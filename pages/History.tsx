import React, { useMemo, useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { Trash2, Search, X, Users } from 'lucide-react';
import { format, subDays, startOfYear } from 'date-fns';
import AuthModal from '../components/AuthModal';
import EditExpenseModal from '../components/EditExpenseModal';
import BalanceSummary from '../components/BalanceSummary';
import ConfirmDialog from '../components/ConfirmDialog';
import { TransactionListSkeleton } from '../components/Skeleton';
import { Expense } from '../types';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { getCategoryIcon, parseCategoryColor } from '../utils/categoryIcons';

export interface FilterState {
  dateRange: {
    type: 'preset' | 'custom';
    preset?: 'today' | 'yesterday' | 'thisMonth' | 'lastMonth' | 'last7days' | 'last30days' | 'thisYear' | 'all';
    customStart?: string;
    customEnd?: string;
  };
  categories: string[];
  amountRange: {
    min?: number;
    max?: number;
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const monthStart = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
const monthEnd = (d: Date) => {
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(lastDay)}`;
};


const History: React.FC = () => {
  const { expenses, deleteExpense, restoreExpense, budget, monthlyStats, activeWallet, markSettlement, isSyncing, getAllCategories } = useStore();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);
  
  // Filter state — single source of truth (advancedFilters drives everything)
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>({
    dateRange: { type: 'preset', preset: 'thisMonth' },
    categories: [],
    amountRange: {}
  });
  
  
  // Recalculate currentDate at midnight
  const [currentDate, setCurrentDate] = useState(() => new Date().toISOString().split('T')[0]);
  useEffect(() => {
    const now = new Date();
    const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const timer = setTimeout(() => setCurrentDate(new Date().toISOString().split('T')[0]), msUntilMidnight);
    return () => clearTimeout(timer);
  }, []);

  const currencySymbol = useMemo(() => getCurrencySymbol(), []);

  // --- Filtering Logic (single advancedFilters model) ---
  const filteredExpenses = useMemo(() => {
    let filtered = expenses;
    const now = new Date();

    // Date Range Filter
    if (advancedFilters.dateRange.type === 'preset' && advancedFilters.dateRange.preset) {
      const preset = advancedFilters.dateRange.preset;
      if (preset === 'today') {
        filtered = filtered.filter(e => e.date === currentDate);
      } else if (preset === 'yesterday') {
        const yesterday = new Date(currentDate);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        filtered = filtered.filter(e => e.date === yesterdayStr);
      } else if (preset === 'thisMonth') {
        filtered = filtered.filter(e => e.date >= monthStart(now) && e.date <= monthEnd(now));
      } else if (preset === 'lastMonth') {
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        filtered = filtered.filter(e => e.date >= monthStart(prev) && e.date <= monthEnd(prev));
      } else if (preset === 'last7days') {
        filtered = filtered.filter(e => e.date >= format(subDays(now, 7), 'yyyy-MM-dd'));
      } else if (preset === 'last30days') {
        filtered = filtered.filter(e => e.date >= format(subDays(now, 30), 'yyyy-MM-dd'));
      } else if (preset === 'thisYear') {
        filtered = filtered.filter(e => e.date >= format(startOfYear(now), 'yyyy-MM-dd'));
      }
      // 'all' doesn't filter
    } else if (advancedFilters.dateRange.type === 'custom') {
      if (advancedFilters.dateRange.customStart) {
        filtered = filtered.filter(e => e.date >= advancedFilters.dateRange.customStart!);
      }
      if (advancedFilters.dateRange.customEnd) {
        filtered = filtered.filter(e => e.date <= advancedFilters.dateRange.customEnd!);
      }
    }
    
    // Category Filter
    if (advancedFilters.categories.length > 0) {
      filtered = filtered.filter(e => advancedFilters.categories.includes(e.categoryId));
    }
    
    // Amount Range Filter
    if (advancedFilters.amountRange.min !== undefined) {
      filtered = filtered.filter(e => e.amount >= advancedFilters.amountRange.min!);
    }
    if (advancedFilters.amountRange.max !== undefined) {
      filtered = filtered.filter(e => e.amount <= advancedFilters.amountRange.max!);
    }

    // Search Filter (always applied)
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      filtered = filtered.filter(e => 
        e.note?.toLowerCase().includes(lower) || 
        e.categoryName.toLowerCase().includes(lower) ||
        e.amount.toString().includes(lower)
      );
    }

    // Sort by date first (newest dates first), then by createdAt as tiebreaker (newest first)
    return [...filtered].sort((a, b) => {
      const dateComparison = b.date < a.date ? -1 : b.date > a.date ? 1 : 0;
      if (dateComparison === 0) {
        return (b.createdAt || 0) - (a.createdAt || 0);
      }
      return dateComparison;
    });
  }, [expenses, searchTerm, advancedFilters, currentDate]);

  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset the visible window whenever the filtered result set changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchTerm, advancedFilters]);

  const visibleExpenses = useMemo(
    () => filteredExpenses.slice(0, visibleCount),
    [filteredExpenses, visibleCount]
  );
  const hasMore = filteredExpenses.length > visibleExpenses.length;

  const grouped = useMemo(() => {
      const groups: Record<string, typeof visibleExpenses> = {};
      visibleExpenses.forEach(t => {
          if (!groups[t.date]) groups[t.date] = [];
          groups[t.date].push(t);
      });
      // Sort expenses within each date group by createdAt (newest first)
      Object.keys(groups).forEach(date => {
          groups[date] = [...groups[date]].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      });
      // Sort date groups by date (newest dates first)
      const sortedDates = [...Object.keys(groups)].sort((a, b) => b.localeCompare(a));
      const sortedGroups: Record<string, typeof visibleExpenses> = {};
      sortedDates.forEach(date => {
        sortedGroups[date] = groups[date];
      });
      return sortedGroups;
  }, [visibleExpenses]);

  const categoryColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    getAllCategories().forEach(c => { map[c.id] = c.color || 'bg-slate-100 text-slate-700'; });
    return map;
  }, [getAllCategories]);

  const getDateHeader = (dateStr: string) => {
      if (dateStr === currentDate) return 'Today';
      const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      if (dateStr === yesterdayStr) return 'Yesterday';
      // Parse as local date to avoid UTC shift (date-only strings are read as UTC midnight)
      return format(new Date(dateStr + 'T00:00:00'), 'MMM d, yyyy');
  };

  // Budget calculations
  const currentMonthSpending = monthlyStats.currentMonthSpending;
  const budgetProgress = Math.min((currentMonthSpending / budget) * 100, 100);
  
  // Check if current wallet is a group wallet
  const isGroupWallet = activeWallet && !activeWallet.isPersonal && activeWallet.members.length > 1;

  // Delete with Undo: confirmation first, then deletion commits immediately; Undo restores
  const handleDeleteConfirm = () => {
    if (!confirmDelete) return;
    deleteExpense(confirmDelete.id);
    setPendingDelete(confirmDelete);
    setConfirmDelete(null);
  };

  const handleDeleteClick = (item: Expense) => {
    setConfirmDelete(item);
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

  return (
    <div 
      className="min-h-full bg-slate-50 overflow-x-hidden"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
        paddingBottom: 'calc(9rem + env(safe-area-inset-bottom, 0px))'
      }}
    >
      <div className="pt-3 px-3 md:px-5 lg:px-6">
       {/* Header */}
       <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 mb-0.5">History</h1>
          {activeWallet && (
            <p className="text-xs sm:text-sm text-slate-700">{activeWallet.name}</p>
          )}
        </div>
       </div>

        {/* Budget Progress + Summary — single merged card */}
        <div className="mb-4">
         <div className="bg-white p-4 md:p-5 lg:p-6 rounded-xl border border-slate-300">
            <p className="text-xs sm:text-sm font-medium text-slate-700 mb-2">Monthly Spending</p>
            <div className="flex items-baseline gap-1.5 mb-3">
               <span className="text-lg sm:text-xl font-bold text-slate-900">{currencySymbol} {currentMonthSpending.toLocaleString()}</span>
               <span className="text-xs sm:text-sm text-slate-700">/ {budget.toLocaleString()}</span>
            </div>
            <div className="h-5 w-full bg-slate-100 rounded-full overflow-hidden">
               <div 
                 className={`h-full rounded-full transition-all duration-300 ${
                   budgetProgress > 100
                     ? 'bg-rose-600'
                     : budgetProgress > 80
                       ? 'bg-orange-500'
                       : budgetProgress > 50
                         ? 'bg-yellow-500'
                         : 'bg-emerald-500'
                 }`}
                 style={{ width: `${Math.min(budgetProgress, 100)}%` }}
               />
            </div>
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-slate-700">Progress</span>
              <span className={`text-xs font-semibold ${
                budgetProgress > 100 ? 'text-rose-600' : 'text-slate-700'
              }`}>
                {budgetProgress.toFixed(1)}%
              </span>
            </div>
         </div>
        </div>

        {/* Filters Row — consistent 44px+ tap/click targets */}
<div className="mb-4 flex items-center gap-2 flex-wrap">
            <button
                onClick={() => setShowSearch(!showSearch)}
                 className="min-w-[44px] min-h-[44px] bg-white border border-slate-300 rounded-xl flex items-center justify-center active:scale-95 hover:shadow-md hover:bg-slate-100 transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                aria-label="Search"
            >
                <Search size={20} className="text-slate-700" />
            </button>
            
            <div className="flex gap-1.5 flex-1 flex-wrap">
                <button onClick={() => setAdvancedFilters(prev => ({ ...prev, dateRange: { type: 'preset', preset: 'today' } }))}
                  className={`h-11 px-3 rounded-xl text-xs sm:text-sm font-medium active:scale-95 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    advancedFilters.dateRange.preset === 'today' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-200'
                  }`}>Today</button>
                <button onClick={() => setAdvancedFilters(prev => ({ ...prev, dateRange: { type: 'preset', preset: 'yesterday' } }))}
                  className={`h-11 px-3 rounded-xl text-xs sm:text-sm font-medium active:scale-95 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    advancedFilters.dateRange.preset === 'yesterday' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-200'
                  }`}>Yesterday</button>
                <button onClick={() => setAdvancedFilters(prev => ({ ...prev, dateRange: { type: 'preset', preset: 'thisMonth' } }))}
                  className={`h-11 px-3 rounded-xl text-xs sm:text-sm font-medium active:scale-95 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    advancedFilters.dateRange.preset === 'thisMonth' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-200'
                  }`}>Month</button>
                <button onClick={() => setAdvancedFilters(prev => ({ ...prev, dateRange: { type: 'preset', preset: 'all' } }))}
                  className={`h-11 px-3 rounded-xl text-xs sm:text-sm font-medium active:scale-95 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    advancedFilters.dateRange.preset === 'all' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-200'
                  }`}>All</button>
            </div>
       </div>
       
       {/* Search Input - Show when toggled */}
       {showSearch && (
           <div className="mb-3 relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
               <input 
                   type="text" 
                   placeholder="Search expenses" 
                   value={searchTerm}
                   onChange={e => setSearchTerm(e.target.value)}
                   className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                   autoFocus
               />
               <button
                   onClick={() => { setShowSearch(false); setSearchTerm(''); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 active:scale-95 hover:text-slate-700 transition-colors"
               >
                   <X size={18} />
               </button>
           </div>
       )}
       
        {/* Group wallet settlement summary */}
        {activeWallet && !activeWallet.isPersonal && activeWallet.members.length > 1 && (
          <div className="mb-4">
            <BalanceSummary onSettle={markSettlement} />
          </div>
        )}

         {/* Transaction List */}
        {isSyncing && expenses.length === 0 ? (
          <TransactionListSkeleton />
        ) : Object.keys(grouped).length > 0 ? (
         <div className="space-y-4">
           {Object.keys(grouped).map(dateStr => {
               const enDate = getDateHeader(dateStr);
               return (
               <div key={dateStr} className="space-y-2">
                   <h3 className="text-sm font-semibold text-slate-700 px-1">{enDate}</h3>
                   
                   <div className="space-y-1.5">
                       {grouped[dateStr].map((item) => {
                           return (
                                <div 
                                   key={item.id} 
                                   onClick={() => setEditingExpense(item)}
                                   role="button"
                                   tabIndex={0}
                                   aria-label={`${item.categoryName} ${currencySymbol} ${item.amount}`}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditingExpense(item); } }}
                                     className="bg-white p-3 md:p-4 lg:p-5 rounded-xl border border-slate-300 flex items-center gap-3 md:gap-4 lg:gap-5 active:scale-95 cursor-pointer select-none hover:shadow-md transition-shadow focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                                >
                                     <div className={`w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-lg flex items-center justify-center text-xl md:text-2xl lg:text-3xl flex-shrink-0 relative ${parseCategoryColor(categoryColorMap[item.categoryId]).bg}`}>
                                       {(() => {
                                         const Icon = getCategoryIcon(item.categoryId);
                                         const { text } = parseCategoryColor(categoryColorMap[item.categoryId]);
                                         return Icon ? <Icon size={22} className={text} /> : <span className={text}>{item.categoryEmoji}</span>;
                                       })()}
                                        {item.splitDetails && (
                                          <div className="absolute -top-1 -right-1 w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 bg-emerald-600 rounded-full flex items-center justify-center">
                                            <Users size={10} className="md:w-3 md:h-3 lg:w-4 lg:h-4 text-white" />
                                          </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-0.5 md:mb-1">
                                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                <h4 className="text-sm md:text-base lg:text-lg font-semibold text-slate-900 truncate">{item.categoryName}</h4>
                                                {item.splitDetails && (
                                                  <span className="text-[10px] md:text-xs lg:text-sm font-medium text-emerald-600 bg-emerald-50 px-1.5 md:px-2 lg:px-2.5 py-0.5 md:py-1 rounded flex-shrink-0">
                                                    Split
                                                  </span>
                                                )}
                                            </div>
                                             <span className="text-sm md:text-base lg:text-lg font-bold whitespace-nowrap ml-2 text-rose-600">
                                                 {currencySymbol} {item.amount.toLocaleString()}
                                            </span>
                                        </div>
{item.note && (
                                        <p className="text-xs text-slate-700 truncate">{item.note}</p>
                                    )}
                                   {item.splitDetails && (
                                       <p className="text-[10px] text-slate-400 mt-0.5">
                                         Paid by {item.splitDetails.participants.find(p => p.userId === item.splitDetails?.paidBy)?.userName || 'Unknown'} • 
                                         Split among {item.splitDetails.participants.length} {item.splitDetails.participants.length === 1 ? 'person' : 'people'}
                                       </p>
                                   )}
                                   {isGroupWallet && item.createdBy?.name && !item.splitDetails && (
                                       <p className="text-[10px] text-slate-400 mt-0.5">Added by {item.createdBy.name}</p>
                                   )}
                               </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleDeleteClick(item); }}
                                     className="min-w-[44px] min-h-[44px] text-slate-400 active:scale-95 flex-shrink-0 flex items-center justify-center hover:text-rose-600 hover:bg-rose-50 transition-colors focus-visible:ring-2 focus-visible:ring-rose-500"
                                    aria-label={`Delete ${item.categoryName}`}
                                 >
                                     <Trash2 size={18} />
                                 </button>
                           </div>
                           );
                       })}
                   </div>
               </div>
               );
           })}
           {hasMore && (
             <button
               onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
               className="w-full mt-2 py-3 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-700 active:scale-95 hover:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
             >
               Show more ({filteredExpenses.length - visibleExpenses.length} more)
             </button>
           )}
         </div>
        ) : (
          <div className="text-center py-12 flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                 <Search size={32} className="text-slate-400" />
            </div>
            {expenses.length === 0 ? (
              <>
                <p className="text-base font-semibold text-slate-700 mb-1">No expenses yet</p>
                <p className="text-sm text-slate-700">Tap the + in the bottom nav to log your first expense</p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-slate-700 mb-1">No transactions found</p>
                <p className="text-sm text-slate-700">Try adjusting your filters</p>
              </>
            )}
          </div>
        )}

         {/* Undo snackbar */}
        {pendingDelete && (
          <div
            className="fixed left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white rounded-xl shadow-2xl flex items-center gap-3 px-4 py-3 animate-slide-up-bottom"
            style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))', maxWidth: 'calc(100% - 2rem)' }}
            role="status"
          >
            <span className="text-sm">Deleted</span>
            <button
              onClick={handleUndo}
              className="text-sm font-semibold text-emerald-400 active:scale-95 min-h-[36px] px-2 hover:text-emerald-300 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              Undo
            </button>
          </div>
        )}


<AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
        <EditExpenseModal 
          expense={editingExpense}
          isOpen={!!editingExpense}
          onClose={() => setEditingExpense(null)}
        />
        <ConfirmDialog
          isOpen={!!confirmDelete}
          title="Delete Expense"
          message="Delete this expense? This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmDelete(null)}
        />
      </div>
    </div>
  );
};

export default React.memo(History);