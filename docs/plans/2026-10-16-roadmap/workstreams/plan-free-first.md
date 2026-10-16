# Workstream plan: free-first core learning (FREE)

*Planning agent output, 2026-10-16, against `main` @ `eec9e78`. Nothing was modified. Every file:line was re-checked against that commit. Anything unverified is marked ASSUMPTION or UNVERIFIED.*

## 0. Findings that change the plan

1. **The story highlight engine is clock-driven.** `startHighlightLoop` (`index.html:5347-5454`) reads `ttsAudio.currentTime` and binary-searches `ttsWordTimings[].startMs`. The timings are rescaled to `ttsAudio.duration` (`:5359-5375`) and shifted by a 20 ms offset (`:5357`). The loop then applies the result by index to:
   - `S.wordEls`
   - the scroll container
   - `#rm-text .word-span`
   - `#progress-bar`
   - the race bars

   When no real timings exist, it falls back to letter-weighted timing (`:5402-5418`).

   So browser TTS (`onboundary` gives a `charIndex`) should not fake an audio clock. Instead, split the loop in two:
   - "compute active index", one version per engine
   - "apply highlight for index", shared and extracted byte-for-byte
2. **Many call sites touch `ttsAudio` directly**, so a player-controller layer is needed:
   - play, pause and resume: `:5737-5767`
   - speed: `:5299-5301`
   - race commands: `:6787-6790`
   - dictionary pause and resume: `:7480-7488`, `:7561-7564`
   - teardown: `:7391`
   - reading-mode Listen: `:14875+`
   - home and back: `:15023`, `:15141`
3. **There are 5 TTS client paths:**
   - `sayHearItAll` (`:7648-7786`), which has its own highlight loop with a 50 ms offset
   - `sayDictEntry` (`:7788`)
   - `sayWordOnly` (`:7817`)
   - `sayWordForPractice` (`:10624`), which is **missing the iOS unlock**: there is no synchronous `new Audio().play()` before `await fetch`
   - the story path
4. **WAV is labelled as MP3 (confirmed).**
   - Google returns LINEAR16/WAV (`functions/tts.js:288, 315`). ElevenLabs returns MP3.
   - The story path picks the MIME type correctly (`index.html:5591, 7287`).
   - `:7679`, `:7805`, `:7833` and `:10636` hard-code `data:audio/mp3`.
5. **An offline dictionary half-exists already.**
   - `fry.json` and `dolch.json` hold 441 unique words, each with a kid-friendly definition, syllables and 3 sentences.
   - Tapping a story word calls `getWordDefinition` (`:7417-7459`), which uses AI only, then the cache, then `null`.
   - `showSightWordPopup` is reached only from the word bank (`:10246`, `:15205`).
6. **Fallback stories.**
   - There are exactly 54 (5,551 words), for grades 1–3 only.
   - `getStory` (`:5041-5046`) always picks the story closest in length. It runs only after a **15-second AI timeout** (`:6990-6992`).
7. **WPM fallback passage = the error string** (`:8908`).
8. **The reading-mode overlay tokenizes differently.** It skips tokens with no letters (`:14839-14849`), so `#rm-text` indices drift from `S.wordEls`. This is an existing bug. It also inserts unescaped `innerHTML`.
9. **`.txt` import is already on-device** (FileReader, about `:6447-6457`). Only images, PDF and DOCX go to the AI.
10. **`library.json`:**
    - 108 sessions, 30,203 words and 157K characters.
    - 3,104 unique tokens, 2,698 of them not in the sight-word lists.
    - **No vocabulary field.**
11. **Comprehension Mode has no TTS.** The adult reads aloud (`comprehension.html:983`). Its only paid call is "✨ New AI story" (`:989`, `:430`).

## 1. Work items

