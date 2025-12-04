import React, { useMemo, useState, useCallback } from 'react';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { TRANSLATIONS } from '../constants';
import { Trash2, Search, TrendingUp, X, Users } from 'lucide-react';
import { format, isToday, isYesterday, isSameMonth, subMonths } from 'date-fns';
import AuthModal from '../components/AuthModal';
import EditExpenseModal from '../components/EditExpenseModal';
import BalanceSummary from '../components/BalanceSummary';
import { Expense } from '../types';
import { getCurrencySymbol } from '../utils/currencyFormatter';


const History: React.FC = () => {
  const { language, country, expenses, deleteExpense, budget, monthlyStats, pieChartData, activeWallet, markSettlement } = useStore();
  const { user } = useAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  
  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'thisMonth' | 'lastMonth' | 'all'>('today');
  const [showAnalyticsDetails, setShowAnalyticsDetails] = useState(false);
  
  // Memoize currentDate - recalculate once per day, not every render
  const currentDate = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []); // Only recalculate once on mount, then daily (we can enhance this later)

  // Memoize translations
  const t = useMemo(() => TRANSLATIONS[language], [language]);
  const isGuest = useMemo(() => user?.type === 'guest', [user]);
  const currencySymbol = useMemo(() => getCurrencySymbol(country), [country]);

  // --- Filtering Logic ---
  const filteredExpenses = useMemo(() => {
    let filtered = expenses;
    const now = new Date();

    // Date Filter
    if (dateFilter === 'today') {
        filtered = filtered.filter(e => e.date === currentDate);
    } else if (dateFilter === 'yesterday') {
        const yesterday = new Date(currentDate);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        filtered = filtered.filter(e => e.date === yesterdayStr);
    } else if (dateFilter === 'thisMonth') {
        filtered = filtered.filter(e => isSameMonth(new Date(e.date), now));
    } else if (dateFilter === 'lastMonth') {
        filtered = filtered.filter(e => isSameMonth(new Date(e.date), subMonths(now, 1)));
    }

    // Search Filter
    if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        filtered = filtered.filter(e => 
            e.note?.toLowerCase().includes(lower) || 
            e.categoryName.toLowerCase().includes(lower) ||
            e.amount.toString().includes(lower)
        );
    }

    // Sort by createdAt (chronological order - newest first)
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }, [expenses, dateFilter, searchTerm, currentDate]);

  const grouped = useMemo(() => {
      const groups: Record<string, typeof filteredExpenses> = {};
      filteredExpenses.forEach(t => {
          if (!groups[t.date]) groups[t.date] = [];
          groups[t.date].push(t);
      });
      // Sort expenses within each date group by createdAt (newest first)
      Object.keys(groups).forEach(date => {
          groups[date].sort((a, b) => b.createdAt - a.createdAt);
      });
      return groups;
  }, [filteredExpenses]);

  // Calculate Summary for the filtered view
  const summary = useMemo(() => {
      const total = filteredExpenses.reduce((s, e) => s + e.amount, 0);
      return { total };
  }, [filteredExpenses]);

  // Dynamic analytics based on filtered expenses
  const dynamicStats = useMemo(() => {
    const now = new Date();
    let comparisonPeriod: Expense[] = [];
    
    // Get comparison period expenses for trends
    if (dateFilter === 'today') {
      const yesterday = new Date(currentDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      comparisonPeriod = expenses.filter(e => e.date === yesterdayStr);
    } else if (dateFilter === 'yesterday') {
      const dayBeforeYesterday = new Date(currentDate);
      dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
      const dayBeforeYesterdayStr = dayBeforeYesterday.toISOString().split('T')[0];
      comparisonPeriod = expenses.filter(e => e.date === dayBeforeYesterdayStr);
    } else if (dateFilter === 'thisMonth') {
      comparisonPeriod = expenses.filter(e => isSameMonth(new Date(e.date), subMonths(now, 1)));
    } else if (dateFilter === 'lastMonth') {
      comparisonPeriod = expenses.filter(e => isSameMonth(new Date(e.date), subMonths(now, 2)));
    }

    // Single pass optimization: Calculate filtered period stats and category breakdown
    let filteredExpense = 0;
    const categoryTotals: Record<string, { value: number; emoji: string; name: string }> = {};
    const expenseDates = new Set<string>();
    let largestExpense: Expense | null = null as Expense | null;
    
    filteredExpenses.forEach(e => {
      filteredExpense += e.amount;
      expenseDates.add(e.date);
      
      if (!categoryTotals[e.categoryId]) {
        categoryTotals[e.categoryId] = {
          value: 0,
          emoji: e.categoryEmoji || '📝',
          name: e.categoryName || 'Other'
        };
      }
      categoryTotals[e.categoryId].value += e.amount;
      
      if (!largestExpense || e.amount > largestExpense.amount) {
        largestExpense = e;
      }
    });
    
    // Calculate comparison period stats
    let compExpense = 0;
    comparisonPeriod.forEach(e => {
      compExpense += e.amount;
    });
    
    // Calculate trends
    const expenseTrend = compExpense > 0 ? ((filteredExpense - compExpense) / compExpense) * 100 : 0;

    const categoryData = Object.values(categoryTotals)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Additional stats
    const transactionCount = filteredExpenses.length;
    const avgTransaction = transactionCount > 0 ? filteredExpense / transactionCount : 0;
    const expenseDays = expenseDates.size;
    const avgDaily = expenseDays > 0 ? filteredExpense / expenseDays : 0;

    return {
      filteredExpense,
      expenseTrend,
      categoryData,
      transactionCount,
      avgTransaction,
      largestExpense,
      expenseDays,
      avgDaily
    };
  }, [filteredExpenses, dateFilter, expenses, currentDate]);

  // Member spending breakdown (for group wallets)
  const memberSpending = useMemo(() => {
    if (!activeWallet || activeWallet.isPersonal || activeWallet.members.length === 1) {
      return null;
    }

    const memberTotals: Record<string, { name: string; total: number; count: number }> = {};
    
    filteredExpenses.forEach(e => {
      const uid = e.createdBy?.uid || 'unknown';
      const name = e.createdBy?.name || 'Unknown';
      
      if (!memberTotals[uid]) {
        memberTotals[uid] = { name, total: 0, count: 0 };
      }
      memberTotals[uid].total += e.amount;
      memberTotals[uid].count += 1;
    });

    return Object.values(memberTotals).sort((a, b) => b.total - a.total);
  }, [filteredExpenses, activeWallet]);

  const getDateHeader = (dateStr: string) => {
      const date = new Date(dateStr);
      let enDate = format(date, 'MMM d, yyyy');
      if (isToday(date)) enDate = t.today;
      if (isYesterday(date)) enDate = t.yesterday;
      return enDate;
  };

  // Budget calculations
  const currentMonthSpending = monthlyStats.currentMonthSpending;
  const budgetProgress = Math.min((currentMonthSpending / budget) * 100, 100);
  const isOverBudget = currentMonthSpending > budget;
  
  // Show analytics for all filters except 'today' and 'yesterday'
  const showAnalytics = dateFilter !== 'today' && dateFilter !== 'yesterday';
  
  // Check if current wallet is a group wallet
  const isGroupWallet = activeWallet && !activeWallet.isPersonal && activeWallet.members.length > 1;

  return (
    <div 
      className="min-h-full bg-slate-50 overflow-x-hidden"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
        paddingBottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))'
      }}
    >
      <div className="pt-4 px-4">
       {/* Simplified Header */}
       <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900 mb-1">{t.history}</h2>
          {activeWallet && (
            <p className="text-sm text-slate-600">{activeWallet.name}</p>
          )}
       </div>

       {/* Budget Progress Bar - Always visible at top */}
       <div className="bg-white p-4 rounded-xl border border-slate-200 mb-4">
          <div className="mb-3">
             <p className="text-sm font-medium text-slate-600">{t.monthlyBudget}</p>
          </div>
          <div className="flex items-baseline gap-1.5 mb-3">
             <span className="text-2xl font-bold text-slate-900">{currencySymbol} {currentMonthSpending.toLocaleString()}</span>
             <span className="text-base text-slate-500">/ {budget.toLocaleString()}</span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${isOverBudget ? 'bg-rose-600' : 'bg-emerald-600'}`} 
                style={{ width: `${budgetProgress}%` }} 
              />
          </div>
       </div>


       {/* Simplified Filters - Single row with pills */}
       <div className="mb-4 flex items-center gap-2 flex-wrap">
           {/* Search Button */}
           <button
               onClick={() => setShowSearch(!showSearch)}
               className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center active:scale-95"
               aria-label="Search"
           >
               <Search size={18} className="text-slate-600" />
           </button>
           
           {/* Date Filter Pills */}
           <div className="flex gap-2 flex-1">
               <button
                   onClick={() => setDateFilter('today')}
                   className={`px-3 py-1.5 rounded-lg text-sm font-medium active:scale-95 ${
                       dateFilter === 'today' 
                           ? 'bg-emerald-600 text-white' 
                           : 'bg-white border border-slate-200 text-slate-700'
                   }`}
               >
                   Today
               </button>
               <button
                   onClick={() => setDateFilter('yesterday')}
                   className={`px-3 py-1.5 rounded-lg text-sm font-medium active:scale-95 ${
                       dateFilter === 'yesterday' 
                           ? 'bg-emerald-600 text-white' 
                           : 'bg-white border border-slate-200 text-slate-700'
                   }`}
               >
                   {t.yesterday}
               </button>
               <button
                   onClick={() => setDateFilter('thisMonth')}
                   className={`px-3 py-1.5 rounded-lg text-sm font-medium active:scale-95 ${
                       dateFilter === 'thisMonth' 
                           ? 'bg-emerald-600 text-white' 
                           : 'bg-white border border-slate-200 text-slate-700'
                   }`}
               >
                   Month
               </button>
               <button
                   onClick={() => setDateFilter('all')}
                   className={`px-3 py-1.5 rounded-lg text-sm font-medium active:scale-95 ${
                       dateFilter === 'all' 
                           ? 'bg-emerald-600 text-white' 
                           : 'bg-white border border-slate-200 text-slate-700'
                   }`}
               >
                   All
               </button>
           </div>
       </div>
       
       {/* Search Input - Show when toggled */}
       {showSearch && (
           <div className="mb-3 relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
               <input 
                   type="text" 
                   placeholder={t.searchPlaceholder} 
                   value={searchTerm}
                   onChange={e => setSearchTerm(e.target.value)}
                   className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                   autoFocus
               />
               <button
                   onClick={() => { setShowSearch(false); setSearchTerm(''); }}
                   className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 active:scale-95"
               >
                   <X size={18} />
               </button>
           </div>
       )}
       
       {/* Balance Summary - Only for group wallets */}
       {activeWallet && !activeWallet.isPersonal && activeWallet.members.length > 1 && (
         <BalanceSummary onSettle={markSettlement} />
       )}
       
       {/* Simplified Summary Bar */}
       <div className="bg-white rounded-xl p-3 border border-slate-200 mb-4">
           <div className="flex justify-center items-center">
               <div className="text-center">
                   <p className="text-xs font-medium text-slate-500 mb-0.5">Total Spent</p>
                   <p className="text-xl font-bold text-slate-900">{currencySymbol} {summary.total.toLocaleString()}</p>
               </div>
           </div>
       </div>
       
       {/* Simplified Analytics - Hidden by default */}
       {showAnalytics && dynamicStats.categoryData.length > 0 && !showAnalyticsDetails && (
           <div className="mb-4">
               <button
                   onClick={() => setShowAnalyticsDetails(true)}
                   className="w-full bg-white rounded-xl p-3 border border-slate-200 text-left active:scale-95"
               >
                   <div className="flex justify-between items-center">
                       <div>
                           <p className="text-sm font-medium text-slate-900 mb-0.5">View Analytics</p>
                           <p className="text-xs text-slate-500">See spending breakdown</p>
                       </div>
                       <TrendingUp size={18} className="text-slate-400" />
                   </div>
               </button>
           </div>
       )}
       
       {/* Detailed Analytics - Shown when expanded */}
       {showAnalytics && showAnalyticsDetails && dynamicStats.categoryData.length > 0 && (
           <div className="mb-4 space-y-3">
               <div className="flex justify-between items-center">
                   <h3 className="text-base font-semibold text-slate-900">Analytics</h3>
                   <button
                       onClick={() => setShowAnalyticsDetails(false)}
                       className="p-1.5 text-slate-400 active:scale-95"
                   >
                       <X size={18} />
                   </button>
               </div>
               
               {/* Top Categories - Simple List */}
               <div className="bg-white rounded-xl p-3 border border-slate-200">
                   <h4 className="text-sm font-semibold text-slate-900 mb-3">Top Categories</h4>
                   <div className="space-y-2">
                       {dynamicStats.categoryData.slice(0, 5).map((item, index) => {
                           const percent = dynamicStats.filteredExpense > 0 ? ((item.value / dynamicStats.filteredExpense) * 100).toFixed(0) : '0';
                           return (
                               <div key={index} className="flex items-center justify-between">
                                   <div className="flex items-center gap-2 flex-1">
                                       <span className="text-xl">{item.emoji}</span>
                                       <span className="text-sm font-medium text-slate-900">{item.name}</span>
                                   </div>
                                   <div className="text-right">
                                       <p className="text-sm font-bold text-slate-900">{currencySymbol} {item.value.toLocaleString()}</p>
                                       <p className="text-xs text-slate-500">{percent}%</p>
                                   </div>
                               </div>
                           );
                       })}
                   </div>
               </div>
           </div>
       )}


       {/* Simplified Transaction List */}
       {Object.keys(grouped).length > 0 ? (
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
                              className="bg-white p-3 rounded-xl border border-slate-200 flex items-center gap-3 active:scale-95 cursor-pointer"
                           >
                               <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0 bg-slate-50 relative">
                                   {item.categoryEmoji}
                                   {item.splitDetails && (
                                     <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-600 rounded-full flex items-center justify-center">
                                       <Users size={10} className="text-white" />
                                     </div>
                                   )}
                               </div>
                               <div className="flex-1 min-w-0">
                                   <div className="flex justify-between items-start mb-0.5">
                                       <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                           <h4 className="text-sm font-semibold text-slate-900 truncate">{item.categoryName}</h4>
                                           {item.splitDetails && (
                                             <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex-shrink-0">
                                               Split
                                             </span>
                                           )}
                                       </div>
                                       <span className="text-sm font-bold whitespace-nowrap ml-2 text-slate-900">
                                            {currencySymbol} {item.amount.toLocaleString()}
                                       </span>
                                   </div>
                                   {item.note && (
                                       <p className="text-xs text-slate-500 truncate">{item.note}</p>
                                   )}
                                   {item.splitDetails && (
                                       <p className="text-[10px] text-slate-400 mt-0.5">
                                         Paid by {item.splitDetails.participants.find(p => p.userId === item.splitDetails?.paidBy)?.userName || 'Unknown'} • 
                                         Split among {item.splitDetails.participants.length} {item.splitDetails.participants.length === 1 ? 'person' : 'people'}
                                       </p>
                                   )}
                                   {isGroupWallet && item.createdBy?.name && !item.splitDetails && (
                                       <p className="text-[10px] text-slate-400 mt-0.5">{t.addedBy} {item.createdBy.name}</p>
                                   )}
                               </div>
                               <button 
                                  onClick={(e) => { e.stopPropagation(); deleteExpense(item.id); }}
                                  className="p-1.5 text-slate-400 active:scale-95 flex-shrink-0"
                                  aria-label="Delete"
                               >
                                   <Trash2 size={16} />
                               </button>
                           </div>
                           );
                       })}
                   </div>
               </div>
               );
           })}
         </div>
       ) : (
         <div className="text-center py-12 flex flex-col items-center">
           <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <Search size={32} className="text-slate-400" />
           </div>
           <p className="text-base font-semibold text-slate-600 mb-1">No transactions found</p>
           <p className="text-sm text-slate-500">Try adjusting your filters</p>
         </div>
       )}

       <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
       <EditExpenseModal 
         expense={editingExpense}
         isOpen={!!editingExpense}
         onClose={() => setEditingExpense(null)}
       />
      </div>
    </div>
  );
};

export default History;