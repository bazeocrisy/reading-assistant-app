# ReadUp — Product & Technical Audit Report

| | |
|---|---|
| **Product** | ReadUp (Transforming Youth Inc.), https://readupapp.com |
| **Repository** | github.com/bazeocrisy/reading-assistant-app, `main` @ `eec9e78` |
| **Audit date** | 2026-10-16 |
| **Method** | Five specialist agents ran in parallel, each limited to its own area. The lead consolidated the results and spot-checked the most serious claims against the code. The work was read-only. |
| **Agent reports** | `agent1-architecture.md` (architecture and security), `agent2-uiux.md` (student UI/UX), `agent3-instruction.md` (reading instruction), `agent4-qa.md` (QA and accessibility), `agent5-cost-privacy.md` (cost, reliability and privacy), all in this folder |
| **Scope of this document** | Documentation only. No application code or Firebase configuration was changed. None of these recommendations has been implemented. |

**Rules the audit followed**
- **Repo and hosting:**
  - Nothing was committed, pushed, merged or deployed.
  - No file in the repo was changed.
  - Nothing was installed.
- **Accounts and services:**
  - There was no sign-in and nothing was written to Firebase.
  - No paid API or Cloud Function endpoint was called.
  - In the headless test, the one possible AI call was stubbed out and blocked on this machine.
- **Data and secrets:**
  - No real children's data was used.
  - The only key-like value found was the public Firebase web key. It is redacted everywhere in these reports.
- **Live site:** only plain downloads of public files were made.

**Labels used in this report**
- **EVIDENCE**: seen in code, data or command output, with file:line references.
- **INFERENCE / ASSUMPTION**: a reasonable conclusion that still needs a runtime, console or user check.
- **Status values**: CONFIRMED WORKING, CONFIRMED BROKEN, SUSPECTED PROBLEM, NOT TESTED.
- **Priorities**: **P0** critical, **P1** important, **P2** improvement, **P3** future opportunity.

**What was not verified:**
- **Firebase and Google Cloud:**
  - All production Firebase behavior: Auth, Realtime Database, security rules, App Check and API-key restrictions.
  - Which functions are actually deployed.
  - Billing status and spending caps.
- **Paid providers:** every feature that depends on a paid AI or speech provider.
- **Devices:**
  - Real-browser audio and highlighting.
  - iOS and Android behavior.
  - Together mode across two devices.

---

## 1. Executive summary

ReadUp already has the core of a sustainable reading product. The work ahead is mostly protecting it, connecting its parts and making it honest, not rebuilding it.

**What is strong**
- **Comprehension Mode already works with no AI and no paid services.** A headless test passed 31 of 31 checks with the network blocked. It covered:
  - adding readers
  - placement up and down
  - the full Teach → Listen → Read → Organize → Retell session from the library
  - rotating to an unused story
  - printing
  - saving
  - falling back to a library story when AI is unreachable
- **Its instructional design matches recognized research.** That includes text-structure instruction, think-aloud modeling, graphic organizers, retelling, repeated reading, and separate listening and reading levels (the Simple View of Reading).
- **The content is balanced and accurate.** The library has 108 stories (6 structures × 6 levels × 3) and 24 placement passages, with clean data. A spot-check of 22 informational texts found no serious factual errors.
- **Provider secrets are kept on the server and were never committed.** There are no analytics or ad trackers.
- **The production site is byte-for-byte identical to `main`.**

**What has to change**

1. **Billing exposure (P0).** All 7 Cloud Functions are public.
   - None of them checks a sign-in token, uses App Check, rate-limits or caps instances.
   - `generateStory` passes any prompt the caller sends straight to Claude, so it works as an open AI proxy on the project's key.
   - Text-to-speech accepts 5,000 characters per call and lets the caller choose any voice.
   - Nothing in the repo shows a budget or spend alert.
2. **Children's privacy (P0).**
   - The app collects a child's **full name**, their learning history, and photos of worksheets that are sent to Anthropic.
   - It has no privacy policy, no parental notice and no consent step.
   - The README says "no data collection, no uploads", which is no longer true.
   - The amended COPPA rule's compliance deadline (2026-04-22) has passed. Whether it applies to Transforming Youth is a question for counsel.
3. **The product doesn't yet fit its audience (P0).**
   - The main app has no 4th or 5th grade anywhere. Every grade picker and benchmark stops at 3rd grade.
   - Comprehension Mode is the feature built for grades 3–5, but **nothing in the main app links to it.**
4. **Misleading measurement labels (P0).**
   - The app's levels come from a Flesch-Kincaid formula but are shown as "≈NNNL" and labeled "Lexile".
   - Reading-speed results are labeled "DIBELS Goal" even though the app counts total words read (not words read correctly) on non-standard passages.
5. **The core keeps working when paid AI is off, with one gap (P1).**
   - Stories, Fry/Dolch practice, Comprehension sessions and saving progress all work without AI.
   - **Reading a whole story aloud has no free fallback.** It shows "Audio unavailable" even though the browser's built-in voice is already used for single words.
6. **Fragile release process (P1).**
   - There are no tests and no CI, and edits are uploaded through the GitHub web page straight to production.
   - In April 2026, commit `b8aae91` replaced `index.html` with an unrelated app for about 9 minutes.
   - **Five buttons are confirmed broken** by a scoping bug.
   - The My Week vocabulary test calls a function that has never existed.

**Bottom line.** None of these problems requires a rewrite.
- The cheapest high-impact steps can be done in the Google Cloud, Anthropic and ElevenLabs consoles today, with no code: budgets, caps and a traffic review.
- The next steps are small code changes:
  - lock down the functions
  - add a privacy notice and consent
  - link Comprehension Mode
  - fix the labels and the broken buttons
  - make the browser voice the default for read-aloud
- After that, the app can be split into modules step by step.

---

## 2. Existing feature inventory

The full 47-row inventory for `index.html` and the 9-row inventory for `comprehension.html` are in `agent4-qa.md` §2.

