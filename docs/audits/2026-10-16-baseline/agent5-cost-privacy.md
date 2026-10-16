# ReadUp Audit, Agent 5: Cost, Reliability and Privacy

**Scope:** dependency map, cost, reliability and privacy. This was a read-only audit of the local clone `C:\Users\bazeocrisy\Projects\ReadUp-audit` at `main @ eec9e78`.
**Date:** 2026-10-16
**Method:**
- I read the code (grep, then read in ranges).
- I did not call any Cloud Function, paid API or Firebase endpoint.
- Vendor pricing comes from public pages or search results, with the date and source noted.
- A DNS lookup of readupapp.com from this machine got no response, so the hosting provider is **unverified**.

**Labels used:**
- **EVIDENCE** means a confirmed `file:line` in the repo.
- **ASSUMPTION** means an inference or estimate.
- **UNVERIFIED** means it needs a check in the console or on the live site.

> Not legal advice. The COPPA and FERPA sections are written conservatively and are meant to show what to ask counsel about.

---

## 1. Current implementation (summary)

| Layer | What the code shows | Label |
|---|---|---|
| Hosting | Static files. `CNAME` = `readupapp.com`. `DEPLOYMENT.md` describes GitHub Pages. `firebase.json` has **no** `hosting` or `database` section, only `functions`. | EVIDENCE: `CNAME:1`, `firebase.json:1-16` |
| Main app | `index.html` is one file of about 869 KB. Firebase JS SDK 10.12.0 is loaded from `www.gstatic.com`. | EVIDENCE: `index.html:3853-3857` |
| Auth | Firebase Auth with email/password (verified email required) and Google sign-in. The parent owns the account; the field is labelled "Your Name (Parent)". | EVIDENCE: `index.html:3857`, `4145-4150`, `15495+` |
| Database | **Firebase Realtime Database, not Firestore.** Paths are `users/{uid}/children/{childId}/{profile,data}` and `rooms/{4-digit code}`. | EVIDENCE: `index.html:3856`, `3863`, `3888-3943`, `4549`, `7018-7020` |
| Security rules | Not in the repo. They are managed only in the console, so they are unknown. | EVIDENCE (absence): `firebase.json` |
| Backend | 7 HTTP Cloud Functions (2nd gen / Cloud Run), in `us-central1`, on Node 24. None of them check auth or App Check, and none have rate limits. | EVIDENCE: `functions/index.js:15,71,151,258,347`; `tts.js:327`; `stt.js:44`; `functions/package.json:12-14` |
| Secrets | `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY` are held via `defineSecret` (Secret Manager). Google STT/TTS use the runtime service account (ADC). **No provider secret appears in client code.** | EVIDENCE: `index.js:6`, `tts.js:8`, `tts.js:11-12`, `stt.js:5` |
| Comprehension Mode | `comprehension.html` stands alone: no Firebase and no auth. The story library comes from `library.json` (108 session stories and 24 placement passages). AI is optional. Data is saved in `localStorage` only. **The page is not linked from `index.html`** (grep found no reference). | EVIDENCE: `comprehension.html:188-216`, `318-333`; grep of `index.html` |
| Word lists | `fry.json` and `dolch.json` are static files fetched from the same origin. | EVIDENCE: `index.html:9639-9668` |

**README and DEPLOYMENT docs are out of date and make privacy claims the code contradicts.** They say:
- "All processing happens in the browser"
- "No files uploaded to servers"
- "No data collection or tracking"
- OCR runs on-device with Tesseract.js

None of that holds today:
- Photos, PDFs and DOCX files are uploaded to Cloud Functions and sent on to Anthropic (`index.html:6459-6560`).
- Accounts and child profiles are stored in Firebase.
- Tesseract, PDF.js and Mammoth CDNs are no longer referenced anywhere in `index.html`.

EVIDENCE: `README.md` "Privacy & Security" section; `DEPLOYMENT.md` "Security & Performance" section.

---

## 2. Dependency and cost matrix

Prices are public list prices found 2026-10-16. Where only third-party aggregators were reachable, that is stated. **All dollar figures are estimates.**

