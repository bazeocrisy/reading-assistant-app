# ReadUp: Prioritized Implementation Plan

| | |
|---|---|
| **Based on** | Baseline audit, PR #4 (`docs/audits/2026-10-16-baseline/`), against `main` @ `eec9e78` |
| **Date** | 2026-10-16 |
| **Status** | **PROPOSED, awaiting owner review.** No application code has been changed. |
| **How it was made** | Four planning agents worked in parallel. Each was read-only and owned one workstream, and each re-checked file:line evidence against `main`. The lead combined their plans, settled conflicts, filled one gap, and spot-checked the new findings. |
| **Workstream plans** (full detail per item) | [`plan-security.md`](plan-security.md) (SEC), [`plan-free-first.md`](plan-free-first.md) (FREE), [`plan-qa-testing.md`](plan-qa-testing.md) (QA), [`plan-ux-data.md`](plan-ux-data.md) (UX / A11Y / DATA) |

Each workstream file lists, for every item:
- the problem it solves, with evidence
- the proposed change
- how it will be tested
- **its impact on existing functionality**, with mitigations
- rollback
- the approvals it needs
- effort

This document sets the overall order, the gates and the decisions.

---

## 1. Ground rules

- **GitHub is the source of truth.**
  - Every change goes on its own feature branch and is opened as a PR to `main`.
  - Nothing is merged without owner approval, and nothing is deployed without owner approval.
  - Before each task, sync with GitHub and verify the branch and commit.
- **Approval gates:**

  | Gate | What it means |
  |---|---|
  | **PR** | Code review and merge. GitHub Pages deploys `main` to readupapp.com, so a merge is a production release of the website. |
  | **FN-DEPLOY** | `firebase deploy --only functions`. Separate from merging; the owner runs it or approves it. |
  | **RULES-DEPLOY** | `firebase deploy --only database`. Separate from merging. |
  | **CONSOLE** | An action in the Google Cloud, Firebase, Anthropic or ElevenLabs console. Owner only. |
  | **SETTINGS** | GitHub repository settings, such as branch protection. Owner only. |
  | **INSTALL** | Installing any tool or dependency. Needs permission. |
  | **PAID-RUN** | Any call to a billable API, including one-time content generation. Needs permission. |
  | **LEGAL** | Counsel or brand review. |

- **Never call a paid API during development or testing.** Tests stub the network and **fail if any request leaves the machine.**
- **Never commit** secrets, real student data, or production rule exports that contain anything sensitive.
- **Preserve student progress.** Every PR must load, render and re-save the storage fixtures unchanged, except for added fields (DATA-1/QA-9). New cloud data goes in sibling nodes, **never inside `children/{cid}/data`** (it is overwritten in full on every save).
- **Preserve Comprehension Mode.** Every PR must pass the 31-check Comprehension harness **unmodified**, plus the manual checklist in DATA-5.

## 2. Why testing comes before the other priorities

The owner's order is cost → free core → privacy → repairs → testing → homepage → preserve progress. The plan keeps that order for the work itself. It adds one small, mostly zero-dependency step up front: **Milestone 1, a test-and-release safety net.** The reasons:

- Every later fix touches the 15,700-line `index.html`. It has no tests, and every push to `main` goes live. A wrong file was already published once (`b8aae91`).
- The characterization tests lock today's behavior for word highlighting, storage formats and Comprehension Mode. With those in place, priorities 1–4 can move quickly without risking priority 7.
- Milestone 1 needs nothing installed, and it doesn't touch application code beyond replacing an unused root `package.json`.
- The cheapest cost protection does not wait for it. **Milestone 0** is console-only and can happen today.
- Milestone 1 does change one thing for the owner: branch protection (QA-4) **ends direct uploads to `main` through the GitHub web page.** Changes go through PRs from then on.

## 3. New findings from planning (beyond PR #4)