**Main app (`index.html`, about 60 screens), grouped by area**

| Area | Features |
|---|---|
| Entry | Splash, landing page, email sign-up and sign-in with email verification and password reset, Google sign-in (popup, or redirect on iOS), child profiles (add, edit, delete, switch, avatar), first-run welcome |
| Reading | AI story wizard (grade → length → topic → story), about 54 built-in fallback stories, read-aloud with word-by-word highlighting, voice and speed controls, tap a word for a definition (syllables, example sentence, audio), sight-word popup, Full Screen reading mode, read-three-times tracker and completion screen, bedtime theme |
| Own text | Paste, scan a page (photo → text), upload PDF or DOCX |
| Fluency | Time My Reading (one-minute WPM): grade, source, read, tap the last word, results, history chart |
| Words | Spelling from Dolch or Fry lists, typed or uploaded lists; study, practice, quiz, sentence mode, word search, word scramble. Vocabulary from typed or uploaded lists, AI definitions, study, flashcards, practice, definition quiz. Word Bank (Story and Vocab tabs), My Words, My Readings |
| Social | Read Together / Race a Friend (4-digit room code, synced playback, race results) |
| Parent | PIN gate, dashboard (overview, readings, spelling, charts), assigning passages, My Week planner with a child checklist and lock mode, export, import, reset, change PIN, help |

**Comprehension Mode (`comprehension.html`)**
- Readers (stored on the device only, at most 2 per session) with reading and listening levels.
- Adaptive placement check: levels 200–900, a timer, a missed-word counter, 5 questions per passage, and a listening check.
- Skill of the week across 6 structures: Story Elements, Sequence, Cause & Effect, Problem & Solution, Compare & Contrast, Description.
- Story source: the library, or AI as an option.
- The five-step session, with stop-and-ask cards, three repeated reads, partner reading, an optional timer, a printable graphic organizer, and a 4-point retell rubric.
- A progress chart and history.

**Content data**

| File | Contents |
|---|---|
| `library.json` | 108 sessions (levels 300–800, 3 stop-and-ask items and 3 questions each) and 24 placement passages (levels 200–900, 5 typed questions each) |
| `fry.json` | 400 words, grades K–3. Its description says "1000", which is wrong. |
| `dolch.json` | 220 words, pre-K to grade 3 |

**Backend (`functions/`)**
- `generateStory`, `extractText`, `extractSpellingWords`, `batchDefine` and `extractDocument` call Anthropic `claude-haiku-4-5-20251001`.
- `synthesizeSpeech` calls ElevenLabs Flash, falling back to Google WaveNet on the server.
- `transcribeSpeech` calls Google Speech-to-Text. It is **deployed but never called by the client.**

---

## 3. Feature health matrix

| Feature | Status | Paid dependency | Notes / evidence |
|---|---|---|---|
| Comprehension: readers, session, rotation, print, progress | **CONFIRMED WORKING** (headless) | none | 31/31 checks (agent4 §2b) |
| Comprehension: placement flow | **CONFIRMED WORKING** (flow); **SUSPECTED** logic issue | none | Stops after 4 rounds, so a reader starting at 800 can never be tested below 500 (`comprehension.html:488, 536-549`) |
| Comprehension: AI story → falls back to library | Fallback **CONFIRMED WORKING** | Anthropic (optional) | AI path: depends on paid provider; status unknown |
| All inline scripts and function files parse | **CONFIRMED WORKING** | — | `node --check` (agent1, agent4) |
| All JSON parses; library schema is clean | **CONFIRMED WORKING** | — | 5 duplicate titles (agent4 S3) |
| Fry/Dolch files load | **CONFIRMED WORKING** (asset fetch) | none | UI NOT TESTED |
| Production matches `main` | **CONFIRMED** | — | sha256 comparison (agent4 S8) |
| My Week "Vocabulary Test" | **CONFIRMED BROKEN** | — | Calls `startVocabQuiz`, which has never existed (`index.html:13949, 14154`); the real function is `startVocabDefinitionQuiz` (`:12882`). Re-checked by the lead. |
| My Week home card (child) | **CONFIRMED BROKEN** | — | Inline `onclick` calls a function that lives inside the module script (`index.html:1928` → `:13839`) |
| Word Bank Story/Vocab tabs | **CONFIRMED BROKEN** | — | `index.html:2678-2679` → `:7933` |
| Dashboard "Assign to Child" / "Delete passage" | **CONFIRMED BROKEN** | — | `index.html:14509-14510` |
| Button and feedback color contrast | **CONFIRMED BROKEN** (WCAG AA) | — | White on `#FF6B35` 2.84:1; words already read 1.84:1 |
| Content-safety filter | **CONFIRMED WORKING** as coded, with false positives | — | Blocks "Molly", "crack", "weed", "kill", and "sex" in its biology sense; would block 2 library passages; misses `f.u.c.k`; AI output is never filtered |
| Splash → sign-in routing | **SUSPECTED** | Firebase Auth | Shows "Loading..." forever if gstatic.com is blocked (`index.html:4563-4603`) |
| Sign-in (email, Google), profiles, cloud sync | NOT TESTED | Firebase (free tier) | iOS Google redirect sign-in may fail on the custom domain (`:4213`, authDomain `:3862`) |
| AI story generation (main app) | Depends on paid provider; status unknown | Anthropic | 15-second timeout, then a built-in story (fallback present; the same story is picked every time) |
| Story read-aloud with highlighting | Depends on paid provider; status unknown | ElevenLabs → Google TTS | **No browser-voice fallback**, shows "Audio unavailable" (`index.html:5712-5719`) |
| Word and definition audio | NOT TESTED | TTS (optional) | Falls back to the browser voice (`:7780-7842`) |
| Tap a word for a definition | Depends on paid provider; status unknown | Anthropic | Degrades to "Tap to look up meaning"; results cached |
| Scan, PDF and DOCX import; spelling and vocab from photos | Depends on paid provider; status unknown | Anthropic | No fallback (on-device OCR was removed). `.doc` files go to mammoth, which only reads `.docx` (INFERENCE) |
| Time My Reading | NOT TESTED | Anthropic (optional) | One fallback path sets the passage to an error message (`:8903-8909`) |
| Read Together | NOT TESTED | Firebase, Anthropic (optional) | 4-digit codes, overwrites an existing room with the same code, rooms are never deleted |
| Spelling and vocabulary games, quizzes | NOT TESTED (code looks fine) | none / TTS optional | Several targets can't be reached by keyboard |
| Parent PIN | NOT TESTED | — | Defaults to `1234`, stored in plain text on the device |
| Export, import, reset | NOT TESTED | — | Reset and import change only the device, so the next sign-in brings the old cloud data back (agent1 F13) |
| `transcribeSpeech` | Unused | Google STT | A live, open endpoint that can be billed |

