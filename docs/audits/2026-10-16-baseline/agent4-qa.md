# ReadUp! — Agent 4: QA & Accessibility Audit

**Scope:** feature inventory, static checks, a local headless run, mobile/accessibility defects, regression risk.
**Repo:** `C:\Users\bazeocrisy\Projects\ReadUp-audit` @ `eec9e78` (read-only). **Production:** https://readupapp.com
**Date:** 2026-10-16. **Method:** read-only. No sign-in, no Firebase writes, and no TTS/STT/AI/Cloud Function calls. During the headless run every non-`library.json` fetch was stubbed and blocked, so no request left the machine. The analysis scripts ran from a temporary local workspace outside the repo (listed in §5).

**Status labels (exactly one per item):**
- **CONFIRMED WORKING**: a check I ran verified it.
- **CONFIRMED BROKEN**: a check I ran verified it.
- **SUSPECTED PROBLEM**: the code points to a problem, but I didn't execute it.
- **NOT TESTED**.

Features that depend on a paid provider are marked "depends on paid provider; status unknown". I verified **no** Firebase production functionality.

---

## 1. Current implementation (QA view)

| Item | Finding | Evidence |
|---|---|---|
| Hosting | GitHub Pages (`Server: GitHub.com`, `Cache-Control: max-age=600`). `CNAME` = readupapp.com. Every push to `main` deploys to production. There is no CI and no test suite. | `curl -I https://readupapp.com/`, `CNAME:1` |
| Live vs repo | **Byte-identical** to git `HEAD` for `index.html`, `comprehension.html`, `library.json`, `fry.json` and `dolch.json` (sha256 compared after removing the CRLF that the local `core.autocrlf=true` checkout adds). | hash comparison of downloaded production files |
| `index.html` | 15,706 lines: CSS 12–1669, markup 1671–3853, then **one `<script type="module">` (3854–15231, 551 KB)**, then more markup after the script (global settings overlay, landing page, splash). No closing `</body></html>`. | `index.html:3854`, `:15231`, `:15703` |
| `index.html` dependencies | Firebase JS SDK 10.12.0 from gstatic (App, **Realtime Database**, Auth), not Firestore. Seven Cloud Functions under `CF_BASE` (`index.html:4700-4707`). Chart.js 4.4.1 is loaded from cdnjs when needed (`:14380`). Google Fonts. Pexels images on the landing page. | |
| `comprehension.html` | 1,460 lines, **one classic `<script>`** (188–1458). localStorage only (`readup_comprehension_v1`). One Cloud Function (`generateStory`, `:197`). `library.json` is fetched from the same folder (`:207`). | |
| Cloud Functions | `generateStory`, `extractText`, `extractSpellingWords`, `batchDefine`, `extractDocument` (Anthropic `claude-haiku-4-5-20251001`). `synthesizeSpeech` (ElevenLabs, with Google TTS fallback). `transcribeSpeech` (Google STT; **the client never calls it**: `CF_STT` is defined at `index.html:4703` and never used). | `functions/index.js:15-503`, `functions/tts.js`, `functions/stt.js` |
| Grade range in `index.html` | Grade pickers offer **Pre-K, K, 1, 2, 3 only** (5× each `data-grade`). The AI system prompt says "kids ages 3-9" (`functions/index.js:~40`). Dictionary and sentence prompts top out at "3rd grade" (`index.html:7424`, `:11432`). The stated audience is grades 3–5, so this is a mismatch. Pedagogy is out of my scope; flagged here as a requirements mismatch. | |
| `comprehension.html` discoverability | `index.html` never links to it (no "comprehension" string). It is reachable only by URL. It links back with `./`. | grep |

---

## 2. Feature inventory & health table

The "Dep." column uses these abbreviations:
- **LS**: localStorage
- **RTDB**: Firebase Realtime Database
- **Auth**: Firebase Auth
- **CF**: Cloud Function
- **Anth**: Anthropic
- **11L**: ElevenLabs
- **GTTS**: Google TTS
- **WSA**: Web Speech API (`speechSynthesis`)

"Static OK" means the bound element ids exist, the handler is defined and reachable, and the code parses. No `index.html` feature could be run in a browser here (no Playwright, and a sign-in is required). So for `index.html`, NOT TESTED means runtime is unverified.

### 2a. index.html

