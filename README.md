# Kharcha Bachau v0.4-beta — Smart Expense Tracker 🇳🇵

**Kharcha Bachau** (खर्च बचाउ — "Save Expenses" in Nepali) is a **Progressive Web App** for daily expense tracking, purpose-built for Nepal. It works offline-first, supports multi-wallet groups, expense splitting, and cloud sync via Firebase.

| Status | Stack | License |
|--------|-------|---------|
| Public Beta | React 18 + TypeScript + Tailwind v4 | Free |

---

## Table of Contents

- [Features](#-features)
- [Screenshots / Pages](#-screenshots--pages)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Quick Start](#-quick-start)
- [Deployment Guide](#-deployment-guide-firebase-hosting)
- [Development Guide](#-development-guide)
- [Project Structure](#-project-structure)
- [State Management](#-state-management)
- [Data Flow](#-data-flow)
- [Key Design Decisions](#-key-design-decisions)
- [Testing](#-testing)
- [Troubleshooting](#-troubleshooting)
- [Known Issues](#-known-issues)

---

## 🚀 Features

### Core
- **Offline-First (Guest Mode):** All data persisted to `localStorage`. No account required.
- **Cloud Sync:** Optional Google sign-in syncs data via Firestore across devices.
- **Guest → Cloud Migration:** One-click backup migrates all local expenses to a Firestore personal wallet.

### Expense Tracking
- **Category Grid** — 9 defaults (Food, Transport, Shopping, Bills, Health, Education, Fun, Rent, Other) + unlimited custom categories with emoji/color
- **Virtual Numeric Keypad** — custom on-screen keypad with haptic feedback, decimal support, 9-digit cap
- **Quick Add** — FAB button opens category picker → directly opens add form
- **Tags** — up to 5 per expense, auto-suggest from existing tags, 20-char max
- **Transport Details** — from/to location + passenger count (only for Transport category)
- **Date Picker** — today/yesterday/custom date per expense

### Wallets
- **Multi-Wallet** — separate expense streams (e.g. "Home", "Trip", "Office")
- **Personal Wallets** — single-user, no sharing
- **Group Wallets** — invite-code-based sharing for roommates/travel groups
- **Wallet Switching** — instant switch between wallets via bottom-sheet selector

### Expense Splitting
- **Equal Split** — divides total evenly among selected members
- **Percentage Split** — custom percentages per member (must sum to 100%)
- **Custom Split** — arbitrary per-person amounts (must sum to total)
- **Who Paid** — designate which member paid
- **Settlement Tracking** — mark debts as settled, track unpaid amounts
- **Smart Recalculation** — editing amount of a split expense auto-recalculates equal/percentage shares

### Budgeting
- **Monthly Budget** — per-wallet configurable limit
- **Progress Bar** — visual indicator with color change at over-budget
- **Over-Budget Alert** — shows exact overshoot amount
- **Month-over-Month Comparison** — percentage change vs. previous month

### History & Filtering
- **Grouped by Date** — expenses shown under "Today", "Yesterday", or date headers
- **Search** — by note, category name, amount, or tags
- **Quick Date Filters** — Today, Yesterday, Month, All
- **Advanced Filter Modal** — date range (presets + custom), category, tags, amount range
- **Pagination** — loads 50 at a time with "Show more"
- **Delete with Undo** — 7-second undo window after deletion
- **Inline Edit** — tap any expense to edit amount, note, tags, transport details

### Data Export
- **PDF Report** — styled report with summary + table via jsPDF
- **CSV Export** — UTF-8 BOM for Excel compatibility
- **Full JSON Backup** — export all data (expenses, wallets, budget, categories)
- **Import Backup** — replace or merge existing data, with preview

### Notifications
- **Budget Alerts** — warning at 80%, critical at 90%, exceeded at 100%
- **Settlement Reminders** — unpaid debt reminders
- **Daily Reminder** — nudge at 6 PM if no expense logged today
- **Notification Preferences** — toggle each type independently

### PWA
- **Install Prompt** — Android (beforeinstallprompt) + iOS Safari guidance
- **Service Worker** — cache-first strategies for assets, offline support
- **Responsive** — mobile-first with desktop breakpoints up to 2xl
- **Safe Area Insets** — full notch/status bar support on modern devices

---

## 📱 Screenshots / Pages

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `Tracker` | Daily/monthly overview, category grid, budget bar |
| `/history` | `History` | Filterable expense list, search, delete/undo, settlement summary |
| `/settings` | `SettingsPage` | Account, wallets, categories, budget, export/backup, danger zone |
| `/privacy` | `Privacy` | Static privacy policy |

---

## 🏗 Architecture

### Component Tree

```
index.tsx
└── App.tsx
    └── BrowserRouter
        └── ErrorBoundary
            └── AuthProvider
                └── StoreProvider
                    └── NotificationUIProvider
                        └── AppContent
                            ├── InstallPrompt
                            ├── OfflineBanner
                            ├── ToastContainer
                            ├── <Routes>
                            │   ├── / → Tracker
                            │   ├── /history → History
                            │   ├── /settings → SettingsPage
                            │   └── /privacy → Privacy
                            ├── NotificationCenter (lazy)
                            ├── QuickAddModal
                            └── Fixed Footer (FAB + Nav)
```

### Context Hierarchy

```
AuthContext          — user, login/logout, guest mode
  └── StoreContext   — expenses, wallets, categories, budget, notifications
       └── NotificationUIContext — notification center open/close
```

### Data Layer

```
storageService.ts  (unified API — branches on user.type)
├── Guest Mode     → localStorage (sync read/write)
└── Cloud Mode     → Firestore (real-time onSnapshot subscriptions)
     ├── wallets/          — wallet documents
     ├── wallets/{id}/expenses/ — subcollection per wallet
     ├── invites/          — invite code docs
     └── users/{id}        — user profile + custom categories
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React 18.3 |
| **Language** | TypeScript 5.7 (strict mode) |
| **Build** | Vite 5.4 |
| **Styling** | Tailwind CSS v4 (CSS-first config, no `tailwind.config.js`) |
| **Routing** | react-router-dom 6.30 |
| **Backend** | Firebase 12 (Auth + Firestore) |
| **Icons** | lucide-react |
| **PDF** | jspdf + jspdf-autotable |
| **Dates** | date-fns |
| **Testing** | Vitest 4 |
| **PWA** | Custom service worker (`sw.js`) + `manifest.json` |

---

## ⚡ Quick Start

```bash
# 1. Clone & install
npm install

# 2. Create .env (see Deployment Guide below)
# 3. Start dev server
npm run dev

# 4. Build for production
npm run build
```

---

## 🚀 Deployment Guide (Firebase Hosting)

### Prerequisites

```bash
npm install -g firebase-tools
```

### Step 1: Environment Setup

Create `.env` in the project root:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

> Firebase config keys are public in client-side apps. Security is enforced by Firestore Security Rules (`firestorerules.txt`).

### Step 2: Deploy Firestore

```bash
# Security rules
firebase deploy --only firestore:rules

# Composite indexes
firebase deploy --only firestore:indexes

# Or both at once
npm run deploy:firestore
```

### Step 3: Build & Deploy

```bash
npm run build
firebase login
npm run deploy
```

Your app will be live at `https://<project-id>.web.app`.

> **Important:** If you see "index required" errors, deploy indexes first. Index creation takes a few minutes.

---

## 💻 Development Guide

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (HMR at `localhost:5173`) |
| `npm run build` | `tsc --noEmit` + `vite build` |
| `npm run test` | Run Vitest test suite |
| `npm run preview` | Preview production build locally |

### Code Style

- **Components:** PascalCase filenames, default export with `React.memo()`
- **Hooks:** `usePascalCase`, exported as named functions
- **Services:** PascalCase files with named exports
- **Utils:** Pure functions, no side effects
- **Types:** Centralized in `types.ts`
- **Imports:** Use `@/` alias (maps to project root)

### Conventions

- All modals accept `isOpen` / `onClose` props with early return pattern (`if (!isOpen) return null`)
- Focus is trapped inside open modals via `useFocusTrap` hook
- Safe area insets via inline `style` with `env(safe-area-*)` on every page/modal
- No CSS modules or CSS-in-JS — pure Tailwind utilities + inline styles
- Tailwind v4 CSS-first config in `src/index.css` (no `tailwind.config.js`)

---

## 📁 Project Structure

```
kharcha-bachau/
├── App.tsx                    # Root layout, providers, router, nav
├── index.tsx                  # Entry point + SW registration
├── index.html                 # HTML shell (PWA meta, fonts)
├── manifest.json              # PWA web app manifest
├── sw.js                      # Service Worker (cache strategies)
│
├── pages/                     # Route-level page components
│   ├── Tracker.tsx            #  /  — dashboard, category grid
│   ├── History.tsx            #  /history  — expense list, search, filters
│   ├── SettingsPage.tsx       #  /settings — account, wallets, export
│   └── Privacy.tsx            #  /privacy  — static privacy policy
│
├── components/                # Shared/reusable UI
│   ├── AddExpenseModal.tsx    # Full expense form with keypad, split, tags
│   ├── EditExpenseModal.tsx   # Edit amount, note, tags, transport
│   ├── QuickAddModal.tsx      # Category picker → AddExpenseModal
│   ├── FilterModal.tsx        # Advanced date/category/tag/amount filters
│   ├── BalanceSummary.tsx     # Group debt visualization + settle
│   ├── WalletSelector.tsx     # Wallet list, create, join
│   ├── CategoryManager.tsx    # CRUD for custom categories
│   ├── AuthModal.tsx          # Google sign-in prompt
│   ├── ConfirmDialog.tsx      # Destructive confirmation dialog
│   ├── NotificationCenter.tsx # In-app notification inbox
│   ├── NotificationBell.tsx   # Bell icon with unread badge
│   ├── Toast.tsx              # Toast notification container
│   ├── OfflineBanner.tsx      # Offline status banner
│   ├── InstallPrompt.tsx      # PWA install banner (Android + iOS)
│   ├── Skeleton.tsx           # Loading placeholders (3 variants)
│   └── ErrorBoundary.tsx      # Class-based error boundary
│
├── context/                   # React Context providers
│   ├── AuthContext.tsx         # Firebase auth + guest mode
│   ├── StoreContext.tsx        # Global store (expenses, wallets, etc.)
│   └── NotificationUIContext.tsx  # Notification panel open/close
│
├── services/                  # Business logic & external integrations
│   ├── firebase.ts            # Firebase app initialization
│   ├── storageService.ts      # Unified data layer (guest + Firestore)
│   ├── notificationService.ts # Budget/settlement/daily notification logic
│   ├── backupService.ts       # JSON backup export/import/merge
│   ├── csvService.ts          # CSV file generation
│   └── pdfService.ts          # PDF report generation (jsPDF)
│
├── hooks/                     # Custom React hooks
│   ├── useCurrentDate.ts      # Date with midnight recalculation
│   ├── useFocusTrap.ts        # Modal focus management
│   └── usePWAInstall.ts       # PWA beforeinstallprompt handler
│
├── utils/                     # Pure utility functions
│   ├── balances.ts            # Member balance calculation from split expenses
│   ├── split.ts               # Split sum validation
│   ├── date.ts                # Local-time ISO date string
│   └── currencyFormatter.ts   # Hardcoded Rs. symbol
│
├── types.ts                   # All TypeScript interfaces
├── constants.ts               # Default expense categories
├── src/index.css              # Tailwind v4 entry + custom utilities/animations
│
├── tests/                     # Unit tests
│   ├── balances.test.ts
│   ├── money.test.ts
│   └── backdupService.test.ts
│
├── public/                    # Static PWA assets
├── firestorerules.txt         # Firestore security rules (263 lines)
├── firestore.indexes.json     # Composite indexes
├── vite.config.ts             # Vite build config (chunk splitting, plugins)
├── vitest.config.ts           # Test runner config
└── tsconfig.json              # TypeScript strict mode config
```

---

## 🔄 State Management

### AuthContext

```
State:
  user: User | null         — { id, name, email, type ('guest'|'user'), createdAt }
  isLoading: boolean        — true during Firebase auth resolution

Actions:
  signInWithGoogle()        — Firebase popup auth
  logout()                  — sign out → fall back to guest
  continueAsGuest()         — create/restore guest from localStorage
  deleteAccount()           — delete Firestore data + auth user → guest
```

### StoreContext

```
State (all useState):
  notifications: Notification[]              — toast queue (auto-dismiss 3s)
  appNotifications: AppNotification[]        — budget/settlement/daily alerts
  readNotificationIds: Set<string>           — persisted to localStorage
  dismissedNotificationIds: Set<string>      — persisted to localStorage
  wallets: Wallet[]                          — user's wallets
  activeWallet: Wallet | null                — currently selected
  expenses: Expense[]                        — active wallet expenses
  budget: number                             — monthly budget (default: 20000)
  customCategories: Category[]               — user-defined categories
  isSyncing: boolean                         — true during Firestore subscription load
  monthlyStats: MonthlyStats                 — derived from expenses

Key Behaviors:
  - Guest mode: localStorage read/write (sync)
  - Cloud mode: Firestore real-time onSnapshot (auto-updates on remote changes)
  - Expenses subscription: new unsubscribe() on wallet switch
  - Derived stats: recalculated via useEffect on expenses change
  - Budget: debounced save (600ms) to prevent Firestore writes on every keystroke
  - Split editing: auto-recalculates equal/percentage amounts on amount change
```

### NotificationUIContext

```
State:
  isOpen: boolean         — notification panel visibility

Actions:
  open(), close()
```

---

## 📊 Data Flow

```
User Action → Component → StoreContext Action → storageService
                                                  ├── Guest: localStorage
                                                  └── Cloud: Firestore setDoc/updateDoc
                                                       └── onSnapshot → auto-updates expenses[]
                                                            └── useEffect → recalculate monthlyStats
                                                                 └── UI re-renders
```

### Firestore Collections

```
wallets/{walletId}
  ├── name: string
  ├── ownerId: string
  ├── members: string[]
  ├── currency: "Rs."
  ├── isPersonal: boolean
  ├── budget: number (optional)
  └── createdAt: number

wallets/{walletId}/expenses/{expenseId}
  ├── categoryId, categoryName, categoryEmoji
  ├── amount, note, date
  ├── createdBy: { uid, name }
  ├── tags?: string[]
  ├── transportDetails?: { passengers, from, to }
  ├── splitDetails?: { splitType, participants[], paidBy, settlements[] }
  ├── createdAt: number

invites/{code}
  ├── walletId: string
  └── createdAt: number

users/{userId}
  ├── name, email
  ├── customCategories: Category[]
  └── createdAt: number
```

---

## 🎯 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **No external state library** | App scope doesn't warrant Redux/Zustand; React Context + useState suffices |
| **Dual storage layer** | Guest mode enables adoption without sign-up friction; cloud sync is opt-in |
| **Real-time Firestore subscriptions** | Automatic cross-device sync without manual refresh |
| **Firestore subcollections** (expenses under wallets) | Scalable: each wallet's expenses are an independent subcollection |
| **Custom numeric keypad** | Better UX on mobile than native number input; avoids OS keyboard quirks |
| **`writeBatch` for bulk operations** | Atomic batch writes for wallet deletion, sync, and merge (max 500 per batch) |
| **LocalStorage for guest** | Simple, zero-infrastructure; acceptable for single-device use |
| **No virtualization** | Pagination (50-at-a-time) is sufficient for typical personal expense volume |
| **Tailwind v4 CSS-first** | No config file needed; `@theme` directive in CSS keeps everything co-located |
| **Pagination reset on filter change** | Simplifies state management; acceptable trade-off for this app's scope |

---

## 🧪 Testing

```bash
npm run test
```

### Test Files

| File | Tests | What it covers |
|------|-------|----------------|
| `tests/balances.test.ts` | 8 | Member balance calculation for all split types + settlements |
| `tests/money.test.ts` | 6 | Currency formatting, amount validation, edge cases |
| `tests/backdupService.test.ts` | 4 | Backup merge logic (deduplication by ID) |

### Testing Approach

- **Vitest** with no DOM environment (pure logic tests)
- Focus on utility functions and data transformation logic
- UI components are not unit-tested (covered by manual QA)
- Firestore integration is not mocked (tested via deployment)

---

## 🔧 Troubleshooting

### Common Issues

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| "Missing required Firebase env variables" | `.env` missing or incomplete | Create `.env` with all `VITE_FIREBASE_*` keys |
| "Permission denied" | Security rules not deployed | Run `firebase deploy --only firestore:rules` |
| "Index required" | Query needs composite index | Run `firebase deploy --only firestore:indexes` |
| Data not syncing across devices | Still in guest mode | Sign in with Google |
| Google Sign-In fails | Provider not enabled in Firebase Console | Enable Google auth in Firebase Console |
| Popup blocked by browser | Popup blocker | Allow popups for this site |

### Debug Mode

In development (`npm run dev`), the app logs to browser console:
- Firestore operations (create, read, update, delete)
- Auth state changes
- Error details with error codes
- Data sync operations

### Getting Help

Check browser console → verify deployment steps → review Firebase Console → inspect Firestore rules.

---

## ⚠️ Known Issues

### Current Release (v0.4-beta)

- **Expense list not virtualized** — users with 1000+ expenses may see performance degradation. Paginated at 50 per page as a partial mitigation.
- **Custom split editing** — editing the amount of a `custom` split expense preserves original per-person amounts (only `equal` and `percentage` splits auto-recalculate). Users should delete and re-add for custom split adjustments.
- **No offline wallet cache** — authenticated users who open the app offline won't see their wallet list. Firebase `onSnapshot` provides cached data for expenses, but wallet metadata isn't cached client-side.
- **Firestore subscription dead on error** — a single subscription error stops the real-time listener permanently until the user navigates away and back.
- **Sequential import** — bulk import uses individual `setDoc` calls (not `writeBatch`) for reliability across large imports, trading speed for correctness.

### Fixed in This Release

| Issue | Fix |
|-------|-----|
| `BrowserRouter` inside providers caused full re-renders on context change | Moved to top-level `App` wrapper |
| Editing split expense amount silently corrupted participant data | Auto-recalculates equal/percentage splits |
| Budget input triggered Firestore write on every keystroke | 600ms debounce added |
| AddExpenseModal had no animation (all other modals animate) | Added `animate-slide-up-bottom` |
| Guest banner permanently visible with no dismiss option | Added dismiss button + localStorage |
| Closing AddExpenseModal with data silently discarded everything | Confirm dialog on unsaved data |
| `handleSubmit` didn't await `addExpense` — modal closed on failure | Now awaits and keeps modal open on error |
| Undo snackbar used fade-in instead of slide-up | Changed to `animate-slide-up-bottom` |
| Unused dead code (`pageCount`, `veggie_nepal` migration, `country` cleanup) | Removed |
| `NotificationBell` not wrapped in `React.memo()` | Wrapped |
| `getMemberName` fallback showed raw user ID | Shows "Member xyz4" instead |

---

## 📄 License

Free & open. Built for Nepal.

---

**© 2024-2026 Kharcha Bachau**