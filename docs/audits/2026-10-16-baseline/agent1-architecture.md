# ReadUp! Architecture & Security Audit — Agent 1 (Lead Software Architect)

- **Repo:** github.com/bazeocrisy/reading-assistant-app, `main` @ `eec9e78` (local read-only clone `C:\Users\bazeocrisy\Projects\ReadUp-audit`)
- **Date:** 2026-10-16
- **Method:** Static reading of the code only. I made no network calls to production, Firebase, Cloud Functions, or paid APIs, and I changed no repo files. I pulled the inline scripts out to a scratch folder and ran `node --check` on them and on `functions/*.js`. All of them parse.
- **Labels:** **[EVIDENCE]** = I saw it in the code (file:line given). **[INFERENCE]** = my reasoning from the code that needs a runtime or console check. **[ASSUMPTION]** = depends on configuration that isn't in the repo (Firebase console, GCP, GitHub settings).
- **Not verified:** how production Firebase actually behaves (RTDB security rules, API-key restrictions, App Check, deployed function versions, billing caps). None of that is in the repo.

---

## 1. Current implementation

### 1.1 Files and size
| File | Lines | Shape |
|---|---|---|
| `index.html` | 15,706 (869 KB) | **One `<style>` block** (12–1669, about 1,650 lines of CSS). Static HTML for **about 60 `screen-*` sections** (1670–3853, plus more after the script, 15232–15706: overlays, auth, profiles, landing page). **One `<script type="module">`** (3854–15231, about 11,380 lines). 1,441 inline `style="…"` attributes, about 565 JS `.style.x =` writes, 201 named functions, 341 `addEventListener` calls, 130 `innerHTML` writes. |
| `comprehension.html` | 1,460 (80 KB) | One `<style>` (11–175) and **one classic `<script>`** (188–1458). Renders by templating `app.innerHTML`. Uses `esc()` consistently (67 calls). |
| `library.json` | 1 line (326 KB) | `{version:1, note, sessions[108], placement[24]}`. Each item: `id, structure, level, genre, topic, title, paragraphs, stops, questions`. Used only by `comprehension.html`. |
| `fry.json`, `dolch.json` | — | Keyed by grade (`prek/k/1/2/3` + `meta`). `index.html` fetches them with relative `./${source}.json` (9651, 9816). |
| `functions/index.js` | 502 | 5 HTTP functions (`generateStory`, `extractText`, `extractSpellingWords`, `batchDefine`, `extractDocument`). It also re-exports `synthesizeSpeech` (tts.js) and `transcribeSpeech` (stt.js). |
| `functions/tts.js` | 372 | ElevenLabs TTS with timestamps, falling back to Google Cloud TTS (SSML marks). |
| `functions/stt.js` | 100 | Google Speech-to-Text plus a reading-accuracy scorer. |
| `firebase.json` | — | **Functions only.** No `hosting`, `database` (rules), `firestore`, `storage`, or `emulators` section. |
| `CNAME` | — | `readupapp.com`, so the site is served by **GitHub Pages** ([ASSUMPTION] the Pages settings themselves aren't visible). |
| `package.json` (root) | — | Declares `@google-cloud/speech`, `@google-cloud/text-to-speech`, `mammoth`. **Nothing in the static site uses them** [EVIDENCE: no imports in either HTML]. It's a leftover. |

There is no build step, bundler, linter, test suite, CI workflow (`.github/` is absent), service worker, web manifest, or Content-Security-Policy [EVIDENCE: grep for `serviceWorker|manifest|Content-Security-Policy|integrity=` found nothing].

### 1.2 Runtime architecture (as written)
```
GitHub Pages (readupapp.com; bazeocrisy.github.io)
 ├─ index.html  (ES module, Firebase JS SDK v10.12.0 from gstatic)
 │    ├─ Firebase Auth: email/password (+ verify email), Google popup / iOS redirect
 │    ├─ Firebase **Realtime Database** (NOT Firestore): users/{uid}/children/{childId}[/data], rooms/{4-digit}
 │    ├─ localStorage: readup_data_{childId}, readup_active_child, readup_dict_cache
 │    ├─ Web Speech API speechSynthesis (fallback only)
 │    ├─ Chart.js 4.4.1 (lazy, cdnjs, no SRI)
 │    └─ fetch → https://us-central1-readup-transforming-youth.cloudfunctions.net/{generateStory, synthesizeSpeech,
 │               extractText, extractSpellingWords, batchDefine, extractDocument}   (transcribeSpeech defined but unused)
 └─ comprehension.html (classic script, NO Firebase)
      ├─ localStorage: readup_comprehension_v1 (its own kids/sessions/placement)
      ├─ fetch ./library.json
      └─ fetch generateStory (AI is optional; the library comes first)

Cloud Functions v2 (Node 24, firebase-functions ^7.2.2), project readup-transforming-youth
 ├─ Anthropic Messages API (claude-haiku-4-5-20251001) via secret ANTHROPIC_API_KEY
 ├─ ElevenLabs (eleven_flash_v2_5) via secret ELEVENLABS_API_KEY → fallback Google TTS (Wavenet)
 └─ Google Speech-to-Text (latest_long, enhanced)
```

### 1.3 Firebase integration details
- **SDK:** modular v10.12.0, pinned exactly to `www.gstatic.com/firebasejs/10.12.0/…` [EVIDENCE index.html:3855–3857]. It is **not** the compat SDK. The pin is good for stability, but the version is about two majors old as of late 2026 [ASSUMPTION about the current release line].
- **Config:** inline object [EVIDENCE index.html:3859–3867]. `apiKey` is a Firebase **web API key** (`AIza…<REDACTED>`, index.html:3861). It is a public project identifier, not a server secret, and history shows only this one value. It should be restricted in GCP (HTTP referrers + API restrictions) [ASSUMPTION: unknown whether it is]. `authDomain` = `readup-transforming-youth.firebaseapp.com` (3862). `storageBucket` is configured, but **Firebase Storage is never used**.
- **Auth methods:** `createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, `sendEmailVerification`, `sendPasswordResetEmail`, Google via `signInWithPopup` (non-iOS) or `signInWithRedirect` (iOS) [EVIDENCE 3857, 4210–4224, 4227]. Unverified email/password users are signed out **on the client only** [EVIDENCE 4056–4063].
- **Data paths:** `users/{uid}/children/{childId}` holds the profile (`id,name,nickname,grade,avatar,createdAt`, 4547–4549). `…/data` holds the whole progress blob (3925–3946). `rooms/{code}` holds partner reading (7016–7027, 6812–6822).
- **Security rules:** **none in the repo.** `firebase.json` has no `database` key. So the rules are console-managed, unversioned, and unreviewable here [EVIDENCE firebase.json]. Whether `users/$uid` is owner-only and whether `rooms` is open **cannot be verified from code**.
- **Cloud Functions auth:** **none.** No function reads an `Authorization` header, verifies a Firebase ID token, or checks App Check. The client never sends a token [EVIDENCE: grep `Authorization|getIdToken|appCheck` = 0 hits in all files].

### 1.4 Origin allowlists (complete list)
| Location | Mechanism | Allowed origins |
|---|---|---|
| `functions/index.js:9–13` (`CORS_ORIGIN`) used at 16, 72, 152, 259, 348 | v2 `onRequest({cors: CORS_ORIGIN})` | `https://bazeocrisy.github.io`, `https://readupapp.com`, `https://www.readupapp.com` |
| `functions/stt.js:3` | `require("cors")({origin: true})` | **any origin** (reflects the caller) |
| `functions/stt.js:45` | `onRequest({cors: true})` | **any origin** |
| `functions/tts.js:5` | `require("cors")({origin: ["https://bazeocrisy.github.io"]})` | github.io only (inner middleware) |
| `functions/tts.js:332` | `onRequest({cors: true})` | **any origin** (outer wrapper) |
| `index.html:4700–4707`, `comprehension.html:197` | hard-coded endpoint URLs | n/a |

No allowlist includes `localhost`, `127.0.0.1`, `*.web.app`, or `*.firebaseapp.com`. That is fine for production, but **local development against real functions is blocked** for the five index.js functions.

**[INFERENCE] tts.js uses two CORS layers.** The outer `cors:true` handles preflight and sets `Access-Control-Allow-Origin` to the request origin. The inner `cors` package (origin array) doesn't override the header for non-matching origins, because it emits a falsy value and skips it. So `synthesizeSpeech` is effectively open to every origin. **readupapp.com TTS only works because of the outer `cors:true`.** If someone "tightens" tts.js by deleting `cors:true`, TTS on readupapp.com breaks, because the inner list lacks readupapp.com. Either way, CORS is only a browser control. It does nothing against `curl` or scripts.

### 1.5 Data storage model
- **index.html (per child)** — localStorage key `readup_data_{childId}` (or `readup_data` when no child is selected) [EVIDENCE 9023–9027]. Schema defaults are applied in `getData()` (9081–9093): `pin`, `bedtimeMode`, `stories[]`, `wordBank[]`, `spellingLists[]`, `vocabLists[]`, `weeklyLog[]`, `timedPassages[]`, `assignments[]`, plus `wpmHistory`, `myWeek`, and `updatedAt` elsewhere. There is **no schema version field** in stored data (only the export envelope has `version:1`, 14663).
- **Sync:** `saveData` writes localStorage, then debounces `pushToCloud` by 3 s (9074–9078). `pushToCloud` **`set()`s the entire `/data` node** with 9 arrays (3925–3946). That makes it last-writer-wins at whole-document granularity. `pullFromCloud` makes the cloud win per field on child selection (3899–3922). The `onValue` listener applies newer cloud data using client-clock `updatedAt` comparisons (4374–4402).
- **Not synced:** `pin`, `bedtimeMode`, and `readup_dict_cache` (global across children, 7402).
- **comprehension.html** — a single key `readup_comprehension_v1` (198), with `DB = {kids, sessions, rotationStart, current, placement}` (323–333). **Its reader profiles are completely separate from index.html's Firebase child profiles.** There's no sign-in, no cloud backup, and it isn't included in index.html's export/import. index.html has **no link to comprehension.html** [EVIDENCE: grep `comprehension` in index.html = 0 hits]. comprehension.html links back with `./`.

### 1.6 Versioning / build markers
- The UI shows a hand-edited `BUILD JT` in two places [EVIDENCE index.html:1881, 3619]. The latest commit messages say "Build JS" / "Build JR". The export envelope hard-codes `appBuild: 'CL'` (14665). These three markers disagree.
- Commit history: 430 commits. **271 share the message "Fix word highlight sync drift on long passages"**, and there are 13 "Delete index.html" and 12 "Add files via upload" commits. That pattern points to whole-file uploads through the GitHub web UI [INFERENCE]. History can't be used to bisect, and every commit redeploys Pages live.
- README.md/DEPLOYMENT.md are out of date and **wrong in safety-relevant ways**. They claim Tesseract/PDF.js client-side OCR, "No files uploaded to servers", "No data collection", "Works offline", an ~80–90 KB file, and the github.io URL [EVIDENCE README.md "Privacy & Security", DEPLOYMENT.md "Security & Performance"]. The code now uploads images and documents to Anthropic, stores child data in Firebase, and sends text to ElevenLabs/Google.

---

## 2. Confirmed findings

### Security / abuse
- **F1 [EVIDENCE] All 7 Cloud Functions are unauthenticated public endpoints that call paid APIs.** There is no ID-token check, App Check, rate limit, per-user quota, or `maxInstances` on any function (index.js:15, 71, 151, 258, 347; tts.js:327; stt.js:44). CORS (§1.4) doesn't stop non-browser callers.
- **F2 [EVIDENCE] `generateStory` is an open LLM proxy.** It forwards client-supplied `instructions` verbatim as the user message, with no type, length, or content checks (index.js:22–26, 41–44). The only guard is the system prompt (40). index.html and comprehension.html both rely on this passthrough (index.html:4962–4973; comprehension.html:427–434). Each call is up to 2,048 output tokens.
- **F3 [EVIDENCE] Document and image endpoints have no server-side size, type, or page limits.**
  - `extractDocument`'s plain-text branch decodes any base64 and puts **the entire file** into the prompt (437–446). Large inputs mean large input-token bills.
  - The PDF path forwards arbitrary PDFs (369–395).
  - `mediaType` is trusted from the client.
  - HEIC conversion runs on any buffer in a 1 GiB function (86–97, 166–177).
  - The only size limit is client-side, 10 MB (index.html:4718, 6438).
- **F4 [EVIDENCE] `synthesizeSpeech` accepts up to 5,000 characters per call from anyone (tts.js:340–341), billed to ElevenLabs.** `transcribeSpeech` accepts any audio and is **not called by the client at all**: `CF_STT` is defined at index.html:4703 and never used. It is a live, unused, open cost surface.
- **F5 [EVIDENCE] Stored and reflected XSS sinks in index.html.** Data from users, OCR, AI, or partner rooms is interpolated into `innerHTML` without escaping:
  - **Reading-mode overlay story text** `${w}` (14838–14849). A whitespace-free token like `<svg/onload=…>` in pasted, OCR'd, or AI text would execute. The main reader `renderStory` (7343–7372) is safe because it uses `textContent`. **Two story renderers, with different safety.**
  - Vocab study cards `${w.word}`, `${w.definition}` (12706–12710). These are AI-extracted from uploaded documents, so prompt injection inside a document is enough.
  - Word bank `${w.word}` (13114–13116), vocab feedback and results (12833, 12868, 12903), vocab list label (12178–12180), passage `displayTitle` (8603, 8609–8613), child `avatar` (4285).
  - `escapeHtml` (5119–5122) doesn't escape `'`, yet it's used inside single-quoted inline JS (`onclick="retryPassageFromDash('${escapeHtml(p.id)}')"`, 14509–14510).
  - The backup **import** writes arbitrary JSON straight to localStorage (14738), which can seed these sinks.
  - comprehension.html, by contrast, escapes consistently with `esc()` (337) [EVIDENCE 801–802, 1009–1011].
- **F6 [EVIDENCE] Partner-reading rooms use 4-digit codes (9,000 possibilities) from `Math.random`.** `createRoom` `set()`s `rooms/{code}` **without checking whether it exists**, so it can overwrite another family's live room (7016–7027). Joining needs only the code (6812–6822). Room content (story or spelling list) written by one user is rendered on another user's device. Combined with F5, that is a **cross-user injection path**. How severe it is depends on RTDB rules [ASSUMPTION]. No `onDisconnect` cleanup exists, so abandoned rooms persist (removal happens only on explicit exit, 9016).
- **F7 [EVIDENCE] Parent gate PIN defaults to `'1234'`.** It's stored in plaintext in localStorage, per device, and not synced (9083, 13016, 14642). It's a UI gate, not security.
- **F8 [EVIDENCE] Error responses leak upstream detail:** `detail: heicErr.message` (index.js:95, 175), `raw: JSON.stringify(data).slice(0,200)` (138), `detail: error.message` (145), `raw: rawText` (248, 489), `details: err.message` (stt.js:97, tts.js:369). ElevenLabs error bodies are thrown into logs (tts.js:174).
- **F9 [EVIDENCE] Email verification is enforced only in client code** (4056–4063). `onAuthStateChanged` (4570) fires before the forced sign-out, so for a brief window an unverified user is `currentUser`. Only the RTDB rules can actually enforce `auth.token.email_verified` [ASSUMPTION].
- **F10 [INFERENCE] Google sign-in on iOS uses `signInWithRedirect` (4213–4214) with `authDomain` on `firebaseapp.com` while the app runs on `readupapp.com`.** Modern Safari/Chrome storage partitioning breaks cross-origin redirect sign-in unless `authDomain` matches the app domain (or a reverse proxy is used, or popup is used). This is a known Firebase migration issue. **Needs real-iPhone verification.**
- **Secrets [EVIDENCE]:** The Anthropic and ElevenLabs keys are Secret Manager `defineSecret`s (index.js:6; tts.js:8). I scanned the full git history for `sk-ant-api`, `sk_<hex>`, and hard-coded `x-api-key`/`xi-api-key` values: **no server keys were ever committed**. The only key-like string is the public Firebase web key (index.html:3861, redacted).

### Data integrity
- **F11 [EVIDENCE] Whole-blob `set()` sync can silently lose data.** `pushToCloud` replaces `/data` entirely (3943–3945). Two devices, or one device that's behind, will clobber each other. Conflict detection uses client clocks (4380).
- **F12 [EVIDENCE] The storage-quota handler deletes user data, then syncs the deletion to the cloud.** On `QuotaExceededError`, `saveData` trims `stories` to the last 5 and `spellingLists` to the last 3 (9049–9055). The debounced push then overwrites the cloud copy (9074–9078), so a full phone erases cloud history.
- **F13 [EVIDENCE] Reset and import bypass sync, and the cloud resurrects the data.** "Reset ALL data" only removes localStorage (14649–14654). Import writes localStorage directly without `saveData` (14738). On the next `pullFromCloud` the cloud wins (3899–3922), so a reset comes back and an import gets reverted. Deleting a child does remove the RTDB node (4301).
- **F14 [EVIDENCE] comprehension.html data lives only on the device**, under separate profiles (198, 323–333). The same child exists twice with no linkage, and that data isn't included in backups.

### Architecture / code health
- **F15 [EVIDENCE] It's a monolith with module-scope globals.** One 11.4k-line module holds the state object `S` (index.html:5049; about 148 `S.x =` assignments), dozens of `let` globals (`currentUser`, `currentChildId`, `ttsAudio`, `dictAudio`, `ttsWordTimings`, …), and 6 `window._*` globals (`_childDataUnsub`, `_mwMode`, `_pendingVerifyUser`, `_sessionsChart`, `_storagWarnShown`, `_wpmChart`). Navigation is `show(id)` over about 60 screen divs (5003).
- **F16 [EVIDENCE → INFERENCE] Inline `onclick` handlers call functions declared inside `<script type="module">`.** Module-scope functions aren't on `window`, so these handlers should throw `ReferenceError`:
  - `openMyWeekChild()` (1928 → defined 13839)
  - `wbSwitchTab('story'|'vocab')` (2678–2679 → 7933)
  - `retryPassageFromDash` / `deletePassageFromDash` (14509–14510 → 14518, 14560)

  I found no `window.X =` assignments for them. **Likely broken buttons; confirm in a browser console.**
- **F17 [EVIDENCE] TTS client logic is duplicated 4+ times with drift:**
  - `fetchTTSAudio` (about 5470–5497) normalizes text, caches, and sends `voiceGender`.
  - `sayDictEntry` (7788–7815), `sayWordOnly` (7817–7842), and `sayWordForPractice` (10624–10646) each recompute `gradeNum/gradeKey/voiceName`, don't cache, omit `voiceGender` (the server then defaults to female, tts.js:339), and use different speech-synthesis fallback rates (0.8 / 0.8 / 0.65).
  - All of them build `data:audio/mp3;base64,…` (7679, 7805, 7833, 10636), but the Google fallback returns **WAV** (tts.js:297–316). That's a MIME mismatch; it works only if the browser sniffs the format [INFERENCE].
- **F18 [EVIDENCE] Upload-to-AI pipelines are duplicated at least 5 times:** about 6438–6660, 9984–10010, 12393–12440, 13620–13740 (minified one-liners), plus 4712–4762. 27 copies of the JSON `fetch` header literal. Server side, the Anthropic call is copy-pasted 5× with the model id hard-coded 5× (index.js:37, 106, 186, 298, 462), and the HEIC conversion is duplicated (86–97, 166–177).
- **F19 [EVIDENCE] The grade model is hard-coded as Pre-K–3 throughout,** but the stated product audience is grades 3–5:
  - `VOICE_NAMES` keys prek..3 (5317–5320)
  - 10 copies of the `{prek:'Pre-K', …, '3':'3rd Grade'}` label map
  - server `gradeNames` stop at "3" (index.js:270–276, 360–363)
  - `googleTTS` checks `grade === 3` (tts.js:280); the gradeKey logic is at tts.js:348
  - fry/dolch data only goes to grade 3

  Grades 4 and 5 fall through to defaults (for example "1st grade" in batchDefine at index.js:277). comprehension.html is the only part shaped for grades 3–5 (it uses Lexile levels).
- **F20 [EVIDENCE] Dead code and dependencies:**
  - `syncToCloud` is never called (3885)
  - `CF_STT` and the deployed `transcribeSpeech` are unused (4703; stt.js)
  - `sttClient` and the `SpeechClient` import in tts.js are unused (4, 12)
  - `sharp` is declared but never required (functions/package.json)
  - the root `package.json`/`package-lock.json` deps are unused
  - the `anthropic-beta: pdfs-2024-09-25` header is obsolete (index.js:459)
  - `application/msword` (.doc) goes to mammoth, which only reads .docx (index.js:398–411), so .doc uploads will fail [INFERENCE from mammoth's documented scope]
- **F21 [EVIDENCE] Fragile dependencies:**
  - `cors` is `require`d in stt.js:3 and tts.js:5 but **not declared** in functions/package.json. It resolves only as a transitive dependency of firebase-functions (functions/package-lock.json:3948, 4582). A future firebase-functions release that drops it would break deploys.
  - Chart.js is loaded dynamically with no SRI (14380).
  - Google Fonts are required for the look (index.html:11).
  - The landing page hotlinks a Pexels image (about 15290).
  - firebase-functions `^7` and Node 24 are recent and fine. The functions use the `firebase-functions/v2/https` path, and v7 already disallows legacy runtime config (firebase.json `disallowLegacyRuntimeConfig: true`), so the `functions.config()` migration risk is already handled.
  - Caret ranges plus a committed lockfile are reasonable.
  - No `.nvmrc` or engines check for local tooling.

---

## 3. Risks and severity

| ID | Sev | Risk | Basis |
|---|---|---|---|
| R1 | **P0** | Unauthenticated, unthrottled paid endpoints. `generateStory` is an open LLM proxy. Document/TTS/STT calls have no size or rate limits and no `maxInstances`. One script can run up the Anthropic, ElevenLabs, and Google bills. (F1–F4) | EVIDENCE |
| R2 | **P0** | RTDB security rules for children's data (names, grade, reading history) and `rooms` are **not in the repo** and so can't be reviewed. If `rooms` (or worse, `users`) are open, child data is exposed and F6 becomes a cross-family injection vector. | EVIDENCE (absence) + ASSUMPTION (production state) |
| R3 | **P1** | XSS via `innerHTML` of story, OCR, AI, room, and imported content (F5). Same origin as Firebase Auth tokens in IndexedDB, so a successful payload can act as the parent account. | EVIDENCE |
| R4 | **P1** | Data-loss paths: whole-blob `set()`, the quota-trim then cloud overwrite, and reset/import being reverted by the cloud (F11–F13). | EVIDENCE |
| R5 | **P1** | Likely broken buttons from module-scope inline `onclick` (F16). | INFERENCE, high confidence |
| R6 | **P1** | iOS Google redirect sign-in may fail on the custom domain (F10). | INFERENCE |
| R7 | **P1** | Public docs make false privacy claims (README/DEPLOYMENT) for a children's product. That's a compliance and trust risk (details belong to Agent 5). | EVIDENCE |
| R8 | **P1** | Room-code collisions overwrite live sessions, and there's no cleanup (F6). | EVIDENCE |
| R9 | **P2** | Monolith, duplication, and drift (F15, F17, F18). With no tests and edits made by uploading through the web UI, every change is a full-file replacement that deploys live with no rollback beyond git. | EVIDENCE |
| R10 | **P2** | The grade model doesn't cover 3–5 (F19). The two apps keep separate, unlinked profiles and storage (F14). | EVIDENCE |
| R11 | **P2** | Undeclared `cors` dependency, unused `sharp` native dependency, inconsistent CORS layers, error-detail leakage, client-only email-verification gate (F8, F9, F21). | EVIDENCE |
| R12 | **P2** | No CSP, no SRI, no schema version in stored data, three conflicting build labels. | EVIDENCE |
| R13 | **P3** | Firebase JS SDK 10.12 is aging. Long-term: move off hard-coded endpoints, keep offline/PWA claims honest, region pinning, an observability dashboard. | ASSUMPTION about the SDK release line |

---

## 4. Evidence index (file:line)
- Script and style layout: index.html:12–1669 (CSS), 3854–15231 (module JS); comprehension.html:11–175, 188–1458
- Firebase SDK and config: index.html:3855–3867; DB path helpers 3880–3881
- Cloud sync: pull 3899–3922, push 3925–3946, dead `syncToCloud` 3885, listener 4374–4402, child session restore 4570–4590
- Auth: 4056–4063 (client-side verify gate), 4112/4141 (send verification), 4210–4224 (popup/redirect), 4227 (`getRedirectResult`)
- Endpoints: index.html:4700–4707; comprehension.html:197
- localStorage engine: 9020–9093 (keys 9023–9027, quota trim 9038–9067, debounce 9074–9078)
- PIN: 9083, 13016, 14642
- Rooms: create 7016–7027, join 6812–6822, removal on exit 9016
- XSS sinks: 4285, 8603–8613, 12178–12180, 12706–12710, 12833, 12868, 12903, 13114–13116, 14838–14849, 14509–14510; helper 5119–5122. Safe renderer for contrast: 7343–7372; comprehension `esc` 337
- Inline module-scope handlers: 1928/13839, 2678–2679/7933, 14509–14510/14518/14560
- TTS duplication: ~5470–5497, 7650–7690, 7788–7842, 10624–10646; `VOICE_NAMES` 5317–5320
- Reset/export/import: 14649–14654, 14659–14680 (`appBuild:'CL'` 14665), 14738–14741
- Build tags: 1881, 3619
- Chart.js: 14380
- Functions: CORS 9–13; open proxy 22–26; model ids 37/106/186/298/462; HEIC 86–97/166–177; text-file passthrough 437–446; .doc→mammoth 397–411; beta header 459; leakage 95/138/145/248/489
- stt.js: 3, 45 (open CORS), 97; tts.js: 4/12 (unused STT client), 5/332 (CORS layers), 280/348 (grade logic), 340–341 (5,000-char limit), 369
- Dependencies: functions/package.json (`sharp` unused, `cors` missing); functions/package-lock.json:3948, 4582 (`cors` transitive)
- Config: firebase.json (no rules/hosting); `.firebaserc`; CNAME

---

## 5. Recommended changes (incremental, strangler-style)

Guiding constraint: **keep GitHub Pages and keep "edit a file, push, it's live" working**, and avoid any big-bang rewrite. Every step below is shippable on its own and reversible.

### Phase 0 — Stop the bleeding (days; no UI change)
1. **Protect the functions (R1).** Add `maxInstances` (e.g., 2–5) plus `concurrency` to every `onRequest`. Then add a shared `requireUser(req)` helper that verifies `Authorization: Bearer <Firebase ID token>` with `firebase-admin`'s `verifyIdToken`. On the client, add a single `apiFetch(path, body)` that attaches `await auth.currentUser.getIdToken()`. comprehension.html has no auth today, so either give it anonymous Firebase Auth or put it behind App Check. **Enable Firebase App Check (reCAPTCHA Enterprise / v3)** for both pages. Add a per-uid daily quota counter in RTDB (e.g., `quota/{uid}/{yyyymmdd}`, transaction-incremented in the function).
2. **Close the open proxy (F2).** Make the server own the prompt templates. The client sends `{kind:"story"|"comprehension"|"define", grade, topic, wordCount, structureId, level}` and the server builds the prompt. Clamp `wordCount`; reject strings over N characters.
3. **Input limits (F3/F4).** Reject bodies over ~6 MB base64. Allowlist `mediaType`. Cap text-file length (e.g., 20k characters) and PDF pages. Cap `words` items (string, ≤40 characters). Lower the TTS limit to what the UI actually needs. **Delete or disable `transcribeSpeech`** until it's used.
4. **Unify CORS.** Define one `ALLOWED_ORIGINS` module (readupapp.com, www, github.io, and `http://localhost:5000` for dev only when running in the emulator). Use it in all three files. Drop the double `cors` layer in tts.js/stt.js, and declare `cors` in package.json if it's kept.
5. **Put RTDB rules in the repo (R2).** Add `database.rules.json` and `"database": {"rules": "database.rules.json"}` to firebase.json, with: `users/$uid` read/write only when `auth.uid === $uid && auth.token.email_verified`; `rooms/$code` writable only by authenticated users, with `.validate` on shape and size and host-uid ownership. Pull the **current** production rules from the console first and diff before deploying.
6. **Fix the XSS sinks (R3)** with the existing `escapeHtml` (and add `'` → `&#39;` to it), or switch them to `textContent`. Replace the reading-mode overlay renderer (14838–14849) with the same DOM-building approach `renderStory` uses. Replace the inline `onclick` strings with `addEventListener` and `data-*` attributes (this also fixes F16).
7. **Correct README/DEPLOYMENT** so they describe what is actually collected and sent (coordinate with Agent 5).

### Phase 1 — Extract shared modules without a build step (weeks)
GitHub Pages serves ES modules natively, so `index.html` can `import` from `/js/*.js` with no bundler.
```
/js/core/config.js        — CF_BASE, Firebase config, ALLOWED grades, BUILD_ID (single source of truth)
/js/core/firebase.js      — initializeApp/getAuth/getDatabase singletons (pinned SDK URL in ONE place)
/js/core/api.js           — apiFetch() with ID token / App Check, timeouts, JSON errors
/js/core/dom.js           — esc(), el(), safe render helpers (port comprehension.html's esc)
/js/data/store.js         — versioned localStorage store: get/set/migrate(schemaVersion), per-child keys
/js/data/sync.js          — RTDB sync using per-collection paths + update() (not set of whole blob)
/js/speech/tts.js         — TtsProvider interface: speak(text,{grade,voice,rate}) → {audio, wordTimings}
                            providers: CloudTts (ElevenLabs/Google via function), BrowserTts (speechSynthesis,
                            free; boundary events for highlighting), with automatic fallback + cache
/js/speech/stt.js         — SttProvider: BrowserSpeechRecognition (free) | CloudStt (optional)
/js/ai/ai.js              — AiProvider: CloudAi | LibraryOnly (offline/free: library.json, fry/dolch)
/js/content/grades.js     — one grade table (prek..5) with labels, voices, rates, word targets
```
Do it strangler-style. Move one function family at a time, starting with the safest: `escapeHtml`/grade labels, then the TTS calls (collapse the 4 copies into `tts.speak`), then the upload pipeline (collapse the 5 copies into one `extractFromFile(file, mode)`). Each move is a small diff, and the old call sites delegate to the new module.

- **comprehension.html** imports the same `core/` and `speech/` modules. It gains free browser TTS for the "Listen" step and the shared `apiFetch`, while keeping its own UI.
- **Profiles:** add an optional "link this reader to a ReadUp child" field. When signed in, store comprehension data under `users/{uid}/children/{childId}/comprehension` in RTDB. Keep `readup_comprehension_v1` as the offline source and migrate it once, without deleting it.
- **Server:** split `functions/index.js` into `lib/anthropic.js` (one `callClaude({system, content, maxTokens})` and one model constant), `lib/images.js` (HEIC), `lib/validate.js`, and `lib/auth.js`. Remove `sharp` and the unused STT client.

### Phase 2 — Data layer hardening
- Add `schemaVersion` to the per-child blob, plus a `migrate()` chain. Keep the export format backward compatible (accept `version:1`).
- Sync per collection (`/data/stories`, `/data/wordBank`, …) with `update()`. Append-only logs (`weeklyLog`, `wpmHistory`, attempts) should use push-ids so that two devices merge instead of clobbering. Use `ServerValue.TIMESTAMP` for `updatedAt`.
- **Never auto-delete user data on quota.** Evict only the dict cache, and warn. Better still, move bulky arrays to IndexedDB.
- Make reset and import go through the store **and** the cloud, with confirmation.
- Rooms: 6+ character codes from `crypto.getRandomValues`, create via `runTransaction` only if absent, `onDisconnect().remove()`, a TTL field, and a host-uid rule.

### Phase 3 — Minimal tooling (optional but recommended)
- **Tests without a build:** Node's built-in `node:test` against the pure modules (`grades.js`, `store.js` migrations, `scoreReading` and `charAlignmentToWordTimings` extracted from tts.js/stt.js, the `esc` helper, the `parseStory` logic in comprehension.html). Add the **Firebase Emulator Suite** for functions and RTDB rules (`@firebase/rules-unit-testing`). Add one **Playwright** smoke test that loads both pages from `npx http-server`, stubs `fetch` to the functions, and clicks through the core screens.
- **CI:** a GitHub Action running `node --check` on extracted scripts, unit tests, and rules tests on every PR. Protect `main` and stop uploading through the web UI.
- **Versioning:** a single `BUILD_ID` in `config.js`, shown in the UI and written into exports. Use real tags or releases instead of hand-typed letters.
- **Hardening:** a `<meta http-equiv="Content-Security-Policy">` allowing gstatic, cloudfunctions, firebaseio, fonts, and cdnjs (GitHub Pages can't set headers, so it has to be the meta tag). Add SRI to Chart.js, or vendor it. Self-host fonts and images.
- Firebase JS SDK: bump one major at a time behind the `core/firebase.js` seam, after the emulator tests exist. Consider setting `authDomain` to `readupapp.com` with a hosting proxy, or using popup on iOS (resolves R6).

---

## 6. Required verification (not possible from code alone)
1. **Firebase console → Realtime Database → Rules:** export the live rules. Confirm `users/$uid` is owner-only, whether `rooms` is world-readable or writable, and whether `email_verified` is enforced.
2. **GCP:** check restrictions on the Firebase web API key (`AIza…`, index.html:3861); whether App Check is enabled or enforced; budget alerts and caps on the GCP, Anthropic, and ElevenLabs accounts; deployed function list (is `transcribeSpeech` live?), their `maxInstances`, and their runtime (Node 24).
3. **Browser:** click "My Week" home card, Word Builder tabs, and Dashboard "Assign to Child"/"Delete" and watch the console for `ReferenceError` (F16). Test the reading-mode overlay with a pasted token like `<b>x</b>`: harmless markup rendering would confirm F5. Use a test account only, never production child data.
4. **iPhone Safari:** Google sign-in via redirect on readupapp.com (F10).
5. **Two devices on one child:** edit on both while offline, then reconnect, and check for loss (F11). Fill quota and confirm cloud trimming (F12, emulator only). Reset, then reload, to check resurrection (F13).
6. **TTS fallback:** force `ttsEngine:"google"` in the **emulator** and check that WAV-in-`data:audio/mp3` plays on Safari and Chrome (F17).
7. **GitHub Pages settings:** custom domain, HTTPS enforced, branch/folder; whether github.io redirects to readupapp.com (relevant to CORS lists).

---

## 7. What must be preserved
- **Zero-build static deploy on GitHub Pages** at readupapp.com, and the relative fetches of `library.json`, `fry.json`, and `dolch.json`.
- **The word-highlight sync** behavior: ElevenLabs character alignment → word timings with fuzzy matching (tts.js:40–146), Google SSML marks (tts.js:260–274), and the client-side text normalization that must match server word-splitting (index.html:5479–5482). This was hard-won (271 commits). Extract it into tested modules **byte-for-byte** before changing anything.
- **The iOS audio-unlock patterns** (silent `new Audio().play()` inside the user gesture, 7081, 7650–7656, 7791–7793) and the reuse of a single audio element.
- **The free fallbacks already in place:** `speechSynthesis` when cloud TTS fails, and comprehension.html's library-first approach (no AI needed). Grow these into the provider abstraction; don't remove them.
- **comprehension.html's patterns:** consistent `esc()`, a single state object with `save()`, small render functions. Use it as the template for refactoring index.html.
- **Existing user data:** the localStorage keys `readup_data_{childId}`, `readup_active_child`, `readup_dict_cache`, `readup_comprehension_v1`, and the RTDB paths `users/{uid}/children/{childId}[/data]`. Any migration must be additive and read old shapes. The backup export `version:1` format must stay importable.
- **Server-held secrets** via `defineSecret` (never move keys to the client), and the ElevenLabs → Google fallback.
- **The content-safety filter** (index.html:5063–5140, `BLOCKED_WORDS` + `checkContentSafety` at 5124) and the child-safe system prompt (index.js:40). When prompts move server-side, carry them over and strengthen them, never weaken them.