| # | Finding | Evidence | Status |
|---|---|---|---|
| N1 | **The My Week child screen sits inside the My Readings screen**, so it renders blank. Fixing the broken My Week button alone would still show an empty screen. | `index.html:2067-2100`. `screen-my-week-child` opens at 2070, inside `screen-my-readings`, which closes at 2100. | Confirmed by the lead |
| N2 | **My Week progress is never recorded.** No code ever marks a task as done, so the checklist never advances and a child stays locked in My Week until a parent enters the PIN. | Writes happen only at publish time (`13774-13775`). `_mwReadIdx` is set at 13913 and 14115 but never read. `storiesUsedByDate` is never written. | Confirmed by the lead |
| N3 | **Read Together's PDF/DOCX import always fails.** The client sends `mode:'passage'` and expects text back, but the server treats every mode except `vocab` as spelling. | `index.html:6470-6497`; `functions/index.js:359` | Confirmed by the lead |
| N4 | **Adding grade 4/5 buttons on their own would make things worse.** Lookups fall back to **grade 1**, so a 4th grader would get 1st-grade AI stories and be told "above grade level". | `index.html:4942, 8771, 8837, 14196, 14479`; `functions/index.js:277` | Planner-verified |
| N5 | **The parent PIN is stored per child and per device, in plain text**, and is never synced. A stored `1234` can't be told apart from a parent who chose 1234. | `index.html:9083, 13016, 14642` | Planner-verified |
| N6 | **Four destructive "Clear all" buttons** are open to children, and each wipe syncs to the cloud. | `2692, 2789, 2914, 3201` | Planner-verified |
| N7 | `sayWordForPractice` is missing the iOS audio-unlock step (latent iPhone bug). WAV audio is labeled as MP3 at 4 sites. | `index.html:10624`; `7679, 7805, 7833, 10636` | Planner-verified |
| N8 | The reading-mode overlay splits words differently from the main reader, so its highlight drifts after "—" or numbers. | `index.html:14839-14849` | Planner-verified |
| N9 | **Correction to the audit:** partner rooms *are* deleted in most cases. Only rooms left behind by a closed tab persist, so a cleanup job is still needed. | `index.html:5246, 7071, 7856, 9016, 15036` | Planner-verified |
| N10 | **Testing needs nothing installed.** Node 26 includes a JavaScript parser (acorn). Chrome and Edge are already installed for headless testing. The Comprehension harness re-ran at 31/31. | QA §0 | Verified by running |

## 4. Gap filled by the lead: SYNC (data-loss fixes)

No planner owned the audit's data-loss findings (A7 / F11–F13). Three items depend on them: DATA-3 (family backup), SEC-17 (shared-device sign-out) and DATA-4 (Comprehension linking). Defined here; details to be added when the work is scheduled:

| ID | Pri | Problem (evidence) | Change | Tests | Impact / mitigation | Rollback | Approvals | Effort |
|---|---|---|---|---|---|---|---|---|
| SYNC-1 | P1 | **Full-disk trim deletes data and then syncs that loss to the cloud.** On `QuotaExceededError`, stories are trimmed to 5 and spelling lists to 3, then pushed (`index.html:9049-9078`). | Never delete user data automatically. Evict only `readup_dict_cache`, warn the parent, and **block the cloud push** of a trimmed record. | QA-9 golden plus a quota-simulation test: no item is lost, and no push happens after a trim. | Parents see a "storage full" warning instead of silent loss. | revert | PR | S |
| SYNC-2 | P1 | **Reset and import change only the device**, so the next sign-in restores the old cloud data (`14649`, `14738`, `3899-3922`). | Route reset and import through `saveData` and the cloud push, with confirmation. | Fixtures: reset, then reload, keeps it reset; import, then reload, keeps the import. | Reset now also clears the cloud copy (that is what users expect). Export first. | revert | PR | S |
| SYNC-3 | P1/P2 | **Each sync overwrites the whole cloud record**, so two devices clobber each other (`3925-3946`, client-clock compare at `4380`). | Per-collection `update()`. Use push-id appends for logs (`weeklyLog`, `wpmHistory`). Use `ServerValue.TIMESTAMP`. **Read the old shape and write both shapes for a transition period**, so stale clients keep working. | Fixture tests: two-device merge, and old client → new client → old client round trips. | The highest-risk data change. Ship behind a flag after QA-9, keep the old `/data` blob current during the transition, and require a backup (DATA-3) first. | flag off | PR (+ RULES-DEPLOY if rules change) | M–L |

