# Workstream plan: repairs & automated testing (QA)

*Planning agent output, 2026-10-16, against `main` @ `eec9e78`. Planning only. The agent ran only read-only `node` commands: it parsed and compiled `index.html` in memory, and re-ran the Comprehension harness with a stubbed network (31/31 in 0.12 s).*

## 0. Verified facts that shape the plan

1. **A JavaScript parser is available without installing anything.** Node v26.5.0 ships with acorn 8.17.0 and acorn-walk.
   - Load it with `node --expose-internals` and `createRequire(import.meta.url)('internal/deps/acorn/acorn/dist/acorn')`.
   - It parses the whole 551 KB module in about 96 ms using a 26 MB heap. The module has 192 top-level functions and 147 variable declarations.
   - The checks can use a real syntax tree instead of regexes. The regex scanner from the audit flagged 33 names, but only `startVocabQuiz` is real.
2. **The index.html module runs as a classic strict script.** It has no top-level await.
   - Replace the 3 gstatic `import` lines with `const {…} = __FB;`, and `vm.Script("'use strict';"+code)` compiles it.
   - Every function worth testing is a top-level declaration, so **functions can be tested without refactoring first**.
3. **A browser test harness needs no install.**
   - Chrome is at `C:/Program Files/Google/Chrome/Application/chrome.exe` and Edge at `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`.
   - Node 26 has `WebSocket` and `fetch` built in.
   - The 124-line pattern in a CDP test harness from another of the owner's projects can be reused: CDP, `DevToolsActivePort`, `Runtime.exceptionThrown` and `taskkill /T /F`. It needs network interception (`Fetch.enable`) added.
4. **NEW: the markup nesting bug is real, and it hides the child's My Week screen.**
   - `screen-my-readings` opens at `2067`. `screen-my-week-child` opens inside it at `2070` and closes at `2089`. The parent closes at `2100`.
   - `.screen{display:none}` (`82-83`) and `show()` (`5003`) activates only the target, so the parent stays hidden.
   - **So fixing F2 alone would still show a blank screen.**
5. **NEW: My Week progress is never recorded.**
   - `progress:{read1:false,…,vocabTest:false}` is written only when a plan is published (`13774`). Nothing ever sets those flags to true.
   - `S._mwReadIdx` and `S._mwTimed` are set (`13913`, `14115`) but never read.
   - `storiesUsedByDate` is read but never written.
   - `git log -S"_mwReadIdx"` shows no revision ever read it.
   - Result: the child's checklist never advances, and the child stays locked in My Week Active mode until the parent PIN clears it (`13020`).
6. **F1 inputs.**
   - `startVocabDefinitionQuiz(words)` (`12882`) needs an array of `{word, definition}`. It shows `screen-vocab-practice`, then `screen-vocab-results`.
   - The normal caller (`12661-12673`) filters `definition.length > 3` and requires at least 2 words.
   - My Week vocab words can have no definition (`13710`, `13733`).
   - The fix has to filter the list. It must **not** call the paid `CF_BATCH_DEF` automatically.
7. **F2 confirmed** at `1928`, `2678-2679` and `14509-14510`. The dashboard template renders into the static `#dash-readings-content` (`3800`, rendered by `14176`).
8. **WPM:** the catch block at `8903-8909` sets the error sentence as the passage and still shows the instructions screen, so the score is saved through `saveWPMScore`. The story path already falls back to the free `getStory` (`7002-7006`).
9. **R5:** `hideSplash()` runs only inside `onAuthStateChanged`. The gstatic imports are static (`3855-3857`), so if any import fails the whole module never runs. **Any fallback must live in a separate classic `<script>`.**
10. **Missing closing tags:** `index.html` has no `</body></html>`.
11. **Three build IDs:** `BUILD JT` (`1881`, `3619`), `appBuild:'CL'` (`14665`) and "Build JS/JR" in commits.
12. **Data for a wrong-file guard.**
    - The real titles are `ReadUp! — Transforming Youth Inc.` and `ReadUp! Comprehension`.
    - `b8aae91` had a different title and 709 lines.
    - The guard should match exact strings from a config file. AC8's "title equals ReadUp!" would fail today.
    - `DEPLOYMENT.md` still recommends "Edit on GitHub" and "Upload New File".
