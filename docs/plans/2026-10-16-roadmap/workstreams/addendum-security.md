# Security addendum: guest access, account preservation, operating costs, rollback

*Planning agent addendum, 2026-10-16. Read-only, no secrets. Prices marked **[U]** are unverified list prices; confirm each in the provider's console.*

## 1. Guest mode (no account)

**Guests never call any Cloud Function, and every paid endpoint requires a signed-in parent.** This is enforced in two layers:
- **Client:** `cfPost` (SEC-11) throws `NoAccountError` when `auth.currentUser` is null. Each feature then uses the fallback it already has: a fallback or library story, browser `speechSynthesis`, or "Tap to look up meaning" / the offline dictionary.
- **Server:** once SEC-8 enforces sign-in, a request without a token gets 401, even from a modified client.

Guests use only the free static files (`library.json`, `fry.json`, `dolch.json`, the HTML) and localStorage.

SEC-8, SEC-9, SEC-10 and SEC-12 work unchanged:
- Quotas are counted per uid, and guests have none.
- App Check loads lazily on the first signed-in AI call, so guests never load reCAPTCHA.
- Comprehension's library mode is already guest-ready.

**Anonymous auth is still rejected, for guest mode too.** It would give every child a persistent identifier and add Firebase traffic. It also adds no abuse protection, because anonymous accounts are free and unlimited. The owner should confirm in the console that the Anonymous provider is **disabled**. Optionally, rules can also require `auth.token.firebase.sign_in_provider != 'anonymous'`.

**Read Together stays account-only.** It runs on RTDB `rooms/`, and the rules will require sign-in (SEC-13 and SEC-14). Guests see "A parent account is needed for Read Together." Rooms carry content between families, so they should stay tied to accountable accounts.

**Guest storage** uses separate keys and never syncs. The detailed keys are in the UX/Data addendum.

**Dependency (also affects the architecture and repair work):** the Firebase SDK is imported **statically** at the top of the single 11K-line module (`index.html:3854-3857`). If gstatic.com fails to load, **the whole module fails, guest features included.** So guest mode on poor networks needs **Firebase loaded lazily with `import()`**.

## 2. Preserving existing accounts and progress

**Baseline steps before ANY auth or database change (owner, in the console):**
- **B1. RTDB export:** Data → ⋮ → Export JSON. It contains children's names, so store it **encrypted, owner-only, never in the repo**, and delete it according to the retention policy.
- **B2. Rules backup:** copy the current rules text to `database.rules.prod-backup.json`.
- **B3. Auth baseline:** record the user count and the providers in use.
  - A full export needs `firebase auth:export`, which means INSTALL plus the owner's login. That export includes password hashes and is highly sensitive.
  - **No item in this plan changes Auth users**, so a count is enough.
- **B4. Test accounts:** one email/password and one Google account. Each has two test child profiles with fake progress, plus a second account pair for Read Together.

**Standard check after each change ("V"):**
- Each test account signs in and sees its children.
- Each child's progress, word bank and stories are present.
- One AI story, one read-aloud, and one Read Together room between two accounts all work.
- For rules changes, first run every client database path in the console Rules Playground.