---

## 4. Educational effectiveness assessment

*Agent 3. No learning outcomes are claimed. Matching established research is not the same as evidence that ReadUp works.*

### 4.1 What matches the research
- **Teach → Listen → Read → Organize → Retell** follows a gradual-release pattern: the adult models, the child practices with support, then works more independently.
- **Explicit text-structure instruction** with signal words, a "big question" and organizers matches Meyer's structure-strategy work and the Hebert et al. (2016) meta-analysis. That meta-analysis found text-structure instruction improves comprehension of informational text.
- **Repeated oral reading with a pause before helping** matches guided repeated reading (National Reading Panel, 2000).
- **Separate listening and reading levels**, and an accuracy-based split between "word reading" and "comprehension", follow the Simple View of Reading (Gough & Tunmer, 1986). This is uncommon in consumer apps and worth keeping.
- **Parent support:** stop-and-ask cards come with "look for" answers and a "don't give it away" prompt.

### 4.2 Which reading skill each feature targets

| Skill | Features that target it | Gaps |
|---|---|---|
| Decoding / word recognition | Fry/Dolch spelling, quizzes and games; the placement missed-word count (measurement only) | No phonics, no multisyllable decoding, no morphology. The Fry/Dolch lists only go to grade 3 |
| Oral reading fluency | Read three times; placement WPM and accuracy; the main app's one-minute WPM | Measures speed only; no words-correct-per-minute (WCPM); no expression measure; passages aren't standardized; warm and cold reads are mixed together |
| Language comprehension | Listening step and listening level, stop-and-ask, text-structure knowledge, main-app vocabulary flashcards | No vocabulary work inside Comprehension Mode; no topic sets that build knowledge; no sentence-structure work |
| Reading comprehension | Placement questions, after-reading questions (not scored), retell rubric (the "main measure") | All informal; none validated |

### 4.3 Key educational findings

| ID | Pri | Finding | Evidence |
|---|---|---|---|
| E1 | **P0** | **Lexile wording.** Levels come from `120 + 140 × Flesch-Kincaid grade` but are shown as "≈NNNL" and labeled "Reads alone (Lexile)" and "School Lexile score". Parents are told to "start at their school Lexile and raise it 25–50L". A school Lexile measures the reader; the app's number is an uncalibrated estimate of the text. They should not be matched directly. The good disclaimer at L690 appears only in placement. | `comprehension.html:377-378, 690, 703, 754, 779-780, 794, 917, 930-937, 1061` |
| E2 | **P0** | **DIBELS wording.** Results are labeled "DIBELS Goal" and "DIBELS-aligned", and the app tells children "above grade level". It counts total words read (not words correct) on AI-written passages, has no norms above grade 3, and cites no source. | `index.html:3594, 8113-8119, 8842, 14234, 14275, 14361, 15298` |
| E3 | **P0** (product) | **The main app stops at 3rd grade** in every picker, benchmark, voice setting and server prompt, but the audience is grades 3–5. | `index.html:2165-2169, 15629-15635, 5317-5320`; `functions/index.js:270-277` |
| E4 | P1 | **Placement rests on too few items.** Each level is pass/fail on 4 of 5 parent-scored questions, over at most 4 passages. A rough calculation: a child who answers 70% of items correctly passes a level only about 53% of the time. The per-question-type bars rest on 1–4 items each. "Comprehension is the limit" ignores reading speed. | `comprehension.html:514, 536-549, 589-592, 786-792` |
| E5 | P1 | **Placement passages repeat lesson content.** Four titles are identical (Busy Honeybees, Our Moon, The Amazing Octopus, Cities Under the Sea) and about six more topics overlap, so retests can be inflated by what the child already read. | library ids in agent3 R4 |
| E6 | P1 | **"Level-checked" is circular.** Levels are checked against the same formula that produced them, which measures only sentence and syllable length. | agent3 R5 |
| E7 | P1 | **No content at the top end.** The highest library estimate is about 870 (labels go to 800). A practice level of 800 gives a listening target of 1000, and no story in any structure comes within 100 of it; the app quietly serves an easier one. AI prompts say "3rd grade" at every level. | `comprehension.html:395, 233-243` |
| E8 | P1 | **Genre imbalance.** Sequence and problem/solution appear only as fiction, while text-structure research is strongest for informational text. "Story Elements" and "Problem & Solution" overlap heavily. Topics lean toward science, with little history, biography or civics. | agent3 R7 |
| E9 | P2 | **Think-aloud scripts are fixed**, so they model on content that isn't in the day's story. | `comprehension.html:255-305` |
| E10 | P2 | **Weak signal words and rubric fit.** The same signal words are listed for several structures, and description texts contain only 1–3 of their listed signals. The 4-item retell rubric doesn't fit compare or description. It's unclear which story the child retells. Organizer content isn't saved. | `comprehension.html:254-301, 314-319, 1027, 1039, 1243-1248` |
| E11 | P2 | **No vocabulary or knowledge-building strand** in Comprehension Mode. | — |
| E12 | P2 | **Fluency rewards speed only** ("Beat My Score!"), and placement WPM (cold read) is mixed with session WPM (warm read). | `index.html:8838-8860` |
| E13 | P2 | **Small content errors:** sharks described as "smooth" (`compare-500-c`), hurricanes "near the equator" (`compare-700-a`), astronaut recovery too quick (`cause-800-c`), moon counts that will go out of date (`compare-800-c`). The landing page's "25M can't read at grade level" overstates what NAEP shows. | agent3 R14-R15 |

