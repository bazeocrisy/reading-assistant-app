# Workstream plan: homepage, navigation, accessibility & data preservation (UX / A11Y / DATA)

*Planning agent output, 2026-10-16, against `main` @ `eec9e78`. It was read-only and made no network calls. Contrast ratios were computed with the WCAG relative-luminance formula.*

## 0. Findings that change the plan

1. **Adding grade 4/5 buttons on their own would make things worse.** Lookups for unknown grades fall back to grade 1:
   - `gradeInstructions[grade] || gradeInstructions["1"]` (`index.html:4942`): 4th graders would get **1st-grade AI stories**.
   - `WPM_BENCHMARKS[...] || ['1']` (`8771, 8837, 14196, 14479`): 4th graders would be told "above grade level" against 1st-grade ranges.
   - The server falls back to grade 1 (`functions/index.js:277`) and grade 2 (`:364`).
   - Offline stories exist only for grades 1–3, and `getStory` (`5041`) falls back to `'2'`.

   So **a safety-net PR has to ship before the new grade options**, and it has to stay in place if those options are rolled back.
2. **Grade maps the audit missed:**
   - `4790` and `4854-4940` (per-grade prompt text)
   - `5775 GRADE_DEFAULTS`, `5777 NEAREST_SIZE`, `5817 GRADE_SPEED_DEFAULTS`, `5890 GRADE_LABELS`
   - `6299 GRADE_WORD_TARGETS`, `7424` (dictionary prompt), `9106 GRADE_WPM`
   - `9636-9637 GRADE_ICONS/NAMES`, `13150`
   - server `functions/index.js:360-364`
3. **The PIN is stored per child, per device, in plain text.**
   - `getData()` writes `pin='1234'` into every `readup_data_{childId}` (`9083`). It is checked at `13016` and changed at `14642`, always for the active child only.
   - It is never synced, and it appears in the export.
   - A stored `'1234'` is indistinguishable from a parent who deliberately chose 1234.
4. **Never add fields inside `users/{uid}/children/{cid}/data`.** `pushToCloud` (`3925-3946`) uses `set()` with a fixed list of 9 fields, so any new field is erased by the next save, including saves from old cached clients. New cloud data goes in **sibling nodes**, written with `update()`.
5. **Don't keep backup copies in localStorage before a migration.** That can trigger `QuotaExceededError`, and the quota handler then trims stories and syncs that loss to the cloud (`9049-9055`, F12). Backups are **downloaded files**, and migrations only add data.
6. **There are four destructive "Clear all" buttons a child can reach, and each is wiped in the cloud too:**
   - `btn-wordbank-clear-all` (`2692` / handler `8082`)
   - `btn-mywords-clear-all` (`2789` / `9768`)
   - `btn-spelling-clear-all` (`2914` / `11327`)
   - `btn-vocab-clear-all` (`3201` / `12274`)

   `btn-group-clear-all` (`2819`) only clears the current selection and isn't destructive.
7. **The modal's BACK button carries meaning:** it resolves to `null`, which "Time My Reading / Just Read" treats as "do nothing" (`8717`). Esc must keep resolving to `null`.
8. **What the Comprehension test harness depends on.** It uses:
   - the first plain `<script>`
   - ids `newName` and `newLex`
   - the text "Add a reader"
   - data attributes `act`, `kid`, `struct`, `source`, `kidedit`, `f`, `delkid`, `place`
   - DB fields `kids[].practice/listen/placements`, `used`, `sessions`, `current`
   - no network except `library.json`
   - null-guarded new static elements

   Any change to comprehension.html must keep these intact.
9. **The landing page also claims "DIBELS-aligned benchmarks"** (`15298`). This is marketing copy, so the owner must approve the change.

## Shared definitions

- **DM-core (devices):** school Chromebook 1366×768 (touch, trackpad and keyboard only), iPad 10th gen portrait and landscape, Android phone at 360×640, iPhone SE. Each with bedtime mode on and off.
- **DM-full:** DM-core plus:
  - 200% zoom
  - large OS text
  - OS reduced motion
  - VoiceOver on iPad
  - ChromeVox on Chromebook
  - airplane mode
