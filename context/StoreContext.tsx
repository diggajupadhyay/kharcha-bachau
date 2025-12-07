
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StoreContextType, Expense, Notification, NotificationType, Language, Category, MonthlyStats, PieChartData, Wallet, SplitDetails } from '../types';
import * as storage from '../services/storageService';
import { useAuth } from './AuthContext';
import { startOfMonth, subMonths, endOfMonth, format } from 'date-fns';
import { EXPENSE_CATEGORIES } from '../constants';

const StoreContext = createContext<StoreContextType | undefined>(undefined);

const ACTIVE_WALLET_KEY = 'kharcha_bachau_active_wallet_id';
const LANGUAGE_KEY = 'kharcha_bachau_language';
const CUSTOM_CATEGORIES_KEY = 'kharcha_bachau_custom_categories';

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
  
  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
  }, []);
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  // Persist language to localStorage
  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language);
  }, [language]);
  
  // Clean up old country key from localStorage
  useEffect(() => {
    localStorage.removeItem('kharcha_bachau_country');
  }, []);
  
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
  const [customCategories, setCustomCategoriesState] = useState<Category[]>([]);
  
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

  const addExpense = useCallback(async (amount: number, category: Category, note: string, date?: Date, splitDetails?: SplitDetails) => {
    if (!user || !activeWallet) return;
    try {
        const dateStr = date ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
        await storage.addExpense(user, activeWallet.id, {
            categoryId: category.id,
            categoryName: category.name,
            categoryEmoji: category.emoji,
            amount,
            note,
            date: dateStr,
            splitDetails
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

  // Calculate member balances from expenses
  const getMemberBalances = useCallback((): Record<string, number> => {
    if (!activeWallet || !expenses.length) return {};
    
    const balances: Record<string, number> = {};
    
    // Initialize balances for all members
    activeWallet.members.forEach(memberId => {
      balances[memberId] = 0;
    });
    
    // Calculate balances from split expenses (accounting for settlements)
    expenses.forEach(expense => {
      if (expense.splitDetails) {
        const { paidBy, participants, settlements = [] } = expense.splitDetails;
        
        // Person who paid gets credited with the full amount
        if (balances[paidBy] !== undefined) {
          balances[paidBy] += expense.amount;
        }
        
        // Participants owe their share
        participants.forEach(participant => {
          if (balances[participant.userId] !== undefined) {
            // Check if this participant's debt has been settled
            const settlement = settlements.find(
              s => s.fromUserId === participant.userId && s.toUserId === paidBy
            );
            
            if (!settlement) {
              // Not settled: participant owes the amount
              balances[participant.userId] -= participant.amount;
            } else {
              // Settled: participant has paid, so don't subtract from their balance
              // Instead, reduce the payer's balance by the settled amount (they got paid back)
              if (balances[paidBy] !== undefined) {
                balances[paidBy] -= settlement.amount;
              }
              // Participant's balance remains unchanged (they've cleared their debt)
            }
          }
        });
      }
    });
    
    return balances;
  }, [activeWallet, expenses]);

  // Load custom categories from Firestore/localStorage
  useEffect(() => {
    if (!user) {
      setCustomCategoriesState([]);
      return;
    }
    
    const loadCategories = async () => {
      try {
        const categories = await storage.getCustomCategories(user);
        setCustomCategoriesState(categories);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error loading custom categories:', error);
        }
      }
    };
    
    loadCategories();
  }, [user]);

  // Save custom categories to Firestore/localStorage
  // Note: Categories are now saved explicitly in add/update/delete functions
  // This useEffect is kept as a backup for edge cases but should rarely trigger
  // since we explicitly save in each function

  // Get all categories (default + custom)
  const getAllCategories = useCallback((): Category[] => {
    // Merge default and custom categories, custom ones take precedence if same ID
    const categoryMap = new Map<string, Category>();
    
    // Add default categories first
    EXPENSE_CATEGORIES.forEach(cat => {
      categoryMap.set(cat.id, cat);
    });
    
    // Override/add custom categories
    customCategories.forEach(cat => {
      categoryMap.set(cat.id, cat);
    });
    
    return Array.from(categoryMap.values());
  }, [customCategories]);

  // Category Management
  const addCustomCategory = useCallback(async (category: Category) => {
    if (!user) return;
    
    // Validate category
    if (!category.id || !category.name || !category.emoji) {
      showNotification('error', 'Invalid category data');
      return;
    }
    
    // Check if ID already exists
    if (customCategories.find(c => c.id === category.id) || EXPENSE_CATEGORIES.find(c => c.id === category.id)) {
      showNotification('error', 'Category ID already exists');
      return;
    }
    
    try {
      const updatedCategories = [...customCategories, category];
      setCustomCategoriesState(updatedCategories);
      await storage.saveCustomCategories(user, updatedCategories);
      showNotification('success', 'Category added');
      triggerHaptic();
    } catch (error: any) {
      showNotification('error', error.message || 'Failed to save category');
      if (import.meta.env.DEV) {
        console.error('Error adding category:', error);
      }
    }
  }, [user, customCategories, showNotification, triggerHaptic]);

  const updateCustomCategory = useCallback(async (categoryId: string, updates: Partial<Category>) => {
    if (!user) return;
    
    const category = customCategories.find(c => c.id === categoryId);
    if (!category) {
      showNotification('error', 'Category not found');
      return;
    }
    
    // Can't update default categories
    if (EXPENSE_CATEGORIES.find(c => c.id === categoryId)) {
      showNotification('error', 'Cannot modify default categories');
      return;
    }
    
    try {
      const updatedCategories = customCategories.map(c => 
        c.id === categoryId ? { ...c, ...updates } : c
      );
      setCustomCategoriesState(updatedCategories);
      await storage.saveCustomCategories(user, updatedCategories);
      showNotification('success', 'Category updated');
      triggerHaptic();
    } catch (error: any) {
      showNotification('error', error.message || 'Failed to update category');
      if (import.meta.env.DEV) {
        console.error('Error updating category:', error);
      }
    }
  }, [user, customCategories, showNotification, triggerHaptic]);

  const deleteCustomCategory = useCallback(async (categoryId: string) => {
    if (!user) return;
    
    // Can't delete default categories
    if (EXPENSE_CATEGORIES.find(c => c.id === categoryId)) {
      showNotification('error', 'Cannot delete default categories');
      return;
    }
    
    // Check if category is used in expenses
    const isUsed = expenses.some(e => e.categoryId === categoryId);
    if (isUsed) {
      showNotification('error', 'Cannot delete category that is used in expenses');
      return;
    }
    
    try {
      const updatedCategories = customCategories.filter(c => c.id !== categoryId);
      setCustomCategoriesState(updatedCategories);
      await storage.saveCustomCategories(user, updatedCategories);
      showNotification('success', 'Category deleted');
      triggerHaptic();
    } catch (error: any) {
      showNotification('error', error.message || 'Failed to delete category');
      if (import.meta.env.DEV) {
        console.error('Error deleting category:', error);
      }
    }
  }, [user, customCategories, expenses, showNotification, triggerHaptic]);

  const markSettlement = useCallback(async (expenseId: string, fromUserId: string, toUserId: string) => {
    if (!user || !activeWallet) return;
    try {
        const expense = expenses.find(e => e.id === expenseId);
        if (!expense || !expense.splitDetails) {
          showNotification('error', 'Expense not found or not split');
          return;
        }
        
        // Find the debt amount
        const participant = expense.splitDetails.participants.find(p => p.userId === fromUserId);
        if (!participant || participant.amount <= 0) {
          showNotification('error', 'Invalid settlement');
          return;
        }
        
        // Check if already settled
        const existingSettlement = expense.splitDetails.settlements?.find(
          s => s.fromUserId === fromUserId && s.toUserId === toUserId
        );
        if (existingSettlement) {
          showNotification('info', 'Already settled');
          return;
        }
        
        // Add settlement
        const updatedSplitDetails = {
          ...expense.splitDetails,
          settlements: [
            ...(expense.splitDetails.settlements || []),
            {
              fromUserId,
              toUserId,
              amount: participant.amount,
              settledAt: Date.now(),
              settledBy: user.id
            }
          ]
        };
        
        // Update expense with settlement
        await storage.updateExpense(user, activeWallet.id, expenseId, {
          splitDetails: updatedSplitDetails
        });
        
        // Expenses will auto-refresh via subscription, but for guest mode we need to manually update
        if (user.type === 'guest') {
          setExpenses(storage.getGuestExpenses());
        }
        
        showNotification('success', 'Payment marked as settled');
        triggerHaptic();
    } catch (e: any) {
        const errorMsg = e?.message || 'Failed to mark settlement';
        showNotification('error', errorMsg);
        if (import.meta.env.DEV) {
            console.error('Error marking settlement:', e);
        }
    }
  }, [user, activeWallet, expenses, showNotification, triggerHaptic, setExpenses]);

  const contextValue = useMemo(() => ({
    language, setLanguage,
    wallets, activeWallet, switchWallet, createNewWallet, joinWallet, leaveWallet, deleteWallet,
    expenses, budget, setBudget, monthlyStats, pieChartData,
    addExpense, updateExpense, deleteExpense, setExpenses,
    getMemberBalances, markSettlement,
    customCategories, addCustomCategory, updateCustomCategory, deleteCustomCategory, getAllCategories,
    notifications, showNotification, dismissNotification, triggerHaptic
  }), [
    language, setLanguage,
    wallets, activeWallet, switchWallet, createNewWallet, joinWallet, leaveWallet, deleteWallet,
    expenses, budget, setBudget, monthlyStats, pieChartData,
    addExpense, updateExpense, deleteExpense,
    getMemberBalances, markSettlement,
    customCategories, addCustomCategory, updateCustomCategory, deleteCustomCategory, getAllCategories,
    notifications, showNotification, dismissNotification, triggerHaptic
  ]);

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  );
};