const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
const { SpeechClient } = require("@google-cloud/speech");
const cors = require("cors")({ origin: true });

// Secrets
const elevenlabsApiKey = defineSecret("ELEVENLABS_API_KEY");

// Google clients (fallback)
const ttsClient = new TextToSpeechClient();
const sttClient = new SpeechClient();

// ============================================================
// ElevenLabs Voice Mapping
// ============================================================
// Default premade voices — warm, clear, great for reading aloud
const ELEVENLABS_VOICES = {
  female: {
    // Rachel — warm, clear American female (ElevenLabs default)
    default: "21m00Tcm4TlvDq8ikWAM",
    preK: "21m00Tcm4TlvDq8ikWAM",
    K: "21m00Tcm4TlvDq8ikWAM",
    1: "21m00Tcm4TlvDq8ikWAM",
    2: "21m00Tcm4TlvDq8ikWAM",
    3: "21m00Tcm4TlvDq8ikWAM",
  },
  male: {
    // Adam — warm, friendly American male
    default: "pNInz6obpgDQGcFmaJgB",
    preK: "pNInz6obpgDQGcFmaJgB",
    K: "pNInz6obpgDQGcFmaJgB",
    1: "pNInz6obpgDQGcFmaJgB",
    2: "pNInz6obpgDQGcFmaJgB",
    3: "pNInz6obpgDQGcFmaJgB",
  },
};

// ============================================================
// ElevenLabs TTS — Character timestamps → Word timestamps
// ============================================================

/**
 * Convert ElevenLabs character-level alignment to word-level timings.
 * 
 * ElevenLabs returns: { characters: ["H","e","l","l","o"," ","w","o","r","l","d"],
 *                       character_start_times_seconds: [...],
 *                       character_end_times_seconds: [...] }
 * 
 * IMPORTANT: ElevenLabs normalized_alignment may alter text (expand contractions,
 * change punctuation, normalize numbers like "3" → "three"). So we can NOT assume
 * the character stream matches the original words character-by-character.
 * 
 * Strategy: Build word timings directly from the character stream by splitting on
 * whitespace, then map those "spoken words" to the original input words.
 */
function charAlignmentToWordTimings(originalWords, alignment) {
  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;

  if (!characters || characters.length === 0) {
    return null;
  }

  // Step 1: Build "spoken words" directly from the character stream
  // Each spoken word = contiguous non-whitespace characters
  const spokenWords = [];
  let i = 0;
  while (i < characters.length) {
    // Skip whitespace
    while (i < characters.length && (characters[i] === " " || characters[i] === "\n" || characters[i] === "\t")) {
      i++;
    }
    if (i >= characters.length) break;

    // Collect non-whitespace characters into a word
    const wordStart = i;
    while (i < characters.length && characters[i] !== " " && characters[i] !== "\n" && characters[i] !== "\t") {
      i++;
    }
    const wordEnd = i - 1; // last non-whitespace char index

    spokenWords.push({
      text: characters.slice(wordStart, i).join(''),
      startMs: Math.round(character_start_times_seconds[wordStart] * 1000),
      endMs: Math.round(character_end_times_seconds[wordEnd] * 1000),
    });
  }

  if (spokenWords.length === 0) return null;

  console.log(`ElevenLabs: ${spokenWords.length} spoken words from ${characters.length} characters, ${originalWords.length} original words`);

  // Step 2: Map spoken words to original words
  // If counts match, it's a 1:1 mapping
  if (spokenWords.length === originalWords.length) {
    return originalWords.map((word, idx) => ({
      word,
      index: idx,
      startMs: spokenWords[idx].startMs,
      endMs: spokenWords[idx].endMs,
    }));
  }

  // Step 3: Counts don't match (ElevenLabs expanded/contracted text)
  // Use proportional mapping: distribute spoken word timings across original words
  const wordTimings = [];
  for (let w = 0; w < originalWords.length; w++) {
    // Map original word index to spoken word index proportionally
    const ratio = originalWords.length <= 1 ? 0 : w / (originalWords.length - 1);
    const spokenIdx = Math.min(
      Math.round(ratio * (spokenWords.length - 1)),
      spokenWords.length - 1
    );
    wordTimings.push({
      word: originalWords[w],
      index: w,
      startMs: spokenWords[spokenIdx].startMs,
      endMs: spokenWords[spokenIdx].endMs,
    });
  }

  // Ensure startMs is monotonically non-decreasing
  for (let w = 1; w < wordTimings.length; w++) {
    if (wordTimings[w].startMs < wordTimings[w - 1].startMs) {
      wordTimings[w].startMs = wordTimings[w - 1].startMs;
    }
    if (wordTimings[w].endMs < wordTimings[w].startMs) {
      wordTimings[w].endMs = wordTimings[w].startMs + 50;
    }
  }

  console.log(`ElevenLabs: mapped ${spokenWords.length} spoken → ${wordTimings.length} original words (proportional)`);

  return wordTimings;
}

