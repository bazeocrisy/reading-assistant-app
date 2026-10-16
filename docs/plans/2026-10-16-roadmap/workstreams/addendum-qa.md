# QA addendum: guest mode tests, preservation gate, phase exits, static-site rollback

*Planning agent addendum, 2026-10-16. Read-only, nothing built or run yet. Extends `plan-qa-testing.md`.*

## 1. Guest (no-account) test support

**Harness support**
- **Fake Firebase, signed-out mode.** `seed.user = null`, and `onAuthStateChanged` fires once with `null`. In guest mode, any call to `ref/get/set/update/remove/onValue/signIn*` **throws** and is recorded in `window.__fbCalls`, so a test fails even if the app swallows the error.
- **vm harness (QA-6).** Same fake, plus a `fetch` stub that records and rejects any `cloudfunctions.net` or non-loopback URL.
- **Browser TTS stub.** Replaces `speechSynthesis` and `SpeechSynthesisUtterance` via `addScriptToEvaluateOnNewDocument`. On fake timers it fires `onstart`, then `onboundary` (with `charIndex`) for each word, then `onend`, and logs every utterance.
- **Guest fixtures.** `fixtures/storage/guest-*.json`. Key names will be locked in goldens once the UX/Data design fixes them.

**Tier 0 "guest-reachability" check (built on the acorn syntax tree)**
- **Inputs.** `tests/static/guest.json` lists guest entry points, as element ids plus named functions.
- **Roots.** The handlers bound with `getElementById('<id>').addEventListener` (including inline arrow functions), plus the named functions.
- **Call graph.** acorn-walk builds a call graph over top-level functions and listener bodies. The graph is an over-approximation; method calls are ignored.
- **What fails.** A reachable function fails if it touches a sink without a recognised guard:
  - **Sinks:** `CF_*`, `fetch(CF_…)`, or `ref/set/update/remove/get/onValue` with `db`.
  - **Guards:** `if (isGuest()) return` earlier in the function; an enclosing `if (!isGuest())` or `if (currentUser)`; or a `requireAccount(…)` wrapper.
- **Exemptions.** `/* @guest-unsafe-ok: reason */` exempts a function; all exemptions are listed in the output.
- **Strictness.** Static analysis can't prove a guard is correct, so this check fails only on new violations (ratchet). **The E2E test below is the authoritative check.**

**Guest E2E smoke test (`e2e/guest-smoke.e2e.mjs`), no network**
1. Signed out, the landing page shows.
2. Choose "Start without an account" and create a local profile. `__fbCalls` stays empty.
3. Read a built-in story and a library story. The TTS stub plays and the highlight advances through at least 3 words in order.
4. Do 3 Dolch/Fry practice items.
5. Timed reading on a built-in passage. WPM equals `round(words/s × 60)`.
6. **Reload.** The localStorage snapshot is deep-equal to the one taken before.
7. Totals: 0 non-loopback requests, 0 Cloud Function calls, 0 WebSockets, `__fbCalls` empty, no `pageerror`.

**Guest → account upgrade test**
- **Expected:** after a fake sign-up, `users/{uid}/children/{newId}/{profile,data}` equals the guest data. Guest data is kept until the cloud write is acknowledged, and no field is dropped (checked against the `pushToCloud` field list). A fresh login reproduces the data.
- **Negative case:** if `set` rejects, the guest data stays intact and an error is shown.

## 2. Preservation gate (`npm run test:preserve`)

**Required on every PR** that touches auth, Firebase, storage, `getData`/`saveData`, import/export or `comprehension.html`. CI decides by path and keyword filters.

1. **Storage fixture round trips.** Load → `getData()` → `saveData()`, then check that existing keys are **byte-for-byte equal** (adding keys is allowed). Fixtures:
   - a signed-in user with 2 children and full data, plus `readup_active_child` and `readup_dict_cache`
   - legacy blobs (no `wpmHistory`/`myWeek`, and a pre-child `readup_data`)
   - Comprehension `readup_comprehension_v1` with a session in progress, checking that a mid-session resume renders
   - export v1, where import → export gives the same `readup_data`
2. **Fake-RTDB snapshot diff.** Seed `users/{uid}/children/{id}/{profile,data}` and `rooms/…`, then script login → choose child → read → save → sync → logout.
   - No existing path may be deleted or change type.
   - Values may change only on an allowlist (`updatedAt`, appended arrays).
   - Every write path must be listed in `tests/static/rtdb-paths.json`.