13. **Other.**
    - `core.autocrlf=true`, so checks must normalise CRLF.
    - There is no `.github/` folder.
    - The root `package.json` lists only unused server libraries, with a 158-package lock.
    - `functions` requires `cors` without declaring it.
    - `tts.js buildSSML` (`260`) does not XML-escape words (SUSPECTED to break on `&` or `<`).
    - The `storyHash` cache key uses only the first 200 characters (SUSPECTED collision).

## 1. Test architecture (no dependencies)

```
package.json          scripts only, no deps. "test" = static + unit
tests/README.md       how to run each tier / each file alone
tests/lib/            extract.mjs (inline scripts, CRLF, line padding) · ast.mjs (bundled acorn)
                      vm-index.mjs (index.html characterization) · vm-comp.mjs (comprehension)
                      fake-dom.mjs · fake-firebase.mjs · cdp.mjs (Chrome/Edge + Fetch interception, deny-by-default)
                      server.mjs (127.0.0.1 static server; local preview)
tests/static/         check.mjs (Tier 0) · expect.json (titles, sizes, markers, CNAME) · baseline.json (known violations)
tests/unit/*.test.mjs Tier 1 (node:test)
tests/golden/*.json   characterization snapshots (UPDATE_GOLDEN=1; diffs reviewed in PR)
tests/fixtures/       storage/*.json (synthetic, no real child data) · tts/*.json (synthetic timings) · fake-firebase/*.js
tests/e2e/*.e2e.mjs   Tier 2, one Chrome per file, sequential
.github/workflows/ci.yml · .github/pull_request_template.md
```

**Commands.** Each one runs on its own, which suits a low-memory laptop.
- `npm run test:static`: under 2 s and under 100 MB.
- `npm run test:unit`: `node --expose-internals --test --test-concurrency=1`.
- `npm run test:e2e`: runs sequentially. One browser uses about 250–400 MB at peak.

**Testing functions trapped inside the module, without refactoring:**
1. **vm characterization harness.**
   - Extract the module and rewrite its 3 imports.
   - Run it in `node:vm` with:
     - a fake DOM, where `getElementById` returns only ids from static markup or ids registered through `innerHTML`, so null-guard branches behave as in a browser
     - fake Firebase
     - fake timers and `requestAnimationFrame`
     - a `fetch` that **throws on anything not stubbed**
   - Top-level `let`/`const` values can be read with `vm.runInContext`.
   - **Caveat:** this turns module scope into global scope, so it cannot catch F2-class bugs. Tier 0 and Tier 2 cover those.
2. **AST slice extraction**, used as the fallback and for the pure functions in `functions/tts.js`.
3. **Serve-time instrumentation for Tier 2.**
   - The test server adds a namespaced `window.__ru` (getters plus `fns`), but only when serving the test browser. Production bytes are unchanged.
   - Regression tests for F1 and F2 run against the uninstrumented page.

**Tier 2 network safety:**
- CDP `Fetch.enable({urlPattern:'*'})`, deny by default:
  - loopback is allowed
  - gstatic Firebase files are fulfilled with fake ES modules
  - `*.cloudfunctions.net` is fulfilled from fixtures only when a test opts in, otherwise it fails
  - Chart.js is faked
  - everything else fails
- `--host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"` as a second safety net.
- Fail on any `Network.webSocketCreated`.
- Every file ends with three assertions:
  - zero requests to non-loopback hosts
  - the Cloud Function count matches what was expected
  - no `Runtime.exceptionThrown`

## 2. Work items

Each repair removes its entry from `baseline.json` and from `KNOWN_BROKEN`, so its test **fails before the fix and passes after**.

