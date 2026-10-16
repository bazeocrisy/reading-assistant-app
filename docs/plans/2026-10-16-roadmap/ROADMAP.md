# ReadUp: Coordinated Implementation Roadmap

| | |
|---|---|
| **Status** | **PROPOSED, for owner review.** No application code, Firebase configuration or dependencies have changed. Nothing is merged or deployed. |
| **Based on** | The baseline audit (PR #4) against `main` @ `eec9e78`, and four read-only workstream plans plus their addenda. Every file:line was checked against `main`, and the lead spot-checked the key new findings. |
| **Supersedes** | The earlier draft in PR #5. This is the **one** coordinated plan. |
| **Supporting detail** | `workstreams/`: per-item problem, change, tests, impact on existing functionality, rollback, approvals and effort. SEC = security and cost; FREE = free-first learning; QA = repairs and testing; UX/A11Y/DATA = homepage, accessibility and data. |

**How to read this:**
- **§1** principles
- **§2** data & account preservation (the prerequisite for any auth or database change)
- **§3** dependencies
- **§4** the phases, each with its PRs, risks, rollback, acceptance tests and approval checkpoints
- **§5** operating costs
- **§6** approval checkpoints
- **§7** risks and rollback procedures
- **§8** the complete PR catalogue
- **§9** decisions needed
- **§10** what is unverified

---

## 1. Principles

1. **Free learning without an account, wherever practical.** These all work with **no sign-in, no Cloud Function calls and no paid services**:
   - reading built-in and library stories
   - hearing them read aloud with the browser's voice
   - Fry/Dolch word practice and games
   - timed reading
   - an offline dictionary
   - Comprehension Mode
   - progress saved on the device

   An account adds optional extras: cloud backup and sync across devices, Read Together, and parent-only AI features.
2. **Paid AI is protected on the server, not just in the browser.** That means:
   - Firebase sign-in verification
   - App Check (optional)
   - per-user and global daily limits
   - a **global daily dollar limit**
   - server-built prompts (no open AI proxy)
   - input size limits
   - instance caps
   - provider spend caps

   Guests never reach a paid endpoint.
3. **Preserve before you change.** §2 must be followed before any auth or Firebase database change. Every PR is additive, and nothing a family has saved is deleted without an adult confirming it behind the PIN.
4. **GitHub is the system of record.**
   - Every change is made on a feature branch and goes through a PR to `main`. Each PR is independently testable.
   - **A merge to `main` is a production release** (GitHub Pages).
   - Function and rules deploys are separate approval checkpoints (§6).
5. **No paid calls in development or testing.** Tests stub the network and **fail if any request leaves the machine.**
6. **Comprehension Mode and student progress are protected by gates on every PR.** The 31-check Comprehension harness must pass unmodified, and the storage-fixture preservation suite must pass.

---

## 2. Data & account preservation (prerequisite for every auth or database change)

### 2.1 What exists today

**Browser storage (localStorage, shared by both pages on readupapp.com):**

| Key | Contents |
|---|---|
| `readup_data_{childId}`, or `readup_data` when no child is selected | `pin` (plain text, stored per child, never synced), `bedtimeMode`, the 9 collections, `updatedAt` |
| `readup_active_child` | `{uid, childId}` |
| `readup_dict_cache` | cached word definitions |
| `readup_comprehension_v1` | `{kids, sessions, rotationStart, current, placement, used, placeUsed}` |

**Firebase Realtime Database** (not Firestore):
- `users/{uid}/children/{cid}` holds three things:
  - the child record: `{id, name, nickname, grade, avatar, createdAt}` (child ids look like `child_<base36 time>`)
  - `profile{}`
  - `data{stories, wordBank, spellingLists, vocabLists, weeklyLog, wpmHistory, timedPassages, assignments, myWeek, updatedAt}`, which is **overwritten in full by `set()` on every save**
- `rooms/{4-digit code}` holds temporary Read Together sessions.

**Firebase Auth:** email/password accounts (verification enforced only in the browser) and Google accounts. **Nothing in this roadmap modifies, migrates or deletes Auth users.** The only exception is the self-service "delete my account" feature (SEC-18), which needs typed confirmation and offers an export first.

**Unknown:** the production RTDB security rules (not in the repo) and Firebase Auth's persistence mode.

### 2.2 Invariants every PR must keep

1. Never rename, remove or change the type of an existing localStorage key, RTDB path or field.
2. Changes are additive only. New cloud data goes in **sibling nodes**, never inside `children/{cid}/data` (that node gets only its 9 fields plus `updatedAt`).
3. No user collection is trimmed or deleted unless an adult confirms behind the PIN.
4. Version 1 export files stay importable, and new exports keep a top-level `readup_data` so older app versions can still read them.
5. `index.html` never writes `readup_comprehension_v1`. The one exception is a merge during a restore the user chooses.
6. Migrations read the old data, write new keys, are safe to run twice, and leave the old fields in place, so a rollback restores the old behaviour.
7. No automatic backup copies are written to localStorage, because they could trigger the storage-quota problem.
8. The fixture suite must pass: every saved-data shape loads, renders and saves back deep-equal, apart from additive fields. The Comprehension harness passes 31/31.
9. Guest data lives under its own keys, `readup_guest_v1` and `readup_guestdata_{guest_<uuid>}`. It can never collide with account data, and it is never touched by account-data scans or sign-out cleanup.

### 2.3 Required steps before and after each change

**Before any auth or database change (owner, in the consoles):**

| Step | What to do |
|---|---|
| **B1** | Export the RTDB as JSON. It contains children's names, so store it **encrypted, owner-only, never in the repo**, and delete it under the retention policy. |
| **B2** | Copy the current rules to `database.rules.prod-backup.json`. This is the rules rollback. |
| **B3** | Record the Auth user count and which providers are enabled, and confirm the **Anonymous provider is disabled**. A full export of Auth users would need `firebase auth:export`, which needs an install and is highly sensitive. It isn't needed, because no item changes Auth users. |
| **B4** | Create test accounts: one email/password and one Google account, each with two test children holding fake progress, plus a second pair of accounts for Read Together. Never use a real child's account for testing. |
| **Family backup** | Once DATA-3 ships, the app offers "Download family backup" before any migration. **No data migration ships before DATA-3.** |

**After each change (verification V):**
- Each test account signs in and sees its children, progress, word bank and stories.
- One AI story, one read-aloud and one two-account Read Together session work.
- For rules changes, run every client database path in the Firebase **Rules Playground** before publishing.
- CI fixture round trips pass.
- On one real device with existing data, compare **item counts only, never content** before and after.

### 2.4 How each auth, database or storage change affects existing users

| Change | Auth users | Profiles and cloud progress | Local progress | Migrated, rewritten or deleted | What a returning user sees |
|---|---|---|---|---|---|
| SEC-8/9/11 (token check, App Check, client sends tokens) | unchanged | unchanged | unchanged | nothing | The same app. AI falls back to free paths if the token is missing. |
| SEC-12 (Comprehension AI only for signed-in parents) | session read only | untouched | `readup_comprehension_v1` untouched | nothing | Library works as before. AI asks the user to sign in. |
| SEC-13 (rules into the repo, phase 1) | unchanged | **A rules deploy rewrites no data.** The risk is rejected writes if the new rules are stricter than what the client relies on. Mitigation: start from the exported production rules, allow unknown fields, Playground first. | unchanged | nothing | The same app, if validation passes. |
| SEC-14 (6-character room codes, owner uids) | unchanged | unchanged | unchanged | new rooms get a uid field. Old rooms become locked until they are 24 h old. | New code format. Deploy at a quiet time. |
| SEC-15 (cleanup job) | unchanged | unchanged | — | **Deletes rooms older than 24 h and quota records older than 7 days.** The first run only logs counts. | nothing |
| SEC-17 (sign-out cleanup on shared devices) | unchanged | unchanged | removed **only after a successful cloud push**. Fields that exist only locally (the PIN) move first via DATA-2. | local copy only | Data is pulled from the cloud at the next sign-in. |
| SEC-18 (delete account) | the requesting user only | the requester's only | the requester's only | deleted on request; irreversible | n/a |
| SEC-19 (consent) | unchanged | adds `users/{uid}/consent` | unchanged | new field only | A one-time consent screen; the data behind it is intact. |
| SYNC-1 (full-disk trim) | — | the cloud no longer receives trimmed data | only the dictionary cache is trimmed | **less** deletion than today | A "storage full" warning. |
| SYNC-2 (reset and import) | — | reset and import now reach the cloud | — | reset clears the cloud copy too, behind the PIN and after a backup prompt | Reset and import finally stick. |
| SYNC-3 (merge per collection) | — | `update()` instead of `set()`. Adds sibling `data_v2/` and per-collection timestamps. **Legacy `/data` is still written and never removed.** | unchanged | additive dual write | Two devices no longer overwrite each other. Clears now sync. |
| DATA-2 (PIN) | — | — | old `pin` values are read and **never rewritten** | a new hashed `readup_pin_v2` | A custom PIN works as before. Parents still on 1234 set a new PIN once. |
| DATA-3 (family backup v2) | — | — | — | export only | Bigger backup file; version 1 files still import. |
| DATA-4 (link Comprehension readers) | — | phase C adds an optional `users/{uid}/comprehension_v1` | adds `linkedChildId`; phases A and B only read | additive | Optional link. |
| UX-3b (grades 4–5) | — | saved grades unchanged | — | nothing | A parent chooses 4 or 5 by editing the profile. |
| Guest mode G-1 to G-4 | unchanged | unchanged | new guest keys only | nothing | Signed in: same app. Signed out: a "Start reading — no account needed" option. |
| Guest upgrade (G-3) | the user's own account | **creates new children only**; existing children stay deep-equal | the guest copy is kept until the parent removes it | additive | "Copy N guest readers into your account?" |

---

## 3. Workstreams and dependencies

```
                    ┌──────────── P0 owner console safeguards (no code) ───────────┐
                    │  budgets/caps · export rules+data (B1–B4) · key restriction   │
                    └──────────────────────────────┬────────────────────────────────┘
P1 safety net:  QA-1/2/3/21 ─► QA-4 (Settings) ─► QA-5..10 + DATA-1 fixtures ─► QA-12 E2E
                    │                                   │
     ┌──────────────┼───────────────────────────────────┼─────────────────────────────┐
     ▼              ▼                                   ▼                             ▼
P2 server (observe)  P3 free-first + guest           P5 repairs (parallel)      P7 quick wins
SEC-1..6 ─► SEC-7/8/9/10   FREE-5a,6,7a ─► FREE-1 ─► FREE-2 ─► FREE-3 ─► [devices] ─► FREE-4/5
  (FN deploys)  SEC-13 rules  SEC-11a wrapper+guest guard · FREE-9 flags · ARCH-1 lazy Firebase
     │            (RULES deploy, needs B1/B2)  └─► G-1 ─► G-2 ─► G-4 (guest entry ON)
     ▼                                              
P4 enforce: SEC-11b tokens + SEC-12 (server must be live first) ─► soak ≥7d ─► enforce flags one at a time
            (requires FREE-3 live) ─► SEC-14/15 rooms
P6 privacy & data: UX-4 · SYNC-1/2 ─► DATA-3 ─► DATA-2/UX-5/6 ─► SYNC-3 ─► SEC-17/18 · G-3 upgrade · SEC-19 consent (LEGAL)
P7 grades & a11y: UX-1/2 (early) · UX-3a ─► UX-3b (+server templates) · A11Y-1..8
P8 homepage v2 (flag): UX-9 ─► UX-7 ─► UX-8 ─► default-on
P9 Comprehension & content: DATA-4 · FREE-10/11/7b/8 · QA-19/20 · content
```

**Key cross-workstream dependencies:**

| Dependency | Why it matters |
|---|---|
| P1 before any PR that edits `index.html` | Its tests lock today's behaviour for highlighting, storage and Comprehension Mode. |
| SEC-7/8 server live **before** SEC-11b client | An older server ignores templates and falls back to a generic prompt. |
| FREE-3 browser read-aloud live **before** SEC-8 enforcement | Otherwise browser tabs still running the old version lose read-aloud entirely. |
| SEC-11a (shared request helper plus guest guard) **before** G-2 | The guest network guard lives in that helper. |
| ARCH-1 lazy Firebase **before** G-4 | If a school network blocks gstatic.com, the whole app module fails today, guest mode included. |
| SEC-13 rules **before** SEC-10 enforcement or RTDB-based flags | With today's unknown rules, a client could change quota counters or flags. |
| SYNC-1/2 **before** DATA-3; DATA-3 **before** any migration (DATA-2, SYNC-3, G-3) | Families need a working backup first. |
| DATA-2 PIN move **before** SEC-17 sign-out cleanup | The PIN lives only in local storage today. |
| UX-3a grade safety net **before** UX-3b grades 4–5 | Unknown grades fall back to grade 1. |
| QA-14 nesting fix **with** QA-13 | Otherwise the repaired My Week button opens a blank screen. |

---

## 4. Phases

Each phase lists its PRs (one per branch, each independently testable), dependencies, main risks, rollback, **acceptance tests (exit criteria)**, and approval checkpoints. "M" marks a manual test. Item details are in `workstreams/`.

### P0. Console safeguards (owner, this week; no code)

**Items:** SEC-0. Steps:
- GCP budgets and alerts at $10, $25 and $50
- an Anthropic monthly spend limit
- an ElevenLabs cap (**don't delete the ElevenLabs secret**; the TTS function may fail to deploy without it)
- review 90 days of function traffic
- **B1–B4** (§2.3)
- restrict the Firebase web key by referrer and API
- confirm Auth authorized domains, and that Anonymous sign-in is disabled
- log retention of 7–14 days
- optionally delete the unused `transcribeSpeech` function
- register an App Check key (not enforced)

**Risk:** a wrong key-referrer pattern breaks sign-in for everyone. **Rollback:** each console value is recorded before it changes and restored by hand (1–10 min).

**Exit tests:**
- (M) Screenshots of the budgets and caps.
- (M) Sign-in still works on readupapp.com and www right after the key restriction.
- (M) The B1 export and B2 rules copy are stored securely.
- (M) `transcribeSpeech` is gone from the function list, if chosen.

**Checkpoints:** CP-CONSOLE.

### P1. Test & release safety net (protects every later change)

| PR | Content | Exit tests |
|---|---|---|
| P1-a | QA-1 scripts-only root `package.json`, QA-2 Tier 0 static gate with a ratchet baseline, QA-3 CI, QA-21 DEPLOYMENT.md and PR template | CI runs on the PR. A deliberately bad commit (duplicate id, wrong `<title>`, a 709-line `index.html`) turns it red. Known bugs are listed in the baseline. |
| P1-b (Settings) | QA-4 branch protection, including admins | (M) A direct web-UI commit to `main` is refused. |
| P1-c | QA-5 to QA-10, plus DATA-1: the Comprehension harness promoted to tests (31/31); the vm characterization harness; goldens for tokenization, highlight timing, storage shapes and placement; the **preservation suite** (`npm run test:preserve`) | All green on `main`, with **zero network**. Fixtures cover a signed-in user with 2 children, legacy blobs, a Comprehension DB mid-session, and a version 1 export. |
| P1-d | SEC-20 README/DEPLOYMENT correction and `SECURITY.md` runbook | Review. Privacy wording is flagged for LEGAL. |
| P1-e | QA-12 headless Chrome E2E with fake Firebase and **deny-by-default network**, smoke tests, and `KNOWN_BROKEN` regressions | Smoke tests pass on Windows and in CI. Every run asserts 0 non-loopback requests and 0 `pageerror`. |

**Risks:** false positives that block PRs, mitigated with an allowlist and warn mode. Owner workflow change: no more direct uploads to `main`. **Rollback:** revert the PR, or switch a check to `warn`. **Checkpoints:** CP-MERGE for each PR, and CP-SETTINGS.

### P2. Server-side cost protection (observe mode; no visible change)

| PR | Content | Exit tests |
|---|---|---|
| P2-a | SEC-1 (instance caps), SEC-2 (one CORS allowlist, removing the TTS double layer), SEC-3 (input limits, plus the **N3 `passage` mode fix**), SEC-4 (no error-detail leakage, no raw-output logs), SEC-5 (model constant, `temperature` removed), SEC-6 (remove `transcribeSpeech`), SEC-21 guards | `node --test` validator suite. After deploy, (M) one story, one read-aloud and one photo import work on **both** readupapp.com and www. |
| P2-b | SEC-7 server prompt templates (old format still accepted), SEC-8 and SEC-9 in **log-only** mode, SEC-10 quotas **count-only**, including the **global daily dollar meter** | **Snapshot tests show each template reproduces today's client prompt exactly.** Injection and out-of-range tests. Logs show the `auth`, `template` and `appcheck` status of each request. |
| P2-c | SEC-13 rules into the repo, phase 1, starting from the B2 export | Emulator rules tests if INSTALL is approved. Otherwise a rules lint plus a (M) Rules Playground run on every client path. Then V. |

**Risks:**
- A classroom burst may hit the instance caps and get "try again" or a fallback.
- PDFs over 20 pages and texts over 20K characters are refused.
- **Leaving readupapp.com off the CORS list would break read-aloud.** The checklist covers it.
- **A bad rules file locks families out.** The Playground check and the B2 rollback cover it.

**Rollback:**
- Functions: redeploy the previous tag (15–30 min), or in an emergency route Cloud Run traffic back to the previous revision (2–5 min).
- Rules: paste B2 and publish (1–3 min).

**Checkpoints:** CP-MERGE, **CP-FN-DEPLOY** (twice), **CP-RULES-DEPLOY**.

### P3. Free-first core learning + no-account access

| PR | Content | Exit tests |
|---|---|---|
| P3-a | FREE-5a: the WAV/MP3 MIME fix and the iOS unlock in `sayWordForPractice` | Unit tests. (M) The first tap on iPhone plays audio. |
| P3-b ‖ | FREE-6a/c and QA-17: fallback stories that rotate, no 15-second wait, and **no error text used as a reading passage** | 10 loads give at least 8 different stories. The WPM test never shows "could not be generated". |
| P3-c ‖ | FREE-7a: offline Fry/Dolch dictionary with a lemmatizer | The 441 sight words and their inflections show definitions with **0 network calls**. |
| P3-d | FREE-1: extract the highlight core byte-for-byte | **Goldens identical before and after.** Within ±1 word at 0.75×, 1.0× and 1.25×. (M) iPad and Chromebook. |
| P3-e | FREE-2: story player controller | State-machine tests. `recordReadComplete` fires exactly once. |
| P3-f | FREE-3: **browser read-aloud fallback** (phase A, with a kill switch) | With cloud TTS blocked, Play starts within 1 s. Highlighting only moves forward. Every chunk is ≤220 characters. Pause and resume work. |
| P3-g (no code) | Device-matrix run | (M) iPad and iPhone Safari, managed Chromebook, Android (Pixel and Samsung), Windows, macOS, Firefox. An 800-word story finishes on each. |
| P3-h | SEC-11a: one shared request helper for all 29 call sites, **with no token change yet**, plus the guest guard | A grep test finds no `fetch(CF_` outside the helper. Goldens unchanged. |
| P3-i | FREE-9: feature flags (`config.json`). **For guests, AI and cloud TTS are forced off.** | With every function URL blocked, every child screen is usable with **0 Cloud Function calls**. |
| P3-j | FREE-5/FREE-4: one speech provider; **the browser voice is the default** and the cloud voice is an adult opt-in | **0 `synthesizeSpeech` calls on the default path.** |
| P3-k | ARCH-1 (new): **load Firebase lazily** with `import()`, so free and guest paths work when gstatic.com is blocked, combined with QA-16 (no endless splash) | E2E with gstatic blocked: the guest path works and the boot message appears. **Signed-in call sequence identical to the baseline recording.** |
| P3-l | G-1: guest shell, local readers, shared-device notice (flag off) | Data is written only under `readup_guestdata_*`. Signed-in flow unchanged. |
| P3-m | G-2: gating guest features and the network guard. Guest-reachability static check (acorn call graph) | **Guest E2E with zero network:** land, start without an account, read a built-in and a library story, browser read-aloud highlights, word practice, timed reading, reload keeps progress. `__fbCalls` is empty. |
| P3-n | G-4: **turn on "Start reading — no account needed"** on the landing page, plus a link to Comprehension Mode for guests | The same guest E2E passes against the live configuration. (M) Owner walkthrough. |
| P3-o | FREE-6b: library stories in the main app | Token counts and grade mapping (educator confirms). |

**Risks:**
- **The highlight extraction is the highest-risk change.** Mitigation: byte-for-byte extraction, goldens, and a device check.
- Browser voice quality varies by device.
- Lazy Firebase loading touches startup. Mitigation: the call sequence must match a baseline recording.
- Guest progress lives only on the device. Mitigation: the notice, and the account upgrade in P6.

**Rollback:**
- Device: the `readup_tts_engine=cloud` flag works immediately.
- Fleet: a flag PR (15–45 min).
- Otherwise revert (about 15–60 min).
- Guest mode: turn the `guestMode` flag off. Guest data stays on the device and is unaffected.

**Checkpoints:** CP-MERGE for each, CP-DEVICES (owner provides devices), **CP-PRODUCT** (browser voice as the default; guest mode on).

### P4. Client lockdown and enforcement

| PR / step | Content | Exit tests |
|---|---|---|
| P4-a | SEC-11b: the client sends Firebase tokens and templates (and the App Check token once approved). **Only after P2-b is live.** | Headless tests check every call site sends the header and template. The preservation suite passes. |
| P4-b ‖ | SEC-12: Comprehension AI requires an existing parent session. Library mode stays sign-in-free. | **Harness 31/31 with no network**, plus a stubbed signed-in path. |
| P4-c (flag flips) | After at least 7 days with under ~1% old-format or token-less requests: `ENFORCE_AUTH`, then old format off, then `ENFORCE_QUOTA`, then `ENFORCE_APPCHECK`. **One per function deploy.** | Unit and fixture tests show 401, 429 and 503 lead to child-friendly fallbacks. (M) One curl without a token is refused (run by the owner). Function logs show the expected rejections. |
| P4-d | SEC-14 client: 6-character codes and owner uids | (M) Two-account Together test. |
| P4-e | SEC-14 rules phase 2 and SEC-15 cleanup (dry run first) | Emulator or Playground tests. Cleanup counts compared with B1. |

**Risks:** browser tabs still running the old version lose AI and fall back to free features (FREE-3 must be live). Signed-out families lose AI in Comprehension, but the library remains. **Rollback:** each flag flip is undone by redeploying with the old value (5–10 min), or by an RTDB config edit once SEC-13 is live (under 60 s). **Checkpoints:** CP-MERGE, **CP-FN-DEPLOY for each flip**, CP-RULES-DEPLOY.

### P5. Repair confirmed broken features (can run alongside P2 and P3 once P1 is done)

| PR | Content | Exit test: fails before the fix, passes after |
|---|---|---|
| P5-a | QA-13 (F2: 5 inline handlers) + QA-14 (N1: My Week screen nested inside another screen) | Static check: handler and nesting errors go to 0. E2E: the My Week card shows a **visible** checklist, the Word Bank tabs switch, dashboard Assign/Delete work, and exactly one modal opens. |
| P5-b | QA-15 (F1: vocabulary test) | A vm test throws before the fix and shows 4 choices after. Words with no definitions show a friendly alert and make **0 paid calls**. |
| P5-c ‖ | QA-18 (unique back-button ids, `</body></html>`) + QA-22 (one BUILD_ID) + QA-23 (post-deploy hash check) | Static checks green. The hash check confirms the first deploy. |
| P5-d ‖ | SEC-16 (XSS sinks, including the cross-family room path; import validation) | Injected `<img onerror>` payloads create no element and run no script. |
| P5-e | FREE-12 (reading-mode highlight drift) | A fixture with an em-dash and a year gives matching indexes. |
| P5-f | QA-20 (N2: My Week progress never recorded) | Each completed task advances the checklist and persists. **Needs a decision on what counts as done.** |
| P5-g | QA-19 (F7: placement floor) | The placement golden diff is reviewed. **Needs a decision.** |

**Risk:** low; each change is small and isolated. **Rollback:** revert (about 15 min). **Checkpoints:** CP-MERGE, plus CP-PRODUCT for P5-f and P5-g.

### P6. Student privacy and data safety

| PR | Content | Exit tests |
|---|---|---|
| P6-a | UX-4: "ReadUp level (estimated)" instead of Lexile; DIBELS wording removed or cited; landing-page claim | No user-visible "Lexile" or "DIBELS" except the disclaimer. Stored fields unchanged. Harness 31/31. |
| P6-b | SYNC-1 (no trimming of user data on a full disk) + SYNC-2 (reset and import go through the cloud) | Simulated quota error: cloud counts unchanged. Reset then reload stays reset. An import survives a reload and a pull. |
| P6-c | DATA-3: family backup v2 (all children, cloud copy and Comprehension; no PIN) | Version 1 file into the new code and v2 file into the old code both import. Importing the same file twice changes nothing. |
| P6-d | DATA-2 (hashed PIN, existing PINs kept) + UX-5 (profile edit/delete moved into the Grown-Ups area) + UX-6 (clear-all actions require the PIN) | PIN fixtures for none, one, several, and only 1234. Old `pin` byte-identical. A child can't reach delete or clear-all. |
| P6-e | SYNC-3: per-collection `update()` and dual-write `data_v2`, behind a flag | An unknown `/data` field survives a push. A clear-all reaches a second device. Data written by an old client stays readable. |
| P6-f | G-3: guest → account upgrade | Account with 1 child + 2 guest readers = 3 children, the existing child deep-equal. Running it again creates nothing. Guest data kept until removed. A failed write leaves guest data intact. |
| P6-g | SEC-17 (shared-device sign-out cleanup) + SEC-18 (delete account) | Sign-out never wipes data that hasn't synced. Deletion removes the RTDB paths and local data (throwaway account). |
| P6-h | SEC-19: privacy notice and parental consent (counsel's text) | Consent gate tests. Write-once rule test. (M) Privacy page linked everywhere. |

**Risks:**
- **SYNC-3 is the highest-risk data change.** Mitigation: a flag, the legacy copy written in parallel, and family backups first.
- **Consent may block existing parents** at their next sign-in. The owner chooses a blocking screen or a banner with a grace period.

**Rollback:**
- Flags off for SYNC-3 and guest upgrade.
- Revert the others.
- Data restore from B1 is a last resort that overwrites the affected node, so use it subtree only.

**Checkpoints:** CP-MERGE, CP-PRIVACY review (DATA-2, SEC-17, SEC-18), **CP-LEGAL** (P6-a wording, P6-h), CP-RULES-DEPLOY (consent node, SYNC-3 paths).

### P7. Grades 4–5 and accessibility

| PR | Content | Exit tests |
|---|---|---|
| P7-a | UX-1/2: **Comprehension linked from the Parent Menu and dashboard**; BUILD tag hidden. A P0 quick win that can ship right after P1. | The link works. Harness 31/31. |
| P7-b | UX-3a: grade safety net | Every grade map covers every grade. **Pre-K to 3 output identical.** |
| P7-c | UX-3b client + server templates: grades 4–5 (values from the reading specialist; benchmarks set to null until sourced) | A grade-5 profile round-trips. A grade-4 prompt uses the grade-4 rules. Never shows "above grade level" without a benchmark. |
| P7-d | A11Y-1 (contrast tokens) + A11Y-3 (focus) | All tokens ≥4.5:1 in light and bedtime modes. Visible focus everywhere. Screenshot diffs. |
| P7-e ‖ | A11Y-2: reduced motion and Calm | With reduced motion, the highlight has no transform and still advances. |
| P7-f | A11Y-5/6/7: semantics, labels, live regions, dialogs | Axe-style checks (axe needs INSTALL; otherwise a static lint plus manual checks). Harness 31/31. Esc returns `null`. |
| P7-g ‖ | A11Y-4 (44 px targets) + A11Y-8 (keyboard access to story words, behind a flag) | Click and Enter call the same function. Highlight sequence unchanged. |

**Risk:** children will notice the darker colors (each feature keeps its hue). **Rollback:** revert, or delete the contrast block. **Checkpoints:** CP-MERGE, **CP-EDUCATOR** (P7-c), CP-FN-DEPLOY (P7-c server), CP-VISUAL (P7-d).

### P8. Homepage v2 and navigation (behind a flag)

| PR | Content | Exit tests |
|---|---|---|
| P8-a | UX-9: Reading Comfort panel | Preferences persist per profile. Tap-to-define works at every size. The default look is unchanged. |
| P8-b | UX-7: flag infrastructure and the Grown-Ups hub | Every adult-facing feature can be reached. |
| P8-c | UX-8: Kid Home v2 (off by default) | **Every row of the audit's feature-mapping table becomes an E2E test.** Switching back to classic restores today's home. (M) A/B usability test with children. |
| P8-d | v2 on by default, with the classic toggle kept for at least one school term | (M) Usability results reviewed. |

**Risk:** children used to the current layout. Mitigations:
- feature colours and emoji are kept
- a one-time "Things moved!" tip
- the classic toggle stays available

**Rollback:** switch the flag back; no data is involved. **Checkpoints:** CP-MERGE, **CP-USABILITY**, CP-PRODUCT.

### P9. Comprehension integration and content (scheduled after P6)

**Items:**
- DATA-4 A/B/C: optional linking of readers, then an optional cloud backup
- FREE-10: an optional "Read it to me" button in the Listen step
- FREE-11: on-device PDF/DOCX import; on-device OCR as an optional beta
- FREE-7b: a curated dictionary
- FREE-8: static audio, sight words first
- content: stories above about 870, informational problem/solution and sequence texts, placement on its own topics, sourced grade 4–5 fluency ranges, words-correct-per-minute (WCPM)

**Exit tests:**
- Harness 31/31 at every step.
- index.html never writes `readup_comprehension_v1` in DATA-4 phases A and B.
- The static-audio validator passes, and static stories play with 0 TTS calls.
- Library schema checks and the estimator check pass, with unique titles.

**Checkpoints:** CP-MERGE, CP-EDUCATOR, **CP-PAID-RUN** (audio or dictionary generation), CP-PRIVACY (DATA-4C), CP-RULES-DEPLOY (DATA-4C).

---

## 5. Estimated recurring operating costs

**All figures are estimates.** Prices marked [U] are unverified list prices; confirm them in each provider's console before relying on them.

### Usage assumed per active child per month

| Item | Volume |
|---|---|
| AI stories | 20 (~600 input / 450 output tokens) |
| Definitions | 40 (~150 / 40 tokens) |
| Photo scans | 2 (~2K / 1K tokens) |
| Story read-alouds | 12–20, at ~900–1,200 characters |
| Single-word audio | ~30–100 utterances |

TTS adds up to about **16–19K characters per child per month**. On the Google path, the per-word SSML marks could raise the billed volume to about 61K, if marks are billed [U].

### Unit prices assumed

| Service | Price |
|---|---|
| Claude Haiku 4.5 | $1 input / $5 output per million tokens |
| Claude Haiku 5.5 | $0.10 / $0.50 per million (not counting extra "thinking" tokens [U]) |
| Google WaveNet | $4 per million characters after ~1M free per month [U]; some sources say $16 |
| ElevenLabs Flash | ~$0.05 per 1K characters [U] |
| Cloud Functions | 2M calls/month free, then $0.40 per million |
| Realtime Database (Blaze) | $5/GB stored, $1/GB downloaded |
| reCAPTCHA | 10K assessments/month free, then ~$8 per 100K [U] |
| Free | Cloud Scheduler (3 jobs), Logging (50 GiB), GitHub Pages, Firebase Auth under 50K monthly users |
| Artifact Registry | ~$0–0.50/month |

**Firebase Blaze has no fixed fee.** The domain renewal for readupapp.com isn't in the repo; it is likely about $10–20 a year [U].

### Monthly scenarios

| Scenario | 100 children | 1,000 children | Notes |
|---|---|---|---|
| **A. Today (unprotected)** | $13 (WaveNet) – $100 (ElevenLabs) | $163 – $995 | **No upper limit under abuse**: open AI proxy, no caps |
| **B. After lockdown, AI for signed-in parents** (Haiku 4.5, WaveNet, ElevenLabs off) | ~$13 (Haiku 5.5: ~$5) | ~$165 (Haiku 5.5: ~$85) | At 1,000 children this exceeds a $3/day meter, so the owner must set the meter to match |
| **C. Free-first (recommended)**: browser voice by default, 10% opt into a cloud voice, AI for parents only at ~25% of the volume, offline dictionary | **~$2–3** (Haiku 5.5: under $1) | **~$25–50** (Haiku 5.5: ~$6–25) | Guests cost $0. TTS share at 1,000 children: ~$2–20 |
| **D. Fully free**: no Cloud Functions | **$0** | **$0** | No AI. Spark plan: 100 simultaneous RTDB connections (classroom peaks may hit this), no cleanup job. Moving back to Spark means deleting every Blaze-only resource |

### Costs under abuse

**Worst case with only the per-type daily caps** (30 days, Haiku 4.5, every call at max tokens): about **$1,520/month**. Read-aloud at the cap would be about $3,000 on ElevenLabs. That is too high, so the roadmap adds two limits:
1. **A global daily dollar meter (SEC-10 amendment).** Each call adds its real cost; AI stops for the day at an owner-set limit. At **$3/day, AI spend is capped at about $90/month**, with the Anthropic monthly spend limit as a hard backstop.
2. **Tighter per-type caps:**
   - scans: 100/day
   - cloud TTS: 300K characters/day on WaveNet
   - ElevenLabs: off, or capped at 50K characters/day (about $75/month)

### One-time costs (each needs CP-PAID-RUN)

| Item | Cost |
|---|---|
| Static audio for all fixed content, 2 voices | Google ~$0–9, ElevenLabs ~$26, Piper $0 |
| Dictionary drafted by AI, then reviewed by a person | under $1 |
| Quality spot-check of Haiku 5.5 | a few dollars |

**Static-audio bandwidth:** about 9 MB per child per month, so the GitHub Pages 100 GB soft limit would be reached at about 11,000 children.

**Not estimated:** legal counsel, educator review, and staff time.

---

## 6. Approval checkpoints (nothing reaches production without the matching approval)

| ID | When | What the owner reviews | Evidence provided |
|---|---|---|---|
| **CP-MERGE** | Every PR. **A merge is a production release of the website.** | The diff, PR description and test results | Green CI, the preservation suite, harness 31/31, and screenshots for UI changes. Each repair has a test that fails before and passes after. |
| **CP-FN-DEPLOY** | Before every `firebase deploy --only functions`, including each enforcement flag flip | The deploy plan, the exact functions affected, and rollback steps | Unit and snapshot results, plus logs from the previous phase (e.g. 7 days in log-only mode under ~1% legacy) |
| **CP-RULES-DEPLOY** | Before every `firebase deploy --only database` | The rules diff against the B2 production backup | Playground results for every client path (or emulator tests), B1/B2 confirmed |
| **CP-CONSOLE** | Any console change: budgets, caps, key restriction, App Check, provider settings | Before and after values | The record in `SECURITY.md` |
| **CP-SETTINGS** | GitHub settings: branch protection, Actions | The rule configuration | The test refusal |
| **CP-INSTALL** | Any install (firebase-tools/JDK emulator, Playwright, axe) | Why it's needed | — |
| **CP-PAID-RUN** | Any billable call, including one-time generation or a model spot-check | Scope and a cost estimate | — |
| **CP-LEGAL** | Privacy notice and consent; Lexile®, DIBELS® and NAEP wording; account-deletion wording | The text | — |
| **CP-PRIVACY** | DATA-2, SEC-17, SEC-18, DATA-4C, guest-mode notice | The data flows | The §2.4 table entry |
| **CP-EDUCATOR** | Grade 4–5 values, content, placement floor | Values and samples | — |
| **CP-PRODUCT** | Browser voice as the default, guest mode on, AI defaults, My Week "done" rules | The decision | Device-matrix results |
| **CP-DEVICES / CP-USABILITY / CP-VISUAL** | Before the browser-voice default, Home v2 and the contrast change | Results from real devices, children and parents | Notes and screenshots |

---

## 7. Risks and rollback

### Rollback procedures

| Change type | Procedure | Time to recover |
|---|---|---|
| Website (merge to `main`) | Revert the PR → CI (~1 min) → merge → Pages build (1–3 min) → cache (`max-age=600`) | **~15 min**. The post-deploy hash check confirms it. |
| Fleet flag (`config.json`) | One-line PR | 15–45 min, including approval |
| Device flag (`localStorage` or URL) | Immediate, for one device | instant |
| Functions deploy | Redeploy the last good tag with the owner's login; mirror it in git with a PR. **Emergency:** Cloud Run → Revisions → 100% traffic to the previous revision. | 15–30 min (emergency 2–5 min) |
| Enforcement flag | Phase 1: redeploy with the old `.env` value. Phase 2 (after SEC-13): edit `config/security` in RTDB. | 5–10 min, or under 60 s |
| Rules deploy | Paste `database.rules.prod-backup.json` and publish | 1–3 min |
| Console change | Restore the recorded value | 1–10 min |
| Data restore (last resort) | Import the B1 JSON into **only the affected subtree** (import overwrites that node) | 5–15 min; writes made after B1 are lost |

**A revert does not undo data the bad build wrote.** That is why every change must be additive (§2.2), so older code can still read newer data.

### Top risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Highlight-sync regression (FREE-1/2/3) | Medium | Core reading feature | Byte-for-byte extraction, goldens, device matrix, kill switch |
| Rules deploy locks families out (SEC-13) | Low–Medium | Severe | Start from B2, allow unknown fields, Playground first, 1–3 min rollback |
| Enforcement breaks stale clients (SEC-8) | Medium | AI and TTS lost on old tabs | FREE-3 first, soak until legacy is under ~1%, one flag at a time |
| Data loss during sync changes (SYNC-3) | Low–Medium | Severe | Backups first (DATA-3), dual write, legacy never removed, flag, fixtures |
| Lazy-loading Firebase breaks startup (ARCH-1) | Medium | App won't open | Baseline call-sequence recording, E2E with gstatic blocked, revert in ~15 min |
| Cost overrun before P2–P4 finish | Medium today | Financial | P0 caps first, the dollar meter, the Anthropic spend limit |
| Consent screen drives families away (SEC-19) | Medium | Adoption | Banner with a grace period (owner decides); data untouched |
| Children confused by the new home (UX-8) | Medium | Engagement | Flag, A/B testing, classic toggle, "Things moved!" tip |
| A school network blocks gstatic or firebaseio | Medium | Endless "Loading…" today | QA-16 message; ARCH-1 so free features still work |
| Guest progress lost when browser data is cleared | Medium | Guest data | Shared-device notice, upgrade path, export |

---

## 8. PR catalogue (each independently testable; one branch each)

Gates: **M** = CP-MERGE, **F** = CP-FN-DEPLOY, **R** = CP-RULES-DEPLOY, **L** = CP-LEGAL, **E** = CP-EDUCATOR, **P** = CP-PRODUCT, **S** = CP-SETTINGS.

| # | Branch (proposed) | Items | Depends | Gates |
|---|---|---|---|---|
| 1 | `test/static-gate-ci` | QA-1, 2, 3, 21 | — | M |
| 2 | (settings) | QA-4 | 1 | S |
| 3 | `test/characterization-preservation` | QA-5 to 10, DATA-1 | 1 | M |
| 4 | `docs/security-runbook` | SEC-20 | — | M, L (wording) |
| 5 | `test/e2e-harness` | QA-12 | 1 | M |
| 6 | `functions/hardening` | SEC-1 to 6, 21, N3 | P0 | M, F |
| 7 | `functions/templates-auth-observe` | SEC-7, 8, 9, 10 (observe + dollar meter) | 6 | M, F |
| 8 | `rules/phase1` | SEC-13 | B1, B2 | M, R |
| 9 | `fix/tts-mime-ios-unlock` | FREE-5a | 3 | M |
| 10 | `feat/rotating-stories-wpm-fallback` | FREE-6a/c, QA-17 | 3 | M |
| 11 | `feat/offline-sight-dictionary` | FREE-7a | 3 | M |
| 12 | `refactor/highlight-core` | FREE-1 | 3 | M |
| 13 | `refactor/story-player` | FREE-2 | 12 | M |
| 14 | `feat/browser-tts-fallback` | FREE-3 | 13 | M |
| 15 | `refactor/cf-wrapper-guest-guard` | SEC-11a | 3 | M |
| 16 | `feat/feature-flags` | FREE-9 | 10, 11, 15 | M, P |
| 17 | `feat/browser-tts-default` | FREE-5, FREE-4 | 14 + devices | M, P |
| 18 | `refactor/lazy-firebase-boot` | ARCH-1, QA-16 | 5 | M |
| 19 | `feat/guest-shell` | G-1 | 16, 18 | M |
| 20 | `feat/guest-gating` | G-2 | 19 | M |
| 21 | `feat/guest-entry-on` | G-4 | 20 | M, P |
| 22 | `feat/library-stories-in-app` | FREE-6b | 10 | M, E |
| 23 | `client/tokens-templates` | SEC-11b | 7 live, 15 | M |
| 24 | `comprehension/auth-gated-ai` | SEC-12 | 7 live | M |
| 25 | (flag flips ×4) | SEC-8 → legacy off → SEC-10 → SEC-9 | 23, 24, 14 live, 8; soak | F each |
| 26 | `rooms/codes-uids` | SEC-14 client | 8 | M |
| 27 | `rules/phase2-rooms-cleanup` | SEC-14 rules, SEC-15 | 26 + soak | M, R, F |
| 28 | `fix/myweek-handlers-nesting` | QA-13, 14 | 5 | M |
| 29 | `fix/myweek-vocab-test` | QA-15 | 3 | M |
| 30 | `chore/html-ids-build-postdeploy` | QA-18, 22, 23 | 1 | M |
| 31 | `fix/xss-sinks` | SEC-16 | 5 | M |
| 32 | `fix/reading-mode-tokenize` | FREE-12 | 12, 31 | M |
| 33 | `feat/myweek-progress` | QA-20 | 3 | M, P |
| 34 | `fix/placement-floor` | QA-19 | 3 | M, E |
| 35 | `copy/level-fluency-wording` | UX-4 | 3 | M, L |
| 36 | `fix/sync-quota-reset-import` | SYNC-1, 2 | 3 | M |
| 37 | `feat/family-backup-v2` | DATA-3 | 36 | M |
| 38 | `feat/pin-v2-grownup-gates` | DATA-2, UX-5, UX-6 | 37 | M, privacy |
| 39 | `feat/sync-per-collection` | SYNC-3 | 37 | M, (R) |
| 40 | `feat/guest-upgrade` | G-3 | 37, 39, 20 | M |
| 41 | `privacy/signout-delete` | SEC-17, 18 | 38, 39 | M, L |
| 42 | `privacy/consent` | SEC-19 | 8; counsel's text | M, L, R |
| 43 | `feat/comprehension-link` | UX-1, 2 | 1 (can ship early) | M |
| 44 | `fix/grade-safety-net` | UX-3a | 3 | M |
| 45 | `feat/grades-4-5` (+ server) | UX-3b | 44, 7 | M, E, F |
| 46 | `a11y/contrast-focus` | A11Y-1, 3 | 5 | M, visual |
| 47 | `a11y/reduced-motion` | A11Y-2 | 5 | M |
| 48 | `a11y/semantics-dialogs` | A11Y-5, 6, 7 | 5 | M |
| 49 | `a11y/targets-keyboard-words` | A11Y-4, 8 | 12 | M |
| 50 | `feat/reading-comfort` | UX-9 | 46, 47 | M |
| 51 | `feat/grownups-hub` | UX-7 | 38 | M |
| 52 | `feat/home-v2` | UX-8 | 51, 28 | M, usability |
| 53 | `feat/home-v2-default` | — | 52 + results | M, P |
| 54+ | P9 items | DATA-4, FREE-10, 11, 7b, 8, content | P6 | M, E, paid-run, R |

**Suggested first two weeks:** P0, then PRs 1–5. In parallel: PR 6 (after P0), PR 43 (Comprehension link) and PRs 28–29 (My Week repairs).

---

## 9. Decisions needed

### To start (P0/P1)

| # | Decision | Recommendation |
|---|---|---|
| 1 | Approve this roadmap's order, with the safety net first and guest mode in P3 | Yes |
| 2 | Do the P0 console steps and B1–B4 backups | This week |
| 3 | Replace the unused root `package.json` and lock file | Yes |
| 4 | Turn on branch protection for `main`, including admins (is the repo public?) | Yes |
| 5 | Test tooling: use the JavaScript parser built into Node (no install) or keep a copy of acorn (MIT) in the repo | Built-in, with Node 26 pinned |
| 6 | Close PR #5 as superseded; merge PR #4 when ready | Yes |

### Cost and security

| # | Decision | Recommendation |
|---|---|---|
| 7 | Daily dollar limit for AI | $3/day (≈$90/month max) |
| 8 | Per-user and global quotas | Start from SEC-10 |
| 9 | Comprehension AI only for signed-in parents | Yes |
| 10 | App Check (reCAPTCHA cost, data sent to Google) | Decide after checking pricing |
| 11 | Model: keep Haiku 4.5 as a constant, or approve a paid Haiku 5.5 check | Constant now |
| 12 | Upload limits | 20-page PDFs, 20K characters |
| 13 | ElevenLabs | Off; WaveNet as the opt-in voice |
| 14 | Emulator install (firebase-tools + JDK) | Recommended before PR 8 |
| 15 | A staging environment | Local preview plus post-deploy hash check, at minimum |
| 16 | 6-character room codes | Yes |
| 17 | Log retention | 7–14 days |

### Free access and product

| # | Decision | Recommendation |
|---|---|---|
| 18 | Guest mode turned on (PR 21) before the guest-to-account upgrade exists (PR 40)? Guest data stays on the device and can be upgraded later. | Yes |
| 19 | Read Together for account holders only | Yes |
| 20 | Browser voice as the default read-aloud | Yes, after the device tests |
| 21 | Target grades: 3–5 only, or Pre-K–5 | Owner |
| 22 | Teacher or class mode in scope | Owner |
| 23 | PIN only on the device, or synced; the adult check | Owner |
| 24 | Consent for existing users: blocking screen or banner | Owner + counsel |
| 25 | Fluency for grades 4–5 | Personal best until a source is approved; remove "DIBELS-aligned" |
| 26 | Who writes and reviews grade 4–5 content and benchmarks | Reading specialist |
| 27 | What counts as "done" in My Week; where placement stops | Owner + educator |
| 28 | Static audio generation (paid run, or free Piper); a separate `readup-audio` repo | Sight words first |
| 29 | Dictionary: hand-written, or an AI draft reviewed by a person | Owner |
| 30 | Fonts self-hosted; OpenDyslexic (license check) | Self-host |
| 31 | Home v2 timeline; how long the classic toggle stays; "Grown-Ups" or "Parent/Teacher" | Owner |
| 32 | Hide `tests/` from the public site (`_config.yml`) | Exclude |

---

## 10. Not verified

None of these block P0 or P1.

- **Production and accounts:**
  - production RTDB rules, which affect SEC-13 and guest/rooms behaviour
  - deployed functions and their traffic
  - billing status and caps
  - reCAPTCHA pricing
  - provider prices marked [U]
  - whether the repo is public
- **Devices and browsers:**
  - browser voice behaviour on real devices
  - iOS gesture rules
  - Chrome on CI runners
- **Test harness:**
  - whether the whole module runs under the planned fake DOM
  - whether `node --test` passes `--expose-internals` to child processes
- **Educational:** grade 4–5 benchmark values and content.
- **Lead-confirmed new findings:**
  - N1: My Week screen nested inside another screen
  - N2: My Week progress never recorded
  - N3: `passage` mode always fails
  - empty arrays are never pulled from the cloud, so a clear-all never reaches other devices
  - the Firebase SDK is imported statically, so a blocked gstatic.com stops the whole app
