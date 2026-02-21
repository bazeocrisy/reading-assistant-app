const { onRequest } = require("firebase-functions/v2/https");
const { SpeechClient } = require("@google-cloud/speech");
const cors = require("cors")({ origin: true });

const speechClient = new SpeechClient();

function scoreReading(recognized, expected) {
  const normalize = (s) =>
    s.toLowerCase().replace(/[^a-z0-9\s']/g, "").trim().split(/\s+/).filter(Boolean);

  const recWords = normalize(recognized);
  const expWords = normalize(expected);
  if (expWords.length === 0) return { score: 100, wordResults: [], wordsRead: 0, totalWords: 0 };

  let correct = 0;
  let expIdx = 0;

  const wordResults = expWords.map((expWord) => {
    const searchWindow = recWords.slice(expIdx, expIdx + 3);
    const match = searchWindow.findIndex((w) => w === expWord || levenshtein(w, expWord) <= 1);
    if (match !== -1) {
      expIdx += match + 1;
      correct++;
      return { word: expWord, status: "correct" };
    } else {
      return { word: expWord, status: "missed" };
    }
  });

  return { score: Math.round((correct / expWords.length) * 100), wordResults, wordsRead: correct, totalWords: expWords.length };
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

exports.transcribeSpeech = onRequest(
  { region: "us-central1", memory: "512MiB", timeoutSeconds: 60, cors: true },
  async (req, res) => {
    cors(req, res, async () => {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

      const { audioBase64, expectedText = "", grade = 2 } = req.body;
      if (!audioBase64) return res.status(400).json({ error: "audioBase64 is required" });

      try {
        const audioBytes = Buffer.from(audioBase64, "base64");

        const [response] = await speechClient.recognize({
          audio: { content: audioBytes },
          config: {
            encoding: "WEBM_OPUS",
            sampleRateHertz: 48000,
            audioChannelCount: 1,
            languageCode: "en-US",
            model: "latest_long",
            useEnhanced: true,
            speechContexts: [{
              phrases: expectedText.toLowerCase().replace(/[^a-z0-9\s']/g, "").split(/\s+/).filter(Boolean).slice(0, 100),
              boost: 15,
            }],
            enableWordTimeOffsets: true,
            enableWordConfidence: true,
            enableAutomaticPunctuation: false,
            profanityFilter: true,
          },
        });

        if (!response.results || response.results.length === 0) {
          return res.status(200).json({ transcript: "", confidence: 0, wordTimings: [], accuracy: { score: 0, wordResults: [], wordsRead: 0, totalWords: 0 }, message: "No speech detected" });
        }

        const transcript = response.results.map((r) => r.alternatives[0]?.transcript || "").join(" ").trim();
        const overallConfidence = response.results.reduce((sum, r) => sum + (r.alternatives[0]?.confidence || 0), 0) / response.results.length;

        const wordTimings = response.results.flatMap((result) => {
          const alt = result.alternatives[0];
          return (alt?.words || []).map((w) => ({
            word: w.word,
            startMs: Math.round((parseInt(w.startTime?.seconds || 0) * 1000) + (parseInt(w.startTime?.nanos || 0) / 1e6)),
            endMs: Math.round((parseInt(w.endTime?.seconds || 0) * 1000) + (parseInt(w.endTime?.nanos || 0) / 1e6)),
            confidence: w.confidence || overallConfidence,
          }));
        });

        const accuracy = scoreReading(transcript, expectedText);
        return res.status(200).json({ transcript, confidence: Math.round(overallConfidence * 100), wordTimings, accuracy });
      } catch (err) {
        console.error("STT error:", err);
        return res.status(500).json({ error: "Transcription failed", details: err.message });
      }
    });
  }
);