---

## 5. Technical architecture assessment

*Agent 1.*

**Current shape**
- **Static GitHub Pages site.** Confirmed by the response header `Server: GitHub.com` and the `CNAME` file. There is no build step, CI, tests, service worker, Content Security Policy (CSP) or Subresource Integrity (SRI) hashes.
- **`index.html`:**
  - CSS: 1,650 lines.
  - About 60 screens.
  - **One `<script type="module">` of about 11,380 lines**, lines 3854–15231 (551 KB).
  - 1,441 inline styles, 130 `innerHTML` writes and 148 assignments to the global `S` state object.
- **`comprehension.html`** is a small, consistent classic script. It escapes text everywhere with `esc()`. It is the best template for refactoring.
- **Firebase:**
  - JS SDK 10.12.0, the modular version, pinned exactly.
  - **Realtime Database, not Firestore.** Paths are `users/{uid}/children/{childId}[/data]` and `rooms/{code}`.
  - **No security rules are in the repo.** `firebase.json` defines functions only.
- **Functions:** Cloud Functions 2nd gen on Node 24, `firebase-functions` v7, in us-central1. Secrets are held with `defineSecret`.

**Key findings**

| ID | Pri | Finding | Evidence |
|---|---|---|---|
| A1 | **P0** | All 7 functions accept anonymous requests: no ID-token check, App Check, rate limit or `maxInstances`. The client never sends a token. | `functions/index.js:15,71,151,258,347`; `tts.js:327`; `stt.js:44` (lead re-checked: no `verifyIdToken`, `appCheck` or `maxInstances` anywhere) |
| A2 | **P0** | `generateStory` forwards the caller's `instructions` to Claude unchanged. | `functions/index.js:22-26` (lead re-checked) |
| A3 | **P0** | No server-side limits on size, type or page count for uploads. The text-file path puts the whole file into the prompt. Text-to-speech accepts 5,000 characters. | `index.js:437-446, 369-395`; `tts.js:340` |
| A4 | **P0** | Database security rules can't be reviewed (they aren't in the repo) while the database holds child names, grades and reading history. | `firebase.json` |
| A5 | P1 | **Cross-site scripting (XSS) risk.** Text from users, photo scans, AI and partner rooms is inserted with `innerHTML` and not escaped: reading-mode overlay `14838-14849`, vocabulary cards `12706-12710`, word bank `13114-13116`, and `12178`, `8609`, `4285`. `escapeHtml` doesn't escape `'` (`5119`). Import writes raw JSON straight to storage (`14738`). The main reader is safe (it uses `textContent`, `7343`). | index.html lines as listed |
| A6 | P1 | **Partner rooms.** 4-digit codes from `Math.random`; creating a room overwrites any existing room with the same code; no cleanup. Combined with A5, one family's content can run code on another family's device. | `index.html:7016-7027, 6812-6822` |
| A7 | P1 | **Data-loss paths.** Each sync replaces the whole cloud record, so devices overwrite each other (`3943`). A full device trims stories to 5 and spelling lists to 3, then syncs that loss to the cloud (`9049-9078`). Reset and import are undone by the cloud on the next sign-in (`14649`, `14738`, `3899-3922`). | |
| A8 | P1 | **Module-scope `onclick`** breaks 5 buttons (see §3). | |
| A9 | P1 | **iOS Google sign-in.** Redirect sign-in uses `authDomain` on firebaseapp.com while the site is on readupapp.com, which modern browsers may block. Needs a real-iPhone test. | `index.html:4213, 3862` |
| A10 | P1 | Email verification is enforced only in the browser. | `index.html:4056-4063` |
| A11 | P2 | **Duplicated code that has drifted apart.** Client TTS calls are copied 4+ times (no caching, `voiceGender` sometimes left out, WAV audio labeled as mp3). The upload-to-AI pipeline is copied about 5 times. On the server, the Anthropic call and model id are pasted 5 times. | agent1 F17-F18 |
| A12 | P2 | **Fragile dependencies.** `cors` is required in code but not declared in `functions/package.json`. `sharp` is declared but unused. Root `package.json` dependencies are unused. Chart.js has no SRI hash. | |
| A13 | P2 | Three build labels disagree (`BUILD JT` in the UI, `appBuild:'CL'` in exports, "Build JS/JR" in commits). 271 commits share one message. | `index.html:1881, 3619, 14665` |

**Allowed origins (CORS): record of current settings.** CORS settings only restrict browsers; they do nothing against scripts.

| Location | Allowed origins |
|---|---|
| `functions/index.js:9-13` (5 functions) | `https://bazeocrisy.github.io`, `https://readupapp.com`, `https://www.readupapp.com` |
| `functions/tts.js:5` (inner `cors` package) | `https://bazeocrisy.github.io` only. **readupapp.com is missing.** |
| `functions/tts.js:332` (outer `cors:true`) | Any origin. TTS on readupapp.com works only because of this layer. **If someone "tightens" TTS by deleting `cors:true` without adding readupapp.com, read-aloud breaks on production.** |
| `functions/stt.js:3, 45` | Any origin |
| Not allowed anywhere | `localhost`, `*.web.app`, `*.firebaseapp.com`. Local development against the real functions is blocked. |
| Firebase Auth | `authDomain` = `readup-transforming-youth.firebaseapp.com` (`index.html:3862`). The authorized domains list in the console must include `readupapp.com` (UNVERIFIED). |

---

## 6. UI/UX and accessibility findings

*Agent 2 (design) and Agent 4 (defect list).*

