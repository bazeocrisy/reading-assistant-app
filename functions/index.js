const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const anthropicKey = defineSecret("ANTHROPIC_API_KEY");

const gradePrompts = {
  "1st": "Use very simple words a 6-7 year old knows. Write in short but natural sentences that flow together smoothly into paragraphs. Tell a simple story with a clear beginning, middle, and end. Make it warm, fun, and easy to follow. Do NOT use bullet points or lists.",
  "2nd": "Use simple but varied vocabulary for a 7-8 year old. Write in flowing paragraphs with sentences of different lengths. Include some description and feeling. Tell a real story or share interesting facts in a narrative way. Do NOT use bullet points or lists.",
  "3rd": "Use grade-appropriate vocabulary for an 8-9 year old. Write in natural paragraphs with varied sentence structure. Include interesting details, descriptive language, and a clear point or message. Do NOT use bullet points or lists."
};

exports.generateStory = onRequest(
  {secrets: [anthropicKey], cors: true},
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const {grade, topic, wordCount} = req.body;
    const gradeStyle = gradePrompts[grade] || gradePrompts["2nd"];

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey.value(),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          messages: [{
            role: "user",
            content: `Write a reading passage about ${topic} that is approximately ${wordCount} words long.

${gradeStyle}

Write in flowing paragraphs like a real children's book or magazine article. End with exactly one question that starts with "Think about it:" on its own line.

Write the passage text only. No title. No headers. No bullet points. No numbered lists. Just natural paragraphs.`,
          }],
        }),
      });

      const data = await response.json();
      logger.info("Anthropic response type:", data.type);

      if (data.error) {
        logger.error("Anthropic API error:", data.error);
        return res.status(500).json({error: data.error.message || "Anthropic API error"});
      }

      if (!data.content || !data.content[0] || !data.content[0].text) {
        logger.error("Unexpected response structure:", JSON.stringify(data));
        return res.status(500).json({error: "Unexpected response from Anthropic"});
      }

      const story = data.content[0].text;
      res.json({story});
    } catch (error) {
      logger.error("Error generating story", error);
      res.status(500).json({error: "Failed to generate story"});
    }
  }
);

const { synthesizeSpeech } = require("./tts");
exports.synthesizeSpeech = synthesizeSpeech;

const { transcribeSpeech } = require("./stt");
exports.transcribeSpeech = transcribeSpeech;