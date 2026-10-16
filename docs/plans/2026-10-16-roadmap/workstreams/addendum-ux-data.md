# UX/Data addendum: guest mode, data & account preservation, phase acceptance tests

*Planning agent addendum, 2026-10-16. Re-checked read-only against `eec9e78`.*

**Corrections to DATA-1:**
- `readup_active_child` stores `{uid, childId}` (`index.html:4355`).
- Firebase child ids are `'child_' + Date.now().toString(36)` (`4548`).

## 1. Guest mode

**What the code does today with no user signed in:**
- When there is no user, `onAuthStateChanged` only calls `showLandingPage()` (`4597-4604`).
- **Storage already works locally:**
  - `getLSKey()` (`9025`) depends on `currentChildId`, not on the user.
  - `saveData` schedules a push only when `currentUser && currentChildId` (`9074`).
  - `childPath()` (`3881`) returns null when no one is signed in, so `pushToCloud` and `pullFromCloud` return early (`3897`, `3926`).
- **These would break for a guest:**
  - 10 places dereference `currentUser.uid`: `3880, 3881, 3997, 4272, 4301, 4355, 4500, 4533, 4536, 4549`.
  - `selectChildProfile` (`4350`) would throw.

**Design.** Guest mode sits behind a FREE-9 flag, `guestMode`, which stays **off by default** until the guest tests pass.
- **Entry point:**
  - A landing-page button (`15265`): "Start reading — no account needed".
  - "Continue as {nickname}" when guest readers already exist.
  - A returning guest is never resumed automatically, so the signed-out landing page looks the same as today.
- **Storage:**
  - `readup_guest_v1 = {readers:[{id, nickname, grade, avatar, createdAt, upgradedTo?:{uid, childId, at}}], activeId, noticeAckAt}`.
  - Each reader's data goes in **`readup_guestdata_{gid}`**. `getLSKey()` gets a guest branch, so scans of `readup_data_*` (the DATA-2 PIN scan, the SEC-17 sign-out cleanup) **never touch guest data**.
  - `gid = 'guest_' + crypto.randomUUID()`. The prefix can never collide with `child_` ids.
  - Guests never write `readup_active_child`.
- **Functions:**
  - `selectGuestReader()`: no pull, no `onValue`.
  - A guest branch in the add-reader modal.
  - The guest Grown-Ups PIN is device-only (`readup_pin_v2`). "Forgot PIN" for a guest resets only the PIN, after an adult check, and leaves the data alone.
- **Network guard.** One `isGuest()` check inside the shared fetch wrapper (SEC-11) and in the RTDB helpers. A guest's call to `CF_*` or `ref()` is refused and the app shows "Sign in for this".

| Guests get (local, free) | Account only |
|---|---|
| Built-in `STORIES` via `getStory` (`5041`); Comprehension in library mode (linked from the landing page) | AI stories (fall back to built-in) |
| Browser read-aloud with `speechSynthesis` (FREE-3) | Cloud voices |
| Fry/Dolch spelling, practice, quiz, word search, scramble | AI sentence mode |
| Timed reading with a pasted or built-in passage | Scan, upload and OCR (`CF_OCR`, `CF_DOC`, `CF_SPELLING`) |
| Typed vocab lists that include their own meanings | AI definitions (`CF_BATCH_DEF`) |
| Dictionary from the cache or offline dictionary (FREE-7a); otherwise "hear it" only | — |
| My Week and assignments (local), bedtime mode, Comfort panel | Cloud sync and multiple devices |
| — | Read Together (RTDB `rooms/`; rules UNVERIFIED) |

**Shared-device notice.** Shown once and available to show again; `noticeAckAt` records that it was seen. Text: "Guest progress is saved only in this browser on this device. Anyone using this device can see it. Clearing browser data erases it. Use a nickname, not a full name. Create a free account to back it up."

Guest Grown-Ups also offers "Remove guest data from this device", protected by the PIN and a confirmation, with a DATA-3 export offered first.

**Upgrading from guest to an account.** After sign-up or sign-in, if any guest readers have no `upgradedTo`, the app offers "Copy N guest readers into your account?".

For each reader:
1. Create a **new** child with a fresh `child_` id and `set()` its profile. Existing children are never touched.
2. Write `readup_data_{newId}` from the guest data, without the PIN.
3. Push it with SYNC-3's `update()`.
4. Read it back and compare item counts.
5. Only when the counts match, record `upgradedTo`.

- **If the account already has a child with the same nickname:**
  - The default is "Add as new reader".
  - The other option is "Merge into {X}". It only adds data, never removes it:
    - stories combined by `storyHash`
    - word bank by word
    - lists by id
    - `wpmHistory` and `weeklyLog` by date
    - where both copies have a value, the account's existing value wins
- **Running it again** skips readers that already have `upgradedTo`.
- **Guest data stays on the device** until the parent taps "Remove guest copy". That button appears only after the read-back check passes.

**Effect on signed-in users: none.** When a user is signed in, the existing path (`4572-4596`) runs unchanged and guest state is ignored.

