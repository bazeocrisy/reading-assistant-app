# ReadUp Audit — Agent 3: Reading Instruction Specialist

Repo: `ReadUp-audit` @ `eec9e78` (read-only clone). Scope: educational content, instructional design, placement, levels, construct mapping.
Method: I read `comprehension.html` (core logic L185–1460), the relevant parts of `index.html`, `functions/index.js`, `fry.json`/`dolch.json` metadata, and all of `library.json` using Node analysis scripts (counts, word/sentence statistics, an exact copy of the app's own `textStats()` level estimator, signal-word presence, text overlap between placement and library). I fact-checked 22 texts in full.
Labels: **EVIDENCE** = I verified it in code or data. **ASSUMPTION** = my inference or professional judgment, not verified.

---

## 1. Current implementation

### 1.1 Content inventory (EVIDENCE: library.json)
| Item | Count |
|---|---|
| Instructional stories (`sessions`) | **108**, all with 9 fields (id, structure, level, genre, topic, title, paragraphs, stops, questions); no empty fields, duplicate ids or out-of-range stops |
| Placement passages (`placement`) | **24** (3 per level at 200–900), each with exactly 5 typed questions: literal, literal, vocab, inference, structure |
| Per structure | story 18, sequence 18, cause 18, problem 18, compare 18, description 18 |
| Per nominal level | 300, 400, 500, 600, 700, 800: 18 each (3 per structure per level) |
| Genre | 54 fiction / 54 nonfiction. **Fiction:** story, sequence, problem. **Nonfiction:** cause, compare, description |
| Story length | 230–300 words, 5–6 paragraphs; each has 3 "stop & ask" items with `lookFor` answers and 3 after-reading Q&A |
| Placement length | 137–170 words, 3 paragraphs |
| Duplicate title | "The Cardboard Rocket" (`sequence-600-c`, `problem-400-c`) |

The six structures (EVIDENCE: `comprehension.html` L250–305) are Story Elements, Sequence, Cause & Effect, Problem & Solution, Compare & Contrast and Description. Each one has a definition, a "big question", signal words, a fixed think-aloud script, an AI prompt description and an organizer template.

### 1.2 Session flow (EVIDENCE)
The flow is Teach → Listen → Read → Organize → Retell (L810, L946–1056).
- **Teach:** the definition, signal words and big question, then the parent reads a fixed think-aloud script (L955–971).
- **Listen:** the parent reads a story aloud at the child's *listening level*, pausing at the stop & ask cards. The cards say "Don't give the answer away — ask 'What makes you think that?'" (L981–988).
- **Read:** the child reads the practice story aloud **3 times**. The parent helps after a 3-second pause. Two children can partner-read by paragraph. An optional timer records WPM (L1000–1015, L1084–1100).
- **Organize:** the organizer is filled in about the **read-aloud** story (L1027).
- **Retell:** an unprompted retell scored with a 4-item checkbox rubric: Main idea, Key details in order, The "why", Used structure words (L314–319, L1035–1053).
- **Progress:** "Retell scores are the main measure. Aim for steady 3s and 4s, then raise the reading level" (L1122). Level changes are manual: "raise it 25–50L when retells are consistently 3–4 out of 4" (L937).
- **Structure choice:** a six-week rotation, one structure per week, which the parent can override (L249, L347–351).

### 1.3 Story selection (EVIDENCE: L233–243, L1166–1199)
- The library comes first; AI generation is an optional alternative or fallback.
- `pickFromPool` filters by structure and keeps stories whose **app-estimated** level is within ±100 of the target. It prefers stories the child hasn't seen and picks at random from the 3 closest.
- The read level is the minimum `practice` level of the selected children; the listen level is the minimum `listen` level.
- AI stories are regenerated once if the estimate is more than 120 away from the target (L449–471).

### 1.4 Level estimate (EVIDENCE: L356–379)
- `level = round((120 + 140 × FleschKincaidGrade)/10)×10`, clamped to 100–1100, with heuristic syllable counting.
- The code comment says: "Lexile is proprietary… mapped to an approximate Lexile scale… spot-check at lexile.com."
- `library.json` itself says "Levels are estimates."

### 1.5 Placement (EVIDENCE: L473–658)
- **Format:** an informal-reading-inventory style check. The child reads a passage aloud while the parent times it and taps "missed word". The parent then asks 5 questions with the passage hidden.
- **Pass rule:** **≥4/5 passes** the level (L514).
- **Adaptive steps:** the start is the child's current level rounded to the nearest 100 (200–900). Each pass moves up 100 and each fail moves down 100. The check stops once a pass and a higher fail bracket the level, or after **4 passages** (L536–549).
- **Result:** `practice = min(passed target, passage estimate + 50)`, plus 50 if the child got 3/5 on the next level up (L556–560).
- **Optional listening check:** one passage read aloud by the parent. Listen level = practice + 200 / 150 / 100 for ≥4 / 3 / ≤2 correct (L580–586). If the check is skipped, it is practice + 200.
- **"What's holding them back":** if accuracy is below 93% on harder text, the app reports that word reading is part of the limit; otherwise it reports "Comprehension is the limit, not word reading" (L589–592).
- **Per-question-type bars:** shown with a red bar below 60% (L786–792).

### 1.6 Main app (`index.html`) reading features (EVIDENCE)
- Grade pickers offer **Pre-K to 3rd grade only** (e.g., L2165–2169, L15631–15635).
- **Timed reading (WPM):**
  - `WPM_BENCHMARKS` covers prek–3 only (L8113–8119).
  - The score counts total words reached in 60 s, not words correct. The app says so in a disclaimer (L3594–3595).
  - Results are labeled "DIBELS Goal" (L14234, L14275, L14361), "DIBELS-aligned benchmarks" (L15298) and "You're above grade level" (L8842), with a "Beat My Score!" button.
- **Sight words:** Fry (400 words, K–3) and Dolch (220 words, pre-primer–3rd) are used in spelling, quiz and word-game screens (L9630ff). `fry.json` meta says "The 1000 most common words" but contains 400.
- **Vocabulary:** flashcards from user-supplied lists, with AI-generated definitions "for a [grade] child" (`functions/index.js` L265–300).
- **Other:** TTS read-aloud with highlighting and partner "Together" rooms. "Lexile" appears **0 times** in `index.html`.

---

## 2. Confirmed findings

### Strengths (EVIDENCE)
1. **The design follows the right research areas.** Explicit text-structure instruction, think-aloud modeling, signal words, graphic organizers, retelling, repeated oral reading with a pause-then-help routine, and a separate listening level are all recognized, research-supported practices. They draw on text-structure research (Meyer's structure strategy and later work), the Hebert et al. (2016) meta-analysis showing text-structure instruction improves expository comprehension, and repeated guided oral reading (National Reading Panel, 2000). This shows alignment with that research, **not** evidence that ReadUp's version works.
2. **Gradual release is roughly present:**
   - I do: the Teach think-aloud.
   - We do: Listen with stop & ask.
   - You do with support: Read three times with help.
   - Organize and retell follow.
3. **It separates listening from reading level, in line with the Simple View of Reading** (Gough & Tunmer, 1986). The placement's accuracy-based "word reading vs comprehension" split also follows that logic (L589–592). This is uncommon in consumer apps and worth keeping.
4. **Stop & ask items are structure-focused** and come with parent-facing `lookFor` answers. This helps parents who aren't trained teachers.
5. **Informational texts were highly accurate in my spot-check.** I found no serious errors in 22 texts: moon phases, seasons (it correctly corrects the "closer to the sun" misconception), ocean salinity, coral bleaching, astronaut physiology, Hawaii hotspot, Grand Canyon, ISS, Saturn, Jupiter/Saturn, T. rex, Triceratops, Stegosaurus, Perseverance/Ingenuity, alligators/crocodiles, owls/hawks, frogs/toads, honeybees, basketball, ice, leaves, hurricanes/tornadoes.
6. **The library is balanced:** an even 3 × 6 × 6 grid, 50/50 fiction/nonfiction, and diverse character names (e.g., Kofi, Priya, Mateo, Amara, Imani, Malik, Hana, Omar, Rosa, Kai).
7. **The placement intro gives a good disclaimer:** "This is an at-home estimate, not an official Lexile score" (L690). The 93% accuracy threshold falls within conventional IRI instructional ranges (ASSUMPTION about convention; varies by source).

### Problems (detail in §3–4)
- "Level-checked" is circular.
- Several UI labels use Lexile wording.
- Placement decisions rest on very few items.
- Placement passages overlap with instructional content.
- Problem/solution and sequence appear only as fiction.
- The library has no content above an estimated ~870 for grade 4–5 listening.
- The fluency feature has DIBELS-labeled, speed-only benchmarks and stops at grade 3.
- Vocabulary and knowledge-building are missing from Comprehension Mode.

---

## 3. Risks and severity

| ID | Sev | Finding | Type |
|---|---|---|---|
| R1 | **P0** | **"Lexile" wording risk.** Several labels present the app's own FK-derived numbers as Lexile measures, or invite comparing them with school Lexile measures: "Reads alone (Lexile)" (L917), "School Lexile score" (L930) feeding the same field, "about 200L higher" (L933), "Start at their school Lexile and raise it 25–50L" (L937), and "≈ NNNL" badges throughout (L703, L754, L779–780, L794, L1061). LEXILE® is a MetaMetrics trademark, and the "L" suffix is its notation. The disclaimer at L690 is good but appears only in placement. The scales are also different: a school Lexile is a *reader* measure, and the app's numbers are uncalibrated *text* estimates. Matching one to the other directly has no validated basis. Needs legal/brand review; I am not drawing legal conclusions. | EVIDENCE (wording); ASSUMPTION (legal significance) |
| R2 | **P0** | **Fluency feature claims DIBELS alignment that the method doesn't support.** It labels ranges "DIBELS Goal" and "DIBELS-aligned" (index.html L14234, L14275, L14361, L15298). But it measures total words (not WCPM) on AI-generated, non-standardized passages. It reports "above grade level" (L8842) and has no grade 4–5 norms (L8113–8119). DIBELS is a University of Oregon mark, and its goals are seasonal cut scores on standardized probes. The ranges' source is not cited. **ASSUMPTION:** the upper bounds (111/142/162) look similar to Hasbrouck & Tindal (2017) spring 90th-percentile WCPM values; I could not verify the lower bounds. Parents may misread the results as a screening outcome. | EVIDENCE + ASSUMPTION |
| R3 | **P1** | **Placement decisions rest on too few items.** Each level is decided by 5 dichotomous, parent-scored items, and a single item flips pass/fail. Illustration (my binomial calculation, assuming independent items): a child with a true 70% item-success rate passes a level only ~53% of the time; at 80%, ~74%; at 60%, ~34%. With ≤4 passages, genre picked at random (the library pick ignores the `fiction` flag, L602–606), and passage estimates varying ±80 around nominal, the outcome can easily move ±100 on retest. The per-type profile (L786–792) rests on 2–4 items per type, sometimes just 1, yet shows percentage bars with red flags below 60%. The "Comprehension is the limit, not word reading" verdict (L592) comes from parent-tallied misses and ignores reading **rate**, so a child who reads accurately but slowly is told word reading isn't a factor. | EVIDENCE (rules); ASSUMPTION (independence model) |
| R4 | **P1** | **Placement passages overlap with instructional content.** Retests "every 6–8 weeks" (L876) reuse topics and facts the child may have just studied: four identical titles (`place-300-b`/`description-300-a` "Busy Honeybees"; `place-300-c`/`description-300-c` "Our Moon"; `place-600-b`/`description-400-a` "The Amazing Octopus"; `place-900-b`/`description-600-b` "Cities Under the Sea"), plus close topic matches (`place-500-b`~`description-400-b` volcanoes, `place-500-c`~`description-500-c` firefighters, `place-200-c`~`sequence-300-c` Biscuit's bath, `place-400-c`~`story-400-c` drum, `place-300-a`~`story-400-a` goalkeeper, `place-700-b`~`description-500-a` dinosaurs). Shared items such as "one queen" and "nectar" can be answered from prior knowledge, which may inflate retest scores and the progress signal. | EVIDENCE (overlap); ASSUMPTION (effect size unknown) |
| R5 | **P1** | **"Level-checked" is circular, and the levels are unvalidated.** All 132 texts fall within ±80 of the app's own formula (mean absolute difference 38). So "checked for level" (L201, L898) means checked against the same FK-linear mapping, not an external measure. The FK→"L" mapping (120 + 140×FK) isn't published by any source I know of. FK is also unstable on 140–300-word passages and with heuristic syllable counts. My independent FK estimates rise steadily with level (300 → FK ≈ 1.2; 800 → FK ≈ 5.0). That is internally consistent, but it only measures sentence length and syllables, not vocabulary rarity, cohesion, background-knowledge demand or structure complexity. | EVIDENCE |
| R6 | **P1** | **Coverage gap at the upper levels (grades 4–5 and listening).** Library estimates top out at **870**. For a practice level of 800, the listening target is 1000 and **0** library stories per structure are within ±100; at 700 → 900, only 1–3 are. `pickFromPool` then falls back silently to the closest (easier) story, shown with a "warn" badge. Placement tops out at 900. Every AI prompt says "for 3rd grade students" (L395), and the main app stops at 3rd grade. This doesn't match a grades 3–5 audience: for reference, the CCSS-published Lexile stretch band for grades 4–5 is 740–1010L. Under-challenge is most likely for on-level and advanced 4th–5th graders, especially on the listening level, which is meant to be *above* their reading level. | EVIDENCE (counts); ASSUMPTION (audience) |
| R7 | **P1** | **Structure/genre pairing limits transfer to informational text.** Meyer's top-level expository structures are description, sequence, causation, problem/solution and comparison. The text-structure evidence is strongest for **expository** text (Hebert et al., 2016). In ReadUp, sequence and problem/solution are **fiction only**, and "Story Elements" and "Problem & Solution" overlap almost completely: both use the same problem → tries → solution arc and similar organizers (L258 vs L285). As a result, children never practice informational problem/solution (e.g., how a town reduced flooding) or procedural/chronological informational sequence. Most informational topics are also science; there is little history, biography, civics or geography. | EVIDENCE (mapping); ASSUMPTION (instructional impact) |
| R8 | **P2** | **Think-aloud scripts don't match the day's text.** Each fixed script refers to content that isn't in the selected story: "bigger net", "ice melts because the sun warms it" and "all about owls" appear in no library story, and "unlike frogs" appears nowhere verbatim. Only the Story Elements script (Maya's kite) matches one story (`story-300-a`). Modeling on an example the child hasn't heard is weaker than modeling on the shared text. | EVIDENCE |
| R9 | **P2** | **Signal words are taught as if each belongs to one structure.** "so", "but", "then" and "finally" are listed for 2–3 structures each (L254–301). Description signals ("has", "looks like") are weak: description texts contain only 1–3 of 6 listed signals (all 18 description stories; also `cause-400-c`). Children may learn "spot the word" instead of reasoning about the gist and how the text is organized. No activity asks the child to tell structures apart ("Which structure is this, and how do you know?"). | EVIDENCE + ASSUMPTION |
| R10 | **P2** | **The retell rubric doesn't fit every structure and isn't anchored.** "Key details in order" doesn't apply to compare/contrast or description. "Main idea" for narrative isn't the usual story-grammar retell. The four binary checks have no anchor examples. The rubric is still called "the main measure" (L1122) and drives level changes. The steps also leave it unclear which story is retold: Organize uses the read-aloud story (L1027), but Retell says "the story you read" (L1039). If it's the listen story, the organizer has already scaffolded the retell. Organizer content isn't saved in the session record (L1243–1248). | EVIDENCE |
| R11 | **P2** | **Comprehension Mode has no vocabulary or knowledge-building strand.** There is no pre-teaching of Tier 2/topic words, no word-meaning discussion, and no morphology. Topics are scattered (about 100 distinct topics across 108 stories) rather than organized into knowledge-building sets. Both vocabulary and background knowledge are language-comprehension strands in Scarborough's Reading Rope. | EVIDENCE + framework |
| R12 | **P2** | **The fluency design rewards speed only, and WPM measures are mixed.** "Beat My Score!", confetti tiers and "Superstar Reader" are based on speed, with no accuracy or expression measure. In Comprehension Mode the parent can time any of the three repeated reads (a warm read gives a higher WPM), and Progress then shows "last timed read". The placement WPM is a cold read. The two numbers aren't comparable. | EVIDENCE |
| R13 | **P2** | **The listening check has a floor and an unexplained offset.** Even 0/5 sets listening = practice + 100 (L584). Skipping sets +200. A single passage determines the result. | EVIDENCE |
| R14 | **P2** | **Minor factual and wording issues:** <br>• `compare-500-c` says sharks and dolphins "both have smooth gray bodies" (shark skin is rough, covered in denticles). <br>• `compare-700-a` says hurricanes begin "near the equator" (they form in the tropics, but generally not within ~5° of the equator). <br>• `cause-800-c` says bodies "usually recover in a few weeks or months" (bone loss can take much longer to recover). <br>• `compare-800-c` gives moon counts ("close to a hundred", "more than two hundred"), which are correct now but date-sensitive. <br>• `cause-800-b` P5 "They are far too slow…" has an unclear pronoun. <br>• `cause-600-a` repeats "But the hot spot stays put" in P3 and P4. <br>• `compare-300-a` presents frogs vs toads without noting that toads are a kind of frog. | EVIDENCE (text); ASSUMPTION (science judgments; expert check advised) |
| R15 | **P2** | **Landing-page claims overreach.** "A brand new story at your child's exact grade level" (index.html L15397) can't be verified for AI text. "25M children in the U.S. can't read at grade level", attributed to NAEP (near L15346): NAEP Proficient is not the same as "grade level" (NCES itself cautions against this reading). The "69% of 4th graders below proficiency (NAEP 2024)" figure matches 31% at/above Proficient, but the "can't read" framing goes further than the data. | EVIDENCE (text); ASSUMPTION (NAEP interpretation) |
| R16 | **P3** | Smaller issues: <br>• The placement "Back" button shows the text again after the questions appear, so the child can look back (L1330). <br>• Duplicate title "The Cardboard Rocket". <br>• The `fry.json` description says 1000 words, but the file has 400. <br>• Some syllabifications are questionable (e.g., "meas·ure"). <br>• Each structure gets one week per six-week cycle and there's no mixed-structure review. Session frequency per week isn't specified (ASSUMPTION: at 2–3 sessions per week, the ±100 pools of about 9–13 fresh stories per structure run out after about 2–3 rotations, and the app then silently repeats stories). | EVIDENCE |

---

## 4. Evidence (key citations)

### Lexile and level wording
- `comprehension.html` L356–360: the comment admits Lexile is proprietary and that this is an approximation.
- L377–378: the FK formula and mapping.
- L395, L494: AI prompts say "on the Lexile scale" (internal to the prompt, not shown to users).
- L690: good disclaimer.
- L703, L754, L779–780, L794, L1061: "≈ NNNL" badges.
- L917: "Reads alone (Lexile)".
- L930–937: "School Lexile score", "about 200L higher", "Start at their school Lexile…".
- L201, L898: "level-checked" / "checked for level".

### Placement rules
- L514: pass at ≥4.
- L536–549: adaptive steps and stop rules.
- L556–565: practice-level formula.
- L580–586: listening offset.
- L589–592: limit diagnosis.
- L597–619: library pick ignores genre.
- L876: retest interval.

### Readability analysis (my scripts, using the app's exact `textStats`)
| Nominal level | 300 | 400 | 500 | 600 | 700 | 800 |
|---|---|---|---|---|---|---|
| Mean words | 260 | 265 | 277 | 289 | 292 | 294 |
| Mean words/sentence | 8.4 | 8.8 | 9.7 | 10.9 | 12.4 | 13.3 |
| Mean FK grade | 1.2 | 2.1 | 2.9 | 3.6 | 4.4 | 5.0 |

- **Largest deviations from nominal:** `description-300-a` est 220 (nominal 300); `problem-300-b` 230; `cause-300-b` 240; `problem-300-c` 240; `sequence-500-c`, `problem-500-a`, `compare-400-c`, `compare-500-a/b` +80; `place-200-c` 140 (nominal 200); `place-900-c` 840 (nominal 900).
- **Interpretation:** these are mismatches *against the app's own estimator*. They don't show the true difficulty, which no estimator here measures.
- **Pool sizes** (structure stories within ±100, read/listen targets):
  - Practice 600 / listen 800: 4–8 / 4–6.
  - Practice 700 / listen 900: 4–8 / **1–3**.
  - Practice 800 / listen 1000: 4–6 / **0**.

### Structure and genre
`library.json` struct×genre: story/sequence/problem = fiction; cause/compare/description = nonfiction (18 each).

### Signal-word presence
- Problem: 6/6 in all 18.
- Story: 5–6/6.
- Sequence: 5–6/6.
- Compare: 3–7/7.
- Cause: 2–5/6.
- Description: **1–3/6** in all 18.

### Fluency (index.html)
- L8113–8119: benchmarks prek–3 only.
- L3594–3595: the DIBELS/AIMSweb comparison and its disclaimer.
- L8838–8860: speed-based praise tiers.
- L14234/14275/14361: "DIBELS Goal".
- L15298: "DIBELS-aligned benchmarks".

### Construct mapping (Simple View of Reading / Scarborough's Rope)
| Construct | Features that target it | Gaps |
|---|---|---|
| **Decoding / word recognition** (phonological awareness, decoding, sight recognition) | Fry/Dolch spelling, quizzes and games (sight-word and orthographic practice); the placement "missed word" accuracy (measurement only) | No phonics or multisyllabic decoding instruction, no morphology. Fry/Dolch K–3 lists are mostly below grade 3–5 level (useful only for struggling readers) |
| **Oral reading fluency** (accuracy, rate, prosody) | Repeated reading ×3 with a pause-then-help routine (instruction); placement WPM and accuracy; main-app 60-s WPM (rate only, total words) | No prosody measure, no WCPM, no standardized passages |
| **Language comprehension** (vocabulary, background knowledge, syntax, verbal reasoning, literacy knowledge) | Listen step and listening level (listening comprehension); stop & ask (reasoning); text structure (literacy knowledge); vocabulary flashcards from user lists in the main app | No vocabulary work inside Comprehension Mode; no knowledge-building text sets; no syntax work |
| **Reading comprehension** (the outcome) | Placement questions; after-reading Q&A (not scored); retell rubric (scored, the "main measure") | All informal; none validated |

---

## 5. Recommended changes (prioritized; grounded in research and phrased conservatively)

### P0
1. **De-Lexile the UI.**
   - Rename the app's numbers to something like "ReadUp level (est.)" and drop the "L" suffix, or use a neutral unit.
   - Show a short persistent disclaimer wherever levels appear: "Estimated from sentence and word length; not a Lexile® measure."
   - Keep the school-score input, but label it nominatively ("Lexile® measure from school, if you have one") and explain that the app converts it only approximately.
   - Rewrite L937 so it doesn't tell parents to adjust a school Lexile.
   - Get trademark guidance from counsel.
2. **Correct the fluency claims.**
   - Remove "DIBELS Goal" and "DIBELS-aligned". If the norms are kept, cite them exactly (e.g., Hasbrouck & Tindal, 2017, WCPM percentiles by season) and present them as reference ranges, not goals.
   - Either count errors to produce WCPM or label the score "words reached per minute (practice)".
   - Replace "above grade level" with neutral wording.
   - Add grades 4–5 if the audience is 3–5.

### P1
3. **Make placement results more reliable and present them more carefully.**
   - Show results as a range (e.g., "about 500–600").
   - Require two passages at the decision level, or use more items per passage (8–10).
   - Control genre (one fiction and one informational passage per level).
   - Hide the per-type percentage bars until at least 6 items per type, or show plain counts with a "too few items to judge" note.
   - Add a rate check (e.g., markedly slow WPM) to the decoding/fluency verdict, and soften "Comprehension is the limit" to "may be."
4. **Separate placement content from instructional content.** Give placement passages topics that never appear in the library, and rewrite the four duplicated titles and the close topic matches.
5. **Extend the library upward** to roughly 1000+ estimated, at least for read-aloud (listening) texts. Show parents a warning when no level-appropriate story exists instead of silently giving an easier one. Make the grade wording in AI prompts follow the child's grade.
6. **Rebalance structures toward expository text.** Add informational sequence (life cycles, how-to, history timelines) and informational problem/solution. Merge or clearly distinguish "Story Elements" and "Problem & Solution". Add social studies, history and biography topics.
7. **Validate the levels externally:** score a sample with an independent text-analysis tool or have expert raters level it, and replace "level-checked" with "estimated level".

### P2
8. **Make the think-alouds text-specific.** Generate the Teach model from the day's listen story (e.g., using its first stop), or store a model for each story.
9. **Strengthen structure instruction** as in structure-strategy approaches:
   - Main-idea sentence frames for each structure (e.g., "___ and ___ are alike because ___, but different because ___").
   - Structure-discrimination tasks.
   - Cumulative mixed-structure review after each rotation.
   - Teach signal words as hints, not proof.
   - Better description cues ("one kind", "another feature", "for example").
   - A chain organizer for cause/effect and a by-attribute matrix for compare/contrast.
10. **Make the retell rubric fit each structure:** story grammar for narrative, steps for sequence, chains for cause, similarities and differences for compare, topic and detail groups for description. Add anchor examples, state which story is retold, and save the organizer content.
11. **Add vocabulary and knowledge-building:**
    - 3–5 Tier 2 or topic words per story with kid-friendly definitions and a discussion prompt.
    - Morphology notes at levels 600 and up.
    - Topic text sets (2–4 linked texts) so children build knowledge.
12. **Rework fluency practice:** time the cold read and the final read separately and label them, log accuracy, add a simple expression/prosody checklist, and put less weight on speed-only rewards.
13. **Fix the R14 content items and the R15 marketing statistics.**

### P3
14. **Clean up the small issues:**
    - Lock the text after questions are shown.
    - Remove the duplicate title.
    - Fix the `fry.json` description.
    - Review syllabification.
    - Track pool exhaustion.
    - Give the parent guidance for "what to do if the child is stuck", such as a prompt ladder (reread, point to the clue word, offer a choice).

---

## 6. Required verification (no outcomes claimed)
- **Reading-specialist content review** of all 132 texts for structure fidelity, age and cultural fit, and science/social-studies accuracy, plus a dated review cycle for time-sensitive facts.
- **External readability check** on a sample (independent tool and/or expert leveling) to calibrate or replace the FK-linear mapping.
- **Placement reliability study:** small test-retest and parallel-form agreement, and agreement with a school-administered measure. Report classification consistency before using the results to set levels.
- **Retell rubric:** inter-rater agreement between parent and trained rater on recorded retells.
- **Family pilot:** whether parents can run Teach and Listen as designed (fidelity), session frequency, and pool exhaustion. Report descriptively; don't claim learning gains without a properly designed evaluation.
- **Legal/brand review** of Lexile®, DIBELS® and NAEP wording.

## 7. What must be preserved
- The Teach → Listen → Read → Organize → Retell structure, explicit modeling, and stop & ask questions with `lookFor` answers for parents.
- **Separate listening and reading levels** and the accuracy-based decoding vs comprehension distinction (refine it, don't remove it).
- Repeated reading with a pause-then-help routine, and partner reading.
- A library-first approach with optional AI. The library is free, consistent, and works offline from the AI service.
- The balanced 6 × 6 × 3 grid, high factual quality, diverse names, and on-device, first-name-only storage.
- The honest disclaimers that already exist ("Levels are estimates", L690 "not an official Lexile score", the WPM total-words note). Make them more visible.
