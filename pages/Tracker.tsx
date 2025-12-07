import React, { useState, useMemo } from 'react';
import { Category } from '../types';
import { EXPENSE_CATEGORIES, TRANSLATIONS } from '../constants';
import { Settings as SettingsIcon, ChevronDown } from 'lucide-react';
import AddExpenseModal from '../components/AddExpenseModal';
import SettingsModal from '../components/SettingsModal';
import WalletSelector from '../components/WalletSelector';
import AuthModal from '../components/AuthModal';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { getCurrencySymbol } from '../utils/currencyFormatter';

interface TrackerProps {
  currentDate: string;
}


const Tracker: React.FC<TrackerProps> = ({ currentDate }) => {
  const { language, triggerHaptic, expenses, monthlyStats, activeWallet, getAllCategories } = useStore();
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWalletSelectorOpen, setIsWalletSelectorOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  
  // Memoize translations and currency symbol
  const t = useMemo(() => TRANSLATIONS[language], [language]);
  const currencySymbol = useMemo(() => getCurrencySymbol(), []);

  const totalExpenseToday = useMemo(() => {
      return expenses
        .filter(e => e.date === currentDate)
        .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses, currentDate]);

  // Memoize sorted categories to avoid re-sorting on every render
  const sortedCategories = useMemo(() => {
    return getAllCategories().sort((a, b) => {
      const nameA = language === 'en' ? a.name : a.name_np;
      const nameB = language === 'en' ? b.name : b.name_np;
      return nameA.localeCompare(nameB);
    });
  }, [getAllCategories, language]);

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
      
      <div className="pt-4 px-4 relative z-10 max-w-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
           {/* Wallet Switcher Button - Larger and clearer */}
           <button 
              onClick={() => setIsWalletSelectorOpen(true)}
              className="flex items-center gap-2 px-2 py-1 rounded-lg active:scale-95"
           >
              <h2 className="text-xl font-bold text-slate-900">
                 {activeWallet ? activeWallet.name : '...'}
              </h2>
              <ChevronDown size={18} className="text-slate-400" strokeWidth={2} />
           </button>
           
           {/* Single Settings Button */}
           <button 
              onClick={() => setIsSettingsOpen(true)}
              className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center active:scale-95"
              aria-label="Settings"
           >
              <SettingsIcon size={18} className="text-slate-600" strokeWidth={2} />
           </button>
        </div>

        {/* Cards Container */}
        <div className="grid grid-cols-1 gap-3 mb-4">
            
            {/* Total Spent Card - Simplified */}
            <div className="bg-white rounded-xl p-4 border border-slate-200">
                <p className="text-sm font-medium text-slate-600 mb-2">{t.totalSpent}</p>
                <div className="flex items-baseline gap-1.5 mb-3">
                    <span className="text-lg font-medium text-slate-500">{currencySymbol}</span>
                    <span className="text-3xl font-bold text-slate-900">
                        {monthlyStats.currentMonthSpending.toLocaleString()}
                    </span>
                </div>
                <div className="pt-3 border-t border-slate-100">
                    <p className="text-xs font-medium text-slate-500 mb-0.5">{t.totalToday}</p>
                    <p className="text-xl font-bold text-slate-900">{currencySymbol} {totalExpenseToday.toLocaleString()}</p>
                </div>
            </div>
        </div>
        
        {/* Categories Grid - 3 columns, larger */}
        <div>
           <h3 className="text-base font-semibold text-slate-900 mb-3">{t.quickAdd}</h3>
           
           <div className="grid grid-cols-3 gap-2.5">
              {/* Expense Categories - Sorted alphabetically (default + custom) */}
              {sortedCategories.map(cat => (
                  <button
                      key={cat.id}
                      onClick={() => {
                          triggerHaptic();
                          setSelectedCategory(cat);
                      }}
                      className="flex flex-col items-center gap-2 p-3 bg-white rounded-xl border border-slate-200 active:scale-95"
                  >
                      <div className="w-14 h-14 rounded-lg flex items-center justify-center text-3xl bg-slate-50">
                          <span>{cat.emoji}</span>
                      </div>
                      <p className="text-xs font-medium text-slate-700 text-center">
                        {language === 'en' ? cat.name : cat.name_np}
                      </p>
                  </button>
              ))}
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

      <AuthModal 
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />

      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onLogin={() => setIsAuthOpen(true)}
      />

      <WalletSelector 
        isOpen={isWalletSelectorOpen}
        onClose={() => setIsWalletSelectorOpen(false)}
      />
    </div>
  );
};

export default React.memo(Tracker);