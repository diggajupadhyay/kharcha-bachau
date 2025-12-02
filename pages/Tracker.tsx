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
  const { language, country, triggerHaptic, expenses, monthlyStats, activeWallet } = useStore();
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWalletSelectorOpen, setIsWalletSelectorOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  
  // Memoize translations and currency symbol
  const t = useMemo(() => TRANSLATIONS[language], [language]);
  const currencySymbol = useMemo(() => getCurrencySymbol(country), [country]);

  const totalExpenseToday = useMemo(() => {
      return expenses
        .filter(e => e.date === currentDate)
        .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses, currentDate]);

  return (
    <div className="min-h-full pb-24 bg-slate-50">
      
      <div className="pt-6 px-6 relative z-10">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
           {/* Wallet Switcher Button - Larger and clearer */}
           <button 
              onClick={() => setIsWalletSelectorOpen(true)}
              className="flex items-center gap-3 px-3 py-2 rounded-xl active:scale-95"
           >
              <h2 className="text-3xl font-bold text-slate-900">
                 {activeWallet ? activeWallet.name : '...'}
              </h2>
              <ChevronDown size={24} className="text-slate-400" strokeWidth={2} />
           </button>
           
           {/* Single Settings Button */}
           <button 
              onClick={() => setIsSettingsOpen(true)}
              className="w-12 h-12 bg-white border-2 border-slate-200 rounded-xl flex items-center justify-center active:scale-95"
              aria-label="Settings"
           >
              <SettingsIcon size={24} className="text-slate-600" strokeWidth={2} />
           </button>
        </div>

        {/* Cards Container */}
        <div className="grid grid-cols-1 gap-6 mb-8">
            
            {/* Total Spent Card - Simplified */}
            <div className="bg-white rounded-2xl p-8 border-2 border-slate-200">
                <p className="text-base font-semibold text-slate-600 mb-3">{t.totalSpent}</p>
                <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-2xl font-medium text-slate-500">{currencySymbol}</span>
                    <span className="text-5xl font-bold text-slate-900">
                        {monthlyStats.currentMonthSpending.toLocaleString()}
                    </span>
                </div>
                <div className="pt-4 border-t border-slate-100">
                    <p className="text-sm font-medium text-slate-500 mb-1">{t.totalToday}</p>
                    <p className="text-2xl font-bold text-slate-900">{currencySymbol} {totalExpenseToday.toLocaleString()}</p>
                </div>
            </div>
        </div>
        
        {/* Categories Grid - 3 columns, larger */}
        <div>
           <h3 className="text-lg font-semibold text-slate-900 mb-6">{t.quickAdd}</h3>
           
           <div className="grid grid-cols-3 gap-4">
              {/* Expense Categories - Sorted alphabetically */}
              {[...EXPENSE_CATEGORIES]
                .sort((a, b) => {
                  const nameA = language === 'en' ? a.name : a.name_np;
                  const nameB = language === 'en' ? b.name : b.name_np;
                  return nameA.localeCompare(nameB);
                })
                .map(cat => (
                  <button
                      key={cat.id}
                      onClick={() => {
                          triggerHaptic();
                          setSelectedCategory(cat);
                      }}
                      className="flex flex-col items-center gap-3 p-4 bg-white rounded-2xl border-2 border-slate-200 active:scale-95"
                  >
                      <div className="w-20 h-20 rounded-xl flex items-center justify-center text-4xl bg-slate-50">
                          <span>{cat.emoji}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-700 text-center">
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

export default Tracker;