## 5. Resolved overlaps between workstreams

| Overlap | Resolution |
|---|---|
| WPM error passage (FREE-6d and QA-17) | **QA-17** owns it. Free-first agrees: use a built-in or library passage. |
| Reading-mode overlay (SEC-16 escaping and FREE-12 tokenization) | **SEC-16** first: same tokenization, escaped DOM building, no visible change. Then **FREE-12** fixes the drift in its own PR so any highlight change can be traced. |
| FREE-1 assumed Vitest/Playwright | Use the **QA zero-install harness** (QA-6 vm and QA-12 CDP) instead. FREE-1's golden tests build on QA-8. |
| Server templates need grade 4–5 wording (SEC-7) and the grade 4–5 rollout (UX-3b) | SEC-7 ports today's prompts exactly (Pre-K–3). UX-3b adds grades 4–5 in both client and templates once the reading specialist supplies the text. |
| Comprehension sign-in (SEC-12 and DATA-4/D3) | The two agree: **library-first with no sign-in; AI only for a signed-in parent; an optional cloud backup later.** |
| PIN storage (DATA-2) and shared-device wipe (SEC-17) | **DATA-2 first**: the PIN moves to `readup_pin_v2`. Then SEC-17 can safely clear `readup_data_*` on sign-out. |
| Browser read-aloud (FREE-3) and auth enforcement (SEC-8) | **FREE-3 must be live before `ENFORCE_AUTH`.** Otherwise stale tabs lose read-aloud entirely. |
| Comprehension error wording (UX-4 at line 1072, FREE-9 AI-off states) | **UX-4** owns the wording. FREE-9 reuses it. |

## 6. The plan: milestones and PRs in order

PRs within a milestone are small, one per branch. **"‖" means the PR can run alongside the one above it.** Each row summarizes the problem, how it's tested and its impact on existing features. Full detail is in the workstream file under the item IDs.

### Milestone 0: Stop charges with no code change (owner, this week)

| Step | Items | Problem solved | How verified | Could it affect existing features? | Gate |
|---|---|---|---|---|---|
| 0.1 | SEC-0 #1–3 | No budget, alert or spend cap; billing exposure is open-ended | Budgets and caps visible in the consoles | Budgets don't stop service. A **provider spend cap** does stop AI and TTS when reached, and the app falls back to its free paths. **Don't delete the ElevenLabs secret** (the TTS function may fail to deploy without it). | CONSOLE |
| 0.2 | SEC-0 #4, #5 | Unknown traffic and unknown database rules | 90-day invocation review; **export of the current RTDB rules**, shared with the lead (needed for M2) | None | CONSOLE |
| 0.3 | SEC-0 #6, #7 | Unrestricted Firebase web key; log retention | Sign-in still works on readupapp.com right after the change | **A wrong referrer pattern breaks sign-in for everyone.** Write down the old setting first and test immediately. | CONSOLE |
| 0.4 | SEC-0 #8 (optional) | The unused `transcribeSpeech` endpoint is live | Function missing from the list | None (nothing calls it) | CONSOLE |

### Milestone 1: Safety net for testing and releases (priority 5, moved first; see §2)