**Order.** After SYNC-1 to SYNC-3, FREE-3, FREE-7a, FREE-9, the DATA-1 fixtures and DATA-2; before Home v2.

| PR | Contents | Notes |
|---|---|---|
| G-1 | Guest shell, local readers, notice | flag off |
| G-2 | Feature gating and network guard | — |
| G-3 | Guest-to-account upgrade | needs DATA-3 and SYNC-3 |
| G-4 | Landing-page entry point turned on | needs owner approval |

*Lead's note:* the testing approach is the zero-install harness (QA-6 vm, QA-12 CDP), not Vitest or Playwright.

## 2. Data & account preservation (required before any auth or database change)

### (a) Inventory

**Browser storage (localStorage):**
- `readup_data_{childId}` or `readup_data`:
  - `pin`: plain text, stored per child, never synced
  - `bedtimeMode`
  - 9 collections
  - `updatedAt`
- `readup_active_child`: `{uid, childId}`
- `readup_dict_cache`
- `readup_comprehension_v1`: `{kids, sessions, rotationStart, current, placement, used, placeUsed}`
- Firebase Auth's own persistence (UNVERIFIED)

**Realtime Database:**
- `users/{uid}/children/{cid}`:
  - `{id, name, nickname, grade, avatar, createdAt}`
  - `profile{}`
  - `data{stories, wordBank, spellingLists, vocabLists, weeklyLog, wpmHistory, timedPassages, assignments, myWeek, updatedAt}`
- `rooms/{code}`, which is temporary
- There is no rules file in the repo.

**New keys and paths (all additive):**
- **Browser:**
  - `readup_ui_v1`
  - `readup_prefs_{cid}`
  - `readup_pin_v2`
  - `readup_family_dir_v1`
  - `readup_guest_v1`
  - `readup_guestdata_{gid}`
- **Database:**
  - `children/{cid}/prefs`
  - `users/{uid}/settings`
  - `users/{uid}/comprehension_v1`
  - `children/{cid}/data_v2` (SYNC-3)

### (b) Invariants every PR must keep
1. Never rename, remove or change the type of an existing key, path or field.
2. Additive only. New cloud data goes in sibling nodes. `/data` only ever gets its 9 fields plus `updatedAt`.
3. No user collection is trimmed or deleted without an adult's confirmation behind the PIN.
4. Version 1 exports are always importable, and v2 exports keep a top-level `readup_data`.
5. index.html never writes `readup_comprehension_v1`. It may merge into it only when the user chooses to restore a backup.
6. The Comprehension harness passes 31/31 unmodified.
7. Every migration reads the old format, writes a new key, and can safely run twice. Old fields are kept, so rolling back restores the old behaviour.
8. No automatic backup copies in localStorage, because of the storage-quota risk.
9. Every fixture loads, renders, and saves back deep-equal, apart from added fields.

### (c) Effect on existing accounts, by item

Nothing is deleted by any of these items.

| Item | What happens to existing accounts, profiles and progress | What a returning user sees |
|---|---|---|
| DATA-2 (PIN) | The old `d.pin` is read and never rewritten. | One custom PIN: no change. Still on 1234: asked once to create a PIN (1234 is accepted that one time). Several different PINs: any of them works once, then the parent chooses one. |
| DATA-3 (backup) | Export only; nothing is rewritten. | The PIN is left out of exports. Importing keeps the current PIN. Comprehension data is merged, not replaced. |
| DATA-4 (Comprehension linking) | Adds a `linkedChildId` field and the family directory key. Phases A and B only read. Phase C writes its own node and changes nothing on the device. | An optional link |
| UX-3b (grades 4–5) | Saved grades are unchanged. A profile becomes 4 or 5 only when a parent edits it. UX-3a keeps such profiles on grade-3 content if the change is rolled back. | Nothing changes until a parent edits |
| UX-5 / UX-6 | Delete and clear-all work exactly as today. | They now ask for the PIN and offer a backup first |
| UX-9 (preferences) | A new key | Today's look stays the default, except the phone text minimum rises from 1.15 to 1.25 rem |
| Guest mode and upgrade | Nothing for signed-in users. The upgrade only creates new children. | The guest copy stays until removed |

### (d) Release procedure
- **Before:**
  - Families download a full family export (DATA-3). Until DATA-3 ships there is only a v1 export of one child, and Comprehension has no export at all. **So no migration ships before DATA-3.**
  - The owner exports the RTDB as JSON from the console. It contains student data, so it must be encrypted, kept outside the repo, and deleted after the retention period.
- **After:**
  - CI fixture round trips: v1 and v2 import, the Comprehension DB, and the guest upgrade.
  - A test account with 2 children on 2 devices, with seeded data. Compare item counts in each collection before and after, check the PIN works, check Comprehension sessions are intact, and check a reset doesn't bring data back.
  - One real device that already has data. **Compare counts only**; don't look at the content.

