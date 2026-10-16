# Free-first addendum: guest experience, read-aloud cost inputs, acceptance tests and rollback

*Planning agent addendum, 2026-10-16. Read-only: no edits, no network or paid calls. Extends `plan-free-first.md`.*

## 1. Using ReadUp without an account

**What blocks guests today is the sign-in router, not the free features.** When nobody is signed in, the app clears the current user and child and shows the landing page (`index.html:4596-4603`).

**None of the free-first paths read `currentUser`:**

| Path | Code |
|---|---|
| `fetchTTSAudio` | `5473-5497`, an unauthenticated `fetch(CF_TTS)` |
| `getWordDefinition` | `7417-7459`, a device-wide cache (`readup_dict_cache`, `7402`) and then `CF_STORY` |
| `generateAIStory` | `4965-4978` |
| `sayDictEntry`, `sayWordOnly`, `sayWordForPractice` | `7788`, `7817`, `10624` |
| `saveData` | `9035`, saves locally under `readup_data_{currentChildId}`, or `readup_data` when no child is set (`9025-9027`). Cloud sync runs only when `currentUser && currentChildId` (`9075`). |

**Hidden coupling to watch:**
- Guests can use these calls today only because the functions are open. **Once the server lockdown lands, every one of them fails for guests**, after a long wait and then an error. So for guests, the FREE-9 flags must **skip these calls before any `fetch` is made**, not rely on catching the failure.
- Guests need a local `currentChildId`. Otherwise every guest on a device shares `readup_data`.

**Guests can't have these:**
- **Read Together.** It uses the RTDB `rooms/` node (`7106`). Its countdown also preloads `CF_TTS` (`7129`, `7134`). Whether the database rules allow guests is UNVERIFIED, so keep it **account-only**. FREE-4 removes the preload when cloud audio isn't the engine.
- **AI import** (`CF_OCR`, `CF_DOC`). It stays for adults only. Guests still get paste, `.txt` files (read on the device) and FREE-11b.

**The minimum set for a good guest experience.** Each item works with no one signed in and makes **zero Cloud Function calls**:

| Item | Guest behavior |
|---|---|
| FREE-3 + FREE-4 | Read-aloud uses the browser voice by default. The cloud voice is offered only to signed-in adults. |
| FREE-5 | Word audio uses a static clip, then the browser voice, and never calls a Cloud Function for guests. |
| FREE-6a–d | Built-in stories rotate and include `library.json` stories. There is no 15-second wait when AI is off. |
| FREE-7a | The Fry/Dolch offline dictionary. The AI step is skipped for guests. |
| FREE-9 | For guests, `ai.*` and `tts.cloud` are **forced off**, whatever `config.json` says. |
| FREE-1, FREE-2 | Prerequisites for the items above. |

**Comprehension Mode already works without an account.** It has no auth code and loads `library.json` first (`comprehension.html:207`). Its only Cloud Function call is the optional AI story (`430`, `989`). FREE-10 adds only on-device speech. FREE-9 hides the AI button for guests.

## 2. Read-aloud cost inputs (all prices UNVERIFIED)

**Usage assumed for each active child per month:**
- 12 story plays (3 a week) at about 1,200 characters each. Measured averages are about 1,460 characters for library stories and 570 for built-in stories.
- About 30 word or definition utterances at about 60 characters each.
- That totals **about 16K characters a month**.

**Why the real total could be higher:**
- The client cache lives in memory only (10 entries, `5311`, `5495`), so replaying a story in a later session is billed again.
- On the Google path, the server adds an SSML `<mark>` for every word (about 17 characters each, `tts.js:266`). If those marks are billed (UNVERIFIED), the total is **about 61K characters per child a month**.

**Prices assumed:**
- ElevenLabs Flash: about $0.05 per 1K characters.
- Google WaveNet: about $4 per 1M characters after roughly 1M free each month. Some sources say $16 per 1M; in that case, multiply line (b) by 4.