| ID | Pri | Problem (evidence) | Change | Depends | Tests | Impact on existing functionality / mitigation | Rollback | Approvals | Effort |
|---|---|---|---|---|---|---|---|---|---|
| QA-1 | **P0** | No tests. The root `package.json` lists unused server libraries plus a 158-package lock. | Change it to scripts only, with no deps. Delete the root lock file. Add the `tests/` skeleton and README. `functions/` is untouched. | — | `npm test` passes on `main` | None at runtime. Note: with no `.nojekyll`, Pages serves `tests/` publicly, so fixtures must stay synthetic (see QA-24). | revert | PR (owner confirms the root deps are unused) | S |
| QA-2 | **P0** | F1, F2, F3, F5, nesting and the missing end tags could all have been caught statically. | `tests/static/check.mjs`:<br>(a) `node --check` on the extracted inline scripts and `functions/*.js`<br>(b) every JSON file parses<br>(c) `library.json` schema: 6×6×3 sessions, 24 placement passages, stops, unique ids and titles (5 known duplicates go in the baseline), and the ±100L estimator via AST<br>(d) fry/dolch counts<br>(e) **onclick-into-module detector**: finds 4 names today<br>(f) **undeclared-call detector (AST)**: finds `startVocabQuiz` ×2<br>(g) duplicate ids: 6 groups<br>(h) **no `.screen` nested inside another `.screen`**<br>(i) the file ends with `</body></html>`<br>(j) **wrong-file guard**: exact titles, at least 10,000 lines and 600 KB, required markers and files, `CNAME`, and a CI failure if `index.html` shrinks more than 20% from the base<br>(k) **paid-call ratchet**: 15 `fetch(CF_…)` sites in index and 1 in comprehension; any new one fails until it is reviewed<br>(l) fake-Firebase import contract<br>(m) optional: contrast lint and a secret scan<br>**Ratchet:** fail on new violations and on stale baseline entries. | QA-1 | `static-gate.test.mjs` feeds in known-bad snippets: the `b8aae91` title, a 709-line file, `onclick="foo()"`, a nested screen | None at runtime. False positives are handled with an allowlist and clear messages. | revert, or set a check to `warn` | PR | M |
| QA-3 | **P0** | No CI. | `.github/workflows/ci.yml` runs on pull_request and on pushes to main. `permissions: contents: read`, no secrets, Node 26.x. Jobs: `static` and `unit`, later `e2e` on ubuntu with the image's Chrome (UNVERIFIED), uploading screenshot artifacts. | QA-2 | The first PR shows green. A throwaway duplicate-id commit turns it red, then is reverted. | None. Pages deploys independently. | delete the workflow | PR (+ Settings if Actions is disabled) | S |
| QA-4 | **P0** | Web-UI uploads go straight to production. | Branch protection or a ruleset on `main`:<br>• require a PR<br>• require the `static` and `unit` checks, later `e2e`<br>• block force-push and deletion<br>• **include administrators**<br>Including administrators is what actually stops web-UI uploads. | QA-3 merged | A direct web-UI commit to main is refused | No more direct hot-fixes. Document an emergency bypass. | disable the rule | **Owner, in GitHub Settings.** UNVERIFIED: whether the repo is public (protection on private repos needs a paid plan). | S |
| QA-5 | P1 | The Comprehension harness exists only in a temporary folder. | Promote it to `tests/lib/vm-comp.mjs` plus `comprehension-flow.test.mjs` (31 checks). **Network assertion:** `library.json` once, and exactly one blocked `generateStory` attempt, only in the AI test. | QA-1 | Passes 31/31 today | none | revert | PR | S |
| QA-6 | P1 | Functions inside the module can't be tested. | `vm-index.mjs`, `fake-dom.mjs` (about 250–350 lines) and `fake-firebase.mjs`. Smoke test: boots; with no user, the landing page shows; with a fake user and child, `screen-pick` shows; no errors; zero unstubbed fetches. | QA-1 | Smoke test passes | Test-only. The fake DOM may need several iterations; fall back to AST extraction where it can't reach. UNVERIFIED that the module executes cleanly under it. | revert | PR | M–L |
| QA-7 | P1 | Lock in tokenization and normalization. | Lock in `renderStory` (`7356-7368`) and `fetchTTSAudio` normalization (`5482`), capturing the request body through the stubbed fetch. **Invariant:** `normalizedText.split(' ')` deep-equals the span texts, checked against `tts.js buildSSML` (`261`) and `charAlignmentToWordTimings` (`40`). Fixtures: short; 300 words; quotes, em-dashes, apostrophes; triple blank lines; CRLF; tabs; NBSP; `&` and `<`. | QA-6 | `golden/tokens.json` | none | — | PR | S |
| QA-8 | P1 | The highlight sync area has 271 churn commits and no tests. | Drive `startHighlightLoop` with a fake `ttsAudio` and a manual rAF queue. Cases:<br>• real timings with the 20 ms offset<br>• duration more than 1.01× the last timing (rescale)<br>• duration NaN, then valid<br>• all `startMs=0`, so the letter-weighted path runs<br>• count mismatch<br>• speeds 0.75, 1.0 and 1.25 | QA-6 | `golden/highlight-*.json`; the basis for AC5 | none | — | PR | M |
| QA-9 | P1 | **Owner priority 7: no lost progress.** | Lock in:<br>• `getLSKey()`<br>• `getData()` defaults, including `pin:'1234'`, recorded as current behaviour<br>• the quota-trim path<br>• the 3 s debounce of `pushToCloud`, only when signed in<br>• the push payload fields (`3929-3940`)<br>• `pullFromCloud` cloud-wins merge (`3906-3916`)<br>• `readup_active_child`<br>• `readup_dict_cache`<br>• the export envelope `version:1`<br>• import validation<br>• the Comprehension DB keys and kid shape<br>Fixture corpus of synthetic blobs, including legacy ones without `wpmHistory`/`myWeek`. | QA-6 | Load and round trip with no changes | none | — | PR | M |
| QA-10 | P1 | Placement logic. | Table-driven tests of `placementNext` and `placementResult` (`comprehension.html:536-570`): start levels 200, 500, 800 and 900 × pass patterns, plus the +50 rule. Also lock in `pickFromPool` rotation. | QA-5 | goldens | none | — | PR | S |
| QA-11 | P2 | Pure functions. | `checkContentSafety` and `escapeHtml`. The fixtures include all 132 passages, with the two false positives `cause-700-b` and `description-400-a` recorded as **known current behaviour**. Also: `storyHash` (prefix collision), `cleanStoryText`, `generateWordSearchGrid` (seeded), `generateSmartDistractor`, `parseMeaningsFromText`, `mwProgress`, `buildMwChecklistItems`, the WPM formula and `saveWPMScore`, and timezone handling at midnight. | QA-6 | units | none | — | PR (safety fixtures before the F6 change) | M |
| QA-12 | P1 | No browser tests. | `cdp.mjs` (the existing CDP harness pattern plus Fetch interception, resolver rules, a websocket guard, `addScriptToEvaluateOnNewDocument` seeding, real `Input.dispatchMouseEvent` clicks) and fake Firebase ES modules. Smoke tests:<br>1. signed out: the landing page shows<br>2. seeded user and child: `screen-pick` shows with no `pageerror`<br>3. a built-in story renders N spans<br>4. Comprehension makes 0 external requests<br>Regression tests for F1, F2 ×3, nesting, R5 and WPM start as `KNOWN_BROKEN`. | QA-3 | Smoke passes on Windows Chrome and CI | none | revert | PR (no install) | L |
| QA-13 | P1 | **F2** (`1928`, `2678-2679`, `14509-14510`). | Remove the 5 `onclick`s and bind listeners at the top level. Dashboard buttons get `data-passage-action` and `data-passage-id` in **double-quoted** attributes, handled by **one** delegated listener on the static `#dash-readings-content`, bound once and not on re-render. Also convert the `attempts-${idx}` toggle, which helps a future CSP. | QA-12; ship with QA-14 | Tier 0 (e) goes from 4 to 0. E2E: My Week card shows a **visible** checklist; word-bank tabs switch; Assign and Delete work; exactly one modal; no `pageerror`. | Event-order risk is low, because the BACK delegate uses `closest()`. The single-modal test catches handlers multiplying. | revert | PR | S |
| QA-14 | P1 | **NEW** nesting bug (`2067-2100`). | Move the `screen-my-week-child` block (`2069-2089`) after `2100`. Ids are unchanged. | ship with QA-13 | Tier 0 (h) goes from red to green. E2E: the checklist is visible, and My Readings and its BACK still work. | No descendant selectors exist (grep). `show()` doesn't depend on order. | revert | PR | S |
| QA-15 | P1 | **F1** (`13949`, `14154`; `screen-vocab-quiz` doesn't exist). | At both sites: filter to words with definitions longer than 3 characters. If fewer than 2, show "Test not ready yet — ask a grown-up to add meanings". Otherwise call `startVocabDefinitionQuiz(withDefs)` and set `SCREEN_BACK_MAP` for `screen-vocab-practice` and `screen-vocab-results`. **Do not call the paid `CF_BATCH_DEF`.** | QA-6 | Tier 0 (f) goes to 0. vm test: `launchMwaTask` with 4 defined words throws before the fix and shows 4 choices after. Undefined words: alert, no throw, 0 fetches. E2E. | `SCREEN_BACK_MAP` changes persist, which is an existing pattern. Add a test for BACK from vocab outside My Week (UNVERIFIED whether `updateBottomBar` reads the map). | revert | PR | S |
| QA-16 | P1 | **R5**: the splash can hang forever (`4563-4603`, `15703`). | A **classic** `<script>` before the module, with a timer (`__READUP_BOOT_MS` or 10 s). If `__readupBooted` is unset, show "Can't reach ReadUp… ask your school to allow gstatic.com and firebaseio.com" with a Retry button. Set `__readupBooted` on the first auth callback. Add `<noscript>`, and try/catch around routing so `hideSplash()` always runs. | QA-12 | E2E with `firebase-auth.js` blocked and 1.5 s: message visible within 3 s (fails today). Normal boot: no message. Late boot: the message hides. | On slow networks the message could appear early; if auth arrives later, it hides itself. | revert | PR | S |
| QA-17 | P1 | The WPM error text becomes the passage (`8903-8909`). | In the catch, use `getStory(randomTopic, S.grade, 300).body` and show a "Using a built-in passage" note, or offer "Paste / Built-in". Note for the cost workstream: `Promise.race` doesn't abort the paid fetch; use an `AbortController`. | QA-6 | vm test: stub `CF_STORY` to reject. Before the fix `wpmPassage` is the error text; after, it's a built-in story and no score is saved with error text. E2E variant. | Built-in stories may be shorter than 300 words; WPM still counts words read. | revert | PR | S |
| QA-18 | P3 | F5 duplicate ids; no `</body></html>`. | Give each `btn-inscreen-back-*` a unique id; `data-back-target` is unchanged and nothing references the ids. Add the closing tags. | QA-2 | Tier 0 (g) and (i) go green. E2E: BACK works on 3 screens. | Negligible: BACK uses delegation. | revert | PR | S |
| QA-19 | P2 | F7 placement floor (`comprehension.html:488`, `545`). | Stop only when bracketed, or when there is a pass and at least 4 rounds, or at a hard cap of about 7. Otherwise keep descending to 200. Reconsider `Math.max(150, lowest-100)`. | QA-10 | The golden "800, all wrong" goes from `[800…500]`→400 to `[800…200]`→150 (or the agreed value), as a reviewed diff. All-correct is unchanged. | A struggling child does more rounds; the cap limits fatigue. Stored shape unchanged. | revert | PR + **owner/pedagogy decision** | S |
| QA-20 | P1 | **NEW:** My Week progress is never recorded (§0.5). | `markMwProgress(key, extra)` updates `d.myWeek.progress` and saves. Call it on:<br>• read complete (read1-3, or wpm1-3 when timed)<br>• spelling practice and quiz results<br>• vocab practice and quiz results, honouring the attempt limits<br>• story generation (`storiesUsedByDate`)<br>Then re-render the checklist. | QA-9 goldens first | Tier 1: each completion increments `mwProgress().done` and persists. E2E: one read ticks the item. | Touches several results screens and adds more `myWeek` cloud writes. | revert (additive) | PR + **decision on what counts as "done"** | M |
| QA-21 | **P0** | `DEPLOYMENT.md` recommends web-UI uploads, which is the root of F3. | Rewrite it as branch → PR → CI green → owner approves → merge → Pages deploys, and fix the stale URLs. Add a PR template: why, finding ids, tests that fail before and pass after, "no new paid call sites", storage goldens unchanged or explained, screenshots. Commit messages in the form `area: summary (Fx)`. | with PR-1 | — | Process only. | revert | PR | S |
| QA-22 | P2 | Three build IDs. | One `<meta name="readup-build">` filled into both tags by a one-line classic script and read by the export. Same in comprehension.html. Tier 0 requires exactly one definition. CI fails if `index.html` changed but the build id didn't. | QA-2 | QA-9 golden | Export `appBuild` format changes; the importer ignores it. | revert | PR | S |
| QA-23 | P2 | No staging environment; wrong-file deploys go unnoticed. | `node tests/lib/server.mjs --preview` defaults to **fake Firebase with Cloud Functions blocked**; `--real` must be chosen explicitly. A `post-deploy.yml` workflow GETs the 3 live files and compares their sha256 to the commit (CRLF-normalised), so a wrong-file deploy shows up within minutes. Real staging (a second Pages repo, or Firebase preview channels, which need **Install**) is optional. | QA-3 | — | none | revert | PR; staging is an owner decision | S |
| QA-24 | P3 | `tests/` would be public on the site. | `_config.yml` `exclude: [tests, package.json, functions, "*.md"]`, or add `.nojekyll` and accept that it's public. | QA-23 | Live hashes unchanged | Changes the Jekyll build. | revert | PR + owner | S |
| QA-25 | P3 | Handed to the security workstream: `cors` isn't declared; `buildSSML` doesn't escape. | Add a Tier 0 check that every `require()` is declared. | — | — | — | — | PR | S |

## 3. PR order

1. **PR-1 "test: zero-dependency static gate and CI"**: QA-1, QA-2 (with baseline), QA-3, QA-21. After merge, the owner enables QA-4.
2. **PR-2 "test: unit and characterization harnesses"**: QA-5 to QA-10. No app changes. **Must merge before any security, UI or free-first PR touches `index.html`.**
3. **PR-3 "test: headless Chrome E2E, fake Firebase, no network"**: QA-12.
4. **PR-4 "fix(myweek): home card, word bank tabs, dashboard buttons, screen nesting (F2)"**: QA-13 and QA-14.
5. **PR-5 "fix(myweek): vocabulary test (F1)"**: QA-15.
6. **PR-6 "fix(boot): visible error instead of endless splash (R5)"**: QA-16.
7. **PR-7 "fix(wpm): built-in passage when AI fails"**: QA-17.
8. **PR-8 "chore(html): unique back ids, close body/html (F5)"**: QA-18.
9. **PR-9 "release: single BUILD_ID + post-deploy hash check"**: QA-22, QA-23 (and QA-24 if chosen).
10. **PR-10 placement floor**: QA-19, after the owner decides.
11. **PR-11 record My Week progress**: QA-20, after the owner decides.

QA-11 can land any time after PR-2.

## 4. Owner decisions

1. Remove the unused root dependencies and the root lock file?
2. Turn on branch protection for `main`, including administrators? Is the repo public?
3. Use the bundled acorn via `--expose-internals` (no install, but an internal Node path; CI pins Node 26), or vendor the MIT-licensed `acorn.js` into the repo?
4. Optional installs, each needing permission: Playwright with WebKit, axe-core, and the Firebase Emulator (`firebase-tools`). None of them are needed for Tiers 0–2.
5. F7: descend to the 200 floor? What hard cap, and what practice value at the floor?
6. QA-20: what counts as "done" for each My Week item? Do test attempts count?
7. When AI fails in the WPM test: substitute a built-in passage automatically, or ask?
8. Keep `tests/` publicly served, or exclude it?
9. Staging: are the local preview and the post-deploy hash check enough?
10. BUILD_ID format, and who updates it.

## 5. Unverified

- Whether the whole module *executes* under the fake DOM.
- Whether `node --test` passes `--expose-internals` on to the child processes it starts for each test file.
- Chrome on `ubuntu-latest`. Whether the repo is public.
- Real-browser observation of F1, F2 and the nesting bug. All three are proven from source code, and PR-3's browser tests will confirm them.
- Whether `updateBottomBar` reads `SCREEN_BACK_MAP`.
- Whether `buildSSML` breaks on `&` or `<`. Whether the 200-character `storyHash` prefix causes collisions.
- Whether Pages runs Jekyll.
- Device audio and highlight timing.
