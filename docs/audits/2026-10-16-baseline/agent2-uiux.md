# ReadUp: Student UI/UX Audit (Agent 2)

**Scope:** Information architecture, navigation, reading controls, feedback, design-level accessibility, and a student-first homepage proposal.
**Target users:** (a) a 3rd–5th grader reading alone, (b) a parent running a session, (c) a teacher with several students.
**Source:** repo `main @ eec9e78` (read-only clone `C:\Users\bazeocrisy\Projects\ReadUp-audit`). I also fetched the live pages read-only. https://readupapp.com and https://readupapp.com/comprehension.html match the repo on every point I checked: no link to Comprehension, "BUILD JT" tag showing, grade options stop at 3rd Grade, and the "← ReadUp" header link.
**Labels:** **EVIDENCE** means confirmed in code (file:line). **ASSUMPTION** means inferred and needs device or user testing.
**Not covered (other agents):** security (default PIN, keys), detailed a11y defect list, pedagogy, cost/privacy. I note those only where they change the UX, and say so.

---

## 1. Current implementation

### 1.1 Entry flow (index.html)
`#splash-screen` (L15703) → **unauthenticated:** `#screen-landing` marketing page (L15265) → `#auth-screen` (L15495) → **authenticated:** `#child-profile-screen` "Who's reading today?" (L15596; add-child modal L15613) → first time only: `#screen-welcome-1` (L1768) → **home `#screen-pick`** (L1880).

Persistent chrome:
- `header` (L1679): logo, 🌙 bedtime toggle, profile-switch badge, Bookie mascot with speech bubble, stats bar (streak, stories, words).
- Fixed `nav#parent-bar` (L3623): 🏠 Home, plus Back, Play, Pause and Stop that appear depending on context, plus 👩‍👧 Parent. It sits at the bottom on phones and tablets and moves to the top at 1280px and wider (L449).
- Footer with "BUILD JT" (L3632).

### 1.2 Screen map (index.html, 70+ screens/overlays)

```
HOME  #screen-pick (L1880)
├─ [HERO] Read a Story! ─► wiz-grade (L2158: Pre-K…3rd) ─► wiz-length (L2175: Quick 50 / Regular 100 / Long 300)
│                           ─► wiz-topic (L2190: 19 topics + Surprise) ─► loading (L2318) ─► countdown (L2553)
│                           ─► READ #screen-read (L2558) ─► solo-complete (L2628: read 1-of-3 dots, Read Again,
│                              Save to My Readings, Word Bank, New Story)
│                              ├ word tap ─► #dict-overlay (L3636)
│                              └ Full Screen ─► reading-mode overlay (JS-built, L14818)
├─ Practice Reading  ─► sheet-practice-reading (L1980)
│     ├ Time My Reading ─► timed-grade (L3359) ─► timed-source (L3376) ─► timed-paste (L3409)
│     │                   ─► wpm-instructions (L3473) ─► wpm-read (L3494) ─► wpm-tap (L3519) ─► wpm-results (L3533)
│     └ My Own Reading (upload/scan) ─► own-source (L3422) ─► own-paste (L3457) ─► read
├─ My Readings ─► screen-my-readings (L2067)
├─ Practice Words ─► sheet-word-work (L2003)
│     ├ My Words (duplicate of home card)
│     ├ Spelling Words ─► spelling-source (L2712) ─► [spelling-mywords L2759 | spell-grade-pick L2794 (Dolch/Fry)
│     │                   ─► spell-group-pick L2811 | spelling-type L2827] ─► screen-spelling (L2847)
│     │                   ─► spell-picker L2921 ─► spell-practice L2944 ─► spell-results L2975
│     │                   ─► quiz-countdown L3051 ─► quiz L3061 ─► quiz-results L3087 ; spell-sentence L2993
│     │                   ─► game-picker L3104 ─► wordsearch L3130 | scramble L3148
│     ├ Vocabulary Words ─► vocab-source L3177 ─► vocab-type L3206 ─► vocab L3242 ─► vocab-study L3274
│     │                   | vocab-flashcard L3285 | vocab-practice L3319 ─► vocab-results L3343
│     └ My Word Bank ─► screen-wordbank (L2670, titled "📖 My Words", tabs Story/Vocab)
├─ My Words ─► screen-my-words (L2032)
├─ (conditional) My Assignments ─► loads the timed-reading passage (L1921, L4661)
├─ (conditional) My Week card ─► my-week-child (L2070) / my-week-active full-screen (L2102)
└─ Read Together ─► together-choice modal (L2282) ─► Create: together-room L2397 ─► together-pick L2420
                     ─► [ai-grade L2456 ─► ai-topic L2473 | upload L2501 | spelling L2519]
                    └ Join: screen-join L2384 ─► waiting-guest L2535 ─► countdown ─► read ─► race-results L3606

PARENT  (bottom bar "Parent") ─► #global-settings-overlay "Parent Menu" (L15233)
├─ Parent Dashboard ─► #screen-pin (L3651) ─► #screen-parent (L3683)
│     tabs: Overview (L3723) · Readings (L3797, incl. assign passage) · Spelling (L3811)
│           · My Week planner (L3824) · Settings (L3831: change PIN, reset, export/import)
└─ Help & Tutorial ─► app-modal (L15116)

GLOBAL: app-modal (L15247), word-toast, bedtime mode (body.bedtime, L389)
```