| # | Provider / service | Called from (file:line) | Client or server | Credential | Billing model, free tier | Likely status |
|---|---|---|---|---|---|---|
| 1 | **Anthropic Messages API** (`claude-haiku-4-5-20251001`) | `functions/index.js:29` (generateStory), `98` (extractText, vision OCR), `177` (extractSpellingWords), `290` (batchDefine), `453` (extractDocument, PDF/DOCX/TXT) | Server | Secret `ANTHROPIC_API_KEY` (`index.js:6`, header `x-api-key` at `:33,102,181,294,457`) | Pay per token, no free tier. Haiku 4.5 list price is about $1 per M input tokens and $5 per M output (ASSUMPTION from known pricing; confirm on the Anthropic pricing page). | **Unknown.** If prepaid credit ran out, every call returns an API error, which the function turns into an HTTP 500. **Lifecycle:** the Anthropic deprecations page (fetched 2026-10-16) lists Haiku 4.5 as *Active, "retirement not sooner than October 15, 2026"*. That date has now passed, so a deprecation notice (at least 60 days) could come at any time. The successor `claude-haiku-5-5` is Active. **Migration trap:** `generateStory` sends `temperature: 0.8` (`index.js:39`), and the docs say models from 4.7 onward return **400** for non-default temperature. |
| 2 | **ElevenLabs TTS** (`eleven_flash_v2_5`, `/with-timestamps`) | `functions/tts.js:148-170`, used from `tts.js:343-357` | Server | Secret `ELEVENLABS_API_KEY` (`tts.js:8,149`) | Subscription credits or pay-as-you-go. Flash is about $0.05 per 1K characters (aggregator figures, Jul–Aug 2026, ASSUMPTION). Free plan is small and non-commercial (ASSUMPTION). | The user says paid subscriptions were cut, so this **probably fails**. Code then falls back to Google TTS on any error (`tts.js:359-366`). |
| 3 | **Google Cloud Text-to-Speech** (WaveNet, with SSML marks) | `functions/tts.js:276-321` | Server | Service account (ADC) | About $4 per M characters for WaveNet. Free tier is 1M to 4M WaveNet characters a month; sources disagree (aggregator, ASSUMPTION). Studio voices reportedly rose to $160 per M in April 2026. Needs a billing account. | Probably working as the fallback if the project's billing is active. UNVERIFIED. |
| 4 | **Google Cloud Speech-to-Text v1** (`latest_long`, `useEnhanced`) | `functions/stt.js:56` | Server | Service account | Per minute, about $0.016–0.024 per min, roughly 60 free minutes a month (ASSUMPTION; the official page did not render). | **Deployed but unused by any client.** `CF_STT` is defined at `index.html:4703` and never called; no `getUserMedia` or `MediaRecorder` exists anywhere. It is pure attack surface. |
| 5 | **Cloud Functions 2nd gen / Cloud Run** | All 7 functions | Server | n/a | **Needs the Blaze plan.** Free tier is 2M invocations a month, then $0.40 per M, plus free GB-s and CPU-s (firebase.google.com/pricing, fetched 2026-10-16). Extraction functions use 1 GiB memory (`index.js:72,152`). Hidden costs: Artifact Registry image storage and Secret Manager versions (ASSUMPTION, small). | Active if Blaze billing is active. UNVERIFIED. |
| 6 | **Firebase Auth** | `index.html:3857`, `4145`, Google popup/redirect | Client | Web config `apiKey` | Free up to 50K MAU (pricing page). | Probably fine (free). |
| 7 | **Firebase Realtime Database** | `index.html:3856-3943`, `3997`, `4272-4301`, `4374`, `4500-4582`, rooms `5259`, `6326`, `6421`, `6694-6845`, `7018-7332` | Client | Web config, plus security rules | Spark: 1 GB stored, about 10 GB a month download, **100 simultaneous connections**. Blaze: $5/GB stored, $1/GB downloaded. | Probably fine at this scale. The 100-connection cap matters only if the project is ever moved to Spark. |
| 8 | Firebase Storage | `storageBucket` is in config (`index.html:3865`), but no Storage SDK import or upload was found | n/a | n/a | n/a | Not used. |
| 9 | **Firebase web config `apiKey`** | `index.html:3861` (value `AIza…REDACTED`) | Client | Public identifier | n/a | **Not a secret.** It identifies the project to Google; access control comes from Auth plus database rules. Best practice is still to restrict the key in GCP (HTTP referrer limited to readupapp.com, API list limited to Identity Toolkit and RTDB) and to enable App Check. |
| 10 | Google Fonts (Fredoka, Nunito, Oswald) | `index.html:11`, `comprehension.html:10` | Client CDN | none | Free | Working. Every page load sends the visitor's IP and user agent to Google, which is privacy-relevant for children's sites. |
| 11 | cdnjs (Chart.js 4.4.1) | `index.html:14380`, `14458` (lazy-loaded) | Client CDN | none | Free | Working. No SRI hash. |
| 12 | Pexels hotlinked image | `index.html:15290`, `15308` (landing page) | Client | none | Free | Working. Third-party request; could break if the URL changes. |
| 13 | GitHub Pages (assumed host) | `CNAME`, `DEPLOYMENT.md` | Static | n/a | Free. Soft limits of 100 GB/month bandwidth and a 1 GB site. | UNVERIFIED (DNS lookup failed from here). |
| 14 | Browser Web Speech `speechSynthesis` | `index.html:7782`, `7812`, `7839`, `10643` | Client | none | Free, on-device or OS voices | Used **only** as a fallback for word and definition audio. Not used for story read-aloud. |