- **Usability panels:**
  - U-kids: at least 5 children per grade from 3 to 5, including struggling readers and children with an IEP or dyslexia.
  - U-parents: at least 5 caregivers, including caregivers with low confidence with technology and Spanish-dominant families.
  - U-teachers: 2–3 teachers.
- **"Harness 31/31":** the existing Comprehension harness passes **unmodified**.

## Work items

| ID | Pri | Problem (evidence) | Change | Depends | Tests | Impact on existing functionality / mitigation | Rollback | Approvals | Effort |
|---|---|---|---|---|---|---|---|---|---|
| UX-1 | **P0** | Comprehension can't be reached: 0 references in index.html; the only link is the back link at `comprehension.html:181`. | Add "🧠 Comprehension Sessions (grown-up led)" to the Parent Menu (`15233-15243`, static markup, no JS) and the dashboard Overview tab. On comprehension.html: "← Back to ReadUp" and a "Grown-Ups" link to `./?open=grownups`. The `?open=` parameter does nothing when signed out. | — (better after DATA-2) | Link exists and resolves; harness 31/31; parents find it within 30 s; DM-core | Low. Parents see one new item; children see nothing new. | revert | PR (D5: behind the PIN?) | S |
| UX-2 | P3 | "BUILD JT" visible (`1881`, `3619`; the latter has no click handler); `appBuild:'CL'` (`14665`). | Hide it and use one build constant: a `<meta>` tag and a `console.info`, with the build shown in Grown-Ups › Help. | — | DOM test: no visible "BUILD" text | none | revert | PR | S |
| UX-3a | **P0** | §0.1 grade fallbacks. | One `normalizeGrade()` used at `4942, 5041, 8771, 8837, 14196, 14479, 11432, 11496, 14227` and `VOICE_NAMES 5474-5475`. Unknown or higher grades map to the highest grade that has content. **No visible change for Pre-K to 3.** | — | Unit test every map for prek, k, 1–5 and '99'; snapshot test that Pre-K to 3 output is identical | none | Revert is safe only while no grade 4–5 profiles exist; **keep it in place once UX-3b ships** | PR | S |
| UX-3b | **P0** | No grades 4–5. | **Pickers:** `2165-2169`, `2233-2237` (hidden compatibility row), `2463-2467`, `3366-3370`, `15629-15635`. **Do not add 4–5 to the sight-word picker (`2801-2805`):** fry.json has only k–3 and dolch.json only prek–3, so 4th–5th graders get "Highest list available" pointing at grade 3.<br>**Label maps:** `4287, 4790, 5890, 7379, 9636-9637, 9798, 9864, 11432, 11496, 13150, 14227`.<br>**Behavior maps (need an educator):** `gradeInstructions 4854-4940`, `VOICE_NAMES` (copy grade 3), `GRADE_DEFAULTS` and `NEAREST_SIZE` (4–5 likely 300 words), `GRADE_SPEED_DEFAULTS`, `GRADE_WORD_TARGETS`, `7424`, `WPM_BENCHMARKS`, `GRADE_WPM`.<br>**Benchmarks:** set them to `null` for 4–5 and show "Beat your best!" until an educator approves values.<br>**Server:** `functions/index.js:270-277, 360-364` go in a separate PR that needs a functions deploy (tts.js already treats grades above 3 as the default).<br>**State the remaining content gaps:** Fry/Dolch end at grade 3, offline stories cover grades 1–3, the library tops out around 870, placement at 900, and the Comprehension AI prompt says "3rd grade". | UX-3a; educator | Every map covers every grade; a grade-5 profile survives a round trip through RTDB and localStorage; grade-5 host in Together; children rate difficulty; DM-core | Current 4th–5th graders stay on "3rd" until a parent changes the profile, so nothing changes silently. | revert (3a keeps saved grade 4–5 profiles on grade-3 content) | PR + **reading specialist** + functions deploy (server part) | M |
| UX-4 | **P0** | Lexile and DIBELS wording (agent3 R1, R2). | **Change only displayed text.** Field names (`practice`, `listen`, `stats.lexile`, `listenLevel`, `readLevel`, `wpmHistory`) stay the same.<br>**comprehension.html:**<br>• `690`: "not a Lexile® measure"<br>• `703, 754, 1061`: "Level ≈ 450"<br>• `779-780, 794, 835`: drop "L" and add "(ReadUp level, estimated)"<br>• `917`: "Reads alone (ReadUp level, estimated)"<br>• `930`: "Starting level (optional)" with help text; keep `id="newLex"`<br>• `933`: "about 200 points higher"<br>• `937`: reworded<br>• `1072`: "New stories are unavailable right now. Library stories still work."<br>• keep "Add a reader"<br>**index.html:**<br>• `3594`: explainer moves to Grown-Ups, reworded as a practice estimate<br>• `8842`: "Wow — super-fast reading!"<br>• `14234, 14361`: "Typical range for {grade} (estimate)"<br>• `14275`: "Typical range"<br>• `15298` landing page: "Grade-level practice ranges" (owner approves) | — | Grep: no visible "DIBELS" or "Lexile" except the disclaimer; harness 31/31; old session fixtures still render | Parents see the same numbers without the "L". Saved data untouched. | revert | PR + **legal/brand** | S/M |
| A11Y-1 | P1 | Contrast fails (exact ratios in the next table). | **Add new tokens; don't change `--green` or `--purple` globally**, because they're used 73 and 134 times, including in bedtime mode. Override inline gradients with one appended `/* a11y-contrast */` block, so it's easy to revert. Remove the 0.7 opacity on the welcome note. | — | Token contrast unit test; axe color-contrast checks; screenshot diffs in light and bedtime modes | **Children will notice darker colors.** Keep each feature's hue, and show before and after to U-kids. | delete the block | PR + owner visual sign-off | M |
| A11Y-2 | P1 | 28 `@keyframes` and 37 `infinite` animations; no reduced-motion rule; word `scale(1.15)` (`293`, `837`). | `prefers-reduced-motion` and `html.calm` turn off the animations and the word scaling. Confetti becomes static. Calm toggle stored in `readup_ui_v1`. | — | Playwright `reducedMotion` check; highlighting still advances | Reading engine unaffected (it only toggles classes). | revert | PR | S |
| A11Y-3 | P1 | 12 `outline:none` rules, 0 `:focus-visible` rules. | `:focus-visible {outline:3px solid #1E3A8A; outline-offset:2px}`. That's 10.36:1 on white; bedtime uses #FFD93D. Replace each `outline:none` with `:focus:not(:focus-visible)`. | — | Playwright tab-through on home, reader and PIN pad | No change for mouse or touch users. | revert | PR | S |
| A11Y-4 | P2 | Targets of 26–38 px (`425, 431, 4288-4289`, `comprehension.html:74`). | Minimum 44×44 on the bar, voice, side and PIN buttons and on `.btn.small`. Word-search cells stay at the WCAG 2.2 AA minimum of 24 px, as a documented exception. | — | Check the hero stays above the fold on iPhone SE and in phone landscape | The bar grows about 14 px. | revert | PR | S |
| A11Y-5 | P2 | Clickable divs, no labels, `aria-hidden` on controls (`2583`). | • Remove `aria-hidden` from `2583`.<br>• Make `<button>` from `.avatar-option`, `#myweek-home-card`, `vocab-flashcard-wrap` and `scramble-hear`.<br>• Give `spell-practice-hear` and `quiz-hear` `tabindex` plus key handlers.<br>• In Comprehension, `.kid` and `[data-toggle]` become `<button>`, **keeping their data attributes** (the `closest()` delegation and the harness still work), with a button CSS reset.<br>• Add `aria-pressed` to chips, grade and voice buttons.<br>• Add `<label for>` to 20 inputs. | — | axe; harness 31/31; ChromeVox and VoiceOver | Layout may shift; check screenshot diffs. | revert | PR | M |
| A11Y-6 | P2 | No live regions in Comprehension. | A `#sr-status` `role=status` element **outside `#app`**, written through a null-guarded helper. Don't put `aria-live` on `#app`. Answer feedback in index.html goes through a live region. | — | Harness 31/31; manual screen reader check | none | revert | PR | S |
| A11Y-7 | P2 | The modal has no dialog role and no focus trap. Help text runs on. | Add `role=dialog`, `aria-modal`, labels, a focus trap and focus return. **Esc resolves to `null`, the same as BACK** (keeps `8717` working). Hide BACK only when a Cancel button exists. Add `white-space:pre-line`. Same treatment for the dictionary popup and naming wizards. | — | Unit test every way of leaving `showAppModal`; Playwright focus trap test | Confirm dialogs go from 3 buttons to 2. | revert | PR | M |
| A11Y-8 | P2 | Story words can't be reached by keyboard (`7360-7366`). | **Keep the `<span class="word">` elements.** Use a roving tabindex: arrow keys and Home/End move between words; Enter or Space calls the same function as a click. Add an `aria-describedby` hint. Same for `#rm-text` and the WPM tap view. Replace the silent 2 s throttle with a "One sec…" toast. Behind the flag `readup_ui_v1.kbdWords`. | — | A click and an Enter call `showDictionaryPopup` with the same index; the highlight sequence is unchanged (spy on `classList`); Chromebook keyboard; iPad keyboard | Touch is unchanged. Arrow keys prevent scrolling only while a word has focus. | turn off the flag | PR | M |
| DATA-1 | **P0 (do first)** | No record of storage shapes; no schema version. | **Inventory document plus golden fixtures** (key list below). Each PR loads, renders and saves the fixtures back, deep-equal apart from additive fields. | test infra | self | none | — | PR | S |
| DATA-2 | P1 | §0.3 PIN problems. | New `readup_pin_v2 = {salt, SHA-256 hash, setAt}` (D4: optionally synced to `users/{uid}/settings/pin`).<br>**Migration, read-only on old data.** Scan every `readup_data*` key for PINs other than '1234':<br>• exactly one: adopt it silently<br>• several: accept any one, then ask the parent to choose<br>• none: show "Create a Grown-Up PIN", with one chance to enter the old 1234<br>**Never rewrite or delete `d.pin`.** Recovery is a Firebase re-authentication. The unlocked state ends after 10 minutes idle or on "Back to kid mode". Exports leave out the PIN; imports keep the current PIN. | DATA-3 | Fixtures for none, one, several and only-1234; old PINs still work; mocked recovery | Parents with a custom PIN notice nothing; parents still on 1234 are asked once. A child reaching setup first is mitigated by the adult check and the re-auth recovery. | revert (old `d.pin` untouched) | PR + privacy review | M |
| UX-5 | P1 | Edit and delete buttons on the child's chooser (`4288-4289`, delete `4296-4305`). | Cards only select a reader. "Manage readers (grown-ups) 🔒" opens Grown-Ups › Readers and reuses `showAddChildModal` and the same delete code. Delete requires typing the child's name and offers a backup first. | DATA-2, DATA-3 | A child can't reach delete; parent add, edit and delete still work | One extra step for parents. | revert | PR | S |
| UX-6 | P2 | §0.6 Clear-all buttons, plus Reset (`14649`) and Import (`14690`). | Wrap the existing handlers in `requirePin(fn)` without changing their logic. Add a 10 s "Undo" toast that holds the old data in memory only. | DATA-2 | Each asks for the PIN; cancel leaves data intact | Children need an adult to clear a list. (Alternative: move these to Settings.) | revert | PR | S |
| UX-7 | P2 | No separate area for adults. | Flag infrastructure: `readup_ui_v1 = {home:'classic'\|'v2', calm, kbdWords}`, `?ui=v2`, and a "Try the new home screen" setting.<br>**Grown-Ups hub** (behind the PIN, replacing the Parent Menu body at `15233`): Progress, Comprehension, Plan the Week, Add Content, Readers, Settings (PIN, comfort, voice, backup, reset), Help, Back to kid mode.<br>**Each entry calls an existing opener; nothing is reimplemented.** | DATA-2 | One Playwright test per adult-facing row of §5.3 | Parents' navigation changes. | flag | PR | M |
| UX-8 | P2 | agent2 §5.2: confusing home screen. | New `#screen-pick-v2`. **The v1 buttons stay in the DOM, hidden, and the v2 tiles call `.click()` on them**, so behavior is identical and no ids are duplicated. `show('screen-pick')` redirects when the flag is on; update `updateHomeStats`, `_mwMode` (`5016-5032`) and `SCREEN_BACK_MAP`.<br>**Layout:** header; Today's Plan (My Week and Assignments); hero with Surprise me and Pick a topic; Reading Workout; Word Practice; My Stuff (My Stories, My Word Bank, My Lists); Read with a Friend; bar with Home and 🔒 Grown-Ups.<br>**Profile grade:** extract `applyStoryGrade(grade)` from `5820-5835`. The hero goes straight to story length with a "Reading level: 4th grade [change]" chip. The `_mwMode` guard (`5811`) is kept.<br>**Renames (labels only, ids unchanged):** `2673` title to "My Word Bank" (ships in v1 too); "My Words" to "My Lists"; "Practice Reading" to "Reading Workout"; "My Readings" to "My Stories". | UX-7; `2067-2070` markup fix (QA) | **Every row of agent2 §5.3 is a Playwright test.** U-kids A/B test of classic vs v2; U-parents; DM-full | **Children used to today's layout will notice.** Keep colors and emoji, add a one-time Bookie tip ("Things moved!"), keep the classic toggle for at least a school term, and send families a short "what moved" note. | flag back to classic | PR + usability results | L |
| UX-9 | P1 | No reading comfort options; on phones text shrinks to 1.15rem (`858`). | **Text size:** 1.25, 1.5, 1.75 or 2.1 rem; phones never below 1.25.<br>**Font:** Nunito, Atkinson Hyperlegible, Lexend or OpenDyslexic. **Check the OpenDyslexic license** (believed to be SIL OFL, UNVERIFIED). Self-host the fonts (a privacy gain) and describe them as a preference, not an evidence claim.<br>**Spacing:** WCAG 1.4.12 values.<br>**Weight:** Bold (current default) or Regular.<br>**Highlight:** Yellow 7.97, Blue #BFDBFE 7.73, or Underline.<br>**Read words:** #1E7A3A, #4B5563, or ink.<br>**Calm.**<br>Stored per child in `readup_prefs_{cid}`, optionally synced to `children/{cid}/prefs` with `update()`, **never inside `/data`**. Applied in `selectChildProfile` (about `4358`). | A11Y-1, 2 | Computed styles; highlighting and tap-to-define work at every size; preferences persist across reload and profile switch; dyslexic readers in U-kids; DM-full | Defaults keep today's look apart from the phone size floor. | revert | PR + font license check | M/L |
| DATA-3 | P1 | Export covers only the active child, not the cloud or Comprehension, and includes the PIN. Import writes directly to localStorage, so the cloud reverts it (F13). | **v2 envelope:** `{version:2, exportedAt, appBuild, readup_data (active child, no PIN), readup_dict_cache, family:{children:{id:{profile, data, cloudData?}}}, readup_comprehension_v1, prefs}`. **`readup_data` stays at the top level**, so old importers can still read v2 files.<br>**Import:**<br>• v1: restored exactly as today, but through `saveData` and the cloud (with the QA F13 fix), keeping the current PIN.<br>• v2: show a checklist and restore each child by matching id.<br>• Comprehension: **merge** kids, sessions, placements and `used` as a union, never replace.<br>• Unknown version: refuse with a friendly message.<br>"Download family backup" appears in Settings and before any delete or migration. | QA F13 fix | Round trips: v1 into the new code, v2 into the old code; importing the same file twice changes nothing; a large dictionary cache | Bigger export files. | old importers still read v2 | PR | M |
| DATA-4 | P2 | Two separate profile systems. | **Phase A (local only):** index.html writes `readup_family_dir_v1` (child id, nickname, grade, avatar) when Grown-Ups opens, and clears it on sign-out. In Comprehension, an optional "Linked ReadUp profile" select sets `k.linkedChildId`. Comprehension never loads Firebase, so it stays offline-safe and passes the harness, and "Scores stay on this device" stays true.<br>**Phase B:** Grown-Ups › Progress in index.html **reads** `readup_comprehension_v1` (never writes it) to show retell scores.<br>**Phase C (opt-in, D3):** "Back up Comprehension to my account" writes `users/{uid}/comprehension_v1` with `set()` on that node only. Restore uses the DATA-3 merge rules. Backups are per account, because sessions can include two readers. **Local data is never deleted.** The privacy notice is updated. | DATA-3; sync fixes | Harness 31/31 at every phase; fixture with a link survives reload; spy confirms index.html never writes `readup_comprehension_v1` in A/B; merging twice changes nothing; Comprehension works in airplane mode | None until a parent links readers. | old code ignores the new field and key | PR + owner + privacy + RTDB rules (C) | M + M |
| DATA-5 | **P0 gate** | "Preserve Comprehension" needs a concrete definition. | **Every PR must pass:**<br>1. Harness 31/31 **unmodified**, once committed.<br>2. The §0.8 contract intact.<br>3. A manual pass: the 5 steps, placement and listening check, skill rotation without repeats, print pack, progress, resuming or discarding a session, airplane mode.<br>4. A real device with existing `readup_comprehension_v1` data shows no loss in a before/after comparison. | QA harness commit | self | — | — | — | — |