| Item | Auth users | `users/{uid}/children/{cid}` profile + /data | Existing rooms | Existing localStorage | Migrated, rewritten or deleted? | What a returning user sees | Backup | Verify |
|---|---|---|---|---|---|---|---|---|
| SEC-8 (verify sign-in token) | unchanged | unchanged | unchanged | unchanged | nothing | The same app. Email/password accounts that were never verified (the UI already blocks these) see AI requests fall back. | B3 | V + logs show `auth=ok` |
| SEC-9 (App Check) | unchanged | unchanged | unchanged | unchanged | nothing | The same app. Once enforced, ad-blocked reCAPTCHA means AI requests fall back. | — | V + App Check metrics |
| SEC-11 (client sends tokens) | unchanged | unchanged | unchanged | dictionary cache and data kept | nothing | The same app | — | V |
| SEC-12 (Comprehension AI) | the session is read, never written | not touched | n/a | `readup_comprehension_v1` untouched | nothing | Library works as before. AI asks the user to sign in. | — | harness 31/31 |
| SEC-13 (rules, phase 1) | unchanged | **A rules deploy rewrites no data.** Risk: writes fail if production rules today allow something the client relies on, or if new `.validate` rules reject current fields. Allow extra fields; don't use `$other: false`. | signed-in read and write | unchanged | nothing | The same app, if validation passes. **Depends on the unknown production rules.** | B1, B2 | Playground, then V |
| SEC-14 (room codes and owners) | unchanged | unchanged | Old rooms have no `hostUid`. Under the phase-2 rules they are locked until they are 24 h old, then can be overwritten. A session running during the deploy may break, so deploy at a quiet time. | unchanged | new rooms get a uid field | 6-character codes | B1 (rooms optional) | two-account Together test |
| SEC-15 (cleanup job) | unchanged | unchanged | **Deletes rooms older than 24 h and quota records older than 7 days** | n/a | those are deleted permanently | nothing | B1; the first run is a dry run that only logs counts | counts compared with B1 |
| SEC-17 (sign-out cleanup) | unchanged | unchanged | n/a | `readup_data_*` and the dictionary cache are removed **only after a successful cloud push**. **Gap:** fields that exist only locally (the PIN and settings inside `readup_data`; `pushToCloud`, `3925-3943`, saves 9 fields) would be lost. **DATA-2 must move them first.** | local copy deleted; the cloud is the source | data re-pulled after sign-in | an export is offered | V on a second device |
| SEC-18 (delete account) | the requesting user only | theirs, after an export offer | theirs expire through SEC-15 | theirs | deleted on request; irreversible | n/a | the user's own export | throwaway test account |
| SEC-19 (consent) | unchanged | adds `users/{uid}/consent`; nothing else rewritten | unchanged | unchanged | new field only | a one-time consent screen; data intact behind it | B1 | V + consent field present |
| Guest mode | unchanged; signed-in users go straight in | unchanged | guests can't create rooms | new guest keys only | nothing | Signed in: the same app. Signed out: a guest option on the landing page. | — | V + a guest run with the network stubbed |

## 3. Operating cost model

**Usage per child per month** (from the audit):
- 20 AI stories (about 600 input / 450 output tokens)
- 40 definitions (about 150 / 40)
- 2 scans (about 2K / 1K)
- 20 read-alouds of about 900 characters (18K characters)
- about 100 single-word read-alouds (about 1K characters)

**Prices:**

| Service | Price used |
|---|---|
| Claude Haiku 4.5 | $1 input / $5 output per million tokens |
| Claude Haiku 5.5 | $0.10 / $0.50 per million tokens (bundled claude-api skill, cached 2026-10-06). Thinking tokens not counted **[U]**. |
| Google WaveNet | $4 per million characters after about 1M free each month **[U]** |
| Google Neural2 | $16 per million characters **[U]** |
| ElevenLabs Flash | about $0.05 per 1K characters **[U]** |
| Cloud Functions | 2M calls a month free, then $0.40 per million, plus free compute |
| Realtime Database (Blaze) | $5 per GB stored, $1 per GB downloaded |
| reCAPTCHA | 10K assessments a month free, then about $8 per 100K **[U]** |
| Free or near-free | Cloud Scheduler (3 jobs free), Logging (50 GiB free), Artifact Registry (about $0–0.50 a month), GitHub Pages and Firebase Auth under 50K MAU ($0) |

**Blaze has no fixed monthly fee.**

**AI cost per child:** about $0.09 a month on Haiku 4.5, or about $0.009 on Haiku 5.5.

