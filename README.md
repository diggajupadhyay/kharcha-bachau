# Kharcha Bachau — Expense Tracker 🇳🇵

**Kharcha Bachau** (खर्च बचाउ — "save expenses" in Nepali) is a Progressive Web App for
daily expense tracking, built for Nepal. It works offline, stores data on your device by
default, and can optionally sync to the cloud and be shared with a household or travel
group.

| Status | Stack | Version |
|--------|-------|---------|
| Beta | React 18 + TypeScript + Tailwind v4 + Firebase | see `package.json` |

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Security model](#security-model)
- [Quick start](#quick-start)
- [Deployment](#deployment)
- [Project structure](#project-structure)
- [State management](#state-management)
- [Data model](#data-model)
- [Testing](#testing)
- [Known gaps](#known-gaps)

---

## What it does

### Core
- **Works without an account.** Expenses are written to `localStorage`. No sign-up.
- **Optional cloud sync.** Google sign-in migrates local expenses into a Firestore
  personal wallet and keeps them in sync across devices.
- **Offline-capable.** Workbox precaches the app shell; Firestore keeps a persistent
  IndexedDB cache for signed-in users.

### Expense tracking
- Category grid — 9 defaults, plus custom categories with an emoji
- On-screen numeric keypad (9-digit cap, 2 decimal places)
- Quick Add via the floating action button, with category search
- Per-expense date, capped at today
- Free-text note (500 characters)

### Wallets
- **Personal wallets** — single user, cannot be shared
- **Shared wallets** — joined with a 6-character invite code
- Instant switching via the wallet selector

### Splitting (shared wallets only)
- Equal split between selected members
- "Who paid" selection
- Balance summary showing who owes whom
- Settle a debt, and undo a settlement you recorded

### Budget
- Per-wallet monthly limit, synced to the wallet document
- Progress bar on the History screen

### History
- Grouped by date, with Today / Yesterday headers
- Search by note, category or amount
- Quick filters: Today, Yesterday, Month, All
- Paginated 50 at a time
- Delete with a 7-second undo
- Tap any row to edit its amount or note

### Data portability
- CSV export
- Full JSON backup and restore, with per-row validation on import

---

## Architecture

**There is no backend.** This is a client-side SPA talking directly to Firebase. All
authorization and validation lives in `firestorerules.txt`.

```
index.tsx → App.tsx → BrowserRouter → ErrorBoundary
                                       └── AuthProvider      (Firebase Auth + guest identity)
                                            └── StoreProvider (wallets, expenses, budget, toasts)
                                                 └── AppContent
                                                      ├── InstallPrompt / OfflineBanner
                                                      ├── ToastContainer / UpdatePrompt
                                                      ├── <Routes>
                                                      └── Fixed footer nav + FAB
```

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `Tracker` | Category grid, month/today totals, balance summary |
| `/history` | `History` | Expense list, search, filters, budget bar |
| `/settings` | `SettingsPage` | Account, wallets, categories, budget, backup, danger zone |
| `/privacy` | `Privacy` | Static privacy policy |

### Data layer

`services/storageService.ts` is the single API; every function branches on `user.type`.

```
guest → localStorage                (synchronous, this device only)
user  → Firestore                   (onSnapshot subscriptions, persistent cache)
```

Anything touching an unbounded set of documents goes through `commitInChunks` — a
Firestore batch is capped at 500 writes and fails as a whole beyond that.

---

## Security model

Every rule lives in `firestorerules.txt`. Points worth knowing before changing it:

- **`/invites` is never listable.** `allow get` only. A blanket `allow read` would let
  any signed-in user enumerate every invite code, and therefore join every shared
  wallet in the database. Clients resolve a wallet's own code via
  `wallets/{id}.inviteCode`.
- **Joining is locked to one operation.** `isValidWalletJoin()` requires
  `affectedKeys().hasOnly(['members'])`, that existing members are preserved, and that
  the array grows by exactly one. Without those, a "joiner" could rewrite `ownerId`
  and evict everyone.
- **Settlement writes cannot alter the split.** `isSettlementShapedUpdate()` pins
  `splitType`, `paidBy` and `participants`, so recording a settlement cannot double as
  a way to change who owes what.
- **Members publish only their own display name** into `memberProfiles`.
- Personal wallets (`isPersonal: true`) can never be joined or shared.

Run the rules against the emulator before deploying:

```bash
firebase emulators:start --only firestore
firebase deploy --only firestore:rules --dry-run   # compile check
```

---

## Quick start

```bash
npm install
cp .env.example .env        # then fill in your Firebase config
npm run dev
```

`.env` must define:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
# Optional: endpoint for production crash reports (see components/ErrorBoundary.tsx).
# Whatever host you use must also be added to connect-src in firebase.json.
VITE_ERROR_REPORT_URL=
```

> Firebase config keys are public in client-side apps. Security comes from the
> Firestore rules, not from hiding these.

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server on `localhost:5173` |
| `npm run build` | `tsc` type check, then `vite build` |
| `npm run test` | Vitest suite |
| `npm run preview` | Serve the production build locally |
| `npm run deploy:rules` | Deploy Firestore rules only |
| `npm run deploy` | Full Firebase deploy |

---

## Deployment

```bash
npm run build
npm run deploy:rules     # deploy rules first if they changed
npm run deploy
```

Hosting headers (CSP, HSTS, `X-Frame-Options`, `nosniff`) are configured in
`firebase.json`. If you add a third-party service, its origin must be added to
`connect-src` or the browser will block it.

---

## Project structure

```
App.tsx                    Root layout, providers, router, bottom nav
index.tsx                  Entry point

pages/                     Route components (Tracker, History, SettingsPage, Privacy)
components/                Shared UI — modals, dialogs, banners, error boundary
context/
  AuthContext.tsx          Firebase auth + guest identity
  StoreContext.tsx         Global store
services/
  firebase.ts              Firebase init (throws if config is missing)
  storageService.ts        Unified data layer, guest + cloud
  backupService.ts         JSON export/import + per-row validation
  csvService.ts            CSV export
  notificationService.ts   Budget/settlement/daily alert logic
hooks/                     useCurrentDate, useFocusTrap, usePWAInstall
utils/
  balances.ts              Member balance calculation
  memberNames.ts           uid → display name resolution
  localData.ts             localStorage keys + cleanup (no Firebase import)
  split.ts, date.ts, currencyFormatter.ts, categoryIcons.ts
types.ts                   All interfaces
firestorerules.txt         Firestore security rules
```

---

## State management

**AuthContext** — `user`, `isLoading`, `signInWithGoogle`, `logout`,
`continueAsGuest`, `deleteAccount`. A guest is a random UUID in `localStorage`, not a
Firebase anonymous user.

**StoreContext** — wallets, active wallet, expenses, budget, custom categories, toasts,
`pendingGuestExpenses` / `retryGuestSync` for an incomplete migration.

Two ordering constraints in `StoreContext`, both load-bearing:

1. The notification helpers are declared **before** any effect that lists them as a
   dependency. Dependency arrays are evaluated during render, so a later `const` would
   be in the temporal dead zone.
2. The wallet-cache effect never writes an empty array. It also runs on mount, when
   `wallets` is still `[]`, and would otherwise erase the offline fallback before the
   loader could read it.

---

## Data model

```
wallets/{walletId}
  id, name, ownerId, members[], currency, createdAt
  isPersonal?      true = cannot be shared or joined
  budget?          monthly limit
  inviteCode?      write-once, 6 chars
  memberProfiles?  { uid: displayName }

wallets/{walletId}/expenses/{expenseId}
  id, walletId, categoryId, categoryName, categoryEmoji
  amount, note, date (YYYY-MM-DD)
  createdBy { uid, name }, createdAt
  splitDetails? { splitType: 'equal', participants[], paidBy, settlements[] }

invites/{CODE}     walletId, createdAt          — get only, never listable
users/{userId}     name, email, customCategories[], createdAt  — self only
```

---

## Testing

```bash
npm run test
```

| File | Covers |
|------|--------|
| `tests/balances.test.ts` | Member balance calculation across split types and settlements |
| `tests/money.test.ts` | Currency formatting and amount edge cases |
| `tests/backupService.test.ts` | Backup merge and de-duplication |

Note that `tsconfig.json` excludes `tests/`, so test files are not type-checked.

**The largest testing gap is the security rules**, which are the entire authorization
model and have no automated coverage. Rules changes have so far been verified by
driving the Firestore emulator over its REST API. Moving that into
`@firebase/rules-unit-testing` and CI is the highest-value work remaining.

---

## Known gaps

- **No CI.** No automated type check, test run or dependency audit on push.
- **No rules test suite.** See above.
- **No linter configured.**
- **Notification subsystem is unmounted.** `NotificationCenter`, `NotificationBell` and
  `NotificationUIContext` are complete but not rendered anywhere, so budget alerts never
  reach the user. `StoreContext` still computes them on a 5-minute interval.
- **`AuthModal` is mounted but never opened.** Sign-in happens from Settings only.
- **Budget is not shown on the home screen** — only on History.
- **Unused dependencies:** `jspdf`, `jspdf-autotable` (PDF export was removed) and
  `vite-plugin-static-copy`.
- **Firebase loads eagerly** (~146 kB gzipped) even in guest mode, which never uses it.
- **`cleanupDuplicatePersonalWallets`** exists to repair duplicate wallets caused by a
  failed-read path that has since been fixed; it should be removable.
- Expense list is not virtualized (paginated at 50 instead).
- Editing a `custom` split preserves original per-person amounts; only `equal`
  recalculates.

---

## License

Free & open. Built for Nepal.

**© 2024-2026 Kharcha Bachau**
