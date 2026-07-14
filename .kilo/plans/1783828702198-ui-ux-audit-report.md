# UI/UX Audit Report — Kharcha Bachau (v0.4-beta)

**Scope:** Front-end audit of `Kharcha Bachau`, a React 18 + TypeScript + Tailwind + Firebase expense tracker (PWA).
**Method:** Static review of `App.tsx`, all pages (`Tracker`, `History`, `Stats`, `SettingsPage`), modals (`AddExpenseModal`, `QuickAddModal`, `WalletSelector`, `AuthModal`, `NotificationCenter`, `FilterModal`), shared panels (`AnalyticsPanel`, `BalanceSummary`), global CSS, and `index.html`.
**Goal:** Identify issues in visual design, navigation/UX flow, usability, accessibility, and aesthetic cohesion, with impact and actionable fixes.

---

## 1. Executive Summary

The app has a **cohesive, well-built mobile-first design system** (consistent cards, rounded corners, slate/emerald palette, 44px touch targets, safe-area handling, focus rings). However, several **high-impact defects** undermine the experience:

- 🔴 **The entire Stats screen is unreachable** — there is a `/stats` route but no nav item links to it.
- 🔴 **The "Filters" button is permanently highlighted** (green/active) regardless of filter state — a broken UI state indicator.
- 🟠 **Top-right controls collide** on the Home screen (floating notification bell overlaps the Settings button).
- 🟠 **The "vs Last Month" label is grammatically broken and direction-ambiguous**.
- 🟡 Various minor color-copy-typography inconsistencies and accessibility gaps (no `h1`, Space-key support, `lang="en"` for a Nepali app).

**Priority order:** Fix unreachable Stats + redundant analytics → fix broken Filters state → resolve header collision → fix Stats copy → address a11y gaps → polish tokens/z-index.

---

## 2. Navigation & Information Architecture

### 2.1 🔴 Stats page is unreachable (Critical)
- `App.tsx:67` defines `<Route path="/stats" element={<Stats />} />`, and `Stats.tsx` exists and is fully built.
- `App.tsx:84-103` bottom navigation only contains **Home, History, Settings** — there is **no NavLink to `/stats`**.
- **Impact:** The complete analytics feature (budget vs last month, group balances, category/tag charts) is dead/unreachable. Users can never open it. Wasted build effort and a confusing "half" app.
- **Recommendation:** Either (a) add a 4th nav item "Stats" (consider icon `BarChart3`), or (b) if Stats is meant to be merged, remove the route. Decide the IA deliberately rather than leaving it orphaned.

### 2.2 🟠 Duplicated analytics surface
- `AnalyticsPanel` (pie chart + category breakdown + tag breakdown) is rendered **identically** on both the History tab (`History.tsx:386`) and the Stats tab (`Stats.tsx:90`).
- **Impact:** If Stats becomes reachable, users see the same charts twice → redundancy/confusion about which screen is "the" analytics screen.
- **Recommendation:** Define one canonical home for charts. Keep `AnalyticsPanel` on Stats (the analytics destination) and remove it from History, OR keep a compact version on History and the full version on Stats. Document the split.

### 2.3 🟡 Two parallel "Quick Add" entry points with identical labels
- Home category grid is labeled **"Quick Add"** (`Tracker.tsx:97`); the floating `+` opens `QuickAddModal` also titled **"Quick Add"** (`QuickAddModal.tsx:56`).
- **Impact:** Mild naming collision; both lead to the same category→`AddExpenseModal` flow. Users may wonder which to use.
- **Recommendation:** Differentiate labels (e.g., Home grid = "Categories", FAB modal = "Add Expense") or consolidate into one entry point.

---

## 3. Visual Design

### 3.1 Color consistency
- ✅ Good: semantic use of **rose = spending/over-budget/more-than-last-month**, **emerald = under-budget/less/positive** is consistent across `History`, `Stats`, `AnalyticsPanel`.
- 🟠 **"Filters" button always shows the active (emerald) state** — `History.tsx:272-282`:
  ```tsx
  className={`... ${advancedFilters ? 'bg-emerald-600 ...' : 'bg-white ...'}`}
  ```
  `advancedFilters` is initialized as an object (`History.tsx:26-31`), so the ternary is **always truthy** → the Filter icon is green even with zero filters applied.
  - **Impact:** Misleads users into thinking a filter is active; erodes trust in UI state indicators.
  - **Recommendation:** Compute an `isFilterActive` flag (e.g., `dateRange.preset !== 'thisMonth'` or categories/tags/amount set) and drive styling from it, matching the already-correct "Tags" button logic right below it.