**Contrast replacements (A11Y-1)**

| Purpose | Today | New token / value | Ratio |
|---|---|---|---|
| Words already read | #5CD85A (1.84) | `--read-done` #1E7A3A | 5.38 on white, 5.21 on bg; bedtime #86EFAC 10.55 |
| Orange button | #FF6B35→#E55D2B (2.84–3.54) | #C2410C → #9A3412 | 5.18 / 7.31 |
| Green button | 1.84–2.87 | #15803D → #166534 | 5.02 / 7.13 |
| Blue button | #54A0FF (2.68) | #1D4ED8 → #1E40AF | 6.70 / 8.72 |
| Teal (My Words) | #00CEC9 (1.97) | #0F766E → #115E59 | 5.47 / 7.58 |
| Red / coral | #FF6B6B (2.78) | #B91C1C | 6.47 |
| Orange text on light | #E55D2B on #FFF3E8 (3.24) | #C2410C (bedtime keeps #FF6B35, 5.23) | 5.18 white / 4.74 on #FFF3E8 |
| Stats: stories / words | #F9A825 1.97 / #5CD85A | #854D0E / #15803D | 6.63 / 4.86 |
| Comprehension: chip text, green, badge | 3.24 / 3.43 / 3.59 | #9A3412 on #FFF3E8; #1E7A3A; #1D4ED8 on #EAF3FF | 6.69 / 5.38 / 5.99 |
| Purple card | #9B59B6 | unchanged | 4.67 (passes) |