### SYNC items checked against the code
- **SYNC-1: confirmed, with one detail added.**
  - **Today:** on `QuotaExceededError`, the app trims the dictionary cache to 100 entries, stories to the last 5 and spelling lists to the last 3, then retries (`9039-9058`). The push queued at `9074` reads that trimmed localStorage through `getData()` (`3928`), so **the trimmed data reaches the cloud when the retry succeeds**. If the retry fails, the cloud gets the older local copy and only the newest edit is lost.
  - **Fix:** trim only the dictionary cache, pass the untrimmed `d` directly to `pushToCloud(d)`, and show a "storage full" warning.
- **SYNC-2: confirmed.**
  - **Reset** removes only the local key (`14652`). `pullFromCloud` (`3900-3915`) and the `onValue` listener (`4381`) then put the cloud copy back, because the local data has no `updatedAt`.
  - **Import** calls `setItem` directly (`14738`) and never pushes, so it gets reverted the same way.
  - **Fix:** reset saves defaults with `updatedAt = now` and pushes immediately, behind the PIN and after a backup prompt. Import saves the merged data and pushes immediately, keeping the PIN.
  - **Additional finding:** RTDB stores an empty array as "absent", and `pull` only applies fields that are present (`if (cloudData.x)`). **So a "clear all" never reaches other devices, and their next push brings the data back.** SYNC-3 needs per-collection timestamps to tell "cleared" apart from "never synced".
- **SYNC-3 (proposed):**
  - **Step 1:** replace `set(/data)` with `update(/data, {9 fields, updatedAt_* per collection})`, so unknown children of `/data` survive.
  - **Step 2 (dual write):** new clients also write `data_v2/{collection}/{itemId}`.
    - Reads use v2 for a collection when its timestamp is newer, otherwise the legacy copy.
    - Legacy `/data` is still written, so old cached clients keep working.
    - Legacy is never removed.
  - **Conflicts:** compare per-collection timestamps instead of the one client-clock `updatedAt` (`4381`).
  - Needs a rules review.

## 3. Acceptance tests by phase

| PR / item | Acceptance tests |
|---|---|
| DATA-1 | Every data shape has a fixture. Load and save gives deep-equal data. |
| UX-1/2 | Parent Menu → Comprehension → "Back" opens Grown-Ups. No visible "BUILD" text. Harness 31/31. |
| UX-3a | `prek`, `k`, `1`–`5` and `'99'` each map to a defined value in every map. Grade 3 and above never resolves to grade-1 values. Pre-K to 3 output is unchanged. |
| UX-4 | No visible "Lexile" or "DIBELS" except the disclaimer. `id="newLex"` and stored fields unchanged. Harness 31/31. |
| UX-3b | A grade-5 profile round-trips. The grade-4 prompt contains the grade-4 instructions. Grade 4 with a null benchmark shows "Beat your best", never "above grade level". No grade 4/5 sight-word button. |
| A11Y (PRs 6–9) | All tokens ≥4.5:1 in light and bedtime modes. axe: 0 serious or critical issues on key screens. Reduced motion: the highlight has no transform. Every interactive element shows a visible focus ring. Bar, voice and PIN buttons are at least 44 px. The modal returns `true`/`false`/`null` correctly, and Esc returns `null`. Harness 31/31. |
| DATA-3 | A v1 file imports with the same counts and the PIN unchanged. A v2 file imports into the old code. Merging the same file twice changes nothing. Comprehension merge loses nothing. An import survives a reload. |
| DATA-2 / UX-5 / UX-6 | The PIN fixtures (none, one, several, only 1234) produce the expected flows. Old `d.pin` stays byte-identical. Delete and all 4 clear-alls ask for the PIN; cancelling changes nothing. |
| A11Y-8 | Enter and a click call `showDictionaryPopup` with the same index. The highlight sequence is unchanged. |
| UX-9 | Preferences persist across a reload and a profile switch. The default look is unchanged except the phone text minimum. Tap-to-define works at every size. |
| UX-7/8 | Every row of §5.3 can be reached from v2. Turning the flag back to classic restores today's home. "Surprise me" uses the profile grade. |
| DATA-4 | index.html never writes `readup_comprehension_v1` in phases A and B. A linked reader's retell scores appear in Progress. Backing up and restoring twice gives the same result. Works offline. |
| SYNC-1 | With a simulated quota error, the cloud collection counts are unchanged. |
| SYNC-2 | Reset, then reload, stays empty. An import survives a reload and a pull. |
| SYNC-3 | An unknown `/data` child survives a push. A clear-all reaches a second (fake) device. Data written by an old client stays readable. |
| G-1/G-2 | A full guest session makes 0 calls to `cloudfunctions.net` and 0 `ref()` calls. Data is written only under `readup_guestdata_*`. The notice is shown once. |
| G-3 | An account with 1 child, plus 2 guest readers, ends with 3 children. The existing child is deep-equal to before, and the new children match the guest data exactly. Running the upgrade again creates nothing. Guest data stays until it's removed. |
| G-4 / any auth PR | The signed-in call sequence (auth → read children → select → pull → `onValue`) is identical to the baseline recording. |

**Unverified:** RTDB rules (not in the repo); exactly what FREE-7a covers; Firebase Auth persistence.