| PR | Items | Problem solved | How tested | Impact on existing features | Gate |
|---|---|---|---|---|---|
| 1 | QA-1, QA-2, QA-3, QA-21 | No tests or CI; web-UI uploads; wrong-file deploys | The static gate goes green on `main`, with today's known bugs listed in a "ratchet" baseline. The gate's own tests feed it known-bad files (including the `b8aae91` upload) and expect it to fail. | None at runtime. Replaces the unused root `package.json` (needs owner confirmation). | PR |
| — | QA-4 | Direct pushes to `main` | A test web-UI commit is refused | **The owner can't hot-fix directly on `main` any more**; there is a documented emergency procedure. | SETTINGS |
| 2 | QA-5–QA-10, DATA-1 | Nothing locks today's behavior before others refactor | The Comprehension harness passes 31/31. Golden snapshots cover word splitting, highlight timing, storage shapes and placement. **Zero network.** | None (tests only) | PR |
| 3 ‖ | SEC-20 | False privacy claims in the README; no security runbook | Review | None | PR (+ LEGAL for privacy wording) |
| 4 | QA-12 | No browser tests | Headless Chrome smoke tests with a fake Firebase. Known bugs are listed as `KNOWN_BROKEN`. **Every request off the machine is denied.** | None | PR |

### Milestone 2: Protect against API charges (priority 1): server side

| PR | Items | Problem solved | How tested | Impact on existing features | Gate |
|---|---|---|---|---|---|
| 5 | SEC-1, 2, 3, 4, 5 (model constant), 6, part of 21; **N3 `passage` mode** | Unlimited instances; the CORS trap; no input limits; error leakage; unused STT endpoint | `node --test` on the validators. After deploy, one manual check each of story, read-aloud and photo import on readupapp.com **and** www. | A classroom burst may get "try again" or fallbacks. **PDFs over 20 pages and text over 20K characters will be rejected or truncated.** If readupapp.com were missing from the allowlist, read-aloud would break; the checklist guards this. | PR → **FN-DEPLOY** |
| 6 | SEC-7 (legacy accepted), SEC-8 and SEC-9 server side (log only), SEC-10 (count only) | Open AI proxy; no identity; no quotas | **Snapshot tests: each server template reproduces today's client prompt exactly.** Injection and out-of-range tests. Logs show how many requests lack a token or use the old format. | **None while in log-only mode.** Old clients keep working. | PR → **FN-DEPLOY** |
| 7 ‖ | SEC-13 | Database rules not version-controlled | Emulator rule tests **if INSTALL is approved**. Otherwise a careful diff against the exported production rules, plus a manual check right after deploy. | **A bad rules file would lock every family out.** It starts from the exported production rules and keeps the export as the rollback. | PR → **RULES-DEPLOY** |

### Milestone 3: Core learning without paid services (priority 2)

| PR | Items | Problem solved | How tested | Impact on existing features | Gate |
|---|---|---|---|---|---|
| 8 | FREE-5 (MIME + iOS unlock part), N7 | WAV labeled as MP3; missing iPhone unlock | Unit test for the MIME helper; **manual iPhone check** | Low | PR |
| 9 ‖ | FREE-6a/c, QA-17 | The same fallback story every time; a 15-second wait; the error message used as the reading passage | Seeded-random unit tests; vm test where AI fails and no error text is used | Fallback stories now vary, and lengths may differ from what was chosen. | PR |
| 10 ‖ | FREE-7a | Tapping a word sends it to Anthropic | Lemmatizer fixtures; **zero network calls for the 441 sight words** | Sight-word popups are richer and play longer audio. | PR |
| 11 | FREE-1 | Highlight sync has 271 fix commits and no tests | Golden outputs **before and after must match exactly** (builds on QA-8). Manual check on iPad and Chromebook. | **Highest-risk area.** Code is extracted unchanged, so behavior should not change. | PR |
| 12 | FREE-2 | Pause, resume and speed code reach into the audio element directly | State-machine tests with a fake engine | Touches Race mode and the iOS preload; the globals keep their current meaning. | PR |
| 13 | FREE-3 (phase A: fallback only) | **Whole-story read-aloud has no free fallback** | A fake `speechSynthesis` checks that highlighting only moves forward, pause and resume work, and dictionary lookups interact correctly. **Then a device-matrix run** (PR 14). | Cloud audio is unchanged. The browser voice runs only where users see "Audio unavailable" today. **Kill switch:** `readup_tts_engine=cloud`. | PR |
| 14 | Device-matrix test run (no code) | Unknown browser-voice behavior on real devices | iPad and iPhone, managed Chromebook, Android (Pixel and Samsung), Windows, macOS, Firefox | — | Owner provides devices |
| 15 | FREE-9 | AI sits on the child's path; silent waits when it's down | Every function URL blocked: every screen is usable and **0 Cloud Function requests are made on the child path** | The AI story button moves to the parent area. Read Together hosts need a library picker. | PR (owner sets the defaults) |
| 16 | FREE-5 (provider), FREE-4 | Each story play is a paid call | Network log shows **0 `synthesizeSpeech` calls by default** | **Voice quality changes on some devices.** "Premium voice" stays available as an adult option. | PR + owner decision |
| 17 | FREE-6b | The main app ignores the 108 library stories | Token-count tests on the mapping | Grade mapping needs educator confirmation. | PR |