No analytics, ads, tracking pixels, service worker or App Check were found (grep for `gtag|analytics|serviceWorker|appCheck|recaptcha` returned nothing). EVIDENCE.

### 2a. Steady-state cost estimate (ASSUMPTION, legitimate use only)

Assumptions: 100 active children, each generating 20 AI stories, playing 20 story read-alouds (about 900 characters each), looking up 40 words and doing 2 photo scans a month.

| Item | Unit cost (est.) | Monthly (est.) |
|---|---|---|
| Story generation (about 600 input and 450 output tokens) | about $0.003 | about $6 |
| Word definitions (on-demand lookups via `generateStory`, plus batches) | about $0.0005 | about $2 |
| OCR or spelling extraction (image of about 1.5K tokens, up to 8K output) | $0.005–0.04 | $1–8 |
| Story TTS with **ElevenLabs** (1.8M characters) | about $0.05 per 1K characters | **about $90** |
| Story TTS with **Google WaveNet** (1.8M characters) | $4 per M, first 1–4M free | **$0–4** |
| Cloud Functions, RTDB, Auth | free tiers | about $0–5 |

**Takeaway:** ElevenLabs is the main recurring cost, roughly 10 to 20 times everything else combined. Claude Haiku costs are modest when used legitimately. **The real financial risk is abuse, not normal use** (see §5).

---

## 3. Feature to service matrix

"FB" means Firebase Auth plus RTDB.

| Feature | Services needed | If the service is down or unpaid | Evidence |
|---|---|---|---|
| **Getting into the main app at all** | FB Auth (and RTDB for the child-profile list) | **Hard gate.** Signed-out users only ever see the landing page; there is no guest mode. If Auth is down, nothing in `index.html` is usable. | `index.html:4570-4604` |
| Read an AI story (home) | Anthropic via `generateStory` | **Graceful.** 15-second timeout, then a built-in story from `STORIES`: 14 categories × grades 1–3, about 54 stories. `getStory` is **deterministic**: it always picks the story closest to the target length, so a child sees the *same* story for a given category and grade every time. | `index.html:4966-4977`, `4982-5000`, `5041-5046`, `6985-7008` |
| Paste or type own text | none | Works. | `index.html:6446-6456` (TXT); paste UI |
| Photo or PDF/DOCX to text | Anthropic (`extractText`, `extractDocument`), Cloud Functions | **Error.** No on-device OCR fallback (Tesseract was removed). The user sees an error modal or message. | `index.html:6459-6560` |
| **Story read-aloud with word highlighting** | `synthesizeSpeech`: ElevenLabs, falling back to Google TTS | ElevenLabs failing falls back to Google on the server. **If both fail: toast "⚠️ Audio unavailable — try again." There is no `speechSynthesis` fallback for whole stories.** Offline: toast "read along on your own". | `tts.js:343-370`; `index.html:5473-5496`, `5502-5512`, `5712-5719` |
| Hear one word or a definition | `synthesizeSpeech` | **Graceful.** Falls back to browser `speechSynthesis`. | `index.html:7780-7785`, `7792-7842`, `10624-10646` |
| Word definitions (tap a word) | Anthropic via `generateStory` with a custom prompt, plus `batchDefine` | **Degrades.** Returns `null` and shows "Tap to look up meaning"; there is no offline dictionary. Results are cached in `localStorage` `readup_dict_cache`. | `index.html:7417-7459`, `10276-10333` |
| Fry/Dolch sight-word practice | Static `fry.json`/`dolch.json`; audio from TTS, falling back to `speechSynthesis`; definitions from batchDefine (optional) | **Works without paid services** (once signed in). Audio falls back to the browser voice. | `index.html:9639-9668`, `10624-10646` |
| Spelling list from a photo | Anthropic (`extractSpellingWords`, `extractDocument`) | **Error**, with no fallback. Manual entry is presumably still possible (UX scope). | `index.html:6617-6660`, `9996-10010`, `13685-13735` |
| Time My Reading (WPM) | Optional AI passage; timer is on the client | **Partial.** `8191` falls back to the current story. **`8903-8909` falls back to setting the passage text to "The passage could not be generated…", so the child is asked to read an error message.** | `index.html:8185-8200`, `8898-8912` |
| Read Together / race | RTDB `rooms/{code}`, AI story (no fallback in host AI path), TTS preload | Without RTDB it fails. Host AI failure shows "Could not generate story". TTS preload happens on every countdown (`7129`, `7134`), even if nobody presses Play. | `index.html:6298-6313`, `7018-7030`, `7102-7135` |
| Parent dashboard and progress | `localStorage`, synced to RTDB; Chart.js CDN | Data stays local if cloud sync fails (errors logged by `console.warn`). Charts need the CDN. | `index.html:3881-3944`, `9035-9060`, `14380` |
| Cloud sync of progress | RTDB | **Silent failure.** Only `console.warn('Cloud push failed')`. Local data survives. | `index.html:3943-3944` |
| **Comprehension Mode** (placement and 5-step session) | `library.json` (static); AI only for an explicit "AI story" choice or when the library has no match | **Works without paid services.** Library first, AI as backup (`ensureStory`, `placementPassage`). Saved to `localStorage`. The AI path errors visibly. | `comprehension.html:200-216`, `596-620`, `1175-1205`, `318-333` |