### 1.3 Comprehension Mode (comprehension.html), a separate single-page app
Views are rendered by `render()` (L820) into `<main id="app">` with a fixed bottom `navbar`:
- **Home** `renderHome` (L840): Session in progress (resume/discard) · Who's reading? (pick 1–2 readers) · 📋 Placement check (one chip per reader) · Skill of the week (6 structure chips) · Stories: Library / New AI (topic chips + custom input) · **Start session** · 📈 Progress.
- **Readers** `renderKids` (L908): name, "Reads alone (Lexile)", "Listening level". The data is stored in localStorage on this device only (L197–199, L910).
- **Session** `renderSession` (L944): Step 1 Teach → 2 Listen (adult reads, 🛑 stop cards) → 3 Read (child reads 3×, Bigger text toggle, partner tags, optional WPM timer) → 4 Organize (graphic organizer, print) → 5 Retell (4-point rubric).
- **Placement** `renderPlacement` (L668): intro → 2–4 rounds of read (timer, Missed word counter) → questions (✓/✗) → listening check → results (Lexile, WPM, accuracy, question-type bars).
- **Progress** `renderProgress` (L1118): retell chart and history table.
- Getting there and back: the only link is `comprehension.html` header `<a href="./">← ReadUp</a>` (L181). **index.html has no link to comprehension.html at all** (grep: 0 matches for "comprehension" in index.html, and the live site agrees).

### 1.4 Homepage choice count (`#screen-pick` + chrome)
- Always visible and tappable: bedtime 🌙, profile switch, Read a Story, Practice Reading, My Readings, Practice Words, My Words, Read Together, bottom Home, bottom Parent = **10**.
- Conditional: My Assignments, My Week card = up to **12**.
- Non-interactive noise: Bookie speech bubble, 3 stats, "BUILD JT" tag (L1881), footer credits.

Ten choices is not extreme. The problems are elsewhere: **overlapping labels**, **2–6 levels of depth before reading starts**, and **adult controls on child screens** (see §2).

---

## 2. Confirmed findings

### A. Audience fit (grades 3–5)
1. **EVIDENCE: Grade 4 and 5 do not exist anywhere in the main app.** Every grade picker stops at "3rd Grade": story wizard (L2165–2169), Read Together AI (L2463–2467), sight words (L2801–2805), timed reading (L3366–3370), add-child profile (`<select>` L15629–15635). Label maps (L4287, L7379, L9798, L14227) and `WPM_BENCHMARKS` (L8113–8119) also stop at '3'. A 4th or 5th grader is asked "What grade are you in?" and cannot answer truthfully. They have to pick "3rd Grade" or lower, and then get 3rd-grade benchmarks and story difficulty. For the stated audience this is the most serious UX gap.
2. **EVIDENCE: The visual tone is aimed at younger children.** The first grade button is "Pre-K 🧸". There is a bouncing mascot, rainbow-animated title (L1784–1794) and a story length of "Quick: 50 words". **ASSUMPTION:** 4th and 5th graders (ages 9–11) often turn away from content that looks "babyish". Test this with them.
3. **EVIDENCE: Comprehension Mode (the grade 3–5 feature) is hidden.** You cannot reach it from the home page, the Parent Menu or the dashboard. A family only finds it by typing the URL.

### B. Information architecture and labels
4. **EVIDENCE: The "My Words" label means three different things.**
   - Home card "My Words" → `screen-my-words` (saved spelling and vocab lists, L2032).
   - The Word Bank screen is *also* titled "📖 My Words" (L2673), but the button that opens it says "My Word Bank" (L2021) or "Word Bank" (L2663).
   - "My Words" appears a second time inside Practice Words (L2008).
   - Related: "My Word Lists" (L2759) and "My Vocabulary Lists" (L3177).

   A child cannot build a mental model of where their words live.