| ID | Pri | Finding | Evidence |
|---|---|---|---|
| U1 | **P0** | No grade 4 or 5, and the child picks their grade again for every story even though the profile already has one. | §4 E3; flow `index.html:2158-2224` |
| U2 | **P0** | Comprehension Mode can't be reached from the app. The only link goes one way, from `comprehension.html:181` back to the main app. | lead re-checked: 0 references in `index.html` |
| U3 | P1 | **Adult controls on child screens.** 28px edit and delete buttons on the "Who's reading today?" cards with no PIN (`4280-4300`); "Clear All" without a PIN (`2692`, `2789`); DIBELS and AIMSweb text addressed to "your child" inside the child's result card (`3594`); "BUILD JT" visible (`1881`); PIN defaults to 1234. | |
| U4 | P1 | **Contrast.** Words already read are 1.84:1 (`294`), which hurts the second and third reads, the core activity. Most white-on-gradient buttons are 1.8–2.9:1. Story text itself passes at 10.98:1. | agent2 §G, agent4 F4 |
| U5 | P1 | **Motion and comfort.** No reduced-motion rule against 37 never-ending animations, including a scale pulse on every word during read-aloud. No `:focus-visible` style. No text-size, font, spacing or dyslexia-friendly option in the main reader; on phones the text shrinks to 1.15rem (`858`). All story text is bold. | |
| U6 | P1 | **Confusing names.** "My Words" means three different things. Profiles are kept twice: Firebase children in the main app and device-only "readers" in Comprehension. | `1915, 2008, 2673` |
| U7 | P1 | **Splash with no timeout or explanation** when Firebase is blocked, for example by a school network filter. | `index.html:4563-4603` |
| U8 | P2 | **Keyboard and screen readers.** Story words, the spelling "hear" buttons, flashcards, avatar options and Comprehension cards and toggles can't be reached by keyboard. 20 of 30 form controls have no label (including all sign-in fields). No `aria-pressed`. Focus outlines removed in 12 rules. No live regions in Comprehension. Modals have no focus trap. `aria-hidden` hides the Pause and Stop buttons (`2583`). | agent4 A1-A6 |
| U9 | P2 | **Small targets.** Bottom bar buttons are about 26–30px tall and voice buttons are smaller, below the 44px minimum. | `index.html:425, 431, 2593` |
| U10 | P2 | **Feedback.** Two offline messages contradict each other (`5507` vs `14758`). Raw error text is shown to children (`10059`, `12483`). Taps within 2 seconds of a lookup are silently ignored (`7468`). The Comprehension error tells parents about the "Blaze plan / Anthropic balance" (`comprehension.html:1071`). Help text probably runs together as one paragraph (`235`). Every modal gets an extra "BACK" button. | |
| U11 | P2 | **No teacher roster or class view.** Comprehension takes at most 2 readers (`1362`). This is a product decision, not a defect. | |
| U12 | P3 | **Tone.** The visual tone may feel young to 4th and 5th graders (Pre-K first in the list, 50-word stories). Test with children. | |
| U13 | P3 | **Markup.** Six groups of duplicate ids. `</body></html>` is missing. `screen-my-readings` may not be closed before My Week opens (`2067-2070`); needs a visual check. | |

**Keep:**
- encouragement such as Bookie, confetti and the three-read dots, but with calmer, opt-in motion
- read-aloud with highlighting
- tap a word for a definition
- the fallback stories
- bedtime mode
- large primary buttons
- a zoomable viewport, `lang`, alt text and the existing live regions

---

## 7. Paid dependency and cost matrix

*Agent 5. Prices are public list prices or aggregator figures found on 2026-10-16. **All dollar amounts are estimates.***

| Service | Used for | Billing / free tier | If unavailable | Est. monthly cost (100 active children, legitimate use) |
|---|---|---|---|---|
| Anthropic Claude Haiku 4.5 (server) | AI stories, definitions, OCR, spelling extraction, document extraction | Per token, no free tier | Stories fall back to built-in ones; definitions degrade; imports fail | about $10–15 |
| ElevenLabs Flash (server) | Story read-aloud with timings | Subscription or credits | Server falls back to Google TTS | **about $90, the largest recurring cost** |
| Google Cloud TTS WaveNet (server) | Fallback read-aloud | About $4 per million characters after a free tier of roughly 1–4M | **No fallback for whole stories**; single words use the browser voice | $0–4 |
| Google Speech-to-Text (server) | Nothing (no client calls it) | Per minute | — | $0, but it is open to abuse |
| Cloud Functions 2nd gen | All AI and speech features | **Requires the Blaze plan**; 2M free calls per month | All AI and speech features stop | $0–5 |
| Firebase Auth | Sign-in | Free up to 50K monthly active users | **The main app can't be used at all** | $0 |
| Firebase Realtime Database | Profiles, sync, rooms | Spark: 1 GB, 100 simultaneous connections | Progress stays on the device | $0 |
| GitHub Pages | Hosting | Free (100 GB/month soft limit) | The whole site is down | $0 |
| Browser speech synthesis | Word and definition audio fallback | Free, on the device | — | $0 |
| Google Fonts, cdnjs (Chart.js), Pexels | Fonts, charts, landing-page image | Free | Charts fail without the CDN | $0 |

**Lifecycle risks**
- `claude-haiku-4-5-20251001` is past its "not retired before 2026-10-15" date, so a retirement notice could come at any time.
- The model id is hard-coded in 5 places (`functions/index.js:37, 106, 185, 298, 462`).
- `temperature: 0.8` (`:39`) will be rejected by newer models.
- The Node 24 runtime is supported until 2028.