**Storage inventory (DATA-1)**

- **localStorage** (one readupapp.com origin, shared by both pages; no sessionStorage, IndexedDB or service worker in app code):
  - `readup_data_{childId}`, or `readup_data` when no child is selected (`9023-9027`): `{pin, bedtimeMode, stories[], wordBank[], spellingLists[], vocabLists[], weeklyLog[], timedPassages[], assignments[], wpmHistory[≤50 {wpm,seconds,wordCount,grade,date}], myWeek, updatedAt}`. No schema version.
  - `readup_active_child`
  - `readup_dict_cache` (`7402`, global)
  - `readup_comprehension_v1` (`comprehension.html:198, 323-333`):
    - `kids[{id, name, practice, listen, placements[{date, practice, listen, wpm, accuracy, byType}]}]`
    - `sessions[{id, date, structureId, topic, kidIds, scores, wpm, notes, listenTitle, readTitle, listenLevel, readLevel}]`
    - `rotationStart`, `current`, `placement`
    - `used{kidId:[storyId]}`, `placeUsed`
- **RTDB:**
  - `users/{uid}/children/{childId}` = `{id, name, nickname, grade, avatar, createdAt}`
  - `…/profile{name, grade, avatar, updatedAt}`
  - `…/data{9 fields + updatedAt}`, written with a whole `set()`
  - `rooms/{code}` (temporary). Rules are UNVERIFIED.
