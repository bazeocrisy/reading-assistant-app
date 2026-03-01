const { onRequest } = require("firebase-functions/v2/https");
const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
const { SpeechClient } = require("@google-cloud/speech");
const cors = require("cors")({ origin: true });

const ttsClient = new TextToSpeechClient();
const sttClient = new SpeechClient();

/**
 * Wrap raw PCM (LINEAR16) data in a WAV header so browsers can play it.
 */
function createWavBuffer(pcmBuffer, sampleRate, numChannels, bitsPerSample) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);           // chunk size
  buffer.writeUInt16LE(1, 20);            // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
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

/**
 * Forced alignment: Run the TTS audio back through STT to get precise word timestamps.
 * STT analyzes the actual audio waveform and returns exact start/end times for each word.
 * This is dramatically more accurate than SSML mark timepoints.
 */
async function getAlignedTimings(audioContent, originalWords) {
  try {
    // Build phrase hints from the original text — group consecutive words into phrases
    // This helps STT match the exact text we're expecting
    const phrases = [];
    for (let i = 0; i < originalWords.length; i += 5) {
      const chunk = originalWords.slice(i, i + 5).join(" ").replace(/[^a-zA-Z0-9' -]/g, "");
      if (chunk.trim()) phrases.push(chunk.trim());
    }

    const [sttResponse] = await sttClient.recognize({
      audio: { content: audioContent.toString("base64") },
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: 24000,
        languageCode: "en-US",
        enableWordTimeOffsets: true,
        enableAutomaticPunctuation: true,
        // Use both individual words AND multi-word phrases for best alignment
        speechContexts: [{
          phrases: [
            ...originalWords.slice(0, 50).map(w => w.replace(/[^a-zA-Z0-9'-]/g, "")),
            ...phrases.slice(0, 50),
          ],
          boost: 20.0,
        }],
      },
    });

    if (!sttResponse.results || sttResponse.results.length === 0) {
      return null;
    }

    // Collect ALL word timings from STT in order
    // STT returns results per-utterance/sentence, but we flatten while keeping order
    const sttWords = [];
    for (const result of sttResponse.results) {
      const alt = result.alternatives && result.alternatives[0];
      if (alt && alt.words) {
        for (const w of alt.words) {
          sttWords.push({
            word: w.word,
            startMs: Math.round(
              (parseInt(w.startTime?.seconds || "0") * 1000) +
              ((w.startTime?.nanos || 0) / 1000000)
            ),
            endMs: Math.round(
              (parseInt(w.endTime?.seconds || "0") * 1000) +
              ((w.endTime?.nanos || 0) / 1000000)
            ),
          });
        }
      }
    }

    if (sttWords.length === 0) return null;

    console.log(`STT returned ${sttWords.length} words for ${originalWords.length} original words`);

    // Align STT words back to original text words
    const aligned = alignWords(originalWords, sttWords);
    return aligned;
  } catch (err) {
    console.error("STT alignment failed:", err.message);
    return null;
  }
}

/**
 * Align original text words with STT-detected words.
 * Handles: punctuation, contractions, numbers, word merging/splitting,
 * and uses bidirectional look-ahead to recover from mismatches.
 */
function alignWords(originalWords, sttWords) {
  const result = [];
  let sttIdx = 0;

  // Pre-clean all words once for speed
  const cleanO = originalWords.map(w => w.replace(/[^a-zA-Z0-9'-]/g, "").toLowerCase());
  const cleanS = sttWords.map(w => w.word.replace(/[^a-zA-Z0-9'-]/g, "").toLowerCase());

  for (let i = 0; i < originalWords.length; i++) {
    const co = cleanO[i];

    // Skip empty (pure punctuation)
    if (!co) {
      const prev = result.length > 0 ? result[result.length - 1].endMs : 0;
      result.push({ word: originalWords[i], index: i, startMs: prev, endMs: prev });
      continue;
    }

    if (sttIdx >= sttWords.length) {
      // Out of STT words — interpolate
      const prev = result.length > 0 ? result[result.length - 1].endMs : 0;
      const avg = prev > 0 && i > 0 ? prev / i : 300;
      result.push({ word: originalWords[i], index: i, startMs: prev, endMs: prev + avg });
      continue;
    }

    // Try direct match with current STT word
    if (wMatch(co, cleanS[sttIdx])) {
      result.push({ word: originalWords[i], index: i, startMs: sttWords[sttIdx].startMs, endMs: sttWords[sttIdx].endMs });
      sttIdx++;
      continue;
    }

    // Look ahead in STT (STT inserted extra words we don't have)
    let found = false;
    for (let k = 1; k <= 4 && sttIdx + k < sttWords.length; k++) {
      if (wMatch(co, cleanS[sttIdx + k])) {
        sttIdx += k;
        result.push({ word: originalWords[i], index: i, startMs: sttWords[sttIdx].startMs, endMs: sttWords[sttIdx].endMs });
        sttIdx++;
        found = true;
        break;
      }
    }
    if (found) continue;

    // Check if next original word matches current STT (original word was skipped by STT)
    if (i + 1 < originalWords.length && wMatch(cleanO[i + 1], cleanS[sttIdx])) {
      const prev = result.length > 0 ? result[result.length - 1].endMs : 0;
      result.push({ word: originalWords[i], index: i, startMs: prev, endMs: sttWords[sttIdx].startMs });
      continue; // don't advance sttIdx
    }

    // Check if STT merged two original words ("ice cream" → "icecream")
    if (i + 1 < originalWords.length && cleanO[i + 1]) {
      const merged = co + cleanO[i + 1];
      if (wMatch(merged, cleanS[sttIdx])) {
        const mid = Math.round((sttWords[sttIdx].startMs + sttWords[sttIdx].endMs) / 2);
        result.push({ word: originalWords[i], index: i, startMs: sttWords[sttIdx].startMs, endMs: mid });
        i++;
        result.push({ word: originalWords[i], index: i, startMs: mid, endMs: sttWords[sttIdx].endMs });
        sttIdx++;
        continue;
      }
    }

    // No match — interpolate, don't advance sttIdx
    const prev = result.length > 0 ? result[result.length - 1].endMs : 0;
    const next = sttWords[sttIdx].startMs;
    result.push({ word: originalWords[i], index: i, startMs: prev, endMs: Math.max(prev, next) });
  }

  return result;
}

/** Quick word match: exact, substring, or within edit distance */
function wMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length > 2 && b.length > 2 && (a.includes(b) || b.includes(a))) return true;
  // Skip number mismatches ("1860" vs "eighteen")
  if (/^\d+$/.test(a) !== /^\d+$/.test(b)) return false;
  const maxDist = Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.35));
  return levenshtein(a, b) <= maxDist;
}

/**
 * Simple Levenshtein distance for fuzzy word matching.
 */
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

exports.synthesizeSpeech = onRequest(
  { region: "us-central1", memory: "512MiB", timeoutSeconds: 60, cors: true },
  async (req, res) => {
    cors(req, res, async () => {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

      const { text, grade = 2, voiceName } = req.body;
      if (!text || typeof text !== "string") return res.status(400).json({ error: "text is required" });
      if (text.length > 5000) return res.status(400).json({ error: "text too long" });

      try {
        const words = text.trim().split(/\s+/);
        const ssml = buildSSML(text);

        const resolvedVoice = voiceName || (grade === 3 ? "en-US-Wavenet-C" : "en-US-Wavenet-F");
        const finalVoice = resolvedVoice.replace("Neural2", "Wavenet");

        // Speaking rate by grade
        const speakingRate = grade === 0 ? 0.75 : grade === 1 ? 0.85 : grade === 2 ? 0.9 : 1.0;

        // Step 1: Generate LINEAR16 audio — used for BOTH playback and STT alignment
        // This ensures the audio the browser plays is identical to what timestamps are based on
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

        // Wrap raw PCM in a WAV header so the browser can play it
        const pcmData = wavResponse.audioContent;
        const wavBuffer = createWavBuffer(pcmData, 24000, 1, 16);
        const audioBase64 = wavBuffer.toString("base64");

        // Step 3: SSML mark timings as fallback
        const timepoints = wavResponse.timepoints || [];
        const lastTp = timepoints[timepoints.length - 1];
        const estimatedDurationMs = lastTp ? Math.round(lastTp.timeSeconds * 1000) + 800 : words.length * 350;
        const ssmlTimings = buildWordTimings(words, timepoints, estimatedDurationMs);

        // Step 4: Forced alignment via STT for precise timings
        let wordTimings = ssmlTimings;
        let alignmentMethod = "ssml_marks";

        const alignedTimings = await getAlignedTimings(wavResponse.audioContent, words);
        if (alignedTimings && alignedTimings.length > 0) {
          wordTimings = alignedTimings;
          alignmentMethod = "forced_alignment";
          const matched = alignedTimings.filter((t, i) => i === 0 || t.startMs !== alignedTimings[i-1].endMs).length;
          console.log(`Forced alignment: ${alignedTimings.length} words, ${matched} matched, ${alignedTimings.length - matched} interpolated`);
        } else {
          console.log("Forced alignment failed, using SSML marks");
        }

        return res.status(200).json({
          audioBase64,
          audioFormat: "wav",
          wordTimings,
          totalWords: words.length,
          voiceUsed: finalVoice,
          alignmentMethod,
        });
      } catch (err) {
        console.error("TTS error:", err);
        return res.status(500).json({ error: "TTS synthesis failed", details: err.message });
      }
    });
  }
);