/**
 * Call ElevenLabs TTS with timestamps API.
 * Returns { audioBase64, audioFormat, wordTimings, totalWords, voiceUsed, alignmentMethod }.
 */
async function elevenLabsTTS(text, voiceId, grade) {
  const apiKey = elevenlabsApiKey.value();

  // Use Flash v2.5 for lower latency and half-price credits on Creator plan
  const modelId = "eleven_flash_v2_5";

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      output_format: "mp3_44100_128",
      voice_settings: {
        stability: 0.6,
        similarity_boost: 0.8,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${errText}`);
  }

  const data = await response.json();

  // Convert character-level alignment to word-level timings
  const words = text.trim().split(/\s+/);

  // Prefer raw alignment (matches original text more closely).
  // normalized_alignment expands contractions/numbers which causes word count drift.
  // Our new charAlignmentToWordTimings handles mismatches via proportional mapping.
  const rawAlignment = data.alignment;
  const normAlignment = data.normalized_alignment;
  
  // Pick whichever alignment's word count is closer to our input word count
  let alignment = rawAlignment || normAlignment;
  if (rawAlignment && normAlignment) {
    const rawChars = rawAlignment.characters || [];
    const normChars = normAlignment.characters || [];
    const rawWordCount = rawChars.filter((c, i) => 
      c !== ' ' && c !== '\n' && (i === 0 || rawChars[i-1] === ' ' || rawChars[i-1] === '\n')
    ).length;
    const normWordCount = normChars.filter((c, i) => 
      c !== ' ' && c !== '\n' && (i === 0 || normChars[i-1] === ' ' || normChars[i-1] === '\n')
    ).length;
    
    const rawDiff = Math.abs(rawWordCount - words.length);
    const normDiff = Math.abs(normWordCount - words.length);
    alignment = rawDiff <= normDiff ? rawAlignment : normAlignment;
    
    console.log(`ElevenLabs alignment choice: raw=${rawWordCount} words, normalized=${normWordCount} words, input=${words.length} words → using ${rawDiff <= normDiff ? 'raw' : 'normalized'}`);
  }

  let wordTimings = null;

  if (alignment) {
    wordTimings = charAlignmentToWordTimings(words, alignment);
    if (wordTimings) {
      console.log(`ElevenLabs alignment: ${wordTimings.length} words from ${alignment.characters.length} characters`);
    }
  }

  // Fallback: even distribution if alignment somehow fails
  if (!wordTimings) {
    console.log("ElevenLabs: No alignment data, using even distribution");
    const estimatedDurationMs = words.length * 350;
    wordTimings = words.map((word, i) => ({
      word,
      index: i,
      startMs: Math.round((i / words.length) * estimatedDurationMs),
      endMs: Math.round(((i + 1) / words.length) * estimatedDurationMs),
    }));
  }

  return {
    audioBase64: data.audio_base64,
    audioFormat: "mp3",
    wordTimings,
    totalWords: words.length,
    voiceUsed: voiceId,
    alignmentMethod: "elevenlabs_character",
  };
}

// ============================================================
// Google Cloud TTS fallback (existing code)
// ============================================================

function createWavBuffer(pcmBuffer, sampleRate, numChannels, bitsPerSample) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(buffer, 44);

  return buffer;
}

function buildSSML(text) {
  const words = text.trim().split(/\s+/);
  const marked = words.map((word, i) => `<mark name="w${i}"/>${word}`).join(" ");
  return `<speak>${marked}</speak>`;
}

function buildWordTimings(words, timepoints, totalDurationMs) {
  return words.map((word, i) => {
    const tp = timepoints.find((t) => t.markName === `w${i}`);
    const nextTp = timepoints.find((t) => t.markName === `w${i + 1}`);
    const startMs = tp ? Math.round(tp.timeSeconds * 1000) : 0;
    const endMs = nextTp ? Math.round(nextTp.timeSeconds * 1000) - 20 : totalDurationMs;
    return { word, index: i, startMs, endMs };
  });
}

async function googleTTS(text, grade, voiceName) {
  const words = text.trim().split(/\s+/);
  const ssml = buildSSML(text);

  const resolvedVoice = voiceName || (grade === 3 ? "en-US-Wavenet-C" : "en-US-Wavenet-F");
  const finalVoice = resolvedVoice.replace("Neural2", "Wavenet");
  const speakingRate = grade === 0 ? 0.75 : grade === 1 ? 0.85 : grade === 2 ? 0.9 : 1.0;

  const [wavResponse] = await ttsClient.synthesizeSpeech({
    input: { ssml },
    voice: { languageCode: "en-US", name: finalVoice },
    audioConfig: {
      audioEncoding: "LINEAR16",
      sampleRateHertz: 24000,
      speakingRate,
      pitch: 0.0,
      effectsProfileId: ["headphone-class-device"],
    },
    enableTimePointing: ["SSML_MARK"],
  });

  const pcmData = wavResponse.audioContent;
  const wavBuffer = createWavBuffer(pcmData, 24000, 1, 16);
  const audioBase64 = wavBuffer.toString("base64");

  const timepoints = wavResponse.timepoints || [];
  console.log(`Google TTS: ${words.length} words, ${timepoints.length} timepoints, voice=${finalVoice}, rate=${speakingRate}`);
  if (timepoints.length > 0) {
    console.log(`Google TTS first timepoint:`, JSON.stringify(timepoints[0]));
    console.log(`Google TTS last timepoint:`, JSON.stringify(timepoints[timepoints.length - 1]));
  } else {
    console.log(`Google TTS: WARNING - no timepoints returned! enableTimePointing may not be working.`);
  }
  const lastTp = timepoints[timepoints.length - 1];
  const estimatedDurationMs = lastTp ? Math.round(lastTp.timeSeconds * 1000) + 800 : words.length * 350;
  const wordTimings = buildWordTimings(words, timepoints, estimatedDurationMs);

  return {
    audioBase64,
    audioFormat: "wav",
    wordTimings,
    totalWords: words.length,
    voiceUsed: finalVoice,
    alignmentMethod: "google_ssml_marks",
  };
}

// ============================================================
// Main endpoint
// ============================================================

exports.synthesizeSpeech = onRequest(
  {
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 60,
    cors: true,
    secrets: [elevenlabsApiKey],
  },
  async (req, res) => {
    cors(req, res, async () => {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

      const { text, grade = 2, voiceName, voiceGender = "female", ttsEngine } = req.body;
      if (!text || typeof text !== "string") return res.status(400).json({ error: "text is required" });
      if (text.length > 5000) return res.status(400).json({ error: "text too long" });

      // Determine which engine to use
      // Default to ElevenLabs; fall back to Google if explicitly requested or if ElevenLabs fails
      const useElevenLabs = ttsEngine !== "google" && elevenlabsApiKey.value();

      try {
        if (useElevenLabs) {
          // Resolve ElevenLabs voice ID
          const gender = voiceGender === "male" ? "male" : "female";
          const gradeKey = grade === 0 ? "preK" : grade <= 3 ? String(grade) : "default";
          
          // The frontend sends Google voice names like "en-US-Wavenet-F"
          // Only use voiceName as ElevenLabs ID if it looks like one (no dashes, alphanumeric)
          const isElevenLabsId = voiceName && voiceName.length > 10 && !voiceName.includes("-");
          const voiceId = isElevenLabsId
            ? voiceName
            : ELEVENLABS_VOICES[gender][gradeKey] || ELEVENLABS_VOICES[gender].default;

          console.log(`Using ElevenLabs TTS: voice=${voiceId}, gender=${gender}, grade=${grade}`);

          const result = await elevenLabsTTS(text, voiceId, grade);
          return res.status(200).json(result);
        }
      } catch (err) {
        console.error("ElevenLabs TTS failed, falling back to Google:", err.message);
        // Fall through to Google TTS
      }

      // Google TTS fallback
      try {
        console.log("Using Google TTS fallback");
        const result = await googleTTS(text, grade, voiceName);
        return res.status(200).json(result);
      } catch (err) {
        console.error("Google TTS also failed:", err);
        return res.status(500).json({ error: "TTS synthesis failed", details: err.message });
      }
    });
  }
);