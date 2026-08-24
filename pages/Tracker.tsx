import React, { useMemo, useState, useEffect } from 'react';
import { ChevronDown, Search, TrendingUp, Users, X } from 'lucide-react';
import { format, subDays, startOfYear } from 'date-fns';
import EditExpenseModal from '../components/EditExpenseModal';
import WalletSelector from '../components/WalletSelector';
import Skeleton, { TransactionListSkeleton } from '../components/Skeleton';
import BalanceSummary from '../components/BalanceSummary';
import ConfirmDialog from '../components/ConfirmDialog';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { Expense } from '../types';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { getCategoryIcon, parseCategoryColor } from '../utils/categoryIcons';
import { shiftISODate, parseISODate } from '../utils/date';

export interface FilterState {
  dateRange: {
    type: 'preset' | 'custom';
    preset?: 'today' | 'yesterday' | 'thisMonth' | 'lastMonth' | 'last7days' | 'last30days' | 'thisYear' | 'all';
    customStart?: string;
    customEnd?: string;
  };
  categories: string[];
  amountRange: { min?: number; max?: number };
}

interface TrackerProps {
  currentDate: string;
}

// Home: wallet summary plus the full transaction list. These used to be two tabs that
// showed the same numbers twice; adding an expense now happens only through the + in
// the nav bar, so the category grid that used to live here is gone.
const Tracker: React.FC<TrackerProps> = ({ currentDate }) => {
  const {
    expenses, monthlyStats, activeWallet, budget, isSyncing,
    markSettlement, getAllCategories, deleteExpense, restoreExpense, showNotification,
  } = useStore();
  const { user } = useAuth();
  const currencySymbol = getCurrencySymbol();

  const [isWalletSelectorOpen, setIsWalletSelectorOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>({
    dateRange: { type: 'preset', preset: 'thisMonth' },
    categories: [],
    amountRange: {}
  });

  const todayTotal = useMemo(() => expenses
    .filter(e => e.date === currentDate)
    .reduce((s, e) => s + e.amount, 0), [expenses, currentDate]);

  // Includes the member count, because BalanceSummary renders nothing for a shared
  // wallet nobody has joined yet — leaving an empty section's worth of blank space.
  const isGroupWallet = !!activeWallet && !activeWallet.isPersonal && activeWallet.members.length > 1;

  const categoryColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    getAllCategories().forEach(c => { map[c.id] = c.color || 'bg-slate-100 text-slate-700'; });
    return map;
  }, [getAllCategories]);

  const filteredExpenses = useMemo(() => {
    let filtered = expenses;
    const now = new Date();

    if (advancedFilters.dateRange.type === 'preset' && advancedFilters.dateRange.preset) {
      const preset = advancedFilters.dateRange.preset;
      if (preset === 'today') {
        filtered = filtered.filter(e => e.date === currentDate);
      } else if (preset === 'yesterday') {
        // `new Date('YYYY-MM-DD')` parses as UTC midnight while setDate/getDate work
        // in local time, and toISOString converts back to UTC — three frames of
        // reference for one subtraction. In Nepal (UTC+05:45) that landed a full day
        // early, so "Yesterday" showed the day before yesterday.
        filtered = filtered.filter(e => e.date === shiftISODate(currentDate, -1));
      } else if (preset === 'thisMonth') {
        const y = now.getFullYear(), m = now.getMonth();
        const start = `${y}-${String(m+1).padStart(2,'0')}-01`;
        const lastDay = new Date(y, m+1, 0).getDate();
        const end = `${y}-${String(m+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
        filtered = filtered.filter(e => e.date >= start && e.date <= end);
      } else if (preset === 'lastMonth') {
        const lm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const ly = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const start = `${ly}-${String(lm+1).padStart(2,'0')}-01`;
        const lastDay = new Date(ly, lm+1, 0).getDate();
        const end = `${ly}-${String(lm+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
        filtered = filtered.filter(e => e.date >= start && e.date <= end);
      } else if (preset === 'last7days') {
        filtered = filtered.filter(e => e.date >= format(subDays(now, 7), 'yyyy-MM-dd'));
      } else if (preset === 'last30days') {
        filtered = filtered.filter(e => e.date >= format(subDays(now, 30), 'yyyy-MM-dd'));
      } else if (preset === 'thisYear') {
        filtered = filtered.filter(e => e.date >= format(startOfYear(now), 'yyyy-MM-dd'));
      }
    } else if (advancedFilters.dateRange.type === 'custom') {
      if (advancedFilters.dateRange.customStart) filtered = filtered.filter(e => e.date >= advancedFilters.dateRange.customStart!);
      if (advancedFilters.dateRange.customEnd) filtered = filtered.filter(e => e.date <= advancedFilters.dateRange.customEnd!);
    }

    if (advancedFilters.categories.length > 0) {
      filtered = filtered.filter(e => advancedFilters.categories.includes(e.categoryId));
    }
    if (advancedFilters.amountRange.min !== undefined) {
      filtered = filtered.filter(e => e.amount >= advancedFilters.amountRange.min!);
    }
    if (advancedFilters.amountRange.max !== undefined) {
      filtered = filtered.filter(e => e.amount <= advancedFilters.amountRange.max!);
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(e =>
        e.note?.toLowerCase().includes(q) ||
        e.categoryName.toLowerCase().includes(q) ||
        e.amount.toString().includes(q)
      );
    }

    return [...filtered].sort((a, b) => {
      const dc = b.date < a.date ? -1 : b.date > a.date ? 1 : 0;
      if (dc === 0) return (b.createdAt || 0) - (a.createdAt || 0);
      return dc;
    });
  }, [expenses, searchTerm, advancedFilters, currentDate]);

  const PAGE_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchTerm, advancedFilters]);

  const visibleExpenses = useMemo(() => filteredExpenses.slice(0, visibleCount), [filteredExpenses, visibleCount]);
  const hasMore = filteredExpenses.length > visibleExpenses.length;

  const grouped = useMemo(() => {
    const groups: Record<string, typeof visibleExpenses> = {};
    visibleExpenses.forEach(t => {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });
    Object.keys(groups).forEach(date => {
      groups[date] = [...groups[date]].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    });
    const sortedDates = [...Object.keys(groups)].sort((a, b) => b.localeCompare(a));
    const sortedGroups: Record<string, typeof visibleExpenses> = {};
    sortedDates.forEach(date => { sortedGroups[date] = groups[date]; });
    return sortedGroups;
  }, [visibleExpenses]);

  const getDateHeader = (dateStr: string) => {
    if (dateStr === currentDate) return 'Today';
    if (dateStr === shiftISODate(currentDate, -1)) return 'Yesterday';
    // A malformed date on a synced document used to reach `format` as an Invalid
    // Date, which throws a RangeError and takes the whole screen down with it —
    // on every render, so there was no way back out from inside the app.
    const parsed = parseISODate(dateStr);
    return parsed ? format(parsed, 'MMM d, yyyy') : dateStr;
  };

  const canEditExpense = (item: Expense) => {
    if (!user) return false;
    if (user.type === 'guest') return true;
    return item.createdBy?.uid === user.id;
  };

  const handleEditClick = (item: Expense) => {
    if (!canEditExpense(item)) {
      showNotification('error', 'Only the person who added this expense can edit it');
      return;
    }
    setEditingExpense(item);
  };

  const handleDeleteClick = (item: Expense) => {
    if (!canEditExpense(item)) {
      showNotification('error', 'Only the person who added this expense can delete it');
      return;
    }
    setConfirmDelete(item);
  };

  const canUndoDelete = (item: Expense | null) => !!item && (!user || user.type === 'guest' || item.createdBy?.uid === user.id);

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    // Awaited: the Undo snackbar used to appear before the delete had landed, so
    // tapping Undo quickly could re-create the expense and *then* have the delete
    // complete on top of it, losing the entry for good.
    await deleteExpense(target.id);
    setPendingDelete(canUndoDelete(target) ? target : null);
  };

  useEffect(() => {
    if (!pendingDelete) return;
    const timer = setTimeout(() => setPendingDelete(null), 7000);
    return () => clearTimeout(timer);
  }, [pendingDelete]);

  const handleUndo = () => {
    if (pendingDelete) restoreExpense(pendingDelete);
    setPendingDelete(null);
  };

  const clearAllFilters = () => {
    setAdvancedFilters({ dateRange: { type: 'preset', preset: 'thisMonth' }, categories: [], amountRange: {} });
    setSearchTerm('');
  };

  // A custom range has no `preset`, so testing the preset alone reported "no filters
  // active": the chip stayed unlit and "Clear all filters" was hidden while a range
  // was quietly hiding most of the list.
  const hasActiveFilters = advancedFilters.dateRange.type === 'custom' ||
    advancedFilters.dateRange.preset !== 'thisMonth' ||
    advancedFilters.categories.length > 0 ||
    advancedFilters.amountRange.min !== undefined ||
    advancedFilters.amountRange.max !== undefined ||
    searchTerm.length > 0;

  // last7days / last30days / thisYear were implemented in the filter chain but never
  // rendered, so three working presets were unreachable.
  const datePresets = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'last7days', label: '7 days' },
    { key: 'last30days', label: '30 days' },
    { key: 'thisMonth', label: 'This month' },
    { key: 'lastMonth', label: 'Last month' },
    { key: 'thisYear', label: 'This year' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="min-h-full bg-slate-50 overflow-x-hidden" style={{
      paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
      paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
      paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
      paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))'
    }}>
      <div className="px-4 md:px-6 lg:px-8 max-w-2xl mx-auto">

        {/* Header — the wallet name is the only wallet switcher; a second icon button
            beside it opened the very same sheet. */}
        <div className="section flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption mb-1">My Wallet</p>
            <button
              onClick={() => setIsWalletSelectorOpen(true)}
              className="flex items-center gap-2 group min-h-[48px] px-1 -ml-1 rounded-xl hover:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
              aria-label="Switch wallet"
            >
              <h1 className="text-heading text-slate-900 truncate max-w-[200px]">
                {activeWallet ? activeWallet.name : '...'}
              </h1>
              <ChevronDown size={18} className="text-slate-400 group-hover:text-slate-600 transition-colors flex-shrink-0" />
            </button>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            className={`mt-5 min-h-[48px] px-4 rounded-xl text-sm font-semibold flex items-center gap-2 flex-shrink-0 transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 active:scale-95 ${
              hasActiveFilters
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Search size={18} />
            Filters
            {hasActiveFilters && (
              <span className="w-5 h-5 bg-white text-emerald-600 rounded-full text-xs flex items-center justify-center font-bold">!</span>
            )}
          </button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="card section space-y-4">
            <div>
              <label htmlFor="expense-search" className="text-subhead block mb-2">Search</label>
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="expense-search"
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search expenses..."
                  className="input pl-10 pr-10"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600" aria-label="Clear search">
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            <div>
              <p className="text-subhead mb-2">Date Range</p>
              <div className="flex gap-1.5 flex-wrap">
                {datePresets.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setAdvancedFilters(prev => ({ ...prev, dateRange: { type: 'preset', preset: p.key as any } }))}
                    className={`min-h-[44px] px-3.5 rounded-xl text-sm font-medium transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      advancedFilters.dateRange.preset === p.key
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {hasActiveFilters && (
              <button onClick={clearAllFilters} className="text-sm text-slate-500 font-medium hover:text-slate-700 active:scale-95 transition-colors min-h-[44px]">
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Hero card — month total + today, merged into a single glanceable card */}
        <div className="card section">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <p className="text-subhead">This Month</p>
            {budget > 0 && (
              <p className={`text-caption font-semibold ${monthlyStats.currentMonthSpending > budget ? 'text-rose-600' : 'text-emerald-700'}`}>
                {monthlyStats.currentMonthSpending > budget ? 'Over budget' : 'On track'}
              </p>
            )}
          </div>
          <div className="mb-4">
            {isSyncing ? (
              <Skeleton className="h-12 w-40" />
            ) : (
              // Symbol and amount are separate elements: as one string the display
              // scale's negative letter-spacing closed the gap and "Rs." ran into
              // the first digit.
              <p className="text-display text-slate-900 flex items-baseline gap-2 flex-wrap">
                <span className="amount-symbol text-xl font-semibold text-slate-500">{currencySymbol}</span>
                <span>{monthlyStats.currentMonthSpending.toLocaleString()}</span>
              </p>
            )}
          </div>
          {budget > 0 && !isSyncing && (
            <div className="space-y-2 mb-4">
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    monthlyStats.currentMonthSpending > budget ? 'bg-rose-500' :
                    monthlyStats.currentMonthSpending / budget > 0.8 ? 'bg-orange-400' :
                    'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min((monthlyStats.currentMonthSpending / budget) * 100, 100)}%` }}
                />
              </div>
              <p className="text-caption">
                {currencySymbol} {Math.max(0, budget - monthlyStats.currentMonthSpending).toLocaleString()} left of {currencySymbol} {budget.toLocaleString()}
              </p>
            </div>
          )}
          {/* Today as an inline stat instead of its own card: one less box to scan */}
          <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
            <TrendingUp size={18} className="text-slate-500" />
            <p className="text-subhead">Today</p>
            {isSyncing ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <p className="ml-auto text-xl font-bold text-slate-900">
                {currencySymbol} {todayTotal.toLocaleString()}
              </p>
            )}
          </div>
        </div>

        {/* Balance Summary for group wallets */}
        {isGroupWallet && (
          <div className="section">
            <BalanceSummary onSettle={markSettlement} />
          </div>
        )}

        {/* Transaction List */}
        <h2 className="text-subhead mb-3 px-1">Expenses</h2>
        {isSyncing && expenses.length === 0 ? (
          <TransactionListSkeleton />
        ) : Object.keys(grouped).length > 0 ? (
          <div className="space-y-5">
            {Object.keys(grouped).map(dateStr => {
              const enDate = getDateHeader(dateStr);
              return (
                <div key={dateStr}>
                  <h3 className="text-subhead mb-2 px-1">{enDate}</h3>
                  <div className="space-y-2">
                    {grouped[dateStr].map(item => (
                      <div key={item.id} className="card !p-0 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => handleEditClick(item)}
                          className="w-full flex items-center gap-4 p-4 text-left active:scale-[0.99] transition-transform focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-inset"
                          aria-label={`Edit ${item.categoryName}, ${currencySymbol} ${item.amount}`}
                        >
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 relative ${parseCategoryColor(categoryColorMap[item.categoryId]).bg}`}>
                            {(() => {
                              const Icon = getCategoryIcon(item.categoryId);
                              const { text } = parseCategoryColor(categoryColorMap[item.categoryId]);
                              return Icon ? <Icon size={26} className={text} /> : <span className="text-2xl">{item.categoryEmoji}</span>;
                            })()}
                            {item.splitDetails && (
                              <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-600 rounded-full flex items-center justify-center">
                                <Users size={12} className="text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start gap-2">
                              <p className="text-base font-bold text-slate-900 truncate">{item.categoryName}</p>
                              <span className="text-base font-extrabold text-rose-600 whitespace-nowrap">{currencySymbol} {item.amount.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {item.note && <p className="text-sm text-slate-600 truncate">{item.note}</p>}
                              {item.splitDetails && (
                                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                                  Split
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteClick(item); }}
                          className="min-h-[56px] w-full sm:w-auto px-5 flex items-center justify-center gap-2 text-slate-500 active:text-rose-700 active:bg-rose-50 hover:text-rose-600 transition-colors border-t border-slate-100 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-inset"
                          aria-label={`Delete ${item.categoryName}`}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          <span className="text-sm font-semibold">Delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {hasMore && (
              <button
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                className="w-full min-h-[48px] bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-700 active:scale-95 hover:bg-slate-50 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
              >
                Show {filteredExpenses.length - visibleExpenses.length} more
              </button>
            )}
          </div>
        ) : (
          <div className="text-center py-16 flex flex-col items-center">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Search size={34} className="text-slate-400" />
            </div>
            {expenses.length === 0 ? (
              <>
                <p className="text-lg font-bold text-slate-800 mb-1">No expenses yet</p>
                <p className="text-base text-slate-600">Tap the big + button below to add your first expense</p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-slate-800 mb-1">No transactions found</p>
                <p className="text-base text-slate-600">Try adjusting your filters or date range</p>
              </>
            )}
          </div>
        )}

        {/* Undo snackbar */}
        {pendingDelete && (
          <div
            className="fixed left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white rounded-xl shadow-2xl flex items-center gap-3 px-5 py-3.5 animate-slide-up-bottom"
            style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))', maxWidth: 'calc(100% - 2rem)' }}
            role="status"
          >
            <span className="text-sm">Deleted</span>
            <button onClick={handleUndo} className="text-sm font-semibold text-emerald-400 active:scale-95 min-h-[36px] px-2 hover:text-emerald-300 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500">
              Undo
            </button>
          </div>
        )}

        <EditExpenseModal expense={editingExpense} isOpen={!!editingExpense} onClose={() => setEditingExpense(null)} />
        <ConfirmDialog
          isOpen={!!confirmDelete}
          title="Delete Expense"
          message={canUndoDelete(confirmDelete) ? 'Remove this expense? You can undo for a few seconds.' : 'This expense was added by someone else and cannot be undone.'}
          confirmLabel="Delete"
          destructive
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmDelete(null)}
        />
      </div>

      <WalletSelector
        isOpen={isWalletSelectorOpen}
        onClose={() => setIsWalletSelectorOpen(false)}
      />
    </div>
  );
};

export default React.memo(Tracker);