3. **Rules.**
   - **If the emulator install is approved:** `@firebase/rules-unit-testing` checks owner-only access, and that other uids and guests are denied.
   - **If not:** the rules file is in the repo with a Tier 0 lint (`users/$uid` requires `auth.uid == $uid`, no top-level `.read: true`, `rooms` declared). Before every rules deploy, run a **manual Rules Playground check in the Firebase console**, with screenshots in the PR.
4. **Manual post-deploy checklist** (a test account only, never a real child), as a checkbox in the PR template:
   - the test account's children, words, WPM history and My Week are unchanged
   - sync to a second browser works
   - export, then import into a fresh browser, works
   - Comprehension progress is intact
   - signing out leaves guest data untouched

## 3. Phase acceptance tests (M = manual)

| Phase | Exit criteria |
|---|---|
| **P0 console safeguards** | (M) Budget, alert and quota screenshots. (M) API key restricted to the readupapp.com referrers. (M) `transcribeSpeech` gone from the function list. |
| **P1 safety net** | CI runs Tier 0 and Tier 1 on every PR. A deliberately bad PR (duplicate id, wrong title, 709-line file) goes red. (M) A direct push or web upload to `main` is refused. The post-deploy hash check is green on the first merge. The Tier 2 smoke test and the preservation gate pass on Windows and in CI. |
| **P2 server-side protection (observe mode)** | Limiter unit tests: an over-limit request is *logged, not blocked*. The paid-call ratchet is unchanged. (M) 7 days of logs with per-uid/IP counters. Client goldens are identical. |
| **P3 free-first core + guest mode** | The guest E2E passes with zero network. With every Cloud Function denied, every core screen works or falls back within 10 s. The guest-reachability gate passes. The upgrade test passes. Highlight goldens pass for browser TTS. |
| **P4 lockdown + enforcement** | Unauthenticated and over-limit requests are rejected (unit tests, plus an E2E with recorded fixtures showing a child-friendly error). CORS options allow readupapp.com only. The preservation gate passes. (M) One curl from a foreign origin is denied (run by the owner). |
| **P5 repairs** | Baseline entries for F1, F2, nesting, R5, WPM, F5 and the end tag are removed; each test failed before the fix and passes after. Zero `pageerror` across E2E. The My Week progress test passes (if approved). |
| **P6 privacy & data safety** | Rules tests (emulator), or the lint plus a manual Rules Playground check. Default-PIN migration keeps existing PINs. Export/import round trip works. "Delete my data" removes the RTDB paths and clears localStorage. (M) The privacy page is linked. |
| **P7 grades 4–5 + accessibility** | Pickers include grades 4 and 5, and the grade-keyed goldens are updated deliberately. Contrast lint passes at ≥4.5:1. A keyboard-only E2E covers the core flows. (M, or axe if installed) 0 serious or critical issues. VoiceOver and TalkBack spot checks. |
| **P8 homepage v2** | Title and marker expectations are updated deliberately. Every landing-page CTA reaches the sign-in or guest flow, and no external images load except allowlisted ones. Screenshot artifacts at 375 px and 1280 px. (M) Owner sign-off. |
| **P9 Comprehension integration/content** | An E2E checks that index.html links to comprehension.html. The `library.json` schema check, estimator check and unique-title check pass. Comprehension tests pass with 0 network. The `readup_comprehension_v1` preservation check passes. |

## 4. Static-site rollback

**Steps (about 15 minutes end to end)**
1. Revert the PR (GitHub "Revert", or `git revert -m 1 <merge-sha>` on a branch) and open the revert PR.
2. CI runs, about 1 min. Merge.
3. The Pages build runs, about 1–3 min.
4. The CDN and browser cache (`max-age=600`) serve the old version for up to about 10 more minutes. There is no service worker. Users can hard-refresh.

**Emergency path.** If CI itself is broken, an admin bypasses protection temporarily to merge the revert, and records that in the PR.

**Data caveat.** A revert does **not** undo localStorage or RTDB writes made by the bad build. That is why every schema change must be additive, so old code can still read new data.

**Post-deploy hash check (`post-deploy.yml`, on push to `main`)**
- **Polling.** Every 60 s for up to 20 min, it fetches the 3 live files with a cache-busting query. It compares their CRLF-normalised sha256 with the pushed commit, and also checks the BUILD_ID and the `<title>`.
- **Results.** A mismatch after 20 min fails the job and sends an alert: either the deploy is stuck, or someone made an out-of-band change such as a b8aae91-style upload. A match confirms the deploy, or the revert, has reached users.
- **Daily run.** It also runs once a day to catch drift.

**Unverified:**
- The `isGuest()` and `requireAccount()` names and the guest key names. These are proposals pending the UX/Data design.
- Where the rules file will live.
- The Pages build time.
