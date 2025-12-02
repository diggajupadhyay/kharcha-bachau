
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StoreContextType, Expense, Notification, NotificationType, Language, Category, MonthlyStats, PieChartData, Wallet, CountryCode } from '../types';
import { DEFAULT_COUNTRY } from '../constants/countries';
import * as storage from '../services/storageService';
import { useAuth } from './AuthContext';
import { startOfMonth, subMonths, endOfMonth, format } from 'date-fns';
import { EXPENSE_CATEGORIES } from '../constants';

const StoreContext = createContext<StoreContextType | undefined>(undefined);

const ACTIVE_WALLET_KEY = 'kharcha_bachau_active_wallet_id';
const LANGUAGE_KEY = 'kharcha_bachau_language';
const COUNTRY_KEY = 'kharcha_bachau_country';

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within a StoreProvider');
  return context;
};

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  
  // App State
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    return (saved === 'en' || saved === 'np') ? saved : 'en';
  });
  const [country, setCountryState] = useState<CountryCode>(() => {
    const saved = localStorage.getItem(COUNTRY_KEY);
    return (saved === 'np' || saved === 'in' || saved === 'au') ? saved : DEFAULT_COUNTRY;
  });
  
  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
  }, []);
  
  const setCountry = useCallback((countryCode: CountryCode) => {
    setCountryState(countryCode);
  }, []);
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  // Persist language to localStorage
  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language);
  }, [language]);
  
  // Persist country to localStorage
  useEffect(() => {
    localStorage.setItem(COUNTRY_KEY, country);
  }, [country]);
  
  // Wallet State
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [activeWallet, setActiveWallet] = useState<Wallet | null>(null);
  const walletInitializedRef = useRef(false);
  
  // Persist active wallet ID to localStorage (but don't clear during initialization)
  useEffect(() => {
    if (activeWallet) {
      localStorage.setItem(ACTIVE_WALLET_KEY, activeWallet.id);
      walletInitializedRef.current = true;
    } else if (walletInitializedRef.current) {
      // Only clear localStorage if wallet was previously set and is now null (e.g., on logout)
      // Don't clear during initial mount when activeWallet starts as null
      localStorage.removeItem(ACTIVE_WALLET_KEY);
    }
  }, [activeWallet]);

  // Data State
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budget, setBudgetState] = useState(20000);
  
  // Derived Stats
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats>({
      currentMonthSpending: 0,
      lastMonthSpending: 0,
      percentChange: 0
  });
  const [pieChartData, setPieChartData] = useState<PieChartData[]>([]);

  useEffect(() => {
      setBudgetState(storage.getStoredBudget());
  }, []);

  const setBudget = useCallback((amount: number) => {
      setBudgetState(amount);
      storage.saveStoredBudget(amount);
  }, []);

  useEffect(() => {
      if (!user) {
          setWallets([]);
          setActiveWallet(null);
          return;
      }
      
      const loadWallets = async () => {
          if (user.type === 'guest') {
              const guestWallet = storage.createGuestWallet();
              setWallets([guestWallet]);
              setActiveWallet(guestWallet);
          } else {
              // Get saved wallet ID early to preserve it
              const savedWalletId = localStorage.getItem(ACTIVE_WALLET_KEY);
              
              // Sync guest data first (this will create a personal wallet if guest data exists)
              try {
                  await storage.syncGuestData(user);
              } catch (error) {
                  // Continue even if sync fails - user can sync later
              }
              
              // Get all wallets after sync
              let userWallets = await storage.getUserWallets(user);
              
              // Cleanup duplicate personal wallets (in case they exist from previous bugs)
              // This also runs after syncGuestData, but we do it here too as a safety measure
              try {
                  await storage.cleanupDuplicatePersonalWallets(user);
                  // Refresh wallets after cleanup
                  userWallets = await storage.getUserWallets(user);
              } catch (error) {
                  // Continue even if cleanup fails
              }
              
              if (userWallets.length > 0) {
                  setWallets(userWallets);
                  
                  // Try to restore saved active wallet ID - this preserves group wallet selection
                  const savedWallet = savedWalletId ? userWallets.find(w => w.id === savedWalletId) : null;
                  
                  if (savedWallet) {
                      // Saved wallet exists and user still has access - use it (preserves group wallet)
                      setActiveWallet(savedWallet);
                  } else {
                      // Saved wallet not found - either user was removed from group, wallet deleted, or no saved ID
                      // Fallback to personal wallet as safe default
                      const personalWallet = userWallets.find(w => w.isPersonal);
                      setActiveWallet(personalWallet || userWallets[0]);
                  }
              } else {
                  // Only create default personal wallet if user has no wallets at all
                  // This should rarely happen since syncGuestData creates one if guest data exists
                  await storage.createWallet(user, 'Personal Wallet', true);
                  const updatedWallets = await storage.getUserWallets(user);
                  setWallets(updatedWallets);
                  setActiveWallet(updatedWallets[0]);
              }
          }
      };
      loadWallets();
  }, [user]);

  useEffect(() => {
      if (!user || !activeWallet) {
          setExpenses([]);
          return;
      }

      if (user.type === 'guest') {
          setExpenses(storage.getGuestExpenses());
      } else {
          const unsubscribe = storage.subscribeToWalletExpenses(activeWallet.id, (data) => {
              setExpenses(data);
          });
          return () => unsubscribe();
      }
  }, [user, activeWallet]);

  // Memoize month boundaries to avoid recalculating on every expense change
  const monthBoundaries = useMemo(() => {
      const now = new Date();
      return {
          currentMonthStart: startOfMonth(now),
          currentMonthEnd: endOfMonth(now),
          lastMonthStart: startOfMonth(subMonths(now, 1)),
          lastMonthEnd: endOfMonth(subMonths(now, 1))
      };
  }, []); // Only recalculate once per mount (could add day tracking for month changes)

  useEffect(() => {
      let currentMonthExpense = 0;
      let lastMonthExpense = 0;
      
      const categoryTotals: Record<string, number> = {};

      expenses.forEach(e => {
          const d = new Date(e.date);
          const amount = e.amount;

          if (d >= monthBoundaries.currentMonthStart && d <= monthBoundaries.currentMonthEnd) {
              currentMonthExpense += amount;
              categoryTotals[e.categoryId] = (categoryTotals[e.categoryId] || 0) + amount;
          } else if (d >= monthBoundaries.lastMonthStart && d <= monthBoundaries.lastMonthEnd) {
              lastMonthExpense += amount;
          }
      });
      
      let percentChange = 0;
      if (lastMonthExpense > 0) {
          percentChange = ((currentMonthExpense - lastMonthExpense) / lastMonthExpense) * 100;
      } else if (currentMonthExpense > 0) {
          percentChange = 100; 
      }

      setMonthlyStats({
          currentMonthSpending: currentMonthExpense,
          lastMonthSpending: lastMonthExpense,
          percentChange
      });

      const chartData: PieChartData[] = Object.keys(categoryTotals)
        .map(catId => {
          const cat = EXPENSE_CATEGORIES.find(c => c.id === catId);
          const name = cat ? (language === 'en' ? cat.name : cat.name_np) : 'Other';
          const emoji = cat?.emoji || '📝';
          return { name, value: categoryTotals[catId], color: 'gray', emoji };
        })
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value);

      setPieChartData(chartData);

  }, [expenses, language, monthBoundaries]);

  // Notification functions - defined early since other functions depend on them
  const showNotification = useCallback((type: NotificationType, message: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, type, message }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const triggerHaptic = useCallback(() => {
    if (navigator.vibrate) navigator.vibrate(10);
  }, []);

  const switchWallet = useCallback((walletId: string) => {
      const wallet = wallets.find(w => w.id === walletId);
      if (wallet) setActiveWallet(wallet);
  }, [wallets]);

  const createNewWallet = useCallback(async (name: string, isPersonal: boolean = false) => {
      if (!user || user.type === 'guest') return;
      try {
          await storage.createWallet(user, name, isPersonal);
          const updatedWallets = await storage.getUserWallets(user);
          setWallets(updatedWallets);
          const newWallet = updatedWallets.find(w => w.name === name);
          if (newWallet) setActiveWallet(newWallet);
          showNotification('success', 'New Wallet Created');
      } catch (e: any) {
          const errorMsg = e?.message || 'Failed to create wallet';
          showNotification('error', errorMsg);
          if (import.meta.env.DEV) {
              console.error('Error creating wallet:', e);
          }
      }
  }, [user, showNotification]);

  const joinWallet = useCallback(async (code: string) => {
      if (!user || user.type === 'guest') return;
      try {
          await storage.joinWalletByCode(user, code);
          const updatedWallets = await storage.getUserWallets(user);
          setWallets(updatedWallets);
          showNotification('success', 'Joined Wallet Successfully');
      } catch (e: any) {
          const errorMsg = e?.message || 'Invalid Invite Code';
          showNotification('error', errorMsg);
          if (import.meta.env.DEV) {
              console.error('Error joining wallet:', e);
          }
          throw e;
      }
  }, [user, showNotification]);

  const leaveWallet = useCallback(async (walletId: string) => {
      if (!user || user.type === 'guest') return;
      try {
          await storage.leaveWallet(user, walletId);
          const updatedWallets = await storage.getUserWallets(user);
          setWallets(updatedWallets);
          // Switch to first available wallet
          if (updatedWallets.length > 0) {
              setActiveWallet(updatedWallets[0]);
          } else {
              // Safety: If no wallets left, recreate personal wallet
              await createNewWallet('Personal Wallet', true);
          }
          showNotification('success', 'Left Wallet');
      } catch(e: any) {
          const errorMsg = e?.message || 'Failed to leave wallet';
          showNotification('error', errorMsg);
          if (import.meta.env.DEV) {
              console.error('Error leaving wallet:', e);
          }
      }
  }, [user, createNewWallet, showNotification]);

  const deleteWallet = useCallback(async (walletId: string) => {
      if (!user || user.type === 'guest') return;
      try {
          await storage.deleteWallet(user, walletId);
          const updatedWallets = await storage.getUserWallets(user);
          setWallets(updatedWallets);
          // Switch to first available wallet
          if (updatedWallets.length > 0) {
              setActiveWallet(updatedWallets[0]);
          } else {
              // Safety: If no wallets left, recreate personal wallet
              await createNewWallet('Personal Wallet', true);
          }
          showNotification('success', 'Wallet Deleted');
      } catch(e: any) {
          const errorMsg = e?.message || 'Failed to delete wallet';
          showNotification('error', errorMsg);
          if (import.meta.env.DEV) {
              console.error('Error deleting wallet:', e);
          }
      }
  }, [user, createNewWallet, showNotification]);

  const addExpense = useCallback(async (amount: number, category: Category, note: string, date?: Date) => {
    if (!user || !activeWallet) return;
    try {
        const dateStr = date ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
        await storage.addExpense(user, activeWallet.id, {
            categoryId: category.id,
            categoryName: category.name,
            categoryEmoji: category.emoji,
            amount,
            note,
            date: dateStr
        });
        if (user.type === 'guest') setExpenses(storage.getGuestExpenses());
        showNotification('success', 'Expense added');
        triggerHaptic();
    } catch (e: any) {
        const errorMsg = e?.message || 'Failed to save';
        showNotification('error', errorMsg);
        if (import.meta.env.DEV) {
            console.error('Error adding expense:', e);
        }
    }
  }, [user, activeWallet, showNotification, triggerHaptic]);

  const updateExpense = useCallback(async (id: string, amount: number, note: string) => {
    if (!user || !activeWallet) return;
    try {
        await storage.updateExpense(user, activeWallet.id, id, { amount, note });
        if (user.type === 'guest') setExpenses(storage.getGuestExpenses());
        showNotification('success', 'Updated successfully');
        triggerHaptic();
    } catch (e: any) {
        const errorMsg = e?.message || 'Failed to update';
        showNotification('error', errorMsg);
        if (import.meta.env.DEV) {
            console.error('Error updating expense:', e);
        }
    }
  }, [user, activeWallet, showNotification, triggerHaptic]);

  const deleteExpense = useCallback(async (id: string) => {
      if (!user || !activeWallet) return;
      try {
          await storage.deleteExpense(user, activeWallet.id, id);
          if (user.type === 'guest') setExpenses(storage.getGuestExpenses());
          showNotification('info', 'Deleted');
      } catch (e: any) {
          const errorMsg = e?.message || 'Failed to delete';
          showNotification('error', errorMsg);
          if (import.meta.env.DEV) {
              console.error('Error deleting expense:', e);
          }
      }
  }, [user, activeWallet, showNotification]);

  const contextValue = useMemo(() => ({
    language, setLanguage,
    country, setCountry,
    wallets, activeWallet, switchWallet, createNewWallet, joinWallet, leaveWallet, deleteWallet,
    expenses, budget, setBudget, monthlyStats, pieChartData,
    addExpense, updateExpense, deleteExpense, setExpenses,
    notifications, showNotification, dismissNotification, triggerHaptic
  }), [
    language, setLanguage,
    country, setCountry,
    wallets, activeWallet, switchWallet, createNewWallet, joinWallet, leaveWallet, deleteWallet,
    expenses, budget, setBudget, monthlyStats, pieChartData,
    addExpense, updateExpense, deleteExpense,
    notifications, showNotification, dismissNotification, triggerHaptic
  ]);

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  );
};