5. **EVIDENCE: "My Readings" and "Practice Reading" sit side by side** with similar names but different purposes (saved stories vs. timed reading). "My Own Reading" (upload) sits under "Practice Reading" next to "Time My Reading".
6. **EVIDENCE: The flows are deep.** Fastest path to reading a story = Read a Story → grade → length → topic → loading → 3-2-1 countdown = 5 taps and 2 waits. The child must re-pick their grade every time, even though the profile already has one (L15627). Spelling practice can take 5–7 screens (source → grade → group → list → picker → practice).
7. **EVIDENCE: There are two parallel profile systems.** The main app uses Firebase child profiles with nickname, avatar and grade. Comprehension uses separate localStorage "readers" with Lexile numbers (L910, L197). A parent has to enter the same child twice, and scores never merge.
8. **EVIDENCE: There is no teacher or classroom structure.** "Assignments" are passages a *parent* assigns to the active child (L14523–14540). Comprehension supports at most 2 readers per session (`slice(-2)`, L1362). There is no roster, no class view and no per-student switching beyond the profile badge. A teacher with 10+ students would need one account per family or would mix data. (ASSUMPTION about intended use. Treat this as a product decision, not a defect.)

### C. Adult controls mixed into child screens
9. **EVIDENCE: Delete and edit buttons sit on the child's profile chooser.** Each card on "Who's reading today?" has ✏️ edit and 🗑️ delete buttons at 28×28px in the card corners (L4288–4289). Delete asks for confirmation but not the PIN. The child taps the card to start, and the delete button sits in its corner, so a mis-tap brings up the delete dialog.
10. **EVIDENCE: Destructive "Clear All" actions are open to children without a PIN.** "🗑️ Clear All My Lists" (L2789) and "Clear all words from Word Bank" (L2692).
11. **EVIDENCE: Adult explanation text appears on child result screens.** The WPM result explainer mentions DIBELS, AIMSweb and AMIRA and says "Your child read out loud…" (L3594), inside the child's results card. The benchmark is labelled "DIBELS Goal Zone" (L14234, L14275). "Words Per Minute" is the main unit a child sees.
12. **EVIDENCE: A developer tag is visible.** "BUILD JT" appears on the child home (L1881) and in the footer (L3634).
13. **EVIDENCE: The parent bar sits on every child screen.** The "Parent" button is always next to "Home" (L3629). The PIN gate defaults to `'1234'` (L9083, L13016). That is mainly a security issue for Agent 1, but for UX it means the parent/child separation is cosmetic until a parent changes the PIN, and the app never asks them to.
14. **EVIDENCE: Comprehension shows infrastructure jargon to parents.** The error card says "the Firebase function, the Blaze plan, or the Anthropic balance" (L1071). It also uses "Lexile" and "L" throughout (L835, L915–921, levelBadge L1059). That is acceptable on a parent-led page, but "Blaze plan" and "Anthropic balance" are operator language.

### D. Reading controls
15. **EVIDENCE: What exists.**
    - Read-aloud with a big Play button, Pause/Stop, Girl/Boy voice and a speed slider from 0.5× to 2.0× (L2579–2608).
    - Word-by-word karaoke highlight: gold background plus scale(1.15), with read words turning green (L292–294).
    - Tap a word for a definition popup with syllables, sentences and audio (L3636).
    - Full Screen reading mode with larger text (L834, L14818).
    - Three-read tracker (L2656).
    - Bedtime dark theme (L389).
    - Offline fallback to built-in stories when AI fails or times out after 15s (L6985–7007). This is graceful because the child never sees an error.
16. **EVIDENCE: What is missing.**
    - No user text-size control in the main reader. Size is fixed by breakpoint, and on phones it *shrinks* to 1.15rem (L858). Comprehension does have a "Bigger text" toggle (L1007).
    - No font-family choice and no dyslexia-friendly option. Only Nunito/Fredoka are loaded (L11).
    - Story text is all **bold** (font-weight 700, L291), which lowers word-shape contrast over long passages (ASSUMPTION, typographic best practice).
    - No line-spacing or letter-spacing control, and no line focus or ruler.
    - Highlight colour cannot be changed.