| # | Feature / workflow | Entry point (file:line) | Handler | Dep. | Status |
|---|---|---|---|---|---|
| 1 | Splash → auth-state routing | `index.html:15703`, `:4570` | `onAuthStateChanged`, `hideSplash` `:4563` | Auth | SUSPECTED PROBLEM: there is no fallback if the gstatic SDK import fails. See R5. |
| 2 | Landing page (marketing, CTAs) | `:15265`; CTAs `:4608` | ids `lp-*-btn` → auth modal | none | NOT TESTED (static OK) |
| 3 | Email sign-up / sign-in / verify / reset | `:4026-4189` | `btn-email-signup` `:4125`, `btn-email-signin` `:4046`, `btn-verify-done` `:4091`, `btn-send-reset` `:4181` | Auth | NOT TESTED (not signed in, by rule) |
| 4 | Google sign-in (popup; redirect on iOS) | `:4210` | `signInWithRedirect`/`signInWithPopup` `:4214-4217` | Auth | NOT TESTED |
| 5 | Child profiles: grid, add, edit, delete, switch | `:4250`, `:4350`, `:4459`, `:4508`; badge `:1683` | `renderProfileGrid`, `selectChildProfile`, `btn-add-child-save` | RTDB `users/{uid}/children` | NOT TESTED |
| 6 | Cloud sync of child data | `:3885-3950`, `:4374` | `syncToCloud`, `pullFromCloud`, `pushToCloud`, `onValue` | RTDB + LS | NOT TESTED |
| 7 | Home: category sheets (Practice Reading / Word Work) | `:4632-4640` | `show('sheet-…')` | none | NOT TESTED (static OK) |
| 8 | Built-in story picker (offline stories) | `getStory` `:5041`, `STORIES` `:4982` | | none | NOT TESTED |
| 9 | Story wizard / Story Builder → AI story | `:2158-2224`; `btn-generate` `:5807` | `generateAIStory` `:4789` → `fetch(CF_STORY)` `:4966` | CF+Anth | Depends on paid provider; status unknown. AI stories are **not** run through the client safety filter (see R10). |
| 10 | Read screen: play/pause/stop TTS, word highlight, progress | `:2558`; `btn-play` `:5722` | `playSpeech` `:5502`, `fetchTTSAudio` `:5473`, `startHighlightLoop` `:5347` | CF+11L/GTTS | Depends on paid provider; status unknown. Highlight logic is SUSPECTED fragile (R8). |
| 11 | Read settings (voice, speed) | `btn-read-settings` `:7860`, `:7188` | | none | NOT TESTED (`read-settings-drawer` id no longer exists; the code is null-guarded) |
| 12 | Tap a word → dictionary popup (+ hear it) | word spans `:7362`; `showDictionaryPopup` `:7470` | `getWordDefinition` `:7417` → `fetch(CF_STORY)` `:7430`; `sayDictEntry` `:7788` | CF+Anth, CF TTS, WSA fallback | Depends on paid provider; status unknown. Not keyboard-accessible (A2). |
| 13 | Sight-word popup | `showSightWordPopup` `:7575` | | WSA | NOT TESTED |
| 14 | Re-read ×3 / solo complete / confetti | `:2628`; `:7883-7894` | `showReadComplete` `:9212`, `recordReadComplete` | LS | NOT TESTED |
| 15 | Reading Mode overlay (full-screen text) | `btn-reading-mode` `:14834`; overlay built at `:14819` | `closeReadingMode` `:14865` | CF TTS | NOT TESTED (static OK: overlay is created before its listeners are bound) |
| 16 | Bottom bar (back/play/pause/stop/settings) | `:15018-15065` | `updateBottomBar` `:14966` | none | NOT TESTED |
| 17 | Scan My Page (photo → text) | `btn-scan-page` `:6036`, `scan-file-input` `:6190` | `processUploadedImage` `:6580` → `fetch(CF_OCR)` `:6513/6550` | CF+Anth vision | Depends on paid provider; status unknown |
| 18 | Upload document (PDF/DOCX) | `readUploadedFile` `:4713`, `processUploadedFile` `:6436` | `fetch(CF_DOC)` `:6467/6490` | CF+Anth (+mammoth) | Depends on paid provider; status unknown |
| 19 | Own passage: paste / scan / continue | `:3422-3459`; `:6042-6185` | `checkContentSafety` `:6161` | LS | NOT TESTED |
| 20 | Together/Race a Friend: create room, join by code, countdown, synced playback | `:2282-2553`; `btn-create-room` `:6249`, `btn-join-room` `:6814` | `createRoom` `:7016`, `startCountdown` `:7074`, `broadcastPlayback` `:6727`, `listenForPartnerPlayback` `:6744` | RTDB `rooms/{code}` | NOT TESTED (multi-device and RTDB writes are out of bounds) |
| 21 | Together: host picks AI / paste / spelling content | `:6278-6621` | `hostSetStory` `:6317` | CF+Anth, RTDB | Depends on paid provider; status unknown |
| 22 | Race results | `:3606`; `:9011-9014` | | RTDB | NOT TESTED |
| 23 | Word Bank (saved words): Story/Vocab tabs | `:2670`; tabs `:2678-2679` | `onclick="wbSwitchTab()"` → fn `:7933` | LS | **CONFIRMED BROKEN** (tabs throw ReferenceError, see F2) |
| 24 | My Words list | `:2032`; `renderMyWords` `:9368` | | LS | NOT TESTED |
| 25 | My Readings (saved passages, rename, read again) | `:2067`; `renderMyReadings` `:8580` | `savePassageToMyReadings` `:8544` | LS/RTDB | NOT TESTED |
| 26 | Timed Reading (WPM): grade, source (AI/scan/paste), instructions, read, tap last word, results | `:3359-3533`; `btn-timed-reading-home` `:8868` | `startWPMRead` `:8175`, `showTapLastWord` `:8281`, `saveWPMScore` `:8338`, `showWPMResults` `:8762` | LS (+CF for AI/scan) | NOT TESTED (last two commits touched this screen, see R7) |
| 27 | Spelling: sources (My Words / Dolch / Fry), grade + group pick | `:2712-2827`; `:9606-9622` | `loadSightWordSet` `:9796` → `fetch('./dolch.json' / './fry.json')` `:9651/9816` | none (static JSON) | CONFIRMED WORKING for the asset fetch (files exist, parse, live 200). UI NOT TESTED. |
| 28 | Spelling: upload list (photo/PDF/DOCX) or type | `spelling-file-input` `:9976`; `btn-spell-type-go` `:9908` | `fetch(CF_SPELLING/CF_OCR/CF_DOC)` `:9997-10005`; `fetchDefinitionsBatch` `:10276` → `CF_BATCH_DEF` | CF+Anth | Depends on paid provider; status unknown |
| 29 | Spelling practice (MC / fill-in), hear word | `btn-spelling-practice` `:10341`; `spell-practice-hear` `:10618` | `startSpellingPractice` `:10519`, `sayWordForPractice` `:10624` | CF TTS, WSA fallback `:10645` | NOT TESTED (hear button not keyboard-operable, A2) |
| 30 | Spelling quiz | `btn-spelling-quiz` `:11072` | `startSpellingQuiz` `:11080` | CF TTS | NOT TESTED |
| 31 | Sentence mode (AI example sentence) | `btn-spelling-sentence` `:11320` | `startSentenceMode` `:11359` → `fetch(CF_STORY)` `:11434/11512` | CF+Anth | Depends on paid provider; status unknown |
| 32 | Games: Word Search, Word Scramble | `:11621-11626` | `generateWordSearchGrid` `:11667`, `startWordScramble` `:11916` | none | NOT TESTED |
| 33 | Spelling Study Mode overlay | `btn-spelling-study` `:15169` | `openSpellingStudyMode` `:15174` | CF TTS | NOT TESTED |
| 34 | Vocabulary: upload / type list, AI definitions | `:3177-3242`; `vocab-file-input` `:12385`, `btn-vocab-type-go` `:12298` | `parseMeaningsFromText` `:12357`, `fetchVocabDefinitions` `:12563` → `CF_BATCH_DEF` | CF+Anth | Depends on paid provider; status unknown |
| 35 | Vocabulary study, flashcards, practice, definition quiz, word search | `:12615-12676` | `renderVocabFlashcard` `:12727`, `startVocabPractice` `:12779`, `startVocabDefinitionQuiz` `:12882` | none/CF TTS | NOT TESTED (flashcard is a click-only `div`, A2) |
| 36 | Assignments (home badge) | `btn-assignments-home` `:4661` | `updateAssignmentsBadge` `:4677` | LS/RTDB | NOT TESTED |
| 37 | Parent PIN gate | `screen-pin` `:3651`; `:12993-13034` | `pinBuffer === (d.pin \|\| '1234')` `:13016` | LS | NOT TESTED (default PIN 1234, R11) |
| 38 | Parent dashboard (stats, WPM chart, sessions chart, timed readings tab) | `openParentDashboard` `:13040`; `renderTimedReadingsTab` `:14175` | Chart.js `:14295/14416` | CDN, LS | NOT TESTED |
| 39 | Dashboard: Assign passage to child / delete passage | `:14509-14510` | `onclick="retryPassageFromDash()"`/`deletePassageFromDash()` (fns `:14518/:14560`) | LS | **CONFIRMED BROKEN** (F2) |
| 40 | My Week planner (parent wizard, publish, clear) | `renderMyWeekDash` `:13183`, wizard `:13262`/`:13570`, publish `:13768` | | LS/RTDB | NOT TESTED |
| 41 | My Week home card (child) | `:1928` | `onclick="openMyWeekChild()"` (fn `:13839`) | LS | **CONFIRMED BROKEN** (F2) |
| 42 | My Week child checklist / Active lock mode | `renderMyWeekChildScreen` `:13848`, `openMyWeekActive` `:13959`, `launchMwTask` `:13899`, `launchMwaTask` `:14104` | `window._mwMode` | LS | NOT TESTED overall. **Vocabulary Test task is CONFIRMED BROKEN** (F1). |
| 43 | Bedtime (dark warm) mode | `btn-bedtime` `:12977`; `applyBedtime` `:12964` | | LS | NOT TESTED |
| 44 | Data export / import / reset / clear words / change PIN | `:14620-14695` | | LS | NOT TESTED |
| 45 | Global Parent menu / Help modal | `:15108-15130`; overlay `:15233` | `showAppModal` `:5147` | none | NOT TESTED |
| 46 | Content safety filter (paste, upload, words, sentence) | `checkContentSafety` `:5124` (10 call sites) | regex `BLOCKED_REGEX` `:5103` | none | CONFIRMED WORKING as coded, with **CONFIRMED false positives** (F6) |
| 47 | Welcome / first-run tutorial | `screen-welcome-1` `:1768`; `btn-welcome-go` `:14765` | | LS | NOT TESTED. Dead branch for `btn-show-welcome` / `screen-welcome-2..4` (ids don't exist; null-guarded) |

### 2b. comprehension.html (all local; one optional paid AI path)

| # | Feature | Entry (file:line) | Handler | Dep. | Status |
|---|---|---|---|---|---|
| C1 | Load + home render | `comprehension.html:1457-1458` | `load()` `:323`, `render()` `:820` | LS | **CONFIRMED WORKING** (headless harness) |
| C2 | Readers: add (validates empty name), edit levels (clamped), remove | `renderKids` `:908`; click `:1386`, input `:1423` | | LS | **CONFIRMED WORKING** (harness). Note: the edit clamp is 100–1200 but the input `max=1100` (`:918` vs `:1431`). |
| C3 | Pick reader(s) (max 2), structure, source (library/AI), topic | `:1359-1367` | `sel` state | none | **CONFIRMED WORKING** (harness) |
| C4 | 5-step session (Teach → Listen → Read → Organize → Retell) from **library** | `startSession` `:1152`, `ensureStory` `:1176`, `goStep` `:1209`, `finishSession` `:1231` | `pickFromPool` `:234` | `library.json` | **CONFIRMED WORKING** (harness: listen `sequence-700-a`, read `sequence-400-a`, finish → progress; used ids recorded; 2nd session picks an unused story) |
| C5 | AI story source | `generateLeveled` → `fetch(CF_STORY)` `:430` | | CF+Anth | Depends on paid provider; status unknown. **Offline fallback CONFIRMED WORKING**: with the network blocked, the error card shows Retry plus "Use a library story", and that button recovers. |
| C6 | Print pack (stories + organizer) | `printPack` `:1280` | `window.print` | none | **CONFIRMED WORKING** (logic; print rendering NOT TESTED) |
| C7 | Placement check (adaptive levels 200–900, timer, miss counter, mark answers, listening check, save) | `startPlacement` `:525`, `placementNext` `:536`, `placementResult` `:551`, `savePlacement` `:650`; click `:1312` | | `library.json` | **CONFIRMED WORKING** for the flow (all-correct run: 500→600→700→800, listen check `place-900-b`, saved practice=800/listen=1000). **SUSPECTED PROBLEM** in the logic: see F7. |
| C8 | Progress view (SVG chart with `role="img"`) | `renderProgress` `:1118` | | LS | **CONFIRMED WORKING** (renders after finish) |
| C9 | Session timer / WPM | `tick` `:1258`; `data-act="timer"` | | none | NOT TESTED (timers were stubbed) |

---

## 3. Confirmed findings (verified by checks I ran)

**Static checks that pass (CONFIRMED WORKING)**
- S1. `node --check` passes on the `index.html` module script (checked as `.mjs`, 551,594 chars), the `comprehension.html` classic script, and `functions/index.js`, `functions/stt.js`, `functions/tts.js`.
- S2. All JSON files parse: `library.json`, `fry.json`, `dolch.json`, `package.json`, `firebase.json`, `.firebaserc` and `functions/package.json`.
- S3. `library.json` schema:
  - 108 sessions = 6 structures × 6 levels (300–800) × 3. Every `structure` value matches the `STRUCTURES` ids in `comprehension.html`.
  - 24 placement passages cover every level 200–900 (3 per level), each with 5 typed questions (literal / vocab / inference / structure).
  - No missing required fields, no empty paragraphs, no duplicate ids, and every stop's `after` index is within range.
  - **Data note:** 5 duplicate titles. "The Cardboard Rocket" appears as both `sequence-600-c` and `problem-400-c`. Four description sessions share titles with placement passages ("Busy Honeybees", "Our Moon", "The Amazing Octopus", "Cities Under the Sea"), so a child may see a title they recognize from placement.
- S4. Running the app's own `textStats()` estimator on every passage: all 132 are within ±100L of their label (mean +15/+16). Average estimate rises monotonically with the labeled level.
- S5. `fry.json`: 400 words (k–3); `dolch.json`: 220 words (prek–3). Counts match `meta`, with no duplicate words. Minor: the Fry `meta.description` says "1000 most common words" but the file holds 400.
- S6. No top-level null dereference from missing element ids. 201 top-level `getElementById(...).addEventListener` statements all target ids that exist in static HTML or are created earlier (the reading overlay at `:14819`). The 5 missing ids (`together-debug-log`, `read-settings-drawer`, `btn-open-parent`, `btn-show-welcome`, `screen-welcome-4`) are all null-guarded dead code.
- S7. Relative fetch targets exist: `./fry.json`, `./dolch.json`, `library.json` (served live with HTTP 200).
- S8. Production equals repo `HEAD`.

**CONFIRMED BROKEN**
- **F1. My Week "Vocabulary Test" task throws `ReferenceError: startVocabQuiz is not defined`.**
  - The calls are at `index.html:13949` (`launchMwTask`) and `:14154` (`launchMwaTask`).
  - No `startVocabQuiz` has ever existed in git history (`git log -S"function startVocabQuiz"` returns nothing). It was introduced in `10e99e8`/`f1183c1` (2026-03-21). The real function is `startVocabDefinitionQuiz` at `:12882`.
  - Both call sites also point back to a non-existent screen `screen-vocab-quiz` (`:13950`, `:14155`).
  - Effect: a parent-assigned vocabulary test cannot be started by the child.
  - Verified by a static undeclared-call scan of the extracted module plus a grep of the whole file.
- **F2. Inline `onclick="fn()"` handlers call functions declared inside `<script type="module">`, so they are not global and every click throws `ReferenceError`.**
  - Verified two ways: a static check (none of these names is assigned to `window`), and a Node demo showing that a module-declared function is `typeof globalThis.fn === 'undefined'` while the classic-script equivalent is a function.
  - Affected:
    - `myweek-home-card` → `openMyWeekChild()` (`:1928`, fn `:13839`). The child's My Week home card does nothing when tapped.
    - `wb-tab-story` / `wb-tab-vocab` → `wbSwitchTab()` (`:2678-2679`, fn `:7933`). The Word Bank tabs can't be switched by the user; only the internal call at `:8077` works.
    - Dashboard "Assign to Child" / delete → `retryPassageFromDash()` / `deletePassageFromDash()` (`:14509-14510`, fns `:14518`, `:14560`).
  - (The `attempts-${idx}` toggle at `:14508` and the landing anchors `:15272-15273` use only `document` and work.)
  - Confirming this in a real browser is still recommended (see §7).
- **F3. Release process put a wrong file into production.** Commit `b8aae91` (2026-04-15 18:11) replaced the 15,675-line `index.html` with a different 785-line single-page app with an unrelated title (not ReadUp). It was restored 9 minutes later by `9d912aa`, under the same commit message. Because Pages deploys from `main`, readupapp.com very likely served the wrong app during that window. Other history signals: 13 "Delete index.html", 12 "Add files via upload", 271 commits titled "Fix word highlight sync drift on long passages" (+32,383 / −20,603 lines, touching 263 `index.html` revisions and also `functions/tts.js` and `functions/index.js`), and duplicated "Build JS/JR" pairs.
- **F4. Text contrast fails WCAG 1.4.3 (AA) on primary buttons.** I computed the ratios from the CSS tokens:
  - White on `--purple #FF6B35` = **2.84:1**. This covers `index.html` `.btn-main` (`:249`, 1.2rem/600) and `comprehension.html` `.btn` (`:65`, 16px/800). AA requires 4.5:1, or 3:1 for large text, so even the large-text threshold fails.
  - White on `--orange #FF9F43` = 2.04:1.
  - `--green #5CD85A` text on white = 1.84:1 (36 inline uses in `index.html`, e.g. the WPM pass colors at `:14505`).
  - `--coral #FF6B6B` text on white = 2.78:1.
  - In `comprehension.html`: `--green #2E9E4F` (answer text, `:129`) = 3.43:1 and `--brand-deep` on `--brand-soft` (selected chip) = 3.24:1. Both fail for normal text.
  - `comprehension.html` chip borders `#F0E6D8` vs white = 1.23:1, which fails 1.4.11 non-text contrast.
- **F5. Duplicate element ids** (invalid HTML; assistive tech and `getElementById` resolve only the first):
  - `btn-inscreen-back-screen-pick` ×8 (`:2160,2537,2560,2630,2672,2714,3179,3361`)
  - `…-screen-together-pick` ×2
  - `…-screen-spelling-source` ×3
  - `…-screen-spelling` ×2
  - `…-screen-vocab-source` ×2
  - `…-screen-vocab` ×3

  Functionally harmless today, because BACK uses delegated `[data-back-target]` at `:15079`.
- **F6. The child-safety word filter over-blocks ordinary text.** I ran the app's own `checkContentSafety`/`BLOCKED_REGEX` (`index.html:5063-5137`).
  - BLOCKED: "Molly the cat found a crack in the sidewalk.", "pulled a weed", "Lions kill zebras to eat.", "studied the sex of the sea turtles".
  - It would block **2 of ReadUp's own 132 library passages** if they were pasted into the main app (`cause-700-b` "tiny crack", `description-400-a` "a crack, or a pile").
  - It misses `f.u.c.k`.
  - `filterContent()` (`:5139`) is defined but never called.
  - `escapeHtml` doesn't escape `'`, yet it is used inside single-quoted JS in `onclick` (`:14509`). Passage ids are app-generated, so this is low risk.

**Observed behavior that is questionable (SUSPECTED PROBLEM, verified by running)**
- **F7. Placement check floor.** In a headless run, a reader starting at 800 who misses every question descends 800→700→600→500, hits `PLACE_MAX_ROUNDS = 4` (`comprehension.html:488`), and is assigned practice = 400. The levels 400/300/200 are never tested. A struggling grade-3 reader whose school Lexile is high could be under-measured. This is a design question for pedagogy (Agent 3); the logic is in `placementNext` `:536-549`.

---

## 4. Risks and severity

| ID | Sev | Status | Risk |
|---|---|---|---|
| F1 | **P1** | CONFIRMED BROKEN | My Week vocabulary test can't launch (`startVocabQuiz` undefined) |
| F2 | **P1** | CONFIRMED BROKEN | My Week home card, Word Bank tabs, and dashboard Assign/Delete passage are dead (module-scope `onclick`) |
| F3/R1 | **P1** | CONFIRMED (history) | No tests, no CI, no staging; uploads through the web UI go straight to production. A wrong-app deploy has already happened. |
| F4 | **P1** | CONFIRMED BROKEN (WCAG) | Primary button and feedback colors fail AA contrast. This affects every screen and matters for school procurement (WCAG 2.1/2.2 AA, Section 508, ADA Title II). |
| R5 | **P1** | SUSPECTED | Full-screen `z-index:9999` splash (`:15703`) is hidden only inside `onAuthStateChanged` (`:4570-4603`). If the gstatic SDK import is blocked (common on school filters) or the module throws before `:4570`, the child sees "Loading..." forever with no message. There is no timeout, no `<noscript>`, and no service worker. |
| A1 | P2 | CONFIRMED (static) | 20 of 30 static form controls have no programmatic label: all auth inputs (`signin-email`, `signup-password`, …), `own-paste-textarea`, `timed-paste-textarea`, `sentence-input`, `speed-slider`, `new-pin-input`, `new-child-*`. They rely on placeholders. In `comprehension.html`, the edit-reader labels (`:914-920`) aren't associated with their inputs (no `for`/`id`). Fails 1.3.1, 3.3.2, 4.1.2. |
| A2 | P2 | CONFIRMED (static) | Click-only, non-focusable targets fail 2.1.1 Keyboard and 4.1.2:<br>• story **word spans** (tap-to-define, `:7360-7365`)<br>• `spell-practice-hear` and `quiz-hear` (`role="button"` but no `tabindex`/key handler, `:2956`, `:3070`)<br>• `scramble-hear` `:3156` and `vocab-flashcard-wrap` `:3295` (plain divs)<br>• `.avatar-option` divs<br>• `myweek-home-card` div<br>• in `comprehension.html`: `.kid` cards (`:832`) and `[data-toggle]` answer-reveal divs (`:725`, `:986`, `:1081`)<br>Only `active-profile-badge` has `tabindex`+`keydown` (`:1683`, `:4451`). |
| A3 | P2 | CONFIRMED (static) | Selected state is shown by color only: chips (`.chip.on`, `comprehension.html:82`), voice and grade buttons. There are **0** `aria-pressed`/`aria-selected`/`aria-checked` in either file (1.4.1, 4.1.2). |
| A4 | P2 | CONFIRMED (static) | Focus visibility: `outline:none` appears on 12 rules or inputs, including inline-styled naming inputs (`:8461`, `:8518`, `:12133`) and list-label inputs (`:9531`, `:12183`), with no `:focus` replacement. Other inputs swap only the border color. There are 0 `:focus-visible` rules (2.4.7). |
| A5 | P2 | CONFIRMED (static) | `comprehension.html` has **no live regions** (0 `aria-live`/`role=status`), so loading ("Writing a passage…"), errors, and scoring changes are silent to screen readers (4.1.3). `index.html` has 7 live regions (`loading-msg`, `join-error`, `word-toast`, `dict-definition`, PIN, import/export). Correct/incorrect feedback in practice, quiz and scramble is not announced. |
| A6 | P2 | CONFIRMED (static) | Dialogs: only 3 `role="dialog"`. `app-modal-overlay` (`:15245`), the dictionary popup and the naming wizards have no dialog role, focus trap or focus return. Escape is handled only for some overlays (`:14893`, `:15224`). |
| F6 | P2 | CONFIRMED | Safety filter false positives block legitimate passages and names. AI-generated stories, definitions and sentences are not filtered on the client; this relies on the model system prompt (`functions/index.js` system string). `comprehension.html` has no filter at all. |
| F7 | P2 | SUSPECTED | Placement can't measure below `start−300`. |
| R6 | P2 | CONFIRMED (static) | Grade coverage in `index.html` is Pre-K–3, while the product targets grades 3–5. Prompts and voices are keyed to ≤3rd grade. |
| R7 | P2 | SUSPECTED | Timed-reading tap screen and My Week lock changed in the last 4 commits (`b8aae91`/`9d912aa`/`9d97088`/`ca76460`) with no regression test. The lock state `window._mwMode` (`:13020`, `:13900`, `:13963`) is in-memory, set from 3 places and read in 15+ places. |
| R8 | P2 | SUSPECTED | **Word-highlight sync** (`startHighlightLoop` `:5347-5455`, `playSpeech` `:5502+`, `functions/tts.js:83-145`). It maps server word timings to DOM spans **by index**, and only `console.warn`s on a count mismatch (`:5377`). It uses magic offsets (20 ms here, 50 ms in the dictionary loop at `:7723`), a duration-rescale heuristic (`:5363`), and a fuzzy ElevenLabs alignment merge. This is the hottest churn area (271 commits) and has no fixtures or tests. Any change to text normalization (`:5482`) or tokenization (`:7358`) silently shifts highlights. |
| R9 | P2 | SUSPECTED | `functions/tts.js:5` wraps the handler in `cors({origin:["https://bazeocrisy.github.io"]})` (not readupapp.com), inside an `onRequest({cors:true})` (`:332`). This probably still works because the outer CORS sets headers, but it is inconsistent with `functions/index.js:9-13`. `stt.js` uses `origin:true`. Depends on paid provider; status unknown. |
| R11 | P2 | CONFIRMED (static) | Default parent PIN is `'1234'` (`:13016`). Deferred to Agent 5 for privacy impact. |
| R12 | P3 | CONFIRMED (static) | Dead code and unused items:<br>• `CF_STT`<br>• `filterContent`<br>• `btn-open-parent` / `btn-show-welcome` / `screen-welcome-2..4` branches (`:12999`, `:14778-14811`)<br>• `together-debug-log`<br>• `read-settings-drawer`<br>• the `transcribeSpeech` function deployed but never called (cost surface) |
| R13 | P3 | CONFIRMED (static) | No `</body></html>`. 58 animations, including infinite ones (`lpbob`), with no `prefers-reduced-motion` (2.2.2, 2.3.3). 111 `px` font sizes, mostly small labels; zoom isn't blocked, so this only reduces text-spacing robustness. |
| R14 | P3 | CONFIRMED | `comprehension.html` is unlinked from the app. README/DEPLOYMENT still point to `bazeocrisy.github.io/reading-assistant-app`. Duplicate library titles (S3). |
| R15 | P3 | NOT TESTED | No CSP or SRI on CDN scripts (gstatic, cdnjs). Firebase RTDB security rules are not in the repo, so they can't be verified (privacy agent). |

---

## 5. Evidence (file:line quick index)

- Module script boundaries: `index.html:3854`–`15231`. Classic script: `comprehension.html:188`–`1458`.
- F1: `index.html:13949`, `:13950`, `:14154`, `:14155`; the real fn is at `:12882`.
- F2: `index.html:1928`, `:2678`, `:2679`, `:14509`, `:14510`; fn defs at `:13839`, `:7933`, `:14518`, `:14560`.
- F3: `git show --stat b8aae91` (709+/15600−) and `git show b8aae91:index.html | grep "<title"`.
- F4: tokens at `index.html` `:root` (`--purple #FF6B35`, `--green #5CD85A`, `--coral #FF6B6B`); `.btn-main` `:249-255`; `comprehension.html` `.btn` `:65-68`, `.q .a` `:129`.
- F5: lines listed in §3.
- F6: `index.html:5063-5143`; call sites `:6161, 6356, 6387, 6571, 8963, 9921, 10017, 11470, 12332, 12453`.
- F7: `comprehension.html:488`, `:536-549`.
- R5: `index.html:4563-4603`, `:15703`.
- R8: `index.html:5347-5455`, `:5473-5497`, `:7355-7366`; `functions/tts.js:83-145`, `:178`.
- R9: `functions/tts.js:5`, `:327-336`; `functions/index.js:9-13`.
- Viewport: `width=device-width, initial-scale=1.0, viewport-fit=cover` in both files. **No** `user-scalable=no`/`maximum-scale`, so zoom is allowed (CONFIRMED WORKING). `lang="en"` is present in both (CONFIRMED WORKING). Both `<img>` tags have meaningful `alt` (`:15290`, `:15308`).
- Autoplay: no `autoplay` attribute. The 5 matches are autoplay-blocked handling for the guest device in Together mode (`:5614-5691`). Audio starts only on a user gesture: CONFIRMED (static).

Audit scripts used, which ran read-only against the repo. They lived in a temporary local workspace and are **not committed in this PR**. Turning them into real tests is the Tier 0/1 work in §7a, to be done in a follow-up PR:
- `analyze.js`: script extraction, `node --check`, id/handler/fetch/URL/a11y counts
- `unguarded.js`: null-deref scan
- `undef_calls.js`: undeclared-call scan
- `clicktargets.js`: non-native click targets and handler-by-screen map
- `validate_json.js`, `levels.js`: library schema and level check
- `safety.js`: filter probe
- `comp_harness.js`: **31/31 headless comprehension checks**
- `scope_demo.mjs`: module-scope proof
- production file copies, used only for the live-vs-repo hash comparison (not kept)

---

## 6. Recommended changes (ordered)

1. **F1:** replace `startVocabQuiz(list.words)` with `startVocabDefinitionQuiz(list.words)` (it needs words with definitions; mirror `:12663-12673`). Point `SCREEN_BACK_MAP` at the actual quiz screen id instead of `screen-vocab-quiz`.
2. **F2:** remove the 5 inline `onclick` attributes. Bind them with `addEventListener`, using delegation for the dashboard cards (`data-passage-action="assign|delete" data-id=…`). Add a static CI check that fails on `onclick="ident(` in module pages.
3. **Release safety (F3/R1):**
   - Protect `main`.
   - Change only through PRs, as PRs #1–#3 for comprehension already did.
   - Add a GitHub Action that runs the checks in §7 and blocks the merge.
   - Use meaningful commit messages, and stop uploading whole files through the web UI.
   - Optionally deploy a preview channel first.
4. **R5:** add a timeout (e.g. 8 s) that replaces the splash with "Can't reach ReadUp. Check your connection or ask your school to allow gstatic.com / firebaseio.com". Add a `<noscript>` message. Wrap the bootstrap in try/catch to surface errors.
5. **Contrast (F4):** darken the action colors. White text needs a background of about `#C2410C` or darker for 4.5:1. Use dark text on orange, and green/red text at ≥4.5:1 (e.g. `#1E7B34`, `#C62828`). Pair color with icons or text for pass/fail.
6. **Keyboard & semantics (A2/A3/A6):**
   - Convert click-only divs and spans to `<button>`, including word spans: a `<button class="word">` inside the text, or `role="button" tabindex="0"` with Enter/Space handling. Keep the tap-target size.
   - Add `aria-pressed` to toggle chips.
   - Give modals `role="dialog"`, `aria-modal`, a focus trap, Escape to close, and focus return.
7. **Labels/focus/live (A1/A4/A5):**
   - Associate `<label for>` or `aria-label` with every control.
   - Restore visible focus with a global `:focus-visible { outline: 3px solid #1F2937; outline-offset: 2px }`.
   - Add `aria-live="polite"` regions for loading, error and answer feedback in both pages.
8. **Safety filter (F6):**
   - Move from single-word blocking to context-aware lists. Allow-list names (Molly) and common words (crack, weed, kill in nature text, sex in a biology sense). Use a review prompt instead of a hard block.
   - Apply the same check to AI output on both pages.
   - Escape `'` in `escapeHtml`.
   - Delete or use `filterContent`.
9. **Highlight sync (R8):** make it deterministic and testable:
   - Have the server return timings keyed by the client's token index, plus the token list it used.
   - Assert that the counts are equal and show a fallback (weighted timing) visibly when they differ.
   - Extract `computeScaledTimings`/active-index search into pure functions with fixture tests built from saved timing JSON.
10. Housekeeping:
    - Remove `CF_STT`, the unused `transcribeSpeech` (or protect it), and the dead welcome/debug code.
    - Fix the duplicate ids.
    - Add `</body></html>`.
    - Add `prefers-reduced-motion`.
    - Link `comprehension.html` from the app.
    - Rename the duplicate library titles.
    - Update README URLs.
11. Placement (F7, with Agent 3): when every round fails, allow descending to the 200 floor beyond 4 rounds, or start lower.

---

## 7. Required verification

### 7a. Proposed automated test plan
These steps need tooling the owner installs later; I installed nothing.

**Tier 0: static gate (Node only; runs in seconds in CI).** Rebuild the audit scripts listed in §5 as committed tests:
- Extract inline scripts and run `node --check` on each (module as `.mjs`).
- **Fail** on any of these:
  - `onclick=` naming an identifier in a module page
  - a call to an undeclared function name (allow-list strings)
  - a `getElementById` target that is missing and not null-guarded
  - a duplicate static id
  - a `<title>` that differs from "ReadUp!" (catches a wrong-file upload like F3)
  - `index.html` < 10,000 lines
- JSON parse plus a `library.json` schema check (fields, structure ids, stop ranges, 5 typed placement questions, unique ids **and titles**, ±100L estimator check).
- Contrast lint on the `:root` tokens (pairs from F4 must reach ≥4.5:1).

**Tier 1: logic unit tests (Node, no browser).**
- `comp_harness.js`, turned into a test runner (Node's built-in `node:test`): readers, sessions, library rotation, placement up/down paths, AI-offline fallback. Also assert **zero** network calls other than `library.json`.
- Pure functions in `index.html` (move them into small ES modules so tests can import them): `checkContentSafety` (a fixture list of allowed and blocked sentences), `escapeHtml`, `storyHash`, `cleanStoryText`, `generateWordSearchGrid` (all words placed, grid in bounds), `generateSmartDistractor`, WPM math, `mwProgress`, highlight-index search and scaling (fixture timings).

**Tier 2: browser E2E (Playwright, later), with Firebase Emulator Suite (Auth + RTDB) and stubbed CF endpoints (`page.route('**/cloudfunctions.net/**', …)` returning recorded fixtures, so it costs nothing).**
- Smoke run per screen: sign up (emulator) → add child → home → built-in story → play with stubbed TTS audio plus timings → highlight advances in order → tap word → dictionary (stubbed) → complete ×3.
- Regression run per F-item:
  - tap the My Week home card → child checklist opens
  - Word Bank tabs switch
  - dashboard Assign/Delete work
  - My Week Vocabulary Test launches the quiz
  - no `pageerror` events during the whole run
- Timed reading: tap the last word → WPM correct for a fixture passage/time.
- Together mode: two browser contexts on the emulator; join by code; countdown; synced play.
- Offline / blocked CDN: block `gstatic.com` → a visible error appears within 10 s (R5).
- Accessibility: `@axe-core/playwright` on every screen at 375×812 and 1280×800 (zero serious/critical issues). Keyboard-only walkthrough of the main flows (Tab/Enter/Space/Escape). Reflow at 320 CSS px and 200% zoom.
- Manual: VoiceOver (iOS Safari) and TalkBack (Android Chrome) on read, spelling practice, and comprehension session; iPad Safari audio-autoplay and highlight sync on a 300-word passage.

### 7b. Acceptance criteria
- AC1: Tier 0 and Tier 1 pass in CI on every PR, and `main` is protected.
- AC2: No uncaught `pageerror`/console error in Tier 2 smoke runs on Chromium and WebKit.
- AC3: F1 and F2 each have a failing-then-passing E2E test.
- AC4: axe reports 0 serious/critical violations. All text ≥4.5:1 (large ≥3:1). Every interactive element is reachable and operable by keyboard with a visible focus indicator. Every form control has an accessible name. Feedback is announced through a live region.
- AC5: Highlight sync: for 3 fixture passages (short, 300-word, with punctuation and quotes), the highlighted index at t is within ±1 word of the reference over the whole clip at speeds 0.75/1.0/1.25. A token-count mismatch triggers a visible fallback, not silent drift.
- AC6: With CF endpoints failing, every AI-dependent screen shows a child-friendly error with a working retry or alternative within 10 s. No unbounded spinners.
- AC7: The safety-filter fixtures pass: 0 false blocks on ReadUp's own 132 library passages, plus agreed allow and block lists.
- AC8: The deploy check fails if `index.html` `<title>` or size deviates from expected (protection against F3).

### 7c. What I could not verify
- Any Firebase Auth/RTDB behavior.
- All Cloud Functions (paid providers), and the deployed functions vs repo code.
- Real-browser rendering, audio, and highlight timing.
- Together mode across devices.
- iOS/Android specifics.
- Firebase security rules (not in repo).

---

## 8. What must be preserved

- **Library-first, offline-capable Comprehension Mode.** Verified: it runs end to end without any AI call, and its AI-failure fallback ("Use a library story") works. Keep the `library.json` structure (6 structures × 6 levels × 3, plus 24 typed placement passages) and the estimator check.
- **Byte-identical static deploy model.** It is simple, cache-friendly, and production matched `HEAD`. Add gates, but don't add a build step that changes runtime behavior without tests.
- **Delegated BACK navigation** (`[data-back-target]`, `:15079`) and `SCREEN_BACK_MAP`, which make the duplicate-id issue harmless. Keep them when fixing the ids.
- **Existing a11y positives:**
  - zoomable viewport
  - `lang="en"`
  - alt text
  - 68 `aria-label`s
  - live regions for loading/join/PIN/toast/dictionary
  - `role="img"` on the comprehension progress chart
  - ≥48px buttons in `comprehension.html` (`min-height:48px`)
  - no autoplay without a gesture
- **Null-guarding pattern** for optional elements (S6) and the `playSpeechId` cancellation token in TTS (`:5499`, `:5517`).
- **The child-safety intent** (a pre-check on pasted and uploaded text). Refine it as described in §6 item 8; don't remove it.
- **The CORS allow-list** in `functions/index.js:9-13` (extend it to `tts.js`, don't loosen it).