| Scenario | 100 children | 1,000 children |
|---|---|---|
| (a) Today: unprotected, normal use | $13 (WaveNet) to $100 (ElevenLabs). **Abuse has no limit.** | $163 to $995. **Abuse has no limit.** |
| (b) After lockdown, AI on for signed-in parents (Haiku 4.5, WaveNet, ElevenLabs off) | about $13 (Haiku 5.5: about $5) | about $165 (Haiku 5.5: about $85). Bounded by the cap. |
| (c) Free-first: browser read-aloud, library first, AI for parents only (25% of the AI volume), offline dictionary | about $2–3 (Haiku 5.5: under $1) | about $25–30 (Haiku 5.5: about $4) |
| (d) Fully free: no Cloud Functions | $0 | $0 |

**Limits of scenario (d):**
- The Spark plan allows only **100 simultaneous RTDB connections**, which classroom peaks could exceed at 1,000 children.
- There is no cleanup job; stale rooms are overwritten through the rules instead.
- There is no AI.
- Moving back to Spark means deleting every Blaze-only resource first: functions, secrets and Scheduler **[U]**.

**Worst case under the SEC-10 daily global caps** (30 days, Haiku 4.5, assuming each call hits `max_tokens`):

| Bucket | Monthly worst case |
|---|---|
| Stories: 2,000 a day at up to $0.007 | $420 |
| Scans: 300 a day at up to $0.07 | $630 |
| Definitions: 5,000 a day at $0.001 | $150 |
| Sentence checks: 2,000 a day at $0.0013 | $78 |
| TTS: 2M characters a day on WaveNet ($8 a day) | $240 (**$3,000 on ElevenLabs**) |
| **Total** | **≈ $1,520 a month** (≈ $400 on Haiku 5.5 with WaveNet) |

That ceiling is too high, so this addendum amends SEC-10:
1. **Global daily dollar meter.** Each call adds its real cost (API `usage` × price constants) to `quotas/_global/{date}/usd`. AI stops for the day at an owner-set limit, for example **$3 a day, which caps spending at about $90 a month.** The Anthropic monthly spend limit (SEC-0) is the hard backstop.
2. **Tighter bucket caps:** scans 100 a day; TTS 300K characters a day on WaveNet; ElevenLabs off, or capped at 50K characters a day (about $75 a month).

## 4. Rollback

| Change type | Exact procedure | Time to recover |
|---|---|---|
| **Functions deploy** | **Normal:** check out the last good release tag and run `firebase deploy --only functions:<name>` with the owner's login (firebase-tools isn't installed on this machine; Cloud Shell probably has it **[U]**). Then make the same revert in git through a PR.<br>**Emergency:** Cloud Run console → service → Revisions → Manage traffic → 100% to the previous revision.<br>A **deleted** function (for example `transcribeSpeech`) can only come back by redeploying it. | Normal: 5–10 min per deploy, 15–30 min with approval. Emergency: 2–5 min. The next `firebase deploy` overrides the traffic split. |
| **Rules deploy** | RTDB → Rules → paste `database.rules.prod-backup.json` → Publish. The console may not keep a rules history **[U]**, so the B2 backup is mandatory. | 1–3 min; takes effect in under a minute |
| **Console change** | Before and after values are recorded in `SECURITY.md` and restored by hand. Key restrictions can take about 5 min to apply. Budgets don't affect service. Raising a spend cap takes effect immediately. | 1–10 min |
| **Flag flip** | **Phase 1** (flags in `.env`): set the old value back and run a functions deploy.<br>**Phase 2** (`config/security` in RTDB, only after the SEC-13 rules are live): edit the value in the console. | Phase 1: 5–10 min. Phase 2: under 60 s (the cache time). |
| **Client (GitHub Pages)** | Revert the merge commit through a PR, then merge after approval | 1–2 min build, plus up to about 10 min of cache |
| **Data restore (last resort)** | RTDB → the affected node → Import JSON from B1. **Import overwrites that node**, so restore only the affected subtree, such as `users/{uid}`. | 5–15 min. Writes made after B1 are lost. |
