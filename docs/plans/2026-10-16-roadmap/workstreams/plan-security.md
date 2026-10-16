# Workstream plan: cost protection & security (SEC)

*Planning agent output, 2026-10-16, against `main` @ `eec9e78`. It was read-only and made no network calls. The Firebase web key stays redacted.*

**Tooling:** Node v26 is present. `firebase-tools` and a JDK are not. Validator unit tests can run with `node --test` and nothing installed. Emulator tests for rules, Auth and functions need the owner's permission to install `firebase-tools` and a JDK.

## 0. Re-verified facts and corrections to the audit

**Confirmed from the audit**
- **Open AI proxy:** `functions/index.js:22-26,41-44`.
- **Model settings:** `temperature: 0.8` at `:39`. The model id is hard-coded at `:37,106,185,298,462`.
- **CORS settings:**
  - `tts.js:5`: the inner allowlist has github.io only.
  - `tts.js:332`: the outer setting is `cors:true`.
  - `stt.js:3,45`: any origin.
  - `cors` is not declared in `functions/package.json`.
- **Leakage:**
  - Error details reach callers at `index.js:95,138,145,175,248,489`, `tts.js:369` and `stt.js:97`.
  - Raw model output is logged at `index.js:57,137,247,326,488`.
- **TTS input:**
  - Text is capped at 5000 characters (`tts.js:341`).
  - The voice is chosen by the caller (`tts.js:280-281,349-352`). The client only ever sends `en-US-Wavenet-A/C/D/F` (`index.html:5317-5320`), so a voice allowlist breaks nothing.
  - Stories are sent whole, without chunking, so **a cap below 5000 would break long pasted stories**.
- **Uploads:** the only size limit is client-side (10 MB, `index.html:4718,6438`). There are no server limits.
- **No auth anywhere:** no `getIdToken`, no App Check, no `maxInstances`.

