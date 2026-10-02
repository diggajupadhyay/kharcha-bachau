# Kharcha Bachau — Expense Tracker 🇳🇵

**Kharcha Bachau** (खर्च बचाउ — "save expenses" in Nepali) is an Android expense tracker, built in
Nepal and usable anywhere. It works fully offline and keeps data on the device by default.
Signing in with Google is optional and adds cloud sync, cross-device access, and shared
wallets you can invite people into.

| | |
|---|---|
| Platform | Android (Expo SDK 57, React Native 0.86, React 19) |
| Package | `com.kharchabachau.app` |
| Minimum | Android 7.0 (API 24) |
| Offline | Yes — local storage is the default and fully sufficient |

---

## Contents

- [What it does](#what-it-does)
- [Web app and Android](#web-app-and-android)
- [Getting started](#getting-started)
- [Project layout](#project-layout)
- [Architecture](#architecture)
- [Security model](#security-model)
- [Design system](#design-system)
- [Testing](#testing)
- [Release](#release)
- [Known gaps](#known-gaps)

---

## What it does

**Wallets.** A wallet is one pot of money — home, a trip, a shared group. Each keeps its own
expenses, its own monthly budget, and its own people. Switching wallets is one tap from Home.

**Expenses.** Log an amount against one of nine default categories (plus any custom ones you
add), with an optional note and date. The date filter chips and search narrow the list, and
the list groups entries by day.

**Splitting.** Log one expense and split it equally between two or more people. The app works
out each share exactly in paisa, tracks who paid, and derives a per-person balance. When cash
actually changes hands, mark it settled — oldest debt first — and undo is available for a few
seconds afterwards.

**Budgets.** A per-wallet monthly limit with a progress bar and an explicit over-budget state.

**Shared wallets.** Sign in and create a wallet marked *Share with others* to get a 6-character
invite code. Anyone with a Google account can redeem it. Members see the same expenses,
balances, and settlements in real time.

**Export and restore.** CSV for spreadsheets, or a full JSON backup. A restore
rebuilds the wallets a backup contains before re-homing its expenses onto them, so
files written by the old webapp import with their structure intact — a flat merge
left rows pointing at wallets that no longer existed, which reads as an empty
ledger rather than as a failure.

**Appearance.** Light and dark themes, following the system by default or pinned in Settings.

---

## Web app and Android

One codebase, two builds. The web version at `/app` is the same React Native source as the
Android app, run through `react-native-web` — so the two are identical by construction, not
by discipline. Only five modules differ, each behind a `.web.tsx` twin: Google sign-in,
export/restore, the date picker, the sign-in button, and Firebase initialisation. See
[DEPLOY.md](DEPLOY.md) for how that works and how to ship it.

## Getting started

### Prerequisites

- Node.js 20+
- Android Studio, or a physical device with USB debugging
- JDK 17 (for local Android builds)

### Run it

```bash
cd mobile
npm install
npx expo start
```

Then press `a` for Android, or scan the QR code with Expo Go.

> The app uses native modules (Firebase, Google Sign-In), so it needs a **development build**
> rather than Expo Go. Run `npm run android` once to produce one, or use an EAS development
> build.

### Firebase setup

The app reads `mobile/google-services.json`, which is **gitignored**. Copy in the file from
your Firebase console (Android app, package `com.kharchabachau.app`). Without it the Firebase
plugins fail the native build.

Register both signing fingerprints under the same Firebase Android app:

| Key | SHA-1 |
|---|---|
| Release (`upload`) | `BE:FA:3E:58:73:E1:E7:E3:36:E9:50:D5:02:62:86:FA:C3:C4:FC:1D` |
| Debug | `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` |

A fingerprint is a one-time, per-key public identifier, not a secret — only the keystore itself
is sensitive.

### Firestore rules

`firestorerules.txt` in the repo root is the source of truth and is already deployed. Read it
before changing any cloud code: the rules encode who may write what, and several write shapes
are deliberately split across two round trips.

---

## Project layout

```
├── mobile/                    # The Android app
│   ├── App.tsx                # Providers, tab bar, onboarding gate
│   ├── app.json               # Expo config
│   ├── src/
│   │   ├── store.tsx          # All app state: wallets, expenses, balances
│   │   ├── AuthContext.tsx    # Firebase auth, guest mode
│   │   ├── lib/
│   │   │   ├── cloud.ts       # Firestore CRUD, invites, paged reads
│   │   │   ├── storage.ts     # AsyncStorage, invite codes, onboarding flag
│   │   │   ├── tokens.ts      # Design tokens (colour, type, space)
│   │   │   ├── theme-context  # Light/dark provider
│   │   │   ├── balances.ts    # Debt derivation
│   │   │   ├── settlement.ts  # Settlement planner
│   │   │   ├── split.ts       # Equal-share maths
│   │   │   └── useSheetDrag   # Pull-down sheet dismissal
│   │   ├── components/        # Sheets, primitives, icons
│   │   └── screens/           # Home, Settings, Onboarding
│   └── plugins/               # Expo config plugins (release signing)
├── firestorerules.txt         # Cloud authorisation contract
├── pages/                     # Landing + privacy (static site)
└── .github/workflows/ci.yml
```

---

## Architecture

### Local-first, cloud-optional

`store.tsx` owns all state. Every mutation goes through it, and it decides where the write
lands based on whether someone is signed in:

```
User action → store.tsx → isCloud ? cloud.ts (Firestore) : storage.ts (AsyncStorage)
```

Signing in migrates local data up rather than starting fresh. That migration is idempotent —
it checks for existing cloud wallets first, and is guarded against running twice concurrently.
It is also **per device**: a second phone that logged expenses while signed out contributes
all of them to the account the first time it signs in, and the app cannot tell those apart
from rows another device already synced.

### Restoring a legacy backup

The old webapp kept its data in browser `localStorage`, so nothing from that era is in
Firestore. Anyone who used it needs the JSON export the webapp produced, which
**Settings → Restore backup** accepts. A restore is deliberately not a flat merge:

- Wallets are rebuilt from the file, then matched to existing wallets **by name**. Restoring
  two exports of one ledger merges them; it does not produce two copies of the same wallet.
- Rows keep their ids, so importing the same file twice overwrites rather than duplicates.
- Ownership follows the person restoring, not the file, and members carried over from another
  account are dropped — the Firestore rules would reject the write otherwise.
- Rows that reference a wallet the file never declares are counted and reported, not silently
  discarded.
- Custom categories are written in a single batch. Adding them one at a time lost every
  category but the last.

### Cloud uses the native Firestore SDK

`@react-native-firebase/firestore`, not the JS SDK. The JS SDK's persistent cache degrades to
memory-only under React Native, so writes would be lost when the app is backgrounded.

### Paged reads with a live tail

A bare Firestore `limit()` returns the first N documents by id order and silently drops the
rest — indistinguishable from lost money. History is therefore paged (500 per page), and a
separate recent-expense subscription keeps the top of the list live without re-reading
everything. Truncation is surfaced to the user rather than hidden.

### Settlement planner

`lib/settlement.ts` is one pure function shared by both local and cloud paths. Two divergent
loops once meant the same debt could settle against different expenses depending on whether
you were signed in. Because a share is marked paid in full or not at all, a small debt can
need more than one round — the planner returns both the settled total and whatever remains, and
the UI says *"Partly settled — X still to pay"* rather than falsely claiming success.

---

## Security model

Cloud authorisation lives entirely in `firestorerules.txt`. The notable constraints:

- **Adding yourself is the only way into a wallet.** `members` may only be extended with the
  caller's own uid, so nobody can add another person by name. Shared wallets are joined by
  redeeming an invite code; guest wallets are the only ones you can add people to by name.
- **Member names are written by each member, for themselves.** The `members` array and the
  `memberProfiles` map are separate collections because the rules require two distinct write
  shapes, and a join has to perform both.
- **A retry after a partial join still records your name.** Returning "already a member"
  without writing the profile left the second person permanently displaying as *"Someone"*.
- **The account is the only trusted identity.** Display names come from the auth token, never
  from client-supplied data.
- Deleting your account removes your wallets, expenses, and categories, and signs you out.

---

## Design system

Calm and typographic. A near-monochrome surface ramp does the structural work, one restrained
accent is reserved for the single most important action on a screen, and hierarchy comes from
type scale and space rather than from colour. The earlier palette used emerald for the FAB, the
active chip, the status badge, the budget bar, the tick, and the settle button — with
everything accented, nothing was.

All tokens live in `src/lib/tokens.ts` with a light and a dark value. Screens read semantic
names (`surface`, `textSecondary`, `negative`) and never a hex, so a theme switch is a token
swap rather than a rewrite.

Destructive actions live in their own `DangerZone` block at the bottom of Settings, never
adjacent to something you might do by accident.

---

## Testing

```bash
cd mobile
npm run typecheck   # tsc --noEmit
npm test            # vitest
npx expo-doctor     # dependency compatibility
```

120 unit tests cover the parts where a silent wrong answer costs money: exact equal-share
rounding, debt derivation, the settlement planner, invite-code generation, and the Firestore
join write sequence checked against mocked rules.

CI runs the type check, the tests, `expo-doctor`, and a real Gradle `assembleDebug` to catch
native breakage. The Gradle step generates the native project with `expo prebuild` first, and
writes a placeholder `google-services.json` — both are gitignored, and a fresh runner has
neither.

---

## Release

```bash
cd mobile
./release.sh
```

Requires a keystore at `mobile/keystore/release.keystore` with the matching
`mobile/keystore/keystore.properties`, and `mobile/android/app/google-services.json`. Both live
outside the gitignored `android/` directory because prebuild recreates that directory on every
run; the script copies them back in. Signing is applied by a config plugin
(`plugins/withReleaseSigning.js`) so it survives a prebuild, which a post-prebuild patch does not.
The script verifies the resulting certificate fingerprint and refuses to ship a debug-signed APK.

The shipped APK is arm64-v8a only (~39 MB), covering every device from roughly 2017 onward. The
same script also produces an all-ABI AAB for the Play Store.

---

## Store release status

Full step-by-step instructions for uploading to Google Play are in
[PLAY_STORE.md](PLAY_STORE.md). Store images live in `store-assets/`.



Audited against Google Play requirements. The build clears the technical bar: `targetSdk` 36
(exceeds the API 35 minimum), `minSdk` 24, an AAB that builds with all four ABIs, and a stable
release key so updates install in place.

Two things were fixed during the audit:

- **`SYSTEM_ALERT_WINDOW` was in the shipped manifest.** It came from `expo-dev-client`'s config
  plugin on every prebuild. Play treats it as a restricted permission requiring prominent
  disclosure, and an expense tracker has no use for drawing over other apps. Also removed two
  unused legacy storage permissions. All three are now blocked in `app.json`, so the release
  requests eight permissions: internet, vibrate, wake lock, network state, biometrics, and the
  three Google/Firebase internals. Nothing else.
- **`expo-dev-launcher` was compiled into the release binary**, with an `exp+kharcha-bachau`
  deep link registered in production. That is the surface which can load a JavaScript bundle
  from a URL — not something a finance app should ship. The dependency is removed; the release
  build contains no launcher classes and no dev scheme.

Prepared for submission:

- `store-assets/` — 8 phone screenshots at exactly 1080×1920 (9:16) and a 1024×500 feature
  graphic, generated from the real app in guest mode with sample data that was cleared
  afterwards so no personal ledger was ever exposed.
- `pages/Privacy.tsx` — rewritten to cover sign-in, sign-out, what is *not* collected, a data
  inventory that maps onto Play's Data Safety categories, and a working contact email.
- `versionCode` 1 / `version` 1.0.0 is correct for the first release. Increment `versionCode`
  for every upload after this one.

Still to do by hand in Play Console (nothing left in code): create the $25 developer account,
paste the store listing and answers from `PLAY_STORE.md`, and upload the `.aab`.

## Known gaps

- **iOS is untested.** The code is cross-platform but has only ever been run on Android, and
  iOS cannot be built on Linux. The platform branches are deliberate and documented, every
  `Modal` has an `onRequestClose`, and shadows carry both `elevation` and the iOS shadow
  properties — but that is a review, not a run.
- **Onboarding is not localisable.** Copy is inline English despite the Nepali name.
- **Signing in on a second device merges that device's unsynced local expenses into the
  account.** The guest-to-cloud migration is per device and does not know another device
  already holds those rows, so expenses logged on a phone while signed out appear in the
  account the first time that phone signs in. Correct as rescue, surprising as arithmetic.
- **Restoring a file re-creates wallets you previously deleted.** A restore matches wallets by
  name, so a wallet absent from the account at the time is recreated rather than skipped.

### Verified on device

- **Samsung Galaxy Tab A8** (`SM-X200`, 1200×1920, Android) — the full build.
- **Samsung Galaxy S24 Ultra** (`SM-S928B`, 1440×3120, 360×780 dp, Android 16) — narrow-screen
  pass over onboarding, Home, the budget card, both Add Expense steps, Edit, the wallet sheet,
  Settings, light and dark themes, plus tap, drag and save behaviour. Cold start 222 ms on a
  release build.

---

Built in Nepal 🇳🇵 · usable anywhere.