### Milestone 4: Turn on the cost lockdown (priority 1, client side)

| PR | Items | Problem solved | How tested | Impact on existing features | Gate |
|---|---|---|---|---|---|
| 18 | SEC-11 | The client sends no token, and the fetch code is repeated at 29 call sites | Headless tests check every call site sends the token and template; grep checks catch any `fetch(CF_` outside the shared helper | **Must deploy after PR 6 is live** (server first, always). | PR |
| 19 ‖ | SEC-12 | Comprehension AI has no identity | **Harness still 31/31 with no network**, plus a stubbed signed-in path | Signed-out families lose AI stories and custom topics; the library stays fully available. | PR |
| 20 | SEC-8 → legacy off → SEC-10 → SEC-9 (one at a time) | Enforcement | Each step needs at least 7 days of log-only data with old-format and token-less requests under about 1%. Each flip can be undone in minutes. | Tabs still running the old version start using the free fallbacks. **FREE-3 must already be live.** | **FN-DEPLOY per flip** |
| 21 | SEC-14 client, then SEC-14 rules + SEC-15 | 4-digit room codes, overwrites, orphaned rooms | Two-device Together test; emulator rule tests if INSTALL is approved | **6-character codes are harder for young children to read aloud.** Both formats work during the transition. | PR → RULES-DEPLOY + FN-DEPLOY |

### Milestone 5: Repair confirmed broken features (priority 4). Can run alongside M2–M3 once M1 is done

| PR | Items | Problem solved | How tested (each fails before the fix and passes after) | Impact on existing features | Gate |
|---|---|---|---|---|---|
| 22 | QA-13 + QA-14 (F2 + N1) | My Week card, Word Bank tabs and dashboard Assign/Delete do nothing; My Week screen is blank | The static check goes from 4 broken handlers to 0 and from 1 nesting error to 0. Browser tests check each feature works and shows **exactly one** dialog. | Low. Element ids are unchanged. | PR |
| 23 | QA-15 (F1) | The My Week vocabulary test crashes | A vm test throws before the fix and shows 4 choices after. Words without definitions trigger a friendly alert and **0 paid calls**. | Low | PR |
| 24 ‖ | QA-16 (R5) | Endless "Loading…" when school filters block Firebase | Browser test with Firebase blocked: the message appears within 3 seconds | A message could appear on very slow networks; it hides itself if sign-in finishes later. | PR |
| 25 ‖ | QA-18, QA-22, QA-23 | Duplicate ids, missing closing tags, three build IDs, no post-deploy check | Static checks pass; a post-deploy hash comparison catches a wrong-file release within minutes | Negligible | PR |
| 26 ‖ | SEC-16 | XSS sinks, including the cross-family room path | Browser test injecting `<img onerror>` payloads: no element is created and no script runs | Text that intentionally contained HTML entities would display them literally (unlikely). | PR |
| 27 | FREE-12 | Reading-mode highlight drifts | A fixture with an em-dash and a year: the overlay index equals the story index | Visible highlight fix in Full Screen mode | PR |
| 28 | QA-20 (N2) | My Week progress never recorded | Each completion increments progress and persists | More `myWeek` writes to the cloud. **Needs the "what counts as done" decision.** | PR + decision |
| 29 | QA-19 (F7) | Placement can't test below start − 300 | Golden diff reviewed | Struggling readers do more rounds; there is a cap. | PR + decision |