- **New keys (additive only):** `readup_ui_v1`, `readup_prefs_{cid}`, `readup_pin_v2`, `readup_family_dir_v1`; RTDB `children/{cid}/prefs`, `users/{uid}/settings`, `users/{uid}/comprehension_v1`. Every new RTDB path needs a rules review.

## PR order

| # | PR | Items | Gate |
|---|---|---|---|
| 1 | Data inventory + schema fixtures | DATA-1 | test infra |
| 2 | Comprehension link, BUILD tag, Word Bank title | UX-1, UX-2 | — |
| 3 | Grade safety net | UX-3a | — |
| 4 | Level and fluency wording | UX-4 | legal/brand |
| 5 / 5s | Grades 4–5, client / server | UX-3b | reading specialist / functions deploy |
| 6 | Contrast + focus | A11Y-1, A11Y-3 | owner visual sign-off |
| 7 | Reduced motion + Calm | A11Y-2 | — |
| 8 | Semantics, labels, live regions, dialogs | A11Y-5, 6, 7 | harness 31/31 |
| 9 | 44 px targets | A11Y-4 | — |
| 10 | Family backup v2 | DATA-3 | QA F13 fix |
| 11 | PIN migration, PIN-gated clears, profile management moved | DATA-2, UX-6, UX-5 | privacy review |
| 12 | Keyboard access to story words | A11Y-8 | — |
| 13 | Reading Comfort panel | UX-9 | font license |
| 14 | Flags + Grown-Ups hub | UX-7 | — |
| 15 | Kid Home v2 (flag off) | UX-8 | §5.3 checklist; U-kids |
| 16 | Comprehension link phases A/B | DATA-4 | — |
| 17 | Comprehension cloud backup | DATA-4C | D3, RTDB rules |
| 18 | v2 on by default with a classic toggle; remove v1 the next term | — | usability results |

