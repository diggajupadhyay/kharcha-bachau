import React, { useState, useMemo } from 'react';
import { Category } from '../types';
import { ChevronDown } from 'lucide-react';
import AddExpenseModal from '../components/AddExpenseModal';
import WalletSelector from '../components/WalletSelector';
import Skeleton from '../components/Skeleton';
import BalanceSummary from '../components/BalanceSummary';
import { useStore } from '../context/StoreContext';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { getCategoryIcon, parseCategoryColor } from '../utils/categoryIcons';

interface TrackerProps {
  currentDate: string;
}

const Tracker: React.FC<TrackerProps> = ({ currentDate }) => {
  const { expenses, monthlyStats, activeWallet, getAllCategories, isSyncing, markSettlement, budget } = useStore();
  const currencySymbol = getCurrencySymbol();

  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [isWalletSelectorOpen, setIsWalletSelectorOpen] = useState(false);

  const totalExpenseToday = useMemo(() => {
    return expenses
      .filter(e => e.date === currentDate)
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses, currentDate]);

  const sortedCategories = useMemo(() => {
    return getAllCategories().sort((a, b) => {
      const aIsOther = a.name.toLowerCase() === 'other';
      const bIsOther = b.name.toLowerCase() === 'other';
      if (aIsOther && !bIsOther) return 1;
      if (!aIsOther && bIsOther) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [getAllCategories]);

  const budgetProgress = budget > 0 ? (monthlyStats.currentMonthSpending / budget) * 100 : 0;
  const remainingBudget = budget - monthlyStats.currentMonthSpending;
  const isOverBudget = remainingBudget < 0;

  const isGroupWallet = activeWallet && !activeWallet.isPersonal && activeWallet.members.length > 1;

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
        {/* Header — Wallet Selector */}
        <div className="flex justify-between items-center mb-5">
          <button
            onClick={() => setIsWalletSelectorOpen(true)}
            className="flex items-center gap-2 px-4 py-3 rounded-xl active:scale-95 min-tap-target bg-white border border-slate-300 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            <div className="text-left">
              <p className="text-xs font-medium text-slate-700 leading-tight">Current Wallet</p>
              <h1 className="text-xl font-bold text-slate-900 truncate max-w-[180px] sm:max-w-[280px]">
                {activeWallet ? activeWallet.name : '...'}
              </h1>
            </div>
            <ChevronDown size={22} className="flex-shrink-0 text-slate-500" />
          </button>
        </div>

        {/* Total Spent Card */}
        <div className="bg-white rounded-xl p-4 md:p-5 lg:p-6 border border-slate-300 mb-5">
          <p className="text-sm font-medium text-slate-700 mb-1">Total Spent (This Month)</p>
          <div className="flex items-baseline gap-1.5 mb-3">
            <span className="text-lg font-medium text-slate-700">{currencySymbol}</span>
            {isSyncing ? (
              <Skeleton className="h-8 w-28 self-center" />
            ) : (
              <span className="text-3xl font-bold text-slate-900">
                {monthlyStats.currentMonthSpending.toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-700">Today:</p>
            {isSyncing ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              <p className="text-base font-bold text-slate-900">{currencySymbol} {totalExpenseToday.toLocaleString()}</p>
            )}
          </div>

          {/* Budget was previously invisible on the screen people actually open — it
              was set in Settings and only charted on History. */}
          {!isSyncing && budget > 0 && (
            <div className="pt-3 mt-3 border-t border-slate-100">
              <div className="flex items-baseline justify-between mb-1.5">
                <p className="text-xs text-slate-700">
                  {isOverBudget ? 'Over your monthly limit by' : 'Left to spend this month'}
                </p>
                <p className={`text-sm font-bold ${isOverBudget ? 'text-rose-600' : 'text-slate-900'}`}>
                  {currencySymbol} {Math.abs(remainingBudget).toLocaleString()}
                </p>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    budgetProgress > 100 ? 'bg-rose-600'
                      : budgetProgress > 80 ? 'bg-orange-500'
                      : budgetProgress > 50 ? 'bg-yellow-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(budgetProgress, 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                {currencySymbol} {monthlyStats.currentMonthSpending.toLocaleString()} of {currencySymbol} {budget.toLocaleString()} monthly limit
              </p>
            </div>
          )}
        </div>

        {/* Group wallet settlement summary */}
        {isGroupWallet && (
          <div className="mb-5">
            <BalanceSummary onSettle={markSettlement} />
          </div>
        )}

        {/* Categories Grid */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Categories</h3>
          {expenses.length === 0 && (
            <div className="mb-3 -mt-1 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-sm font-semibold text-emerald-900 mb-0.5">Start here</p>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Tap the kind of thing you spent money on — Food, Transport, and so on.
                Then type the amount. That is the whole thing.
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2 sm:gap-2.5">
            {sortedCategories.map(cat => {
              const Icon = getCategoryIcon(cat.id);
              const { bg, text } = parseCategoryColor(cat.color);

              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat)}
                  className="flex flex-col items-center gap-1.5 p-2.5 sm:p-3 bg-white rounded-xl border border-slate-300 active:scale-95 transition-all hover:shadow-md hover:border-emerald-300 select-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                  aria-label={`Add ${cat.name} expense`}
                >
                  <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center ${bg}`}>
                    {Icon ? <Icon size={24} className={text} /> : <span className={text}>{cat.emoji}</span>}
                  </div>
                  <p className="text-[11px] sm:text-xs font-medium text-slate-700 text-center leading-tight">
                    {cat.name}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selectedCategory && (
        <AddExpenseModal
          category={selectedCategory}
          isOpen={!!selectedCategory}
          onClose={() => setSelectedCategory(null)}
        />
      )}

      <WalletSelector
        isOpen={isWalletSelectorOpen}
        onClose={() => setIsWalletSelectorOpen(false)}
      />
    </div>
  );
};

export default React.memo(Tracker);