| ID | Pri | Problem | Change | Depends | Tests | Impact on existing functionality / mitigation | Rollback | Approvals | Effort |
|---|---|---|---|---|---|---|---|---|---|
| FREE-1 | P0 (prereq) | R8, F17: 271 sync-fix commits with no tests. The coupled code is at `:5347-5454`, `:5529-5585`, `:5482`, `:7356-7369`. | Copy these pure functions **byte-for-byte** into `js/highlight-core.js`: `normalizeForTTS`, `tokenize`, `mapServerTimings`, `reconcileTimings`, `scaleTimings`, `findActiveIdx`, `weightedIdx`. Extract `applyStoryHighlight(idx)`. Keep the same order and constants (20 ms, 1.01). | Test scaffold | Golden outputs captured from the current inline code first. Fixtures: short, 300 words, quotes, em-dashes, numbers; ElevenLabs and Google timing shapes; count mismatches of ±1–3. AC5: within ±1 word at 0.75×, 1.0× and 1.25×. Use synthetic fixtures only; recording new ones would need paid TTS. | **Highest-risk area.** Mitigation: pure extraction, golden tests, and a manual pass on iPad and Chromebook with a 300-word story. | revert | PR | M |
| FREE-2 | P0 | Pause, resume, speed and dictionary code reach into `ttsAudio` directly. | `StoryPlayer` with `play`, `pause`→position, `resume`, `stop`, `setRate`, `state` and `onEnd`. Position is opaque: `{ms}` or `{wordIdx}`. `AudioEngine` wraps today's `playSpeech` **unchanged**: the preloaded element, `_readupSrc`, `canplaythrough` and the `playSpeechId` token. `onEnd` fires `recordReadComplete` and `broadcastPlayback` once. | FREE-1 | State-machine units with a fake engine. Playwright with a stubbed `<audio>`. | Touches race mode and the iOS preload (`:7091-7096`). Keep the globals with the same meaning; create no new Audio elements. | revert | PR | M |
| FREE-3 | **P0** | F5: no browser fallback; the catch block only shows a toast (`:5712-5719`). | Add a `SpeechEngine`:<br>• **Chunking:** build chunks from `S.wordEls[i].textContent`, keeping `charStart[i]` so `charIndex → wordIdx` is exact. Split at sentence ends into chunks of 160–220 characters (to avoid the ~15 s Chrome cutoff, ASSUMPTION).<br>• **Highlighting:** `onboundary` calls `applyStoryHighlight`. If no boundary arrives within 1.2 s, interpolate by letter weight and snap at `onend`.<br>• **Pause and speed:** `cancel()` and re-speak from `wordIdx` (`speechSynthesis.pause()` is unreliable, ASSUMPTION).<br>• **Rate and voice:** rate = gradeRate × speed. Prefer `localService` en-US voices.<br>• **Phase A:** cloud first, then browser on any failure or when offline. `?tts=browser` or `readup_tts_engine` forces it.<br>• **iOS:** prime with an empty utterance in `startCountdown` and reuse "Tap to Play".<br>• **Race mode:** broadcast `wordIdx`. | FREE-1, FREE-2 | **Units:** chunker (quotes, "Dr.", 900 words, every chunk ≤220 chars) and `charIndex` mapping.<br>**Playwright** with a fake `speechSynthesis`: highlights only move forward across chunks, pause and resume work, the dictionary interplay works, `recordReadComplete` fires once.<br>**Manual device matrix:** iPad and iPhone Safari; managed Chromebook; Android on Pixel and Samsung; Windows Chrome and Edge; macOS Safari; Firefox. | The audio path is unchanged in Phase A; the browser engine runs only where the user gets an error today. Shared `applyStoryHighlight` regressions are caught by the FREE-1 goldens. | `readup_tts_engine=cloud` kill switch, or revert | PR + deploy | L |
| FREE-4 | P1 | Owner priorities 1 and 2. Each story play calls paid TTS (up to 5K characters). The race countdown preloads TTS even if nobody presses Play (`:7129, 7134`). | Order: static audio, then browser, then cloud only when an adult turns on "Premium voice". No preload unless the engine is cloud. A clear state when the device can't read aloud. | FREE-3 + device results | Matrix; zero `synthesizeSpeech` calls on the default path. | Voice quality and highlight precision vary by device. Mitigation: interpolation and the premium opt-in. | one-line flag | PR + deploy + **owner product decision** | S |
| FREE-5 | P1 (MIME and unlock part: P1/S, ships first) | F17 duplication, MIME mislabel, missing iOS unlock, rates drifting apart (0.8, 0.65, 0.8). | `Speech.say({text, kind, highlightEls?, rate?})`: static clip, then browser, then cloud (opt-in). **The iOS unlock stays synchronous** before the first `await`. Wrappers keep the names `sayHearItAll`, `sayDictEntry`, `sayWordOnly` and `sayWordForPractice`. Add `audioMime(data)`. | FREE-3 | Units: provider order and MIME. Playwright: "Hear it all" highlights in order. Manual iPhone and iPad: tapped word, spelling speaker, Fry/Dolch popup. | The iOS unlock is the main risk; check it on an iPhone before merge. | revert (wrappers keep call sites unchanged) | PR | M |
| FREE-6 | P1 | F12: deterministic pick (`:5041-5046`), a 15 s wait (`:6990`), and the error passage (`:8908`). | (a) Random pick within ±50% of the target length, avoiding repeats with a new additive key `readup_seen_stories`. (b) Lazy-load `library.json` into the main app's pool: join paragraphs with `\n\n`; map Lexile to grade (ASSUMPTION; owner or educator confirms); `isAIStory=false`. (c) Skip the 15 s wait when AI is off. (d) WPM falls back to a library or built-in passage, or an error card. Never time error text. | none | Units: seeded random selection, no repeats, grade fallback chain. Playwright: AI fails, story appears in under 1 s, WPM never shows the error. | Story length may differ from the chosen size. Check the WPM word count. No effect on highlighting. | revert | PR | S (a, c, d), M (b) |
| FREE-7a | P1 | Tapping a word sends it to Anthropic (cost, and a child's homework words go to a third party). | Lookup order: Fry/Dolch entry (rich popup), then cache, then curated dictionary, then AI (only if allowed), then "Tap 🔊 to hear". Simple lemmatizer showing "(from *run*)". | none | Lemmatizer fixtures; with AI stubbed off, zero network calls for sight words. | Per-grade definitions are lost (the cache key is `word_grade`). The sight popup plays "Hear it all", which is longer audio. | revert | PR | S–M |
| FREE-7b | P2 | No offline definitions beyond the sight words. | `dictionary.json`: about 1,200–1,600 lemmas from the library (ESTIMATE), around 150–200 KB raw / 50–70 KB gzip. **Recommendation:** hand-curated and owned by Transforming Youth. An optional one-time draft by an LLM (well under $1) with a person reviewing every entry. WordNet as a reference only. Avoid CC BY-SA Wiktionary unless share-alike terms are acceptable. Add a lint for new story vocabulary. | 7a + generation decision | Content QA: every entry reviewed for grade 3–5 readability and no mature senses. | New data only. | revert | PR + **paid-generation approval** (if drafted by an LLM) | M–L |
| FREE-8 | P2 (sight words) / P3 (stories) | Browser voice quality varies by device. | Static MP3s and timings. The manifest is keyed by content hash, with one timing per `tokenize()` token. If the text changes, the lookup misses and browser TTS is used, so it **can't desync**. Host in a **separate `readup-audio` repo**: binaries stay in git history permanently, and `<audio>` needs no CORS. Size estimate: about 87 MB per voice at 32 kbps (all content), or about 5 MB for sight words. Generation is run by the owner:<br>(i) Google with SSML marks: about $0–9 for 2 voices, probably within the free tier (UNVERIFIED: MP3 with timepoints, and whether marks are billed).<br>(ii) ElevenLabs: about $13 per voice; needs a plan.<br>(iii) $0: Piper with forced alignment (check voice licenses).<br>Never record OS voices. **Defer stories** until the FREE-3 device data is in. | FREE-1, FREE-5 | Validator: files exist, timing count = token count, timings only increase, last timing ≤ duration × 1.01. Playwright: zero `CF_TTS` calls. Manual sync check on iPad and Chromebook. | New content only. A missing manifest falls back to browser TTS. | remove manifest entry | PR + **generation run** + content listen-through + deploy | M (sight words) / L (stories) |
| FREE-9 | P1 | Silent 15 s fallbacks. AI sits on the child's path. | A `features` object (`ai.story`, `ai.define`, `ai.import`, `tts.cloud`) from a static `config.json` plus an adult override. The child's default is the library, the offline dictionary and the browser voice. The AI story button moves to the parent area. One consistent "AI helper is off — here's a library story" state with no spinner. Comprehension hides "✨ New AI story" when it's off. | FREE-6, 7a | Playwright with every function URL blocked: every screen is usable, and zero `cloudfunctions.net` requests on the child path. | Read Together hosts need a library picker (`:6298-6313`). The UI workstream owns the wording. | flip `config.json` | PR + **owner decides the defaults** | M |
| FREE-10 | P2 | Comprehension's Listen step relies on the adult reading aloud. | Shared `js/speech.js`. A "🔊 Read it to me" button that chunks by paragraph and **auto-pauses at stops** (`L.stops[].after`). The default stays adult read-aloud. | FREE-3 | Fake speech: pauses at each stop, resume works, leaving the step stops speech. | No effect on library loading or progress. | revert | PR | S–M |
| FREE-11 | P2 (b) / P3 (c) | Image, PDF and DOCX go to AI with no fallback. The README claims on-device OCR. | (b) Self-hosted, lazy-loaded pdf.js (text-layer PDFs, about 1–1.5 MB, Apache-2.0) and mammoth (DOCX, about 0.6 MB, BSD-2; ASSUMPTION), adult side only. (c) Optional Tesseract.js "On-device scan (beta)" (about 10–15 MB; 5–20 s per page and 150–300 MB of memory on low-end Chromebooks, ASSUMPTION) with a required "check the text" step. Keep AI OCR behind `ai.import`. | — | Fixture PDF and DOCX produce the expected text. Chromebook and iPad timing and memory on 3 worksheets. | No change to `.txt`. Page weight is unchanged until someone opts in. | revert / flag | PR | M / M–L |
| FREE-12 | P2 (owned by the repair workstream) | The reading-mode overlay highlight drifts after "—" and numbers, and uses unescaped HTML. | Build overlay spans from `tokenize()`. | FREE-1 | Fixture with an em-dash and a year: overlay index = story index. | Make it its own PR so it can be bisected. | revert | PR | S |

## 2. Ordered PRs (each on a feature branch; no merge or deploy without approval)

1. `fix/tts-mime-ios-unlock` (part of FREE-5)
2. `feat/random-fallback-stories` + WPM error-passage fix (FREE-6a, c, d)
3. `feat/offline-sight-dictionary` (FREE-7a)
4. `refactor/highlight-core` + golden tests (FREE-1; needs the test scaffold)
5. `refactor/story-player-controller` (FREE-2)
6. `feat/browser-tts-fallback`, Phase A (FREE-3; with a kill switch)
7. Device-matrix test run (no code; gates PR 9)
8. `refactor/speech-provider` (FREE-5)
9. `feat/browser-tts-default` + "Premium voice" (FREE-4)
10. `feat/ai-optional-flags` (FREE-9)
11. `feat/library-stories-in-app` (FREE-6b)
12. `fix/reading-mode-tokenize` (FREE-12)
13. `feat/comprehension-read-to-me` (FREE-10)
14. `feat/client-doc-import` (FREE-11b)
15. `data/curated-dictionary` (FREE-7b)
16. `data/static-audio-sight-words`, then optionally stories (FREE-8)
17. `feat/ondevice-ocr-beta` (FREE-11c, optional)

PRs 1–3 are independent. PRs 6, 8 and 9 must land in that order.

## 3. Owner decisions

1. Make the browser voice the default, with cloud as an adult opt-in? (Recommended, after the device tests.)
2. Add grades 4–5? Confirm the Lexile-to-grade mapping for library stories in the main app.
3. Static audio:
   - Approve a one-time generation run? Options: Google (likely free tier, about $0–9 worst case), ElevenLabs (about $26 for two voices) or Piper ($0).
   - Start with sight words only?
   - Use a separate `readup-audio` repo?
4. Dictionary: hand-written, or drafted by an LLM and reviewed by a person (a one-time cost under $1)?
5. Move AI to the adult side only, with `config.json` defaults all **off** until the lockdown lands?
6. Imports: on-device pdf.js and mammoth? Is on-device OCR wanted at all?
7. Race mode with browser TTS: each device speaks locally, synced by word index. Acceptable?
8. Device lab: which real devices are available, especially a managed Chromebook and an iPad?

## 4. Unverified

- **Device behavior:** `onboundary` support per browser, the Chrome cutoff, the iOS gesture requirement, and Android/ChromeOS `pause()` reliability.
- **Google TTS:** whether MP3 works with timepoints, how SSML marks are billed, and the free-tier size.
- **Tesseract and mammoth:** package sizes and Chromebook performance.
- **Estimates:** the audio sizes are derived from reading rate. The word and character counts were measured.
- **Production:** whether the Google fallback plays in production today is still unknown.