---

## 4. Can core learning work without paid services? (judged from the code)

Assumes Anthropic, ElevenLabs **and** Google Cloud TTS/STT are all unavailable, but static hosting and Firebase Auth/RTDB (free tier) still work.

| Capability | Verdict | Evidence |
|---|---|---|
| (a) Read stories | **YES, with limits.** Main app: about 54 built-in fallback stories, chosen deterministically, so variety is poor. Pasted text works. Comprehension Mode: 108 levelled library stories, no AI needed. | `index.html:4982-5046`, `6985-7008`; `library.json` (108 sessions: 18 per structure, levels 300–800L) |
| (b) Hear text read aloud | **PARTIAL.** Single words and definitions fall back to `speechSynthesis`. **Whole-story read-aloud has no fallback** and shows "Audio unavailable". Comprehension Mode has **no TTS at all**; the read-aloud step is done by the adult (`comprehension.html:1292`). | `index.html:5712-5719` vs `7780-7842` |
| (c) Practise Fry/Dolch | **YES.** Static JSON plus browser voice fallback. AI definitions become "Tap to look up meaning". | `index.html:9639-9668`, `10324-10331` |
| (d) Finish a Comprehension session end to end | **YES**, provided `library.json` loads. Caveats: the listening level can reach 1100L (`comprehension.html:1391`), but the library tops out at 800L, so a harder story falls back to the nearest one (always 800L). Placement covers 200–900L. Repeats happen after 3 stories per structure and level. | `comprehension.html:233-240`, `1185-1191`; library counts |
| (e) Save progress | **YES**, in `localStorage`. Main app: per child, key `readup_data_{childId}`, plus best-effort RTDB sync. Comprehension: device-only key `readup_comprehension_v1`. | `index.html:9023-9060`; `comprehension.html:198`, `318-333` |
| Photo/PDF/DOCX import, AI definitions, AI story variety | **NO.** No fallback. | §3 |
| If **Firebase Auth** also goes down | **Main app: NO** (hard sign-in gate). Comprehension Mode: still YES. | `index.html:4570-4604` |

---

## 5. Reliability and cost-abuse risks

**R1. Unauthenticated, uncapped paid endpoints (cost amplification). EVIDENCE.** All 7 functions use `onRequest` with no Firebase ID-token check, no App Check, no rate limit, no `maxInstances`, and no per-user quota.

- **CORS is not access control.** `curl` or any server ignores it.
- `transcribeSpeech` uses `cors: true` (`stt.js:3,45`), which allows any origin.
- `synthesizeSpeech` uses `cors: true` in its options (`tts.js:332`). The platform CORS middleware therefore runs before the inner origin check `cors({origin:["https://bazeocrisy.github.io"]})` at `tts.js:5`. That inner check is effectively bypassed, and it also leaves out readupapp.com. Its intent was broken anyway. (ASSUMPTION about middleware order. It is moot either way, because CORS does not stop scripts.)

Specific amplifiers:

1. **`generateStory` is an open Claude proxy.** The client-supplied `instructions` string becomes the entire user prompt (`index.js:22-26,41-44`). Anyone can use the project's Anthropic key as a free general-purpose LLM, up to 2,048 output tokens per call. Rough cost is about $0.01 per call, so 100K scripted calls ≈ $1K+ (ASSUMPTION).
2. **Extraction endpoints** accept arbitrary base64 images and PDFs, with `max_tokens` 8000 (`index.js:186,462`). Each call costs more, and the 1 GiB / 180-second functions add compute cost.
3. **`synthesizeSpeech`** takes up to 5,000 characters per call (`tts.js:341`) at about $0.25 per ElevenLabs call. The client also chooses any voice ID (`tts.js:349-352`) or any Google voice name; only `Neural2` is rewritten (`tts.js:280-281`). A caller can therefore pick premium Google voices (Studio, Chirp HD) at many times the WaveNet rate.
4. **`transcribeSpeech`** is unused but live. It runs enhanced STT on any audio up to 60 seconds sent to it.

**R2. No budget or alert safeguards in the repo. EVIDENCE (absence).** Nothing in the repo or docs mentions GCP budgets, Anthropic spend limits, ElevenLabs usage caps, or `maxInstances`. Pay-as-you-go with no spend cap, plus open endpoints, is the main financial risk for a nonprofit. UNVERIFIED whether budgets or alerts are configured in the console.