### Milestone 6: Student privacy and data safety (priority 3; data parts serve priority 7)

| PR | Items | Problem solved | How tested | Impact on existing features | Gate |
|---|---|---|---|---|---|
| 30 | UX-4 | "Lexile" and "DIBELS" wording | Grep finds no visible "Lexile" or "DIBELS" text except the disclaimer; harness 31/31; old sessions still render | Same numbers, without the "L". **Saved data is untouched.** | PR + LEGAL |
| 31 | SYNC-1, SYNC-2 | Full-disk deletion; reset and import undone by the cloud | §4 tests | "Storage full" warning instead of silent loss; reset now clears the cloud copy too | PR |
| 32 | DATA-3 | Backup covers only one child; contains the PIN; skips the cloud and Comprehension | Round trips: old backup into new code, new backup into old code. Importing the same file twice changes nothing. | Bigger export files; old importers still work | PR |
| 33 | DATA-2, UX-5, UX-6 | Plain-text per-device PIN defaulting to 1234; delete and clear-all open to children | Fixtures for none / one / several custom PINs; **old PINs still work**; a child can't reach delete | Parents still on 1234 set a new PIN once. Profile edit moves into the Grown-Ups area. | PR + privacy review |
| 34 | SYNC-3 | Two devices overwrite each other | §4 tests | **Highest-risk data change.** Behind a flag, with the old shape kept current during the transition. | PR |
| 35 | SEC-17, SEC-18 | Shared devices keep child data after sign-out; no account deletion | Headless tests with stubbed Firebase; a throwaway test account | Sign-out **never wipes data that hasn't synced**. Deletion is irreversible, so it requires an export offer and typed confirmation. | PR + LEGAL (wording) |
| 36 | SEC-19 | No privacy notice or parental consent | Gate tests; write-once rule test | **Existing parents see a consent screen at their next sign-in** (blocking screen or banner: owner decides). | PR + **LEGAL** + RULES-DEPLOY |

### Milestone 7: Fit grades 3–5 and accessibility (priorities 6 and 7)