17. **EVIDENCE: Story words are `<span>` elements with click listeners** (L7360–7366), not buttons. They cannot be reached by keyboard (Chromebook) or switch access.
18. **EVIDENCE: Word taps are silently ignored for 2 seconds after each lookup** (`DICT_THROTTLE_MS = 2000`, L7468–7474). A child who taps again gets no feedback. ASSUMPTION: this reads as "the app is broken".
19. **EVIDENCE: The "read" word colour is #5CD85A on white, a contrast of 1.84:1** (L294). Text the child has already read becomes very hard to re-read on the second and third reads, which is the core activity.
20. **EVIDENCE: Touch targets are small in several places.**
    - Bottom bar buttons: 0.75rem text, 7px padding (≈30px tall); on phones ≤430px, 0.68rem and 6px padding (≈26px) (L425, L431).
    - Profile edit/delete buttons: 28px (L4288).
    - Voice buttons: 5px×12px padding with 0.82rem text (L2593).
    - Comprehension `.btn.small` is 38px (L74).

    The recommended minimum is 44×44 (Apple) or 48×48 (Material). Primary kid buttons such as the hero, cards and wizard rows are large and fine.

### E. Feedback states
21. **EVIDENCE: Positive feedback is strong** (confetti, mascot, "Great Reading!", 3-read dots). Loading messages rotate every 2s by topic (L6959–6979) and use `role="status"` (L2373).
22. **EVIDENCE: The offline messages contradict each other.** The `offline` event says "📡 No internet — stories still work offline!" (L14758). The Play button offline says "📡 No internet — read along on your own!" (L5507). Both are 3–4 second toasts only. There is no persistent offline indicator, and AI-only features (story generation, dictionary, upload OCR) give no upfront signal.
23. **EVIDENCE: Raw error text reaches children**: `(err.message || 'Unknown error') + ' — Try again…'` (L10059, L12483).
24. **EVIDENCE: Help text loses its formatting.** The Help modal message is built with `\n` line breaks (L15121) and rendered with `textContent` (L5152) into `.app-modal-msg`, which has no `white-space: pre-line` (L235). ASSUMPTION (needs visual check): the help shows as one run-on paragraph.
25. **EVIDENCE: Every modal has a "BACK" button forced on it**, as well as its own buttons (L5172–5179). Confirm dialogs therefore show three choices (Yes / Cancel / BACK).

