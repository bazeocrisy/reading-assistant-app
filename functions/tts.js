const { onRequest } = require("firebase-functions/v2/https");
const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
const cors = require("cors")({ origin: true });

const ttsClient = new TextToSpeechClient();

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

exports.synthesizeSpeech = onRequest(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30, cors: true },
  async (req, res) => {
    cors(req, res, async () => {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

      const { text, grade = 2, voiceName } = req.body;
      if (!text || typeof text !== "string") return res.status(400).json({ error: "text is required" });
      if (text.length > 5000) return res.status(400).json({ error: "text too long" });

      try {
        const words = text.trim().split(/\s+/);
        const ssml = buildSSML(text);

        // Use voiceName from frontend if provided, otherwise fall back to grade defaults
        const resolvedVoice = voiceName || (grade === 3 ? "en-US-Neural2-C" : "en-US-Neural2-F");
        const speakingRate = grade === 1 ? 0.85 : grade === 2 ? 0.9 : 1.0;

        const [response] = await ttsClient.synthesizeSpeech({
          input: { ssml },
          voice: { languageCode: "en-US", name: resolvedVoice },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate,
            pitch: 0.0,
            effectsProfileId: ["headphone-class-device"],
          },
          enableTimePointing: ["SSML_MARK"],
        });

        const audioBase64 = response.audioContent.toString("base64");
        const timepoints = response.timepoints || [];
        const lastTp = timepoints[timepoints.length - 1];
        const estimatedDurationMs = lastTp ? Math.round(lastTp.timeSeconds * 1000) + 800 : words.length * 350;
        const wordTimings = buildWordTimings(words, timepoints, estimatedDurationMs);

        return res.status(200).json({ audioBase64, wordTimings, totalWords: words.length, voiceUsed: resolvedVoice });
      } catch (err) {
        console.error("TTS error:", err);
        return res.status(500).json({ error: "TTS synthesis failed", details: err.message });
      }
    });
  }
);