| PR | Items | Problem solved | How tested | Impact on existing features | Gate |
|---|---|---|---|---|---|
| 37 | UX-1, UX-2 | **Comprehension Mode can't be reached from the app**; BUILD tag shows | The link resolves; harness 31/31 | Parents see a new menu item. *This is a P0 quick win and can move earlier, right after M1.* | PR |
| 38 | UX-3a | Unknown grades fall back to grade 1 (N4) | Every map covers every grade; **Pre-K–3 output is identical** | None | PR |
| 39 | UX-3b (+ server templates) | No grades 4–5 | Grade-5 profile survives a round trip; children rate story difficulty | Current 4th–5th graders stay on "3rd" until a parent changes the profile. Sight words stop at grade 3, with a note. | PR + reading specialist + FN-DEPLOY |
| 40 | A11Y-1, A11Y-3 | Contrast failures; no visible keyboard focus | Token contrast test; axe-style checks; screenshot comparison in light and bedtime modes | **Children will notice darker colors.** Each feature keeps its hue. | PR + owner visual sign-off |
| 41 ‖ | A11Y-2 | Constant animation; no reduced-motion setting | Reduced-motion browser test; highlighting still moves | Wiggle and scale animations stop only if the OS setting or "Calm" is on | PR |
| 42 | A11Y-5, A11Y-6, A11Y-7 | Clickable divs, missing labels, silent screen-reader feedback, dialogs | Harness 31/31; screen-reader passes | Confirm dialogs go from 3 buttons to 2 (Esc keeps BACK's meaning) | PR |
| 43 ‖ | A11Y-4, A11Y-8 | Small targets; story words unreachable by keyboard | Click and Enter call the same function; the highlight sequence is unchanged | The bottom bar is about 14px taller. Keyboard words sit behind a flag. | PR |

### Milestone 8: New homepage and navigation (priority 6), behind a flag

| PR | Items | Problem solved | How tested | Impact on existing features | Gate |
|---|---|---|---|---|---|
| 44 | UX-9 | No text-size, font or spacing options; phone text shrinks | Computed-style tests; tap-to-define works at every size | Defaults keep today's look | PR + font license check |
| 45 | UX-7 | No separate adult area | One test per adult-facing feature row | Parents' navigation changes (behind a flag) | PR |
| 46 | UX-8 | A confusing home screen with three different things called "My Words" | **Every row of the audit's feature-mapping table becomes a browser test.** A/B usability test with children. | **Children used to today's layout will notice.** It's off by default, with a classic toggle for at least one school term. | PR + usability results |
| 47 | Make v2 the default | — | Usability results | Classic stays available | PR + owner |

### Milestone 9: Comprehension integration and content (priorities 2 and 7)

These items need educator involvement or owner decisions. They can be scheduled once the earlier milestones are stable:
- DATA-4 A/B/C: optional linking of Comprehension readers, followed by an optional cloud backup
- FREE-10: optional "Read it to me" in the Listen step
- FREE-11: on-device PDF and DOCX import, with optional on-device OCR
- FREE-7b: a curated dictionary
- FREE-8: static audio, starting with sight words; PAID-RUN or the free Piper option
- Content items from audit §4:
  - stories above about 870
  - informational problem/solution and sequence passages
  - separate topics for placement
  - grade 4–5 benchmarks with cited sources
  - WCPM (words correct per minute)

## 7. Critical path and parallel work

```
M0 (owner, now) ─────────────────────────────────────────────┐
M1: PR1 → [QA-4 settings] → PR2 → PR4                         │
          └ PR3 ‖                                             │
M2: PR5 → PR6 ──────────────┐   PR7 (needs M0 rules export)   │
M3: PR8 ‖ PR9 ‖ PR10;  PR11 → PR12 → PR13 → PR14(devices) → PR16;  PR15, PR17
M4: PR18 + PR19 (after PR6 live) → soak ≥7 days → PR20 enforce (after PR13 live) → PR21
M5: PR22–29 any time after PR2/PR4 (small, independent)
M6: PR30 ‖ PR31 → PR32 → PR33 → PR34 → PR35;  PR36 when counsel's text is ready
M7: PR37 early; PR38 → PR39; PR40–43
M8: PR44 → PR45 → PR46 → PR47 (after usability tests)
```

**Suggested first two weeks:** M0, then PRs 1–4. In parallel: PR 5 (server hardening), PR 37 (Comprehension link) and PRs 22–23 (the two My Week repairs).

## 8. Overall acceptance criteria

These combine the audit's AC1–AC11 with the planning results.

1. Tiers 0 and 1 run on every PR. `main` is protected. Every repair has a test that **fails before the fix and passes after**.
2. **No test makes a network request off the machine.** The count of paid call sites can't grow without a reviewed baseline change.
3. Comprehension harness 31/31 unmodified, plus the DATA-5 manual checklist, on every PR that touches `comprehension.html` or shared code.
4. Storage fixtures round-trip with nothing lost. Old backups import into new code, and new backups into old code.
5. With every Cloud Function failing:
   - **a child can read a story, hear it read aloud, practise words, finish a Comprehension session and save progress**
   - **the child's path makes zero Cloud Function requests by default** (after PR 16)
6. Functions: a request without a token or App Check gets 401/403 once enforcement is on, and an over-quota request gets 429. `generateStory` rejects free-form prompts. `maxInstances` is set on every function.
7. Accessibility: text contrast at least 4.5:1, keyboard access, visible focus, labels, announced feedback, and reduced motion respected.
8. No user-visible "Lexile", "DIBELS Goal" or "above grade level" text without approved wording. Grades 4–5 selectable. Comprehension reachable in 2 taps or fewer from the Grown-Ups area.
9. Shared devices: no `readup_data_*` left after sign-out, and account deletion removes everything.

## 9. Decisions needed from the owner

### Needed before M0/M1 can start

| # | Decision | Recommendation |
|---|---|---|
| 1 | Approve this plan's order, including moving the M1 safety net first | Yes |
| 2 | Do the M0 console steps and share the exported RTDB rules (without anything sensitive) | Yes, this week |
| 3 | Replace the unused root `package.json` and lock file (QA-1) | Yes |
| 4 | Turn on branch protection for `main`, including administrators (QA-4). Is the repo public? | Yes |
| 5 | Load the parser through Node's bundled acorn (`--expose-internals`), or vendor the MIT-licensed `acorn.js` into the repo | Bundled (no install), with CI pinned to Node 26 |
| 6 | Merge PR #4 first, so the plan's links resolve on `main` | Yes, after the M0 console steps |

### Needed before M2–M4

| # | Decision | Recommendation |
|---|---|---|
| 7 | Comprehension AI | Library for everyone, AI only for signed-in parents (SEC-12) |
| 8 | Quota numbers and the daily dollar ceiling | Start with the SEC-10 numbers |
| 9 | App Check with reCAPTCHA (cost, and data sent to Google) | Decide after checking pricing; auth plus quotas come first |
| 10 | Model: keep Haiku 4.5 as a constant, or approve a paid spot-check of `claude-haiku-5-5` (about 10× cheaper per token) | Constant now; spot-check later (PAID-RUN) |
| 11 | Upload limits (20-page PDF, 20K characters) | Accept |
| 12 | Default read-aloud voice: browser by default, cloud as an adult option | Yes, after the device tests |
| 13 | AI defaults off for children until the lockdown is enforced | Yes |
| 14 | Permission to install `firebase-tools` and a JDK for emulator tests | Recommended before PR 7 (rules) |
| 15 | A staging environment, given that every merge goes live | At least a local preview plus the post-deploy hash check |
| 16 | 6-character room codes | Accept, with a clear alphabet |

### Product and content decisions

| # | Decision | Recommendation |
|---|---|---|
| 17 | Target grades: 3–5 only, or Pre-K–5? | Owner |
| 18 | Teacher or class mode in scope? (Comprehension caps at 2 readers today) | Owner |
| 19 | PIN: device-only or synced to the account? Which adult check? | Owner and privacy review |
| 20 | Consent for existing users: blocking screen or banner with a grace period? Counsel to confirm COPPA. | **LEGAL** |
| 21 | Grade 4–5 fluency: cited typical ranges, or personal best only? Remove "DIBELS-aligned" from the landing page? | Personal best until a source is approved; remove the claim |
| 22 | Who writes and reviews grade 4–5 content and benchmarks? | Reading specialist |
| 23 | What counts as "done" in My Week (QA-20)? Placement floor (QA-19)? | Owner and educator |
| 24 | Static audio generation (PAID-RUN or free Piper), and a separate `readup-audio` repo | Sight words first, after the device tests |
| 25 | Dictionary: hand-written, or an LLM draft reviewed by a person (under $1, PAID-RUN) | Owner |
| 26 | Fonts: self-host? Include OpenDyslexic (license check)? | Self-host |
| 27 | Home v2 rollout timeline; how long the classic toggle stays; "Grown-Ups" or "Parent/Teacher" | Owner |
| 28 | Keep `tests/` publicly served by Pages, or exclude it with `_config.yml`? | Exclude |
| 29 | Log retention period | 7–14 days |

## 10. Not verified

- **Production and accounts:**
  - production RTDB rules
  - deployed functions and their traffic
  - billing and spending caps
  - reCAPTCHA pricing
  - repo visibility
- **Browsers and devices:**
  - browser-voice behavior on real devices (FREE-3)
  - iOS gesture requirements
  - Chrome on CI runners
- **Test harness:**
  - whether the whole module executes under the planned fake DOM (QA-6)
  - whether `node --test` passes `--expose-internals` to child processes
- **Educational inputs:** grade 4–5 benchmark values and content.

None of these block M0 or M1.