**The real financial risk is abuse, not normal use.** One script calling `generateStory` (up to 2,048 output tokens per call) or `synthesizeSpeech` (5,000 characters, with a premium voice of the caller's choice) can run up costs with nothing to stop it.

**Can a child still learn when every paid service is off?** Judged from the code:

| Capability | Verdict | Notes |
|---|---|---|
| Read stories | **Yes** | About 54 fallback stories (the same one is picked every time) plus 108 Comprehension library stories |
| Hear text read aloud | **Partial** | Words: yes (browser voice). **Whole stories: no.** Comprehension: the adult reads aloud |
| Fry/Dolch vocabulary | **Yes** | Static lists plus the browser voice |
| Complete a Comprehension session | **Yes** | Verified headless, with the network blocked |
| Save progress | **Yes** | On the device; cloud sync failures are silent |
| Use the main app if Firebase Auth is down | **No** | Sign-in is required; there is no guest mode |

---

## 8. Privacy and security findings

*Agents 1 and 5. This is not legal advice; COPPA and FERPA items are questions for counsel.*

| ID | Pri | Finding | Evidence |
|---|---|---|---|
| S1 | **P0** | Paid endpoints are open to anyone (§5 A1–A3). | |
| S2 | **P0** | **No privacy policy, terms, parental notice, consent step or age attestation.** The app collects the child's **full name** (the form placeholder shows a sample full name), grade, avatar and learning records. It sends worksheet photos and documents to Anthropic, and story or homework text to ElevenLabs and Google. The amended COPPA rule's compliance deadline (2026-04-22) has passed; whether it applies to the nonprofit is a question for counsel. | `index.html:15618-15624`; `functions/index.js:78-126, 158-224, 354-466` |
| S3 | **P0** | Database rules are unversioned and unknown (§5 A4). | |
| S4 | P1 | **README and DEPLOYMENT make false privacy claims**: "No files uploaded", "No data collection", "on-device OCR". | `README.md`, `DEPLOYMENT.md` |
| S5 | P1 | **Shared devices.** Signing out leaves `readup_data_{childId}` (full history and PIN) and the dictionary cache in browser storage. Comprehension has no login and shows every reader's names, scores and notes. | `index.html:4241-4246, 9083`; `comprehension.html:318-333` |
| S6 | P1 | **Retention and deletion.** There is no account deletion. Rooms are never deleted. Function logs record raw model output (`index.js:57, 137, 247, 326, 488`), which can include homework text. There is no retention policy. | |
| S7 | P1 | XSS and room injection (§5 A5–A6). | |
| S8 | P2 | Internal error details returned to clients (`index.js:95, 138, 145, 248, 489`; `stt.js:97`; `tts.js:369`). | |
| S9 | P2 | `transcribeSpeech` is live and unused. If voice reading is ever added, a child's voice recording counts as personal information under COPPA. | |
| S10 | P3 | **Public Firebase web key** (`index.html:3861`, value redacted) is normal and not a secret, but it should be restricted to readupapp.com and paired with App Check. Google Fonts, cdnjs and Pexels receive visitors' IP addresses. | |

**Already good:**
- server-held secrets that were never committed
- parent-owned accounts with child sub-profiles
- child nicknames never sent to AI (stories use random names)
- no trackers
- a child-safe system prompt
- export and import for data portability

---

## 9. Critical repairs (P0), in order

**R0. Console-only actions the owner can take now, with no code:**
1. Set Google Cloud budgets with alerts ($10, $25, $50) on `readup-transforming-youth`. Review the last 3 months of spend by service and the invocation counts per function for unusual traffic.
2. In the Anthropic console, set a monthly spend limit, check the key's last-used date, and look for a Haiku 4.5 deprecation email. In ElevenLabs, confirm the subscription and cap status.
   - **Don't delete the ElevenLabs secret** until someone confirms that `synthesizeSpeech`, and its Google fallback, still deploys without it.
3. In the Realtime Database console, **export the current security rules** for review. Check how large and how old `rooms/` is.
4. Restrict the Firebase web API key: HTTP referrers limited to readupapp.com, www and github.io; APIs limited to Identity Toolkit and the Realtime Database. Confirm Auth authorized domains.
5. Optionally, if billing exposure is a concern before the code fixes land, disable or delete the unused `transcribeSpeech` function. *This is an outward-facing production change; do it only if the owner decides to.*

**R1. Code (each change is small and shippable on its own):**
1. Lock down the functions:
   - `maxInstances` on every function
   - Firebase ID-token check plus App Check
   - per-user daily quotas
   - prompts built on the server from a fixed list of options (no free-form `instructions`)
   - an allowlist of voices
   - size and type limits on uploads and TTS
   - one shared list of allowed origins, including the readupapp.com fix in tts.js
2. Commit `database.rules.json`, starting from the exported production rules, and wire it into `firebase.json`.
3. Add a privacy notice, a parental-consent checkbox at sign-up, and a retention statement. Correct the README and DEPLOYMENT docs. Counsel should review.
4. Rename the levels "ReadUp level (estimated)" with a disclaimer wherever they appear. Remove the "DIBELS Goal / aligned" labels and "above grade level".
5. Link Comprehension Mode from the Parent Menu and dashboard.
6. Add grades 4 and 5 to pickers, profiles and server prompts. Benchmarks and content need educational review before values are set (see E2, E7).

---

## 10. Proposed future architecture

The plan adds structure step by step around the existing code instead of rewriting it ("strangler" style), keeps **GitHub Pages and no build step**, and keeps the readupapp.com domain.

```
readupapp.com (GitHub Pages, static, no build)
├── index.html            ← gradually shrinks; imports modules below
├── comprehension.html    ← imports the same core/speech modules
├── js/core/config.js     ← one BUILD_ID, endpoints, grade table (Pre-K–5), allowed origins
├── js/core/firebase.js   ← SDK pinned in one place; init singletons
├── js/core/api.js        ← apiFetch(): ID token + App Check, timeouts, friendly errors
├── js/core/dom.js        ← esc(), safe render helpers (from comprehension.html)
├── js/data/store.js      ← versioned local store + migrate(); existing keys preserved
├── js/data/sync.js       ← per-collection RTDB update(), merge logs, server timestamps
├── js/speech/tts.js      ← TtsProvider: Static audio → Browser speechSynthesis → Cloud (opt-in)
├── js/ai/ai.js           ← AiProvider: LibraryOnly (default) | CloudAi (adult-side, optional)
├── js/content/grades.js  ← single grade/benchmark/voice table
├── audio/…               ← pre-generated MP3 + word timings for library, fallback stories, Fry/Dolch
└── tests/ + .github/workflows/  ← node:test, rules tests, static gate, Playwright smoke

Cloud Functions (optional tier; Blaze)
├── lib/auth.js (verifyIdToken + App Check + quota)   lib/anthropic.js (one callClaude, one MODEL const)
├── lib/validate.js   lib/images.js
└── generateStory (server templates), extract*, batchDefine, synthesizeSpeech (voice allowlist)
```

**Principles**
1. **Free first, paid optional.** Every core learning path (read, listen, word practice, comprehension session, save) must work with static files and the browser alone. AI becomes an adult-side extra.
   - The fully free option is Spark plus GitHub Pages plus static audio, with no Functions at all.
2. **One profile per child.** Comprehension readers become fields on the Firebase child, with `readup_comprehension_v1` kept as the offline copy. Migrate once, additively, without deleting the old data.
3. **Move one function family at a time**, in this order:
   1. escaping and grade labels
   2. TTS (4 copies into one)
   3. the upload pipeline (5 copies into one)
   4. sync
4. **Copy the hard-won highlight-sync code byte for byte** into tested modules before changing it: `functions/tts.js:40-146, 260-274` and `index.html:5479-5482`.
5. **Keep compatibility with existing storage keys, database paths, and the export `version:1` format.**

---

## 11. Recommended homepage structure

*Agent 2's proposal. Every current feature is mapped in `agent2-uiux.md` §5.3, and none is dropped.*

```
┌──────────────────────────────────────────────┐
│ 🦁 Hi, Maya!   ⭐ 12  🔥 4 days     [Aa] [🌙]│  avatar = switch reader (no edit/delete)
├──────────────────────────────────────────────┤
│ 📅 TODAY'S PLAN (only if set)   [Start next ▶]│  My Week + Assignments merged
│ 📖 READ A STORY  (uses profile grade/level)   │  HERO
│     [🎲 Surprise me]   [Pick a topic ›]       │
│ [⏱ Reading Workout]     [✏️ Word Practice]    │  time it / my own book · spelling, vocab, games
│ [🎒 My Stuff]           [👫 Read with a Friend]│  My Stories · My Word Bank · My Lists
├──────────────────────────────────────────────┤
│ 🏠 Home                         🔒 Grown-Ups  │  48px bar; Play/Pause only in reader
└──────────────────────────────────────────────┘
```

**Grown-Ups area (PIN, set on first use, never a silent 1234)**
- **Progress:** WPM, retell and spelling details. Measurement terms such as estimated levels live here.
- **Comprehension Session:** includes the placement check.
- **Plan the Week / Assign.**
- **Add Content:** upload, scan or paste.
- **Readers:** one merged profile, grades Pre-K–5.
- **Settings:** PIN, reading defaults, voice, export and import, reset, clear-all.
- **Help.**

**Reading Comfort panel [Aa]**, saved per child:
- text size
- font: Nunito, Lexend, Atkinson Hyperlegible or OpenDyslexic
- spacing
- regular-weight text
- highlight style
- keep words already read dark (at least 4.5:1)
- line focus
- "Calm" motion setting

---

## 12. Phased development roadmap

Each phase ships in small PRs to `main` with checks in place. Nothing in this roadmap has been started.

| Phase | Goal | Contents | Pri |
|---|---|---|---|
| **0: Protect** (owner, days) | Stop billing and privacy exposure | §9 R0 console actions. Code: function lockdown, server prompt templates, input limits, one shared origin list, `maxInstances`; database rules in the repo; XSS fixes; branch protection plus a minimal CI static check (catches wrong-file uploads, inline `onclick` calls into module code, undefined calls) | P0 |
| **1: Honest and connected** (1–2 weeks) | Accurate claims; the grade 3–5 path is reachable | Privacy notice and consent, corrected README; level and DIBELS wording; link to Comprehension; fix the 5 broken buttons and the vocabulary test; hide the BUILD tag; splash timeout and `<noscript>`; friendly errors; never use an error message as a reading passage | P0/P1 |
| **2: Free-first core** (2–4 weeks) | Teaching continues with no paid services | Browser-voice fallback, then default, for story read-aloud (word-boundary highlighting); pre-generated audio for library, fallback stories and Fry/Dolch; random fallback-story pick; static child dictionary; AI moved to the adult side; model id as a config constant and `temperature` removed | P1 |
| **3: Safe data and devices** | No silent data loss; clean shared devices | Sync per collection; never delete data when storage is full; reset and import go through the cloud too; safer room codes plus cleanup; clear device data on sign-out; required PIN setup; account deletion; stop logging raw model output; retention policy | P1 |
| **4: Accessible and student-first UI** | WCAG 2.2 AA and the new homepage | Contrast tokens, reduced motion and Calm mode, `:focus-visible`, buttons instead of clickable divs and spans, labels and live regions, 44–48px targets; adult controls behind the PIN; homepage and Grown-Ups restructure; Reading Comfort panel; one name per object | P1/P2 |
| **5: Modularize** | Maintainable codebase | `/js/` modules (§10), merged profiles, design tokens shared by both pages, inline styles moved into classes, Firebase SDK upgrades behind one module | P2 |
| **6: Instruction and content** | Fit grades 3–5 and reading research | Grades 4–5 with sourced benchmarks; WCPM plus accuracy and expression; content above about 870 (at least for read-aloud); informational problem/solution and sequence; history and biography topics; topic sets and Tier 2 vocabulary; story-specific think-alouds; a retell rubric per structure; placement reported as a range, with more items and its own topics; content fixes | P1/P2 |
| **7: Validate and grow** | Evidence-based iteration | Expert content review, outside readability check, placement test-retest study, parent-vs-rater retell agreement, family pilot (fidelity only); decide on teacher or class mode; optional consented voice-reading feature | P3 |

---

## 13. Test and acceptance criteria

The tooling below would need installing later, with permission; nothing was installed for this audit. Agent 4's audit scripts (listed in `agent4-qa.md` §5; not yet committed) are the starting point.

**Tier 0: static check on every PR (Node only, seconds).** Fail on any of:
- a script that doesn't pass `node --check`
- an inline `onclick` calling into module code
- a call to an undeclared function
- a missing element id that isn't null-guarded
- duplicate ids
- an `index.html` `<title>` other than "ReadUp!", or a file under 10,000 lines
- JSON that doesn't parse, or a `library.json` schema error (including unique ids and titles)
- a color pair below the contrast threshold

**Tier 1: unit tests (`node:test`).**
- The Comprehension harness: sessions, rotation, placement up and down, AI-offline fallback, and **zero network calls** besides `library.json`.
- Pure functions: the safety filter (fixtures), `escapeHtml`, WPM math, word-search grid, highlight timing scaling and index search (fixture timings).
- Database rules tests on the Firebase emulator.

**Tier 2: browser end-to-end tests** (Playwright with the Firebase emulator, cloud functions stubbed with recorded fixtures, so no cost).
- Smoke run: sign up → add child → story → stubbed TTS → highlight advances → definition → three reads complete.
- Each F-item regression.
- Two-context Together test.
- Blocked gstatic.com → visible error within 10 seconds.
- axe accessibility checks at 375 and 1280 widths.
- Keyboard-only walkthrough.
- 200% zoom.
- Manual: VoiceOver, TalkBack, Chromebook, iPad.

**Acceptance criteria**

| # | Criterion |
|---|---|
| AC1 | Tiers 0 and 1 pass in CI on every PR; `main` is protected; no uploads through the web UI. |
| AC2 | No uncaught page errors in Tier 2 smoke runs (Chromium and WebKit). |
| AC3 | Each confirmed-broken item (the vocabulary test and the 5 inline-`onclick` buttons) has a test that fails before its fix and passes after. |
| AC4 | 0 serious or critical axe violations. Text contrast ≥ 4.5:1 (≥ 3:1 for large text). Everything can be operated by keyboard with visible focus. Every control has a name. Feedback is announced. |
| AC5 | Highlight sync stays within ±1 word on 3 fixture passages at 0.75×, 1.0× and 1.25×. A word-count mismatch triggers a visible fallback. |
| AC6 | With every Cloud Function failing, every AI-dependent screen offers a child-friendly alternative within 10 seconds. **A whole story can still be read aloud** (browser voice or static audio). |
| AC7 | The safety filter blocks 0 of ReadUp's own 132 passages; agreed allow and block lists pass. |
| AC8 | Calling a function without a valid ID token or App Check token returns 401 or 403 (emulator). Requests over quota return 429. `generateStory` rejects free-form instructions. |
| AC9 | Database rules tests: a user can't read or write another user's `users/{uid}`; rooms require auth and pass shape and size validation. |
| AC10 | No user-facing "Lexile", "DIBELS Goal" or "above grade level" text remains without approved wording. Grades 4–5 can be chosen everywhere. Comprehension is reachable in at most 2 taps from the Parent Menu. |
| AC11 | After sign-out on a shared device, no `readup_data_*` data remains. Account deletion removes Auth, database and local data. |

---

## 14. Open questions and uncertainties

**For the owner (console and accounts)**
1. Is Blaze billing still active? What did each service cost over the last 3 months? Is there unusual traffic on any function?
2. Is there remaining Anthropic credit or an active ElevenLabs subscription? Read-aloud may currently be running on the Google fallback, or not at all; this is untested.
3. What are the current Realtime Database rules? Are `rooms` world-readable?
4. Is the Firebase web key restricted? Is App Check configured? Is `readupapp.com` on the Auth authorized-domains list?
5. Which functions are actually deployed, and does deployed code match the repo?
6. Does bazeocrisy.github.io redirect to readupapp.com? This matters for the allowed-origin lists.

**Product decisions**

7. Is the target grades 3–5 only, or Pre-K–5? This decides whether the younger tone and the Pre-K–2 content stay prominent.
8. Is teacher or class use in scope? That brings a roster, bulk assignment, and likely FERPA and data-agreement obligations.
9. Should AI remain at all for families (adult-side only), or become staff-only or bring-your-own-key? Or should Cloud Functions be dropped for a fully free Spark plus static design?
10. Should Comprehension Mode require sign-in so progress can sync, or stay anonymous and on the device?

**Legal and brand (counsel)**

11. Does COPPA apply to Transforming Youth Inc., and which verifiable-parental-consent method should be used?
12. What wording is acceptable for Lexile®, DIBELS® and the NAEP statistics?

**Technical items still unverified**

13. Do the 5 `onclick` buttons fail in a real browser? Expected: a ReferenceError (confirmed by static analysis and a Node scope demonstration).
14. Does iOS Google redirect sign-in work on readupapp.com?
15. Does WAV audio labeled as `audio/mp3` play on Safari?
16. Is My Week nested inside My Readings because of the unclosed markup?
17. Did readupapp.com actually serve the wrong app during the 9-minute `b8aae91` window? This is inferred from Pages deploying from `main`.

**Educational**

18. Does placement give stable results on retest? Do parents and trained raters agree on retell scores? How well do the app's estimated levels track an outside measure? None of this can be known without the studies in Phase 7. **No learning outcomes are claimed in this report.**

---

*Lead's spot-check of key claims against the repo:*
- *`startVocabQuiz` is called at `index.html:13949, 14154` and never defined.*
- *`generateStory` passes `instructions` through at `functions/index.js:22-26`.*
- *No `verifyIdToken`, App Check or `maxInstances` appears in `functions/`.*
- *There are no 4th or 5th grade options.*
- *`index.html` has 0 references to `comprehension.html`.*
- *The clone's working tree was clean after all agents finished.*
