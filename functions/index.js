const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const anthropicKey = defineSecret("ANTHROPIC_API_KEY");

// CORS restricted to ReadUp! domain only
const CORS_ORIGIN = ["https://bazeocrisy.github.io"];

exports.generateStory = onRequest(
  {secrets: [anthropicKey], cors: CORS_ORIGIN},
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
          temperature: 0.8,
          system: "You are a children's story writer for ReadUp!, a reading app for kids ages 3-9. Write only age-appropriate, positive, encouraging stories. Never include violence, death, weapons, scary situations, mean behavior, or inappropriate content. Keep all content safe for young children.",
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
  {secrets: [anthropicKey], cors: CORS_ORIGIN},
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
  {secrets: [anthropicKey], cors: CORS_ORIGIN, timeoutSeconds: 120},
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

// ── Batch Define Words (up to 20 at a time) ──────────────
exports.batchDefine = onRequest(
  {secrets: [anthropicKey], cors: CORS_ORIGIN, timeoutSeconds: 120},
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const {words, grade} = req.body;
    if (!words || !Array.isArray(words) || words.length === 0) {
      return res.status(400).json({error: "No words provided"});
    }

    const gradeNames = {
      "prek": "Pre-K (age 3-4)",
      "k": "Kindergarten (age 5-6)",
      "1": "1st grade (age 6-7)",
      "2": "2nd grade (age 7-8)",
      "3": "3rd grade (age 8-9)",
    };
    const gradeLabel = gradeNames[grade] || "1st grade (age 6-7)";

    // Take max 25 words per call
    const batch = words.slice(0, 25);

    const prompt = `Define each of these words for a ${gradeLabel} child. Each definition should be ONE simple sentence using words they already know. Do not start with "It means". Just give the definition directly.

Words: ${batch.join(", ")}

Return ONLY a valid JSON object mapping each word to its definition, with no other text, no markdown, no backticks. Example:
{"cat": "A small furry animal that says meow!", "big": "Really, really large — like a house!"}`;

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
          max_tokens: 4000,
          messages: [{
            role: "user",
            content: prompt,
          }],
        }),
      });

      const data = await response.json();

      if (data.error) {
        logger.error("batchDefine API error:", data.error);
        return res.status(500).json({error: data.error.message || "API error"});
      }

      if (!data.content || !data.content[0] || !data.content[0].text) {
        logger.error("batchDefine unexpected response:", JSON.stringify(data));
        return res.status(500).json({error: "Could not define words"});
      }

      let rawText = data.content[0].text.trim();
      rawText = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();

      try {
        const definitions = JSON.parse(rawText);
        res.json({definitions});
      } catch (parseErr) {
        logger.error("Failed to parse batch definitions JSON:", rawText);
        res.json({definitions: {}, error: "Could not parse definitions"});
      }
    } catch (error) {
      logger.error("Error batch defining words", error);
      res.status(500).json({error: "Failed to define words"});
    }
  }
);

