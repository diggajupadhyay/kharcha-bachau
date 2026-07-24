import React, { useState, useMemo } from 'react';
import { Category } from '../types';
import { ChevronDown, Search } from 'lucide-react';
import AddExpenseModal from '../components/AddExpenseModal';
import WalletSelector from '../components/WalletSelector';
import AuthModal from '../components/AuthModal';
import NotificationBell from '../components/NotificationBell';
import Skeleton from '../components/Skeleton';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { getCurrencySymbol } from '../utils/currencyFormatter';

interface TrackerProps {
  currentDate: string;
}

const Tracker: React.FC<TrackerProps> = ({ currentDate }) => {
  const { expenses, monthlyStats, activeWallet, budget, getAllCategories, isSyncing } = useStore();
  const { user } = useAuth();
  const currencySymbol = getCurrencySymbol();

  const spent = monthlyStats.currentMonthSpending;
  const budgetPct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const overBudget = budget > 0 && spent > budget;
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [isWalletSelectorOpen, setIsWalletSelectorOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const totalExpenseToday = useMemo(() => {
      return expenses
        .filter(e => e.date === currentDate)
        .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses, currentDate]);

  const sortedCategories = useMemo(() => {
    return getAllCategories().sort((a, b) => a.name.localeCompare(b.name));
  }, [getAllCategories]);

  const [categorySearch, setCategorySearch] = useState('');
  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return sortedCategories;
    return sortedCategories.filter(c => c.name.toLowerCase().includes(q));
  }, [sortedCategories, categorySearch]);

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

      <div className="pt-3 px-3 md:px-5 lg:px-6 relative z-10 max-w-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <button
            onClick={() => setIsWalletSelectorOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl active:scale-95 min-tap-target hover:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            <h1 className="text-xl font-bold text-slate-900 truncate max-w-[180px] sm:max-w-[280px]">
              {activeWallet ? activeWallet.name : '...'}
            </h1>
            <ChevronDown size={18} className="flex-shrink-0 text-slate-400" />
          </button>

          <NotificationBell />
        </div>

        {/* Total Spent Card */}
        <div className="bg-white rounded-xl p-4 md:p-5 lg:p-6 border border-slate-200 mb-5">
          <div className="flex items-start justify-between mb-2">
            <p className="text-sm font-medium text-slate-600">Total Spent (This Month)</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0">
            <div className="flex-1">
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-lg font-medium text-slate-500">{currencySymbol}</span>
                {isSyncing ? (
                  <Skeleton className="h-8 w-28 self-center" />
                ) : (
                  <span className="text-3xl font-bold text-slate-900">
                    {monthlyStats.currentMonthSpending.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 pt-3 sm:pt-0 sm:pl-3 border-t sm:border-t-0 sm:border-l border-slate-100 sm:pl-4">
              <p className="text-xs text-slate-500">Today:</p>
              {isSyncing ? (
                <Skeleton className="h-5 w-16" />
              ) : (
                <p className="text-base font-bold text-slate-900">{currencySymbol} {totalExpenseToday.toLocaleString()}</p>
              )}
            </div>
          </div>

          {budget > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-500">Monthly budget</span>
                <span className={`font-semibold ${overBudget ? 'text-rose-600' : 'text-slate-600'}`}>
                  {budgetPct.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${overBudget ? 'bg-rose-500' : 'bg-emerald-500'}`}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
              {overBudget && (
                <p className="text-xs text-rose-600 mt-1.5">
                  Over budget by {currencySymbol} {(spent - budget).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Categories Grid */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Categories</h3>
          {expenses.length === 0 && (
            <p className="text-xs text-slate-500 mb-3 -mt-1">Select a category or the + button to log your first expense</p>
          )}

          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={categorySearch}
              onChange={e => setCategorySearch(e.target.value)}
              placeholder="Search categories"
              className="w-full min-h-[44px] pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              aria-label="Search categories"
            />
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2 sm:gap-2.5">
            {filteredCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedCategory(cat);
                }}
                className="flex flex-col items-center gap-1.5 p-2.5 sm:p-3 bg-white rounded-xl border border-slate-200 active:scale-95 transition-all hover:shadow-md hover:border-emerald-300 select-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                aria-label={`Add ${cat.name} expense`}
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center text-2xl sm:text-3xl bg-slate-50">
                  <span>{cat.emoji}</span>
                </div>
                <p className="text-[11px] sm:text-xs font-medium text-slate-700 text-center leading-tight">
                  {cat.name}
                </p>
              </button>
            ))}
          </div>
          {categorySearch.trim() && filteredCategories.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8">No categories match "{categorySearch}"</p>
          )}
        </div>
      </div>

      {selectedCategory && (
        <AddExpenseModal
          category={selectedCategory}
          isOpen={!!selectedCategory}
          onClose={() => setSelectedCategory(null)}
        />
      )}

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />

      <WalletSelector
        isOpen={isWalletSelectorOpen}
        onClose={() => setIsWalletSelectorOpen(false)}
      />
    </div>
  );
};

export default React.memo(Tracker);