**R3. Single points of failure.**
- Firebase Auth is a hard gate for the main app.
- One Anthropic key and one model ID serve 5 features.
- All functions run in one region (us-central1).
- Story read-aloud depends on one Cloud Function.
- If the ElevenLabs secret is *deleted* from Secret Manager, a function declaring `secrets: [elevenlabsApiKey]` may fail to deploy or start. That would take the Google fallback down with it (ASSUMPTION; verify before deleting any secret).

**R4. Runtime and SDK lifecycle.**
- Node 24 on Cloud Run functions: deprecated 2028-04-30, decommissioned 2028-10-31 (Google runtime-support table via search, 2026-10-16). That is fine for now.
- `firebase-functions ^7.2.2` and `firebase-admin ^13.6.0` are current majors (ASSUMPTION).
- **The Anthropic model is the nearest deadline:** Haiku 4.5 is past its "not sooner than" date (see §2 #1).
- `firebase.json` sets `disallowLegacyRuntimeConfig: true`, which is good.
- `stt.js` and `tts.js` `require("cors")`, but `cors` is **not** declared in `functions/package.json`. It resolves only as a transitive dependency of firebase-functions (`package-lock.json:3948`, `4582`). That is fragile.

**R5. Error leakage.**
- Functions return `detail: err.message` and raw model output (`index.js:95,138,145,248,489`; `stt.js:97`; `tts.js:369`).
- Logs record full model responses (`index.js:57,137,247,326,488`), which can include text from children's homework.

**R6. Client-side resilience gaps.**
- Story TTS has no `speechSynthesis` fallback.
- The WPM passage can be set to an error message.
- Cloud-sync failures are silent.
- Google-fallback WAV audio is played as `data:audio/mp3` in the word functions (`index.html:7679`, `7805`, `7833`, `10636`). Browsers usually sniff the format correctly, but this is worth a QA check.

**R7. Read Together rooms.** Room codes are 4 digits (9,000 possibilities), at `index.html:7017`. Rooms are **never deleted**: grep found only one `remove()`, for child profiles (`index.html:4301`). They keep story text, which may be OCR'd homework, plus grade and voice settings forever. Whether rules restrict rooms is UNVERIFIED (rules are not in the repo).

---

## 6. Privacy

### 6.1 Data inventory (EVIDENCE)

| Data | Where stored | Source |
|---|---|---|
| Parent email, display name, Google profile | Firebase Auth | `index.html:3857`, signup form |
| Child: **full name** ("Child's Full Name", placeholder with a sample full name), nickname, grade, avatar, createdAt | RTDB `users/{uid}/children/{id}` and `/profile` | `index.html:15618-15624`, `4536-4549`, `3888-3894` |
| Child learning records: stories (may contain pasted or OCR'd homework text), wordBank, spelling and vocab lists, weeklyLog, wpmHistory, timedPassages, assignments, myWeek | `localStorage` `readup_data_{childId}` plus RTDB `/data` | `index.html:3927-3940`, `9023-9060` |
| Parent PIN (default `1234`) | `localStorage` only | `index.html:9083`, `14642` |
| Dictionary cache | `localStorage` `readup_dict_cache` | `index.html:7402-7414` |
| Comprehension: kid name, levels, session scores, **free-text adult notes on each retell**, WPM | `localStorage` `readup_comprehension_v1` only | `comprehension.html:318-333`, `1391`, `1245` |
| Read Together room contents | RTDB `rooms/{code}` (never deleted) | `index.html:6326-6334`, `7020-7027` |

No age or birthdate field was found. Grade is collected.

### 6.2 What leaves the device for third-party processors

- **Anthropic:**
  - Prompts for stories and definitions. These use random character names, **not** the child's name; the nickname is only displayed (`index.html:4809`, `5197-5215`).
  - **Photos and documents the child or parent uploads** (worksheets, book pages, spelling lists). These may show a child's name, school or handwriting, and the camera may capture faces (`index.js:78-126,158-224,354-466`).
- **ElevenLabs and Google TTS:** the story or passage text, including any pasted or OCR'd homework (`tts.js:160`, `284`).
- **Google STT:** no audio is collected. No microphone code exists in the client, so the deployed `transcribeSpeech` (`stt.js`) is currently unused. If voice reading is ever added, a child's voice recording is personal information under COPPA.
- **Google Fonts, cdnjs, Pexels:** IP address and user agent on page load.

### 6.3 Authentication, ownership, retention and deletion

- The parent owns the account; children are sub-profiles with no credentials of their own. That is a good pattern for COPPA.
- **Deleting a profile** removes the RTDB node and the local key (`index.html:4296-4309`). However:
  - there is **no account deletion** (no `deleteUser`)
  - **rooms are never purged**
  - **Cloud Function logs** may hold extracted homework text and raw model output
  - there is no published retention schedule
- **Shared devices:** sign-out clears only `readup_active_child` (`index.html:4241-4246`, `14612-14616`). It leaves `readup_data_{childId}` (full learning history and PIN) and `readup_dict_cache` in `localStorage`, readable by the next user of a library or community-centre computer. Comprehension Mode has no login, so anyone on the device sees all kids' names, scores and notes.
- **The parent PIN defaults to `1234`** and is checked only on the client (`index.html:9083`).

### 6.4 Privacy policy and consent

- **There is no privacy policy, terms of use, or consent text anywhere in the app.** A grep for `privacy|terms of|coppa|consent|ferpa` found only one unrelated string.
- The only privacy statement is "🔒 Your data is private and secure", and the README makes inaccurate "no data collection / no uploads" claims.
- **No signup checkbox or age attestation exists.**

### 6.5 COPPA (US FTC). Conservative reading; consult counsel.

- ReadUp is very likely a **service directed to children under 13** (grades 3–5, child-facing UI, "Bookie" mascot). It collects personal information about and from children:
  - full name
  - learning records linked to a persistent account
  - photos that may contain a child's image or handwriting
  - persistent identifiers
- COPPA applies regardless of nonprofit status *if* the operator is covered. Many nonprofits are outside FTC Act jurisdiction, but the analysis is fact-specific, and following COPPA practices is the prudent baseline. **ASSUMPTION; ask counsel.**
- **2025 amendments:** published 2025-04-22, effective 2025-06-23, **compliance deadline 2026-04-22, which has passed** (White & Case, Davis Polk, Toy Association, via search 2026-10-16). Items most relevant to ReadUp (summarized from memory of the final rule; verify):
  1. A direct notice to parents and an online privacy notice that list the categories of data and third parties (Anthropic, ElevenLabs, Google).
  2. Verifiable parental consent before collecting a child's personal information. Separate consent is required for non-integral third-party disclosures.
  3. A **written data-retention policy**, published in the notice, keeping data only as long as reasonably necessary. Indefinite retention is prohibited.
  4. A **written information-security program**.
  5. Biometric identifiers were added to the definition of personal information. Voice recordings already count, with a narrow exception for audio deleted immediately after transcription.
- Today the parent creates the account and enters the child's data, so a parent is in the loop. However, **there is no notice, no consent capture, no retention policy, and no full deletion path.**

### 6.6 FERPA

- FERPA applies to education records held by schools that receive US Department of Education funds. It does not apply to a nonprofit serving families directly.
- If schools or teachers adopt ReadUp (the "assignments" and teacher features hint at this), Transforming Youth would likely act as a "school official" under a data agreement. Schools will then ask for:
  - a Data Privacy Agreement
  - state student-privacy law compliance (for example, SOPIPA-style laws)
  - COPPA school-authorization handling
- ASSUMPTION; counsel review is needed.

---

## 7. Confirmed findings and severity

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| F1 | **P0** | Paid AI and TTS endpoints have no auth, App Check, rate limit or `maxInstances`. `generateStory` is an open Claude proxy. The TTS voice can be chosen by the client. Open-ended billing exposure. | `index.js:15-26`; `tts.js:332-352`; `stt.js:44-45` |
| F2 | **P0** | No privacy policy, parental notice or consent, despite collecting children's full names, learning records and uploaded photos sent to third-party AI. COPPA 2025 amendments are in force (deadline passed 2026-04-22). | §6.4 |
| F3 | **P1** | README and DEPLOYMENT privacy claims ("no uploads", "no data collection", on-device OCR) are inaccurate. Families and partners may rely on them. | `README.md`, `DEPLOYMENT.md` |
| F4 | **P1** | No spending safeguards documented (budgets, alerts, provider caps). | absence |
| F5 | **P1** | Story read-aloud, the core feature for struggling readers, has no browser `speechSynthesis` fallback. | `index.html:5712-5719` |
| F6 | **P1** | Anthropic model `claude-haiku-4-5-20251001` is past its "not sooner than" retirement date. The model ID is hard-coded in 5 places. `temperature: 0.8` will break on 4.7+ models. | `index.js:37-39,106,185,298,462` |
| F7 | **P1** | Shared-device residue: sign-out leaves child learning data and the PIN in `localStorage`. Comprehension data is unprotected. The PIN defaults to `1234`. | `index.html:4241-4246`, `9083`; `comprehension.html:318-333` |
| F8 | **P1** | No retention or deletion: rooms are never deleted, there is no account deletion, and logs contain extracted text. | `index.html:4301`, `7018-7027`; `index.js:57,137,247,326,488` |
| F9 | P2 | Database security rules are not version-controlled and are unknown. Room codes are 4 digits. | `firebase.json`; `index.html:7017` |
| F10 | P2 | `transcribeSpeech` is deployed but unused: attack surface and dead cost risk. | `stt.js`; `index.html:4703` |
| F11 | P2 | The `cors` dependency is undeclared. The TTS inner CORS allowlist is wrong and ineffective. | `stt.js:3`, `tts.js:5,332`; `functions/package.json` |
| F12 | P2 | Fallback stories are deterministic (same story every time). The WPM fallback can produce an error string as the passage. | `index.html:5041-5046`, `8908` |
| F13 | P2 | Internal error details and raw model output are returned to clients. | `index.js:95,138,145,248,489` |
| F14 | P3 | Third-party Google Fonts, Pexels hotlink, and Chart.js without SRI hash. | `index.html:11`, `15290`, `14380` |
| F15 | P3 | `comprehension.html` is not linked from the main app, so its free, library-first path is hard to discover. | grep |
| F16 | P3 | The Firebase web `apiKey` is in the client (normal and not secret). Restrict it by referrer and API in GCP and add App Check. | `index.html:3861` (`AIza…REDACTED`) |

---

## 8. Recommended changes (prioritized, low cost first)

### P0, do first

1. **Stop the bleeding on billing.**
   - In GCP: set **budgets with alerts** at small thresholds (for example $10, $25, $50) on the billing account.
   - Set a monthly spend limit in the Anthropic Console and a usage cap in ElevenLabs, or remove the ElevenLabs key from code *after* confirming the fallback still deploys (R3).
   - Add `maxInstances` (for example 2–5) and `concurrency` to every function.
2. **Require identity on paid functions.**
   - Move to `onCall` or verify the Firebase ID token (`Authorization: Bearer`) in each `onRequest`.
   - Enable **Firebase App Check** (reCAPTCHA Enterprise or v3 on web) with enforcement.
   - Add a per-uid daily quota counter in RTDB, for example N stories, N OCR calls and N TTS characters per day.
   - Note: Comprehension Mode is unauthenticated. Either give it a sign-in for AI use or keep it library-only.
3. **Make `generateStory` server-templated.** Accept only `{grade, topic, wordCount, mode}` from an allowlist and build the prompt on the server. Stop accepting free-form `instructions` (comprehension prompts can move into the server as templates). Do the same for the TTS voice: an allowlist of 2–4 voice IDs or names.
4. **Publish a privacy policy and parental notice before wider rollout.**
   - Plain-language summary for families.
   - Categories of data and the processors (Anthropic, Google, ElevenLabs if kept).
   - A retention schedule.
   - A contact person.
   - Deletion instructions.
   - A consent checkbox at parent signup, recorded with a timestamp.
   - A note to parents not to photograph pages showing a child's face or full name.
   - Have counsel confirm COPPA applicability and the consent method.

### P1

5. **Free fallback for story read-aloud.** If `synthesizeSpeech` fails, read with `speechSynthesis` per paragraph, using `onboundary` word events for approximate highlighting.
   - Support caveats: `onboundary` support and voice quality vary. iOS Safari works but with limited voices; some Android and Chrome voices don't fire word boundaries.
   - Make this the **default mode** and paid TTS opt-in. That alone removes most recurring cost.
6. **Pre-generate static audio** for the fixed content: 108 library stories, 54 fallback stories, and the Fry/Dolch words (about 620 words).
   - Generate once with Google TTS (likely inside the free tier) or ElevenLabs, saving MP3 plus word timings as static files on Pages.
   - Child-friendly, consistent voice; zero marginal cost; works without any paid service at runtime.
7. **Make AI optional and adult-side.**
   - Keep AI story generation and OCR behind the parent/teacher area (PIN or account), not on the child's path.
   - Default the child experience to the library.
   - Add a static offline child dictionary (for example, the Fry/Dolch words plus library vocabulary with pre-written definitions).
8. **Migrate the model ID to a config constant.** Test against `claude-haiku-5-5` (or the then-current Haiku), **remove `temperature`**, and subscribe to Anthropic deprecation emails.
9. **Shared-device hygiene.**
   - On sign-out, clear `readup_data_*` and `readup_dict_cache` (cloud keeps the copy).
   - Force a PIN to be set on first parent-dashboard use (no `1234` default).
   - Add a "this is a shared device" option.
   - Give Comprehension Mode a "clear all data on this device" button and optional PIN.
10. **Retention and deletion.**
    - Delete rooms when a session ends, and add a scheduled cleanup (TTL by `createdAt`).
    - Add "Delete my account and all data" (Auth `deleteUser` plus RTDB removal).
    - Stop logging raw model output and extracted text.
    - Set a short log retention period in Cloud Logging.
11. **Fix the README and DEPLOYMENT docs** to describe the real data flows.

### P2/P3

12. Commit `database.rules.json` and wire it into `firebase.json`.
    - Rules: `users/$uid` readable and writable only by `auth.uid === $uid`.
    - Rooms: auth required, schema-validated, size-limited.
    - Longer room codes or tokens.
13. Delete or disable `transcribeSpeech` until there is a consented, designed voice feature.
    - If one is added: process on the device where possible. Note that Chrome's Web Speech `SpeechRecognition` sends audio to Google servers and isn't available in Firefox, so it is not truly on-device.
    - Don't store audio; get parental consent.
14. Add `cors` to `functions/package.json` and set one correct origin allowlist (readupapp.com, www, github.io).
15. Return generic error messages to clients and keep details in the logs.
16. Self-host fonts and the hero image, and add an SRI hash to Chart.js.
17. Randomize the fallback story pick. Never use an error string as a reading passage.
18. Link Comprehension Mode from the main app.

**Firebase Spark is not an option while Cloud Functions are used.** Functions need Blaze. A fully free architecture is possible:
- static site (GitHub Pages)
- Auth and RTDB on Spark (free; watch the 100-connection cap)
- library content, pre-generated audio and `speechSynthesis`
- **no** Cloud Functions

AI features would then become optional "bring-your-own" or staff-only tools (ASSUMPTION about the desired product direction).

---

## 9. Required verification (owner or console; do not call paid endpoints)

1. GCP Billing: is billing active on `readup-transforming-youth`? Which budgets and alerts exist? What was the last 3 months' spend per SKU?
2. Anthropic Console: credit balance, spend limit, last-use date of the key, and any deprecation emails for Haiku 4.5.
3. ElevenLabs: subscription status, and whether the key still exists in Secret Manager (`firebase functions:secrets:access` is **not** to be run by auditors; the owner checks in the console).
4. Cloud Functions console: which of the 7 functions are deployed, their invocation counts (look for unusual traffic suggesting abuse), and `maxInstances` settings.
5. RTDB console: the current **security rules** text, and the size and age of `rooms/`.
6. Auth console: providers enabled, authorized domains, number of users.
7. GCP API key restrictions on the Firebase web key.
8. Hosting: confirm readupapp.com DNS points to GitHub Pages and HTTPS is enforced.
9. Cloud Logging retention period, and whether logs contain children's homework text.
10. Legal: confirm COPPA applicability for Transforming Youth Inc. and pick a verifiable-parental-consent method; decide on a school/FERPA posture.
11. Live-site QA (another agent): story read-aloud behaviour now that ElevenLabs is off, to confirm the Google fallback actually plays.

---

## 10. What must be preserved

- **Secrets stay server-side** (Secret Manager via `defineSecret`). No provider keys are in client code. Keep it that way.
- **Parent-owned accounts** with child sub-profiles, required email verification, and profile deletion that also clears local data.
- **Comprehension Mode's library-first, AI-optional design** and its `library.json` (108 + 24 levelled passages). It is the strongest free path.
- **Graceful fallbacks** already present: fallback stories after a 15-second timeout, word-level `speechSynthesis`, the server-side ElevenLabs-to-Google TTS fallback, and "Tap to look up meaning".
- **Local-first saves with cloud sync**, quota-exceeded trimming (`index.html:9035-9060`), and **JSON export/import** (`index.html:14658+`), which supports data portability and deletion requests.
- Static Fry/Dolch JSON lists.
- Child nicknames are not sent to AI (stories use random names). Keep that rule.
- No analytics or ads trackers. Keep it that way.
- The kid-safety system prompt on story generation (`index.js:40`). Carry it over to any server-templated prompt.

---

### Sources (accessed 2026-10-16)

- Firebase pricing: https://firebase.google.com/pricing
- Anthropic model deprecations: https://platform.claude.com/docs/en/about-claude/model-deprecations
- Cloud Run functions runtime support (Node 24 dates): https://docs.cloud.google.com/functions/docs/runtime-support
- Google TTS pricing (official page did not render; aggregator): https://costbench.com/software/voice-apis/google-tts-api/ and https://costbench.com/changelog/google-cloud-text-to-speech-price-increase-2026-04/
- Google STT pricing (official page did not render; figures are ASSUMPTION): https://cloud.google.com/speech-to-text/pricing
- ElevenLabs API pricing (aggregators): https://invideo.io/blog/ai-voice-model-pricing/ and https://www.activepieces.com/blog/elevenlabs-pricing-2026-plans-credits-and-costs.md
- COPPA amendments: https://www.whitecase.com/insight-alert/unpacking-ftcs-coppa-amendments-what-you-need-know, https://www.davispolk.com/insights/client-update/ftc-prioritizes-coppa-enforcement-new-compliance-obligations-take-effect, https://toyassociation.org/PressRoom2/News/2026-News/updated-coppa-rule-requirements-take-effect-april-22.aspx