| Scenario | 100 children | 1,000 children |
|---|---|---|
| (a) ElevenLabs as the default (today) | 1.6M characters ≈ **$80/mo** | 16M ≈ **$810/mo** |
| (b) Google WaveNet | 1.6–6.1M ≈ **$2–20/mo** | 16–61M ≈ **$61–240/mo** |
| (c) Browser voice by default, with **10% of children** opting in to Google | ≈ **$0** (within the free tier) | ≈ **$2–20/mo** |
| (c′) Same, but the opt-in uses ElevenLabs | ≈ $8/mo | ≈ $81/mo |
| (d) Pre-generated static audio | **$0 recurring** | **$0 recurring** |

**Static audio (d) in detail:**
- **One-time generation:** two voices of all fixed content, about 265K characters per voice. Google costs about $0–9, ElevenLabs about $26, and Piper run locally costs $0.
- **Bandwidth:** about 9 MB per child per month (a library story at 48 kbps is about 0.7 MB, plus word clips). That is about 0.9 GB a month for 100 children and 9 GB for 1,000. **GitHub Pages' 100 GB soft limit would be reached at about 11,000 children**, assuming no browser-cache reuse.
- **Coverage:** fixed content only. Pasted or AI-written text falls back to the browser voice, which is free.

## 3. Acceptance tests and rollback

**Rollback times (ASSUMPTION; based on the PR-approval rule):**

| Method | Effect | Time |
|---|---|---|
| Device flag (localStorage, or `?tts=` in the URL) | Immediate, but affects that one device only | Instant |
| Fleet flag (`config.json` or a default constant) | One-line PR, then the GitHub Pages rebuild | About 15–45 min, depending on how fast approval comes |
| Revert | Revert PR, then the GitHub Pages rebuild | About 30–60 min |

| Item | Acceptance tests | Rollback |
|---|---|---|
| FREE-1 | Golden index sequences are identical before and after the change. Within ±1 word at 0.75×, 1.0× and 1.25× speed on 3 fixtures. Manual check on an iPad with a 300-word story. | revert |
| FREE-2 | Player states go idle → loading → playing → paused → playing → idle. Stopping while loading cancels. `recordReadComplete` fires exactly once. Tapping a word pauses playback and closing the popup resumes it. | revert |
| FREE-3 | With `CF_TTS` blocked or offline, Play starts the browser voice within 1 s. Highlighting only moves forward across chunks. Every chunk is ≤220 characters. Pause and resume continue from the same word. Word lookups pause and resume correctly. An 800-word story finishes on every device in the matrix. | device flag `readup_tts_engine=cloud`, otherwise revert |
| FREE-4 | On the default path, **0 requests to `synthesizeSpeech`** across story, dictionary, spelling and race countdown. The cloud voice can only be reached through the adult toggle while signed in. | flip the default (15–45 min) |
| FREE-5 | On iPhone and iPad, the first tap on a word plays audio. WAV plays as `audio/wav`. No hard-coded `data:audio/mp3` remains. Guests get a static clip, then the browser voice, and never call a Cloud Function. | revert (wrappers keep the call sites unchanged) |
| FREE-6 | With AI off, a story appears within 1 s. 10 loads give at least 8 different stories. The WPM screen never shows "could not be generated". Library stories keep their paragraph breaks. | 6c by flag; the rest by revert |
| FREE-7a | All 441 sight words and their simple forms show a definition with 0 network calls. With AI off, an unknown word shows "Tap 🔊 to hear the word" within 300 ms. | revert (cache untouched) |
| FREE-7b | Every library lemma has a reviewed entry. The lint flags missing vocabulary. | remove `dictionary.json` (lookup falls through) |
| FREE-8 | The validator passes. A static story plays with 0 `CF_TTS` calls. | delete the manifest entry or bump the version (falls back to the browser voice) |
| FREE-9 | With every Cloud Function URL blocked and no account, each child screen is usable with 0 calls to `cloudfunctions.net`. | change `config.json` (15–45 min) |
| FREE-10 | Pauses after each stop paragraph. Library stories still load when signed out. Leaving the step stops speech. | revert, or hide the button |
| FREE-11b | The PDF and DOCX fixtures produce the expected text with 0 network calls. | revert, or turn off the flag |
| FREE-12 | In the em-dash and year fixture, the overlay index equals the story index. | revert |