- 🟡 **Expense-accent color split:** `AddExpenseModal` uses rose as its internal accent (`themeText='text-rose-600'`, submit `bg-rose-600` — `AddExpenseModal.tsx:265-266,368,664`) while the global brand is emerald (`theme-color #10b981`, primary CTAs). The "expense = red" semantic is defensible but undocumented and visually inconsistent with the emerald brand.
  - **Recommendation:** Keep red for amounts/expense semantics (it's consistent with the rose = spending convention) but document it as a deliberate token so the mixed palette reads as intentional.

### 3.2 Typography
- ✅ `Plus Jakarta Sans` loaded; consistent `text-clamp-*` for fluid sizing in `index.css`.
- 🟠 **Broken/ambiguous Stats label** — `Stats.tsx:66-71`:
  ```tsx
  <p className={...}>{trendUp ? 'text-rose-600' : 'text-emerald-600'}>than last month</p>
  ```
  Renders as e.g. **"12% than last month"** — grammatically incorrect and direction-ambiguous; only the arrow/color conveys increase vs decrease.
  - **Impact:** Users can't tell at a glance whether spending went up or down from the text alone.
  - **Recommendation:** Use full phrasing, e.g. `Spent ${pct}% more than last month` / `...less than last month`.
- 🟡 **Hardcoded "Rs."** in `Tracker.tsx:82,90` instead of `getCurrencySymbol()` (used everywhere else). Currently identical, but it's a single-source-of-truth violation and will diverge if currency ever changes.
  - **Recommendation:** Replace with `getCurrencySymbol()`.

### 3.3 Layout & visual hierarchy
- 🟠 **Top-right control collision on Home** — `App.tsx:40-55` renders a **fixed** notification bell (`top-4`, right edge of container, `z-30`), while `Tracker.tsx:57-63` renders its own Settings button at the top-right of the page header. Both occupy the same top-right corner and overlap on mobile (bell spans ~16–60px, Settings button lands in the same zone).
  - **Impact:** Two competing controls stacked/overlapping in one corner; potential tap-target overlap and visual clutter; the bell can visually fight the Settings button.
  - **Recommendation:** Move the notification bell into the page header row (e.g., as a sibling of the Settings button, both inside the centered container, not `fixed`), or offset it and reserve the corner. Make the bell part of the normal document flow per page.
- 🟡 **Inconsistent header semantics:** Home header shows the **wallet name** as its `h2` (`Tracker.tsx:51`), while History/Stats/Settings show the **section title** as `h2`. Mixed mental model for the "top of page."
  - **Recommendation:** Standardize — show section title as `h1/h2`, and wallet name as a secondary sub-label (as History/Stats already do).

---

## 4. User Experience & Friction

### 4.1 Positive patterns
- Undo snackbar with `role="status"` after delete (`History.tsx:512-526`) — good reversible-action pattern.
- Empty states are handled ("No expenses yet" / "No transactions found").
- Custom numeric keypad in `AddExpenseModal` avoids mobile keyboard jank; virtual-keyboard height compensation via `visualViewport` is a nice touch.
- Lazy-loaded routes with `Suspense` fallbacks.

### 4.2 Friction points
- 🟡 **Delete has no confirmation**, only a 5s undo (`History.tsx:202-216`). For an expense tracker this is usually fine, but a mis-tap deletes immediately. The undo relies on the snackbar persisting while the user is scrolled down. Acceptable, but consider a confirm for the "Clear All Data"/"Delete Wallet" (already present) while keeping quick-delete for single items.
- 🟡 **Transaction row is fully tappable (opens edit) with a separate delete button** beside it (`History.tsx:405-481`). On mobile the edit-target and delete-target are adjacent → accidental mis-taps.
  - **Recommendation:** Increase spacing between the card and the delete control, or move delete behind a long-press / swipe, or into the edit modal.
- 🟡 **Adding income is not obvious.** The app tracks "Income & Expense" (README) but the entire UI is "Add Expense" with rose semantics; no visible income entry path in the reviewed flows.
  - **Recommendation:** If income is supported, surface an explicit income toggle/entry; otherwise correct the README claim.

---

## 5. Accessibility

### 5.1 Strengths
- Widespread `focus-visible:ring-2` focus indicators.
- `aria-label` on all icon-only buttons (bell, settings, delete, close).
- 44px minimum tap targets via `.min-tap-target` and explicit `min-h-[44px]`.
- `role="status"` live region for the undo snackbar.
- `role="button"` + `tabIndex={0}` + `Enter` handler on transaction rows (`History.tsx:407-412`).
- Safe-area insets handled throughout.

### 5.2 Issues
- 🟠 **No `h1` / landmark hierarchy.** Pages begin at `h2`; `App.tsx` renders no `h1`. Screen-reader users get no top-level page title.
  - **Recommendation:** Add a visually-hidden `<h1>` per route (or make the page title the `h1`).
- 🟠 **Transaction rows lack Space-key activation.** `History.tsx:411` only handles `Enter`; the ARIA button pattern requires Space as well.
  - **Recommendation:** Add `if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setEditingExpense(item); }`.
- 🟠 **`lang="en"` but app targets Nepal** (`index.html:2`) and uses `ne-NP` number formatting and Bikram Sambat dates. Screen readers will announce English while content is localized; mismatched pronunciation.
  - **Recommendation:** Set `lang` appropriately (e.g., `ne` or `en` consistently) and switch it when the UI language switches.
- 🟡 **Chart accessibility.** The Recharts pie (`AnalyticsPanel.tsx:76-97`) is not keyboard- or screen-reader-friendly. A textual category/tag breakdown list is rendered below it (good fallback), but the pie itself lacks an accessible name/description.
  - **Recommendation:** Add `role="img"` + `aria-label` summarizing the chart, or wrap with an `aria-hidden` pie + guaranteed text alternative.
- 🟡 **Contrast on small emerald text.** `emerald-600` (#059669) on white is ~4.6:1 — passes AA for normal text but is borderline for the tiny `text-[10px]`/`text-xs` labels (e.g., active nav `text-xs`, `text-[10px]` split badges). Verify ≥4.5:1; darken to `emerald-700` for the smallest text.
- 🟡 **`html`/`body` have no `lang`/heading for the loading state** (`App.tsx:29` shows only a spinner) — minor.

---

## 6. Aesthetic Cohesion

- ✅ Strong, consistent design language: white cards, `rounded-xl`, `border-slate-200`, `slate-50` page background, uniform shadows, consistent `hover:bg-slate-100`/`:active:scale-95` micro-interactions, and a coherent animation set (`fadeIn`, `slideUp`, `scaleIn`).
- ✅ Responsive scaling is systematic (`p-4 md:p-5 lg:p-6`, `text-clamp-*`).
- 🟡 **Ad-hoc z-index layering:** import dialog `z-[135]`, modals `z-[140]`, auth `z-[150]`, notifications `z-[160]`. The import dialog (`SettingsPage.tsx:332`) sits *below* the other modals; if a notification arrived while it were open, the notification center would overlay it.
  - **Recommendation:** Define an explicit z-index scale (e.g., `z-modal`, `z-auth`, `z-notification`) as Tailwind tokens.
- 🟡 **Modal drag handles** appear only on mobile (`sm:hidden`) — consistent and correct, just noting it's intentional.

---

## 7. Prioritized Remediation Plan

| # | Severity | Issue | Location | Recommendation |
|---|----------|-------|----------|----------------|
| 1 | 🔴 Critical | Stats route unreachable (no nav item) | `App.tsx:67,84-103` | Add a Stats nav item **or** remove the route; decide IA. |
| 2 | 🔴 High | Analytics duplicated on History & Stats | `History.tsx:386`, `Stats.tsx:90` | Pick one canonical analytics surface. |
| 3 | 🟠 High | "Filters" button always active (green) | `History.tsx:272-282` | Drive style from a real `isFilterActive` check. |
| 4 | 🟠 High | Top-right bell vs Settings collision | `App.tsx:40-55`, `Tracker.tsx:57-63` | Put bell in header flow; stop fixed overlap. |
| 5 | 🟠 Med | "than last month" broken/ambiguous copy | `Stats.tsx:66-71` | "Spent X% more/less than last month". |
| 6 | 🟡 Med | No `h1` / heading landmarks | all pages, `App.tsx` | Add per-route `h1`. |
| 7 | 🟡 Med | Transaction row no Space-key support | `History.tsx:411` | Support Space per ARIA button pattern. |
| 8 | 🟡 Med | `lang="en"` for Nepali app | `index.html:2` | Set/correct `lang`. |
| 9 | 🟡 Low | Hardcoded "Rs." in Tracker | `Tracker.tsx:82,90` | Use `getCurrencySymbol()`. |
| 10 | 🟡 Low | Undocumented rose vs emerald accent split | `AddExpenseModal.tsx:265-266` | Document expense=rose as a token. |
| 11 | 🟡 Low | Pie chart not SR-accessible | `AnalyticsPanel.tsx:76-97` | Add `aria-label`/text alternative. |
| 12 | 🟡 Low | Ad-hoc z-index scale | multiple modals | Define z-index tokens. |
| 13 | 🟡 Low | Two "Quick Add" labels | `Tracker.tsx:97`, `QuickAddModal.tsx:56` | Differentiate or consolidate. |
| 14 | 🟡 Low | Income entry path unclear | whole flow | Surface income or fix README. |

**Suggested rollout:** Ship fixes #1–#5 in one pass (they're the visible, high-impact defects), then #6–#8 for accessibility compliance, then the low-severity polish. No architectural change is required for any of these — all are localized edits.

---

## 8. What's Working Well (keep doing)
- Cohesive card/color/typography system and micro-interactions.
- Reversible delete (undo snackbar).
- Strong focus-visible support and 44px touch targets.
- Safe-area inset handling for notched devices.
- Lazy routes + suspense fallbacks.
- Empty/edge states for filters and no-data.