## Owner decisions

- **D1:** target grades 3–5 only, or Pre-K–5? This decides the order of the pickers and the tone.
- **D2:** is teacher or class mode in scope? Comprehension currently caps at 2 readers (`slice(-2)`, `1362`).
- **D3:** keep Comprehension sign-in-free with an opt-in cloud backup (recommended), or require sign-in?
- **D4:** should the PIN stay on the device or sync to the account? What adult check for first-time setup?
- **D5:** should the Comprehension link sit behind the PIN?
- **D6:** grades 4–5 fluency: show cited typical ranges, or personal best only? Remove "DIBELS-aligned" from the landing page?
- **D7:** self-host fonts? Include OpenDyslexic?
- **D8:** Home v2 rollout timeline, and how long the classic toggle stays.
- **D9:** default text weight for new users.
- **D10:** who writes and reviews grade 4–5 content (Fry 501–1000, offline stories, library above 870, placement above 900)?
- **D11:** call it "Grown-Ups" or "Parent/Teacher"?

**Unverified:**
- **Configuration:** the RTDB rules; the Auth SDK's persistence mode; the OpenDyslexic license.
- **Visual or behavioural checks:** the run-on help text; the unclosed `screen-my-readings`; whether `#build-tag` has a click handler; whether the live site matches `main`.
- **Data and assumptions:** the grade 4–5 benchmark values; whether families have several custom PINs.
