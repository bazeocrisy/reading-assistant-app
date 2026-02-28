const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const anthropicKey = defineSecret("ANTHROPIC_API_KEY");

exports.generateStory = onRequest(
  {secrets: [anthropicKey], cors: true},
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const {grade, topic, wordCount, instructions} = req.body;

    // Use instructions from frontend if provided (handles Pre-K, K, and all grades)
    // Fall back to a generic prompt only if nothing is sent
    const storyInstructions = instructions || `Write a story appropriate for ${grade} grade about ${topic} that is approximately ${wordCount} words long. Write in flowing paragraphs. Do not use bullet points or lists. Do not include a title.`;

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
          max_tokens: 2048,
          messages: [{
            role: "user",
            content: storyInstructions,
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

// ── Extract Text from Image (OCR via Claude Vision) ──────
exports.extractText = onRequest(
  {secrets: [anthropicKey], cors: true},
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const {imageBase64, mediaType} = req.body;
    if (!imageBase64) {
      return res.status(400).json({error: "No image provided"});
    }

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
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType || "image/jpeg",
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: "Read every word from this image exactly as written. Return ONLY the text content, nothing else. No descriptions, no commentary, no formatting marks. Just the exact words as they appear on the page, preserving paragraph breaks with blank lines.",
              },
            ],
          }],
        }),
      });

      const data = await response.json();
      logger.info("extractText response type:", data.type);

      if (data.error) {
        logger.error("extractText API error:", data.error);
        return res.status(500).json({error: data.error.message || "API error"});
      }

      if (!data.content || !data.content[0] || !data.content[0].text) {
        logger.error("extractText unexpected response:", JSON.stringify(data));
        return res.status(500).json({error: "Could not extract text"});
      }

      const text = data.content[0].text.trim();
      res.json({text});
    } catch (error) {
      logger.error("Error extracting text", error);
      res.status(500).json({error: "Failed to extract text"});
    }
  }
);

// ── Extract Spelling Words from Image (OCR + AI parsing) ──
exports.extractSpellingWords = onRequest(
  {secrets: [anthropicKey], cors: true, timeoutSeconds: 120},
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const {imageBase64, mediaType, grade} = req.body;
    if (!imageBase64) {
      return res.status(400).json({error: "No image provided"});
    }

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
          max_tokens: 8000,
          messages: [{
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType || "image/jpeg",
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: `You are looking at a child's word list or spelling list. Extract EVERY word from this image.

For each word, provide:
1. The word exactly as spelled
2. The syllable breakdown using dots (like "el·e·phant" or "di·graph")
3. Whether it appears to be marked as a "red word" or irregular/tricky word (words that don't follow standard phonics rules)

Return ONLY a valid JSON array with no other text, no markdown, no backticks. Each item should be:
{"word": "elephant", "syllables": "el·e·phant", "isRedWord": false}

Important:
- Include ALL words from the list, whether numbered, in columns, or in rows
- There may be many words (50-100+). Include every single one.
- Single-syllable words just have the word itself (e.g. "set" stays "set")
- Red words / sight words / tricky words should have isRedWord: true
- Preserve the exact spelling from the image
- Do NOT include titles, headers, or instructions — only the actual word list items
- Return ONLY the JSON array, nothing else`,
              },
            ],
          }],
        }),
      });

      const data = await response.json();
      logger.info("extractSpellingWords response type:", data.type);

      if (data.error) {
        logger.error("extractSpellingWords API error:", data.error);
        return res.status(500).json({error: data.error.message || "API error"});
      }

      if (!data.content || !data.content[0] || !data.content[0].text) {
        logger.error("extractSpellingWords unexpected response:", JSON.stringify(data));
        return res.status(500).json({error: "Could not extract spelling words"});
      }

      let rawText = data.content[0].text.trim();
      // Strip markdown code fences if present
      rawText = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();

      try {
        const words = JSON.parse(rawText);
        res.json({words});
      } catch (parseErr) {
        logger.error("Failed to parse spelling words JSON:", rawText);
        res.json({words: [], raw: rawText, error: "Could not parse words"});
      }
    } catch (error) {
      logger.error("Error extracting spelling words", error);
      res.status(500).json({error: "Failed to extract spelling words"});
    }
  }
);

const { synthesizeSpeech } = require("./tts");
exports.synthesizeSpeech = synthesizeSpeech;

const { transcribeSpeech } = require("./stt");
exports.transcribeSpeech = transcribeSpeech;