// ── Extract Words from Document (PDF / DOCX / TXT) ───────────
// Handles:
//   PDF  → Claude native document source (base64)
//   DOCX → mammoth converts to plain text, then Claude parses
//   TXT  → plain text, just send to Claude
//
// Request body:
//   { fileBase64, mediaType, mode, grade }
//   mode: "spelling" → returns {words:[{word,syllables,isRedWord}]}
//   mode: "vocab"    → returns {words:[{word,definition}]}
//
exports.extractDocument = onRequest(
  {secrets: [anthropicKey], cors: CORS_ORIGIN, timeoutSeconds: 180},
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const {fileBase64, mediaType, mode, grade} = req.body;
    if (!fileBase64) {
      return res.status(400).json({error: "No file provided"});
    }

    const isSpelling = mode !== "vocab";
    const gradeNames = {
      "prek": "Pre-K (age 3-4)", "k": "Kindergarten (age 5-6)",
      "1": "1st grade (age 6-7)", "2": "2nd grade (age 7-8)", "3": "3rd grade (age 8-9)",
    };
    const gradeLabel = gradeNames[grade] || "2nd grade (age 7-8)";

    try {
      let messageContent;

      if (mediaType === "application/pdf") {
        // PDF — Claude supports natively via document source type
        const spellPrompt = `You are looking at a child's word list or spelling list document. Extract EVERY spelling/vocabulary word.
For each word provide: word, syllable breakdown with dots, whether it is a red/tricky/sight word.
Return ONLY a valid JSON array, no markdown, no backticks:
[{"word": "elephant", "syllables": "el·e·phant", "isRedWord": false}]
Do NOT include titles, headers, directions, page numbers, or teacher instructions — only the actual word list items.`;

        const vocabPrompt = `You are looking at a vocabulary word list document for a ${gradeLabel} child.
Extract EVERY vocabulary word and its definition.
If the document has definitions (after a colon, dash, or labeled "Meaning:"), use those exactly.
If a word has no definition in the document, leave definition as empty string "".
Return ONLY a valid JSON array, no markdown, no backticks:
[{"word": "liberty", "definition": "freedom from control"}]
Do NOT include titles, headers, directions, page numbers, or teacher instructions.`;

        messageContent = [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: fileBase64,
            },
          },
          {type: "text", text: isSpelling ? spellPrompt : vocabPrompt},
        ];

      } else if (
        mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        mediaType === "application/msword"
      ) {
        // DOCX/DOC — convert to plain text with mammoth, then send text to Claude
        let mammoth;
        try {
          mammoth = require("mammoth");
        } catch (e) {
          logger.error("mammoth not installed:", e);
          return res.status(500).json({error: "Word document support not available. Please use PDF or image instead."});
        }

        const buffer = Buffer.from(fileBase64, "base64");
        const result = await mammoth.extractRawText({buffer});
        const plainText = result.value;

        if (!plainText || plainText.trim().length === 0) {
          return res.status(400).json({error: "Could not read Word document"});
        }

        const spellPrompt = `Here is text from a child's spelling word list document:\n\n${plainText}\n\nExtract EVERY spelling word.
For each word provide: word, syllable breakdown with dots, whether it is a red/tricky/sight word.
Return ONLY a valid JSON array, no markdown, no backticks:
[{"word": "elephant", "syllables": "el·e·phant", "isRedWord": false}]
Do NOT include titles, headers, directions, page numbers, or teacher instructions.`;

        const vocabPrompt = `Here is text from a vocabulary word list document for a ${gradeLabel} child:\n\n${plainText}\n\nExtract EVERY vocabulary word and its definition.
If definitions are present (after a colon, dash, or "Meaning:"), use those exactly.
If a word has no definition, leave definition as "".
Return ONLY a valid JSON array, no markdown, no backticks:
[{"word": "liberty", "definition": "freedom from control"}]
Do NOT include titles, headers, directions, or teacher instructions.`;

        messageContent = [
          {type: "text", text: isSpelling ? spellPrompt : vocabPrompt},
        ];

      } else {
        // Plain text file — decode and send directly
        const plainText = Buffer.from(fileBase64, "base64").toString("utf-8");

        const spellPrompt = `Here is text from a child's spelling word list:\n\n${plainText}\n\nExtract EVERY spelling word.
Return ONLY a valid JSON array, no markdown, no backticks:
[{"word": "elephant", "syllables": "el·e·phant", "isRedWord": false}]`;

        const vocabPrompt = `Here is text from a vocabulary word list for a ${gradeLabel} child:\n\n${plainText}\n\nExtract EVERY vocabulary word and its definition.
If definitions are present (after a colon, dash, or "Meaning:"), use those exactly. Otherwise leave definition as "".
Return ONLY a valid JSON array, no markdown, no backticks:
[{"word": "liberty", "definition": "freedom from control"}]`;

        messageContent = [
          {type: "text", text: isSpelling ? spellPrompt : vocabPrompt},
        ];
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey.value(),
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "pdfs-2024-09-25",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 8000,
          messages: [{role: "user", content: messageContent}],
        }),
      });

      const data = await response.json();
      logger.info("extractDocument response type:", data.type);

      if (data.error) {
        logger.error("extractDocument API error:", data.error);
        return res.status(500).json({error: data.error.message || "API error"});
      }

      if (!data.content || !data.content[0] || !data.content[0].text) {
        logger.error("extractDocument unexpected response:", JSON.stringify(data));
        return res.status(500).json({error: "Could not extract words from document"});
      }

      let rawText = data.content[0].text.trim();
      rawText = rawText.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();

      try {
        const words = JSON.parse(rawText);
        res.json({words});
      } catch (parseErr) {
        logger.error("Failed to parse extractDocument JSON:", rawText);
        res.json({words: [], raw: rawText, error: "Could not parse words from document"});
      }

    } catch (error) {
      logger.error("Error in extractDocument:", error);
      res.status(500).json({error: "Failed to process document"});
    }
  }
);

const { synthesizeSpeech } = require("./tts");
exports.synthesizeSpeech = synthesizeSpeech;

const { transcribeSpeech } = require("./stt");
exports.transcribeSpeech = transcribeSpeech;