### F. Visual consistency between the two pages
26. **EVIDENCE: The pages share a brand but not a design.**
    - Shared: fonts (Fredoka/Nunito), orange #FF6B35, ink #2C3E50, bg #FFFBF2.
    - Different: Comprehension uses flat `.btn` with min-height 48, radius 14–18px, small pill chips, 17px base type and a quiet "adult" layout. index.html uses gradient buttons, emoji everywhere, an uppercase "BACK" pill and Bookie.
    - Green differs (#5CD85A vs #2E9E4F) and so does coral (#FF6B6B vs #E5484D).
    - Comprehension has no Bookie, no bedtime mode and no bottom Home/Parent bar.

    It feels like a different product. That suits a parent-led tool, but the move between them is jarring with nothing linking them.

### G. Design-level accessibility

**Contrast**, computed with the WCAG formula:

| Pair (where) | Ratio | Result |
|---|---|---|
| Story text #2C3E50 on white (L291) | 10.98 | AA ✓ |
| Highlighted word #2C3E50 on gold #FFD93D (L293) | 7.97 | AA ✓ |
| **Read word #5CD85A on white (L294)** | **1.84** | **Fail** |
| btn-main white on #FF6B35→#E55D2B (L249) | 2.84–3.54 | Fail / large-only |
| btn-green white on #5CD85A→#27AE60 (L261) | 1.84–2.87 | Fail |
| BACK pill white on #FF9F43 (L273) | 2.04 | Fail |
| Parent btn white on #54A0FF (L439) | 2.68 | Fail |
| Home card "My Words" white on #00CEC9 (L1915) | 1.97 | Fail |
| Home card "Practice Words" white on #FF6B6B | 2.78 | Fail |
| Home card "Practice Reading" white on #9B59B6 | 4.67 | AA ✓ |
| btn-outline #FF6B35 on white (L265) | 2.84 | Fail |
| Stats: stories #F9A825 / words #5CD85A on bg (L1736–1740) | 1.91 / 1.78 | Fail |
| Muted #64748B on bg | 4.61 | AA ✓ |
| Welcome parent note (muted @0.7 opacity, 0.72rem) (L1838) | 2.66 | Fail |
| Hint tip #E55D2B on #FFF3E8 (L387) | 3.24 | large-only |
| Bedtime story #F0EBE0 on #252540 | 12.46 | AA ✓ |
| Comprehension answer green #2E9E4F on white | 3.43 | large-only |
| Comprehension badge #2F7FE0 on #EAF3FF | 3.59 | large-only |

The *reading text* passes. Most *white-on-bright-gradient buttons* fail. Large bold Fredoka text (≥18.66px bold) only needs 3:1, so some pass as large text, but the lighter end of each gradient and the small sub-labels (0.75–0.88rem at 85% white) do not.

**Other design-level patterns:**
- **Motion:** 0 `prefers-reduced-motion` rules in either file. There are 28 `@keyframes` and 37 `infinite` animations: mascot wiggle, hero glow, pulse-glow "Let's Go", rainbow title, floating emoji, and a scale(1.15) word highlight on every word during read-aloud.
- **Focus:** no `:focus-visible` styles anywhere. `outline:none` on the speed slider (L318) and auth inputs (L1212). Clickable `<div>`s with no keyboard role include the avatar picker (L15645+), the My Week card (L1928, `onclick`), and Comprehension reader cards, stop cards and Q&A toggles (`div[data-kid]`, `div[data-toggle]`, L831, L987, L1081).
- **Semantics:** `aria-hidden="true"` wraps the Pause/Stop/Settings buttons (L2583), which hides focusable controls from screen readers. The app modal has no `role="dialog"` (L15247). Duplicate ids exist, for example `btn-inscreen-back-screen-pick` ×5. 1,343 inline `style=""` attributes make theming and a11y fixes expensive.
- **Markup:** `screen-my-readings` (L2067) is not closed before `screen-my-week-child` (L2070) opens. ASSUMPTION: this may nest My Week inside My Readings. Agent 4 should verify the behaviour.

### H. Responsiveness
27. **EVIDENCE: The responsive basics are in place.**
    - Proper viewport meta with no zoom lock (L5).
    - Breakpoints at 380, 430, 480, 768, 1024, 1280 and 1440px.
    - Safe-area insets handled.
    - Single fluid column, with `.app` max-width 90%/85%/1200px.
    - Comprehension has a 720px max column and a 560px breakpoint.
28. **ASSUMPTION (needs devices):**
    - On a Chromebook (1366×768) the nav flips to the top (≥1280px). The bar uses 0.75rem text, so it is a small target for trackpad and touch Chromebooks.
    - In landscape on a phone, header + mascot + stats push the hero below the fold (L855–878 shrinks the mascot only at ≤480px width).
    - Word search cells drop to 28px at ≤380px (L1142).

---

## 3. Risks and severity

| ID | Finding | Who | Sev |
|---|---|---|---|
| A1 | No grade 4–5 anywhere in the main app (pickers, profiles, benchmarks) | Student, parent | **P0** |
| A3 | Comprehension Mode cannot be reached from the app | Parent, teacher | **P0** (the core grade 3–5 feature is invisible) |
| C9 | Edit/delete profile buttons (28px) on the child's "Who's reading" cards, no PIN | Student | **P1** |
| D19 | Read words turn green at 1.84:1, which hurts rereads | Student | **P1** |
| G-contrast | White text on light gradients (1.8–2.9:1) on primary buttons and home cards | Student, low vision | **P1** |
| G-motion | No reduced-motion; constant animations; word scale pulse while reading | Students with attention or vestibular needs | **P1** |
| D16 | No text-size control in the main reader, no font or spacing options | Struggling readers, dyslexia | **P1** |
| B4 | "My Words" means three things; Word Bank naming is inconsistent | Student | **P1** |
| B7 | Two separate profile systems (Firebase vs localStorage) | Parent | **P1** |
| C10 | Child can "Clear All" lists or word bank without the PIN | Student/parent | **P2** |
| C11 | DIBELS/AIMSweb/"your child" text inside the child's result card | Student | **P2** |
| B6 | 5 taps + 2 waits to reach a story; grade asked again every time | Student | **P2** |
| D17 | Story words not keyboard-reachable (Chromebook) | Student | **P2** |
| D18 | Silent 2s tap throttle | Student | **P2** |
| D20 | Bottom bar and voice buttons below 44px | Student | **P2** |
| E22/23 | Contradictory offline toasts; raw error text shown to children | Student | **P2** |
| C14 | "Blaze plan / Anthropic balance" in parent-facing errors | Parent | **P2** |
| B8 | No teacher roster or class view | Teacher | **P2** (product decision) |
| F26 | Two visual languages, no cross-links | All | **P2** |
| C12 | "BUILD JT" visible | All | **P3** |
| E24/25 | Help text likely run-on; extra BACK on every modal | All | **P3** |
| A2 | Younger-child tone (Pre-K first, 50-word stories) | Grade 4–5 student | **P3** (validate with users) |

---

## 4. Evidence index (file:line)

- Grade pickers stop at 3: `index.html:2165-2169, 2233-2237, 2463-2467, 2801-2805, 3366-3370, 15629-15635`; benchmarks `8113-8119`; labels `4287, 7379, 9798, 9864, 11432, 11496, 14227`.
- No Comprehension link: `index.html` (0 matches for "comprehension"); return link `comprehension.html:181`.
- Home: `index.html:1880-1963`; header and chrome `1679-1765`; parent bar `3623-3630`; bar CSS `424-431`.
- BUILD tag: `index.html:1881, 3634`.
- My Words naming: `index.html:1915, 2008, 2021, 2032-2036, 2663, 2673, 2759, 3177`.
- Profile card edit/delete: `index.html:4280-4300`. Clear-all: `2692, 2789, 9767-9790`.
- DIBELS in child result: `index.html:3586-3598, 14234, 14275, 14361`.
- Reader: `index.html:2558-2625`; word CSS `291-294`; word spans `7355-7366`; throttle `7468-7474`; reading mode `828-844, 14818-14833`; phone text shrink `858`.
- Offline and errors: `index.html:5504-5511, 14756-14761, 6985-7007, 10059, 12483`; modal `5147-5182, 235, 15116-15123`.
- A11y patterns: `index.html:318, 1212` (outline none); `2583` (aria-hidden on buttons); `15247` (modal without role); `1928` (div onclick); 0 matches for `prefers-reduced-motion` or `focus-visible` in either file.
- Comprehension: views `comprehension.html:820-1137`; placement `668-806`; jargon error `1068-1076`; Lexile fields `908-933`; reader limit `1362`; buttons `65-75`; story type `104-106`; Bigger text `1007`.

---

## 5. Recommended changes

### 5.1 Design principles
1. **One question per child screen.** Use the profile's grade and level by default. Only ask "how long" and "what topic", and let a single tap skip both ("Surprise me").
2. **Separate the two worlds.** The *Kid Home* has no destructive or adult controls. The *Grown-Ups area* sits behind one clearly labelled, PIN-protected door and holds everything adult-facing, including Comprehension sessions.
3. **One name per object.** Use "My Word Bank" for words saved while reading, "My Lists" for spelling and vocab lists, and "My Stories" for saved readings.
4. **Show progress in child terms.** Use stars, streaks and "faster than last time". Put WPM numbers and DIBELS/Lexile language in the Grown-Ups area.
5. **Accessible by default.** Meet 4.5:1 on text, 44px targets and visible focus, honour reduced motion, and add a reading-comfort panel.

### 5.2 Proposed student-first homepage (text wireframe)

```
┌──────────────────────────────────────────────┐
│ 🦁 Hi, Maya!   ⭐ 12  🔥 4 days     [Aa] [🌙]│  ← avatar = switch reader (no edit/delete here)
│                                              │    [Aa] = Reading Comfort panel
├──────────────────────────────────────────────┤
│  ┌────────────────────────────────────────┐  │
│  │ 📅 TODAY'S PLAN (only if a grown-up     │  │  ← My Week + Assignments merged
│  │    set one)  ▢ Read a story  ▢ Spelling │  │
│  │    ▢ Timed read      [ Start next ▶ ]   │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │        📖  READ A STORY                 │  │  ← HERO; uses profile grade/level
│  │   [🎲 Surprise me]   [Pick a topic ›]   │  │
│  └────────────────────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐          │
│  │ ⏱ Reading    │  │ ✏️ Word       │          │
│  │   Workout    │  │   Practice   │          │
│  │ (time it /   │  │ (spelling,   │          │
│  │  my own book)│  │  vocab, games)│         │
│  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐          │
│  │ 🎒 My Stuff   │  │ 👫 Read with  │          │
│  │ stories, word │  │   a Friend   │          │
│  │ bank, lists   │  │              │          │
│  └──────────────┘  └──────────────┘          │
├──────────────────────────────────────────────┤
│  🏠 Home                    🔒 Grown-Ups      │  ← 48px bar; Play/Pause appear only in reader
└──────────────────────────────────────────────┘

GROWN-UPS AREA (PIN; prompt to set a PIN on first use, no silent 1234)
┌──────────────────────────────────────────────┐
│ Reader: [Maya ▾]   (teacher: [Class ▾] later) │
│ ▸ 📊 Progress      Overview · Readings (WPM, DIBELS zone) · Spelling · Comprehension retell
│ ▸ 🧠 Comprehension Session  (Teach→Listen→Read→Organize→Retell; Placement check)
│ ▸ 📅 Plan the Week  (My Week planner + Assign a passage)
│ ▸ 📤 Add Content    (upload/paste passage, spelling list, vocab list, scan page)
│ ▸ 👨‍👩‍👧 Readers       (add/edit/delete profiles, grade Pre-K…5, Lexile levels: ONE profile)
│ ▸ ⚙️ Settings       (PIN, reading comfort defaults, voice, export/import, reset)
│ ▸ ❓ Help & How it works
│ [ ← Back to kid mode ]
└──────────────────────────────────────────────┘

READING COMFORT PANEL [Aa] (child-adjustable, saved per profile)
 Text size  A  A  A  A   ·  Font: Nunito | Lexend | Atkinson Hyperlegible | OpenDyslexic
 Spacing: Normal | Roomy   ·  Weight: Regular | Bold
 Highlight: Yellow | Blue | Underline only   ·  Read words: keep dark | fade gray (≥4.5:1)
 Line focus: Off | On      ·  Motion: Calm (no wiggle/scale) | Fun
```

**Choices on the kid home:** 1 plan card (conditional) + 1 hero + 4 tiles + Aa + 🌙 + Home + Grown-Ups. That is about 9 tappable items, with no duplicates, no adult controls and a clear first action.

### 5.3 Feature-preservation mapping (every current feature has a home)

| Current feature (location) | New location |
|---|---|
| Read a Story wizard: grade/length/topic, Surprise (L2158–2220) | Hero → grade from profile (changeable in Grown-Ups or via a "harder/easier" chip), length + 19 topics + Surprise kept |
| AI story + offline fallback stories (L6985) | Unchanged (hero) |
| Read-aloud, voice, speed, Play/Pause/Stop (L2579–2608) | Reader toolbar; defaults in Reading Comfort / Settings |
| Karaoke highlight, word tap dictionary (L292, L3636) | Reader (keyboard-reachable buttons; highlight style in Comfort panel) |
| Full Screen reading mode (L14818) | Reader "Focus" button |
| 3-read tracker, Read Again, Save to My Readings (L2628–2664) | Story complete screen (unchanged) |
| Timed reading / WPM, history, benchmark (L3359–3600) | Reading Workout → "Time my reading"; child sees stars and "beat your score"; WPM and DIBELS details in Grown-Ups › Progress |
| My Own Reading upload/scan/paste (L3422–3470) | Reading Workout → "Read my own book" (or Grown-Ups › Add Content for adults) |
| My Readings (L2067) | My Stuff › My Stories |
| Spelling: Dolch/Fry, type/upload, study, practice, quiz, sentences, games (L2712–3175) | Word Practice › Spelling (same sub-flows) |
| Vocabulary: upload/type, study, flashcards, practice, games (L3177–3357) | Word Practice › Vocabulary |
| Word Bank (story + vocab tabs) (L2670) | My Stuff › My Word Bank |
| My Words saved lists (L2032) | My Stuff › My Lists |
| Clear-all lists / word bank (L2692, L2789) | Grown-Ups › Settings (or PIN-confirm) |
| My Assignments (L1921) + My Week child view (L2070–2155) | "Today's Plan" card on Kid Home |
| My Week planner, assign passage (L3824, L14523) | Grown-Ups › Plan the Week |
| Read Together create/join, AI/upload/spelling content (L2282–2552) | "Read with a Friend" tile |
| Profiles: add/edit/delete, avatar, nickname (L15596–15700, L4280) | Pick reader on the chooser (tap only); edit/delete in Grown-Ups › Readers; grades extended to 4 and 5 |
| Parent Dashboard tabs: Overview, Readings, Spelling, Settings (L3683–3990) | Grown-Ups › Progress / Settings |
| PIN, export/import, reset (L3831+) | Grown-Ups › Settings |
| Bedtime mode (L389) | 🌙 on Kid Home |
| Help & Tutorial (L15116) | Grown-Ups › Help; short kid tips stay inline |
| Streak / stories / words stats (L1734) | Kid Home header (accessible colours) |
| Comprehension: readers, placement, skill of week, library/AI, 5-step session, print, retell, progress (comprehension.html) | Grown-Ups › Comprehension Session (same page, linked); readers merged with the main profiles; retell scores shown in Progress |
| Landing page, auth (L15265, L15495) | Unchanged |

### 5.4 Targeted fixes, cheapest first
1. **Add grades 4 and 5 everywhere** (pickers, `<select>`, label maps, `WPM_BENCHMARKS`). The values need Agent 3's pedagogy review. Default the story grade from the profile.
2. **Link to Comprehension** from the Parent Menu (L15233) and the dashboard. Add "← ReadUp" plus a "Grown-Ups" return path on comprehension.html. Use the same word ("Grown-Ups" or "Parent") on both pages.
3. **Remove "BUILD JT" from the UI** (keep it in a console log or data attribute).
4. **Contrast:**
   - Change `.word.done` to a dark color that still passes (for example #1E7A3A, 5.4:1) or keep ink with a subtle underline.
   - Darken button gradients so white text is ≥4.5:1, e.g. orange #C2410C, green #15803D, blue #1D4ED8, teal #0F766E.
   - Use dark text on light tiles.
5. **Add `@media (prefers-reduced-motion: reduce)`** to stop the `infinite` animations and the word scale. Also add a "Calm" toggle, because children rarely set OS preferences.
6. **Add a `:focus-visible` ring** (3px, ≥3:1). Turn word spans, avatar options, kid cards and toggles into `<button>`. Remove `aria-hidden` from L2583. Give the app modal `role="dialog"`, focus trapping and Esc to close.
7. **Raise targets to 44–48px:** bottom bar, voice buttons, profile edit/delete (move these out of the child chooser), Comprehension `.btn.small`.
8. **Reading Comfort panel:** text size steps (keep phone size ≥1.25rem by default), font choice (Atkinson Hyperlegible / Lexend via Google Fonts; OpenDyslexic self-hosted), spacing, regular weight.
9. **Feedback:**
   - Use one offline message and a persistent small "Offline: library stories only" chip.
   - Replace raw `err.message` with a friendly message and log the details.
   - During the dictionary throttle, show "One sec…" instead of doing nothing.
   - Add `white-space: pre-line` to `.app-modal-msg`.
   - Drop the forced BACK when a Cancel button exists.
   - In Comprehension, replace "Blaze plan/Anthropic balance" with "New stories are unavailable right now. Library stories still work."
10. **Rename labels:** My Word Bank / My Lists / My Stories / Reading Workout. Move the DIBELS explainer to Grown-Ups.
11. **Longer term:**
    - Unify profiles (Comprehension readers = Firebase children with Lexile fields), with clear notice of what is stored where (Agent 5).
    - Build a shared design-token stylesheet for both pages.
    - Move the 1,343 inline styles into classes to make the above maintainable (Agent 1).
    - Decide whether a teacher/class mode is in scope. If it is: roster, quick reader switching, class progress table and bulk assign.

---

## 6. Required verification
1. **Moderated usability tests:** at least 5 children per grade (3, 4, 5), including struggling readers and at least one with an IEP or dyslexia. Tasks: start a story; find a saved word; time a reading; get back home. Measure time to first story, errors and mis-taps (especially profile delete), and preference between the current and wireframe homes (paper or Figma prototype).
2. **Parent tests:** 5 or more caregivers, including low-tech-confidence and Spanish-dominant families if they are part of the community. Tasks: add a 4th grader, run a Comprehension session, find progress, set a PIN.
3. **Teacher walkthrough:** 2–3 teachers managing 6+ students, to decide whether class mode is needed.
4. **Device matrix:**
   - School Chromebook (1366×768, touch and trackpad, keyboard-only).
   - iPad 10th gen portrait and landscape.
   - Low-end Android phone (360×640) and iPhone SE.
   - Check the nav flip at 1280px, the hero above the fold, 200% browser zoom, and OS large text.
5. **Assistive tech:** VoiceOver (iPad) and ChromeVox (Chromebook) through the read flow. Check that Play/Pause are announced and words can be reached.
6. **Automated:** axe/Lighthouse on key screens, and contrast re-check after the palette change. Visually confirm the help modal run-on text (E24) and the my-readings/my-week nesting (G).
7. **Reduced motion:** test with OS setting on, and with the "Calm" toggle.

## 7. What must be preserved
- **The warmth and encouragement:** Bookie, confetti, "Great Reading!", 3-read dots, streaks. Children respond to these. Make them calmer (opt-in motion), not gone.
- **The reading engine:** read-aloud with word highlighting, tap-for-definition with syllables and sentences, speed and voice control, Full Screen mode, the repeated-reading model (3 reads).
- **Offline/AI-failure fallback stories.** Never show the child a dead end when the AI is down.
- **All practice modes:** timed WPM, own-book upload/scan, Dolch/Fry spelling, vocab study/flashcards/quiz, sentence writing, word search/scramble, Read Together, My Week plans, assignments, bedtime mode.
- **Comprehension Mode in full:** placement check, 108-story library plus AI, six text structures, Teach→Listen→Read→Organize→Retell, print pack, retell rubric and progress. Its calm, parent-oriented layout suits its audience; it only needs to be linked and visually tied in.
- **Culturally affirming content:** diverse avatars and the Black History topic.
- **The large primary buttons and the sensible viewport/safe-area handling.**