**New findings**
- **Broken feature (passed to QA):** PDF/DOCX import in Together mode sends `mode:'passage'` and expects `data.text` (`index.html:6470,6474,6493,6497`). The server treats every mode except `vocab` as spelling and returns `{words}` (`functions/index.js:359,485-486`). By code reading, this path always fails.
- **XSS sinks (complete list):**

  | Location | What is inserted unescaped |
  |---|---|
  | `4285` | avatar, grade |
  | `8614-8617` | title, in a span and in `value=` |
  | `12178-12179` | label |
  | `12709-12710` | word, definition |
  | `13116` | word |
  | `14838-14849` | Reading Mode text |

  Related issues:
  - `escapeHtml` doesn't escape `'` (`5119-5122`).
  - Import only checks the top-level type (`14712,14738-14741`).
  - `comprehension.html:337` already has a correct `esc()` that can be reused.
- **Cross-family XSS path:** `room.story` → `S.story` → Reading Mode `innerHTML`. Spelling lists are safe because they use `textContent`.
- **Email verification** is enforced only in the browser (`4056-4058,4145`).
- **New Google sign-ins skip the sign-up form.** So consent can't rely on that form alone. Child data is first collected at Add Child (`15618`, save `15695`).

**Correction to audit S6/R7 ("rooms never deleted")**
- Clients *do* delete rooms on cancel, new race, back-out, cleanup and a 1-hour timer (`index.html:5246,7071,7856,9016,15036`).
- Rooms are left behind only when a tab is closed without one of those actions. A server-side cleanup (TTL) is still needed.

**Room model:**
- Codes are 4 digits from `Math.random` (`7017`).
- Creating a room `set()`s over any room with the same code (`7020`).
- Rooms store no uid.
- Guest writes: `guestJoined`, `guestCmd`, `guestReady`.
- Host writes: `story`, `title`, `grade`, `spellingList`, and more.

## 1. Client → Cloud Function call inventory (29 call sites)

| Endpoint | Call sites | Prompt types the server must template |
|---|---|---|
| generateStory | `index.html:4966` (from `6994` loadStory, `6304` Together host, `8191` timed, `8903` WPM) | **story**: grade {prek,k,1,2,3}, 19 categories (`4793-4800`), wordTarget. The builder at `4789-4964` (grade rules, topic anchors, random name, setting, twist and seed, Black-history hero list) moves to the server unchanged. |
| | `7430` | **define**: word, grade |
| | `11434` | **exampleSentence**: word, grade |
| | `11512` | **sentenceCheck**: word, the child's own sentence (free text), grade |
| | `comprehension.html:430` | **comprehensionSession** (`391-411`): structureId (6), topic (10, or custom up to 80 characters), level 100–1100, words {200,380}, paragraphs {4,6}, stops {0,4}, adjust {none,harder,easier} plus measured Lexile.<br>**comprehensionPlacement** (`490-509`): level 200–900, topicIdx 0–7, fiction yes/no, words {140,170}, paragraphs 3, adjust. |
| synthesizeSpeech | `5486`, `7798`, `7826`, `10629` | voice allowlist; text up to 5000 characters |
| extractText | `6513`, `6550`, `12418`, `13625`, `13730` | prompt is already server-side; add size and type limits |
| extractSpellingWords | `6657`, `9997`, `12407`, `13631`, `13685`, `13724` | same |
| extractDocument | `6467`, `6490`, `10005`, `12435`, `13639`, `13688`, `13735` | mode {spelling, vocab, passage} |
| batchDefine | `10289`, `12570` | up to 25 words, regex-checked |

`CF_STT` (`index.html:4703`) is never called.

## 2. Work items

| ID | Pri | Problem (evidence) | Change | Depends | Tests | Impact on existing functionality / mitigation | Rollback | Approvals | Effort |
|---|---|---|---|---|---|---|---|---|---|
| SEC-0 | **P0** | No budget, alert or cap is visible (F4, R2). Production rules, key restrictions and traffic are unknown. | **Owner console steps:**<br>1. GCP budgets of $10, $25 and $50 with alerts.<br>2. Anthropic monthly spend limit; check the key's last use and any Haiku 4.5 deprecation email.<br>3. ElevenLabs: check the plan and set a cap. **Don't delete the secret**: `tts.js:333` declares it, and the deploy may fail without it.<br>4. Review 90 days of invocations per function.<br>5. **Export the current RTDB rules.** Note the size of `rooms/` and its oldest `createdAt`.<br>6. Restrict the web key to the readupapp.com, www and github.io referrers, and to the Identity Toolkit, Token Service and RTDB APIs. Confirm the Auth authorized domains.<br>7. Cloud Logging retention: 7–14 days.<br>8. (Optional) Delete `transcribeSpeech`.<br>9. Register an App Check reCAPTCHA site key, but don't enforce it. | — | Record the results in `SECURITY.md` (SEC-20) | Budgets don't stop service. A provider spend cap does: AI and TTS start failing, and the existing fallbacks take over. **A wrong referrer pattern breaks sign-in for everyone**: test right after the change and keep a note of the old setting. | revert each setting | owner console | S |
| SEC-1 | **P0** | No `maxInstances`. Gen-2 defaults scale up to 100 instances. | Shared options in `functions/config.js`:<br>• generateStory: maxInstances 3, concurrency 10, timeout 30 s<br>• batchDefine: 2 / 5 / 60 s<br>• extract*: 2 / 2 / 90 s at 1 GiB<br>• synthesizeSpeech: 3 / 10 / 60 s<br>Set `cpu` explicitly where concurrency is above 1 (UNVERIFIED: whether 512 MiB gives less than 1 vCPU). **These caps limit how many run at once, not total spend.** The spending ceiling comes from SEC-10 and SEC-0. | — | Unit test the options; check the max instances setting in the Cloud Run console after deploy | A classroom burst may get 429s, which fall back to a built-in story or "try again". The caps can be raised later. | redeploy | PR + **functions deploy** | S |
| SEC-2 | P1 | CORS trap, STT allows any origin, `cors` dependency undeclared. | One `ALLOWED_ORIGINS` list (readupapp.com, www, github.io) used in every `onRequest`. **Delete the inner `cors()` wrapper in tts.js** in the same commit, and drop the require. Localhost only behind an env setting that defaults to off. The browser's preflight check must allow the `Authorization` and `X-Firebase-AppCheck` headers (ASSUMPTION: the default behavior echoes them; verify in the emulator). | — | Unit test the options. After deploy, check the browser's preflight requests and run story, TTS and OCR once each on both readupapp.com origins. | **Leaving readupapp.com out would break read-aloud in production.** The checklist covers it. Forks lose access, as intended. | redeploy | PR + functions deploy | S |
| SEC-3 | **P0** | No server-side size, type or page limits, and the caller picks the voice (A3). | `functions/lib/validate.js`, made of pure functions:<br>• **TTS:** text 1–5000 characters; voice limited to `en-US-Wavenet-A/C/D/F` or the default; drop the client-supplied ElevenLabs id branch; grade clamped to 0–5; ignore the `ttsEngine` flag.<br>• **Images:** mediaType limited to jpeg, png, webp, heic, heif; decoded size ≤ 10 MB (413 if larger); check the file signature bytes.<br>• **Documents:** pdf, docx, doc or txt, ≤ 10 MB; reject PDFs over 20 pages (method TBD); truncate TXT and DOCX to 20K characters; mode limited to spelling, vocab or passage, **with a new passage branch that returns `{text}`**.<br>• **batchDefine:** at most 25 words, each matching `^[A-Za-z][A-Za-z'’-]{0,29}$`.<br>• **All requests:** body ≤ 15 MB. | — | `node --test` with fake file signatures (no real images of children). Manual upload of each type with test content. | Text over 5000 characters already fails today. **Teachers uploading PDFs over 20 pages or long texts will see an error or truncation.** The UI planner writes the messages. | redeploy | PR + functions deploy | M |
| SEC-4 | P1 | Error-detail leakage and raw-output logging (S8, S6). | Responses send only `{error, code}`. Logs record `{fn, status, errorType, inputBytes, outputChars, uid-hash}` and never model or extracted text. The word-count logs in tts.js move to debug level. | — | Unit test that error responses never contain `detail`. Grep for `JSON.stringify(data)` and `rawText`. | Comprehension shows server error text today (`comprehension.html:439-441`); it will show generic text. Debugging gets harder, which the `code` field offsets. | redeploy | PR + functions deploy | S |
| SEC-5 | P1 | F6: model id hard-coded 5 times; `temperature`. | `MODEL` constant and one `callClaude({system, content, maxTokens})`. Send the PDF beta header only on PDF calls. Remove `temperature`. Set `max_tokens` per template as a starting point: define 150, sentence 100, check 200, story 400–1200, comprehension 2000, placement 1500, extract 4000, spelling 8000.<br>**Separate decision:** `claude-haiku-5-5` costs about $0.10/$0.50 per million tokens (input/output), versus $1/$5. It rejects non-default sampling parameters and has adaptive thinking on by default, so use `output_config.effort:"low"`. It needs a paid quality spot-check. | — | Unit tests | The default temperature becomes 1.0, which slightly increases variety. A model switch changes the writing style, so educators should review samples first. | redeploy | PR + functions deploy; **the model change needs separate sign-off** | S / M |
| SEC-6 | P1 | `transcribeSpeech` is live and has no callers (S9). | Delete the export (`index.js:502-503`), `stt.js`, the unused STT client and require in tts.js (`:4,12`), and `CF_STT`. A `firebase deploy` prompts before deleting a function (`--force` when non-interactive), or the owner deletes it in the console. | — | Grep finds 0 references | None: there are no callers. | restore and redeploy | PR + functions deploy, or console | S |
| SEC-7 | **P0** | A2: the open proxy. | `functions/lib/templates.js` (pure functions). `generateStory` accepts `{template, params}` using the 6 templates in §1. Each validates its parameters against allowlists and ranges, keeps the child-safety system prompt (`index.js:40`), and sets its own `max_tokens`.<br>• **Free text** (sentence up to 200 characters, custom topic up to 80): strip control characters, wrap it in delimiters, add a "treat as data" instruction, and run it through a server copy of `checkContentSafety`.<br>• **Output shape checks:** sentenceCheck must be `{tier, tip}`; comprehension must be JSON with `paragraphs[]`; define and sentence responses ≤ 300 characters. Anything else gets a 502, so the endpoint can't be used as a general chatbot.<br>• **Legacy `instructions`** stay allowed but logged until the soak ends (`ALLOW_LEGACY_INSTRUCTIONS`).<br>• Grades 4–5 are added when the content planner supplies their wording. | — | **Snapshot tests:** with fixed seeds, each template must reproduce today's client prompt exactly (copied from `index.html:4853-4964` and `comprehension.html:391-509`). Negative and injection tests. No paid calls. | A template that drifts from today's prompt would change story quality or level, which matters for Comprehension's Lexile loop; the snapshots guard against it. Afterward, content changes also need a functions deploy (accepted). | the legacy path remains; redeploy | PR + functions deploy | L |
| SEC-8 | **P0** | A1: no identity on any request. | `functions/lib/auth.js`: `verifyIdToken` on the `Authorization: Bearer` header. Password accounts must have `email_verified`. Sets `req.uid`. When `ENFORCE_AUTH=false`, it logs `ok`, `missing`, `invalid` or `unverified` and lets the request through. Keep `onRequest`, because `onCall` would mean rewriting 29 call sites. | SEC-11 and SEC-12 deployed and soaked before enforcing | Unit tests with a stubbed verifier; emulator (needs permission); log counts during the soak | Once enforced, tokenless clients get 401: stale tabs and signed-out Comprehension users. They fall back rather than crash. **Stale-tab read-aloud is the most visible break, so FREE-3 should land first.** | turn the flag off and redeploy (minutes); move Cloud Run traffic back in an emergency | PR + functions deploy (observe), then a deploy or flag change (enforce) | M |
| SEC-9 | P1 | S10: scripted abuse through real accounts. Google sign-in makes free accounts unlimited. | Client: `initializeAppCheck` with reCAPTCHA, loaded lazily on the first AI call, sending the `X-Firebase-AppCheck` header. Server: `verifyToken`, with `ENFORCE_APPCHECK` in log-only mode first. **Cost:** check reCAPTCHA pricing (free tier believed to be about 10K/month, UNVERIFIED). **Privacy:** reCAPTCHA sends device and behavior signals to Google, so the privacy notice must say so. | SEC-0 key, SEC-11 | App Check metrics during the soak; a debug token for localhost | Ad blockers and privacy browsers could be refused once enforced; watch the unverified rate first. iOS behavior is UNVERIFIED. | flag | console + PR + deploy + legal | M |
| SEC-10 | **P0** | Even with auth, cost has no upper limit. | `functions/lib/quota.js` uses RTDB transactions on `quotas/{uid}/{date}/{bucket}` and `quotas/_global/{date}/{bucket}`.<br>• **Starting limits (owner confirms):** per user per day, story 30, define 200, sentence 100, extract 20, TTS 60K characters. Global per day: story 2000, extract 300, TTS 2M characters.<br>• Over the limit returns 429. An **`AI_ENABLED` kill switch** returns 503.<br>• **Phase 1:** the flags live as params in a committed `functions/.env` (no secrets; changing one needs a deploy).<br>• **Phase 2, after SEC-13:** RTDB `config/security` with a 60-second cache, so the owner can turn AI off without a deploy. **Not before SEC-13**, because with today's possibly open rules an attacker could change the flags.<br>• `ENFORCE_QUOTA=false` counts only. | SEC-8, SEC-13 | Unit tests with an in-memory transaction stub; emulator (needs permission) | Heavy legitimate users, such as a teacher scanning a lot, may hit the limit ("try again tomorrow"). The global cap could stop AI for everyone, which is the intended worst case; fallbacks keep core learning working. Adds about 50 ms per call. | raise limits or turn enforcement off | PR + functions deploy + rules deploy | M |
| SEC-11 | **P0** | The client sends no token, and 29 call sites each build their own fetch. | `cfPost(url, body)` next to `index.html:4707`. It adds the ID token and the App Check token, a timeout, and typed handling of 401, 429 and 503. All 29 call sites use it. The 4 generateStory calls send `{template:'story', params:{grade, category, wordTarget}}`. Remove `CF_STT`. | **The SEC-7 and SEC-8 server must already be live in observe mode.** Otherwise the server ignores `template` and falls back to the generic prompt at `index.js:26`. **Server first, always.** | Headless test with network stubs: the header and template body are sent. Grep: no `fetch(CF_` outside `cfPost`, and no `instructions:` once legacy is removed. | If `getIdToken` fails offline, the request is sent without a token during observe mode and fails quickly under enforcement. Adds under 50 ms. Pages serves only `main`, so production testing happens right after merge; **consider staging**. | git revert (Pages updates in 1–2 min, caches in about 10 min) | PR | M |
| SEC-12 | **P0** | **Design problem:** comprehension.html has no Auth. | **Options:**<br>A. Anonymous auth: unlimited free identities and a persistent id for every child. Reject.<br>B. App Check only: no per-user quota, and reCAPTCHA on a child-facing page. Reject as the only control.<br>C. Library only: no cost and nothing leaves the device. Acceptable fallback.<br>D. Parent sign-in for AI: strong. **Recommended, combined with C.**<br><br>**Recommendation (C + D):**<br>• Library mode for everyone: no sign-in, works offline.<br>• "AI story" and custom topic are enabled only when a Firebase session already exists on the same origin (shared through IndexedDB).<br>• The SDK is loaded lazily with `import()` when the user clicks AI, then the request is sent with a token and the comprehension templates.<br>• Signed-out users see "Sign in on ReadUp to unlock AI stories".<br>• `callStory` (`427-446`) is the only network change.<br>• Data stays in localStorage, so no new data flow is created. | SEC-7, 8, 11 | The headless suite with the network blocked must still pass 31/31; plus a stubbed signed-in path | Signed-out families lose AI variety and custom topics; the library still covers placement 200–900L. The github.io origin has its own sign-in session. | revert | PR | M |
| SEC-13 | **P0** | A4: rules are not version-controlled. | **Start from the owner's exported production rules** and compare. Add `database.rules.json`, wired into firebase.json.<br>• `users/$uid`: only `auth.uid === $uid`.<br>• Profile checks: name and nickname strings ≤ 60; grade `prek\|k\|1-5`; avatar ≤ 8.<br>• `consent`: each version can be written once.<br>• `quotas` and `config`: no read or write (the Admin SDK bypasses rules).<br>• `rooms/$code` (phase 1, compatible with today's clients): `auth != null`; code is 4 digits or 6 characters; story ≤ 30K; title ≤ 200.<br>• No access at the root.<br>• `email_verified` is not required until SEC-8 logs show 0 unverified users. | SEC-0 export | `@firebase/rules-unit-testing` on the emulator (needs permission): the owner can read and write; another uid can't; quotas and config are denied; today's room write pattern works (`6326, 6421, 6694, 6736, 6838, 7020, 7299`). | Every client path is `users/${uid}` or `rooms/`, so the risk is low. **A bad rules file locks everyone out**, which the emulator tests guard against. | redeploy the exported rules (keep a backup) | PR + **rules deploy** | M |
| SEC-14 | P1 | A6/R7: 4-digit codes, overwrite on create, no ownership. | **Client:** 6-character codes from a 31-character alphabet using `crypto.getRandomValues`; write `hostUid` and `guestUid`; joining accepts 4 or 6 characters during the transition; the input becomes text with `maxlength=6`; retry when permission is denied.<br>**Rules phase 2** (after about a 7-day soak): create only if the room doesn't exist (or is over 24 h old) and `hostUid` matches; writes only by the host or guest uid; remove the 4-digit pattern. | SEC-13 | Emulator rules tests; a manual two-device Together session | 6-character codes are harder for children to read aloud; use a clear alphabet and a large display. Mixed old and new clients work in phase 1; after phase 2, old clients must reload. | revert; redeploy phase-1 rules | PR + rules deploy | M |
| SEC-15 | P2 | Orphaned rooms and quota nodes grow. | Daily `onSchedule` at 03:00: delete rooms older than 24 h (needs `.indexOn: createdAt`) and quota dates older than 7 days. A dry run that only logs comes first. Cloud Scheduler is free for 3 jobs (ASSUMPTION). | SEC-13 | Emulator; dry-run logs | A Together session running more than 24 h would be deleted (unlikely). | delete the function | PR + functions deploy + rules deploy | S |
| SEC-16 | P1 | A5/S7: XSS (list in §0). | Make `escapeHtml` escape `'`. Escape or switch to `textContent` at every sink, and rebuild Reading Mode with `createElement` and `textContent`. **Import:** ≤ 5 MB with a schema check (arrays of objects, capped strings, finite numbers, unknown keys dropped); the dictionary cache must be strings ≤ 300 characters. Sort the other ~120 `innerHTML` uses (static, escaped, or needs a fix) and list them in the PR. | — | Headless test with `<img onerror>` payloads in story, word bank, vocab, titles and import: no element is created and no script runs. `node --test` for `escapeHtml`. | Text that intentionally contained HTML entities would show them literally (unlikely). Reading Mode looks the same if the class names are kept. | revert | PR | M |
| SEC-17 | P1 | S5/F7: sign-out clears only the active-child key. | Sign-out first awaits a final `pushToCloud`. If it succeeds, clear `readup_data_*` and the dictionary cache. If it fails, ask "Sign out anyway / Stay". **Never wipe data that hasn't synced.** Add a "Shared device" option. Comprehension gets "Clear all data on this device", with a prompt to export first. | **The DATA fix for whole-record sync overwrites comes first** | Headless test with stubbed Firebase; manual sign-out and sign-in | Slower first load next time. The PIN stored in `readup_data` resets (coordinate with the UI planner). | revert | PR | M |
| SEC-18 | P1 | S6/F8: no way to delete an account. | Parent dashboard (behind the PIN): typed confirmation and an export offer, then remove `users/${uid}`, clear local data, and `deleteUser`. Re-authenticate on `requires-recent-login`. Quotas and rooms expire via TTL. The runbook notes that logs last until their retention ends. | — | Emulator or a throwaway test account | Irreversible by design, with export and typed confirmation as safeguards. | code revert (deleted accounts can't be recovered) | PR + legal review of wording | S–M |
| SEC-19 | **P0** (content by counsel) | S2/F2: no notice or consent. | Mechanism only:<br>• A static `privacy.html` with counsel's text. **Until then it holds a marked placeholder and is not merged.**<br>• Links from the landing page, auth screen, dashboard and comprehension.html.<br>• A consent checkbox at sign-up (`15563+`). Google sign-ins skip that form, so **also check consent at the first Add Child (`15695`) and at any sign-in where `consent.version` is out of date.**<br>• Store `users/$uid/consent = {version, acceptedAt: serverTimestamp, method}`, writable once per version.<br>• Upload notice: "Don't photograph faces or full names." | SEC-13 | Headless gate tests; emulator write-once test | **Existing parents see a blocking consent screen at their next sign-in.** Their data is untouched, just hidden until they accept. Decide: block, or banner with a grace period. | change `CONSENT_VERSION`, or revert | PR + **legal** + rules deploy | M |
| SEC-20 | P1 | S4/F3: false README claims (`README.md:95,100,106-109`; `DEPLOYMENT.md:167-171`), wrong URLs, no deploy steps for functions or rules. | Describe the real data flows and remove the Tesseract claims. Document Pages, functions and rules as separate approval gates. Add `SECURITY.md`: the SEC-0 checklist and results, every flag and the kill switch, and rollback steps for functions (revert + deploy; Cloud Run traffic in an emergency) and rules (redeploy the backup). | — | Review | None | revert | PR + legal reviews the privacy wording | S |
| SEC-21 | P2 | Regression guards. | Grep checks with `node --test`:<br>• no `fetch(CF_` outside `cfPost`<br>• no `instructions:` in the client<br>• no `detail:` or `raw:` in responses<br>• every `onRequest` has `maxInstances`<br>• no `cors:true` or inner `cors(`<br>• `ALLOWED_ORIGINS` includes readupapp.com | QA Tier 0 | self | none | — | PR | S |

## 3. PR order

| # | Branch | Items | Gate | When |
|---|---|---|---|---|
| 0 | — | SEC-0 | Owner console | Now |
| 1 | `docs/security-runbook` | SEC-20 | PR | Now, alongside 2 |
| 2 | `fix/xss-sinks` | SEC-16 | PR | Now (client only) |
| 3 | `functions/hardening-compatible` | SEC-1, 2, 3, 4, 5 (constant), 6, part of 21 | PR, then **functions deploy** | After 0 |
| 4 | `functions/auth-templates-observe` | SEC-7 (legacy allowed), SEC-8 and SEC-9 server side in observe mode, SEC-10 counting only | PR, then **functions deploy** | After 3 |
| 5 | `rules/phase1` | SEC-13 | PR, then **rules deploy** | After the SEC-0 rules export; can run alongside 4 |
| 6 | `client/cfpost-tokens` | SEC-11 (+ App Check client) | PR | **Only after 4 is live** |
| 7 | `comprehension/auth-gated-ai` | SEC-12 | PR | Only after 4 is live |
| 8 | (flag flips) | Enforce auth, then legacy off, then quota, then App Check | **Functions deploy for each** | After the soak (§4) |
| 9 | `rooms/codes-uids` | SEC-14 client | PR | After 5 |
| 10 | `rules/phase2-rooms` + `functions/cleanup` | SEC-14 rules, SEC-15 | Rules deploy + functions deploy | 9 has soaked about 7 days |
| 11 | `privacy/signout-delete` | SEC-17, 18 | PR | After the DATA sync fix |
| 12 | `privacy/consent` | SEC-19 | PR, rules deploy, legal | When counsel's text is ready |
| 13 | `functions/remove-legacy` | Remove `instructions` and the client prompt builders; flags move to RTDB `config/` | PR + functions deploy | 30 days after 8 |

## 4. Rollout that works while the website and functions are on different versions

Pages caches pages for about 10 minutes, a child's tab can stay open for days, and functions deploy separately.

1. **The server accepts both old and new requests** (PRs 3 and 4). Old clients keep working unchanged. Each request is logged with its `auth`, `template` and `appcheck` status.
2. **Then the client starts sending tokens and templates** (PRs 6 and 7). Old client with new server works; new client with new server works. **Never deploy the client before the server.**
3. **Soak for at least 7 days**, until `auth=missing` and `legacy` requests are under about 1% and the App Check unverified rate is understood.
4. **Enforce one flag at a time**, each a functions deploy that can be reverted in minutes: `ENFORCE_AUTH`, then `ALLOW_LEGACY_INSTRUCTIONS=false`, then `ENFORCE_QUOTA` (only once the rules protect `quotas/`), then `ENFORCE_APPCHECK`. Stale clients fall back rather than crash. Land FREE-3 before enforcing auth.
5. **Rooms:** the client writes uids and accepts both code formats, then the rules tighten after a soak.
6. **Cleanup:** remove the legacy paths, and move the kill switch to RTDB so AI can be turned off without a deploy.

## 5. Owner decisions

1. Comprehension AI: library for everyone, with AI only for signed-in parents (recommended)? Or library-only?
2. Quota numbers, and the daily dollar ceiling.
3. App Check with reCAPTCHA (cost, and data sent to Google), or auth and quotas only?
4. `transcribeSpeech`: delete now in the console, or in PR 3?
5. Model: keep Haiku 4.5 as a constant, or approve a paid spot-check of `claude-haiku-5-5`?
6. Upload limits: a 20-page cap for PDFs and a 20K-character cap for TXT and DOCX?
7. 6-character room codes?
8. Consent for existing users: a blocking screen, or a banner with a grace period? Counsel confirms COPPA and the consent method.
9. Permission to install `firebase-tools` and a JDK for emulator tests?
10. How many days to keep logs?
11. A staging Firebase project or Pages fork, given that every merge to `main` is production?

**Not verified:**
- production rules
- deployed functions and their traffic
- billing and caps
- reCAPTCHA pricing
- CPU and concurrency at 512 MiB
- iOS behavior with App Check
- whether the CORS setting echoes the requested headers
