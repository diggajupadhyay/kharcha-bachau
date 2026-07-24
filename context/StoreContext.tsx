
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StoreContextType, Expense, Notification, NotificationType, Category, MonthlyStats, Wallet, SplitDetails } from '../types';
import * as storage from '../services/storageService';
import { useAuth } from './AuthContext';
import { format } from 'date-fns';
import { EXPENSE_CATEGORIES } from '../constants';
import { AppNotification, getAllNotifications } from '../services/notificationService';
import { calculateMemberBalances } from '../utils/balances';

const StoreContext = createContext<StoreContextType | undefined>(undefined);

const ACTIVE_WALLET_KEY = 'kharcha_bachau_active_wallet_id';
const WALLETS_CACHE_KEY = 'kharcha_bachau_wallets_cache';
const READ_NOTIFICATIONS_KEY = 'kharcha_bachau_read_notifications';
const DISMISSED_NOTIFICATIONS_KEY = 'kharcha_bachau_dismissed_notifications';

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoMonthStart = (year: number, month0: number) => `${year}-${pad2(month0 + 1)}-01`;
const isoMonthEnd = (year: number, month0: number) => {
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  return `${year}-${pad2(month0 + 1)}-${pad2(lastDay)}`;
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within a StoreProvider');
  return context;
};

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  
  // App State
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [appNotifications, setAppNotifications] = useState<AppNotification[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(READ_NOTIFICATIONS_KEY) || '[]'));
    } catch {
      return new Set<string>();
    }
  });
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY) || '[]'));
    } catch {
      return new Set<string>();
    }
  });

  const persistReadIds = useCallback((ids: Set<string>) => {
    setReadNotificationIds(ids);
    localStorage.setItem(READ_NOTIFICATIONS_KEY, JSON.stringify([...ids]));
  }, []);

  const persistDismissedIds = useCallback((ids: Set<string>) => {
    setDismissedNotificationIds(ids);
    localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify([...ids]));
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

  // Persist full wallet list to localStorage for offline fallback
  useEffect(() => {
    localStorage.setItem(WALLETS_CACHE_KEY, JSON.stringify(wallets));
  }, [wallets]);

  // Data State
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budget, setBudgetState] = useState(20000);
  const [customCategories, setCustomCategoriesState] = useState<Category[]>([]);
  const [isSyncing, setIsSyncing] = useState(true);
  
  // Derived Stats
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats>({
      currentMonthSpending: 0
  });

  useEffect(() => {
    const loadBudget = async () => {
      const saved = await storage.getStoredBudget(user, activeWallet?.id);
      setBudgetState(saved);
    };
    loadBudget();
  }, [user, activeWallet]);

  const setBudget = useCallback((amount: number) => {
      setBudgetState(amount);
      storage.saveStoredBudget(user, activeWallet?.id, amount);
  }, [user, activeWallet?.id]);

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
                  // Offline fallback: try localStorage cache before creating a new wallet
                  const cached = localStorage.getItem(WALLETS_CACHE_KEY);
                  if (cached) {
                    try {
                      const parsed: Wallet[] = JSON.parse(cached);
                      if (parsed.length > 0) {
                        setWallets(parsed);
                        const saved = savedWalletId ? parsed.find(w => w.id === savedWalletId) : null;
                        setActiveWallet(saved || parsed[0]);
                        return;
                      }
                    } catch { /* ignore corrupt cache */ }
                  }
                  // Only create default personal wallet if no wallets exist anywhere
                  await storage.createWallet(user, 'Personal Wallet', true);
                  const updatedWallets = await storage.getUserWallets(user);
                  setWallets(updatedWallets);
                  setActiveWallet(updatedWallets[0]);
                }
          }
      };
      loadWallets();
  }, [user]);

  // Notification/haptic helpers — defined before the subscription effect that uses them
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

  useEffect(() => {
      if (!user || !activeWallet) {
          setExpenses([]);
          setIsSyncing(false);
          return;
      }

      if (user.type === 'guest') {
          setExpenses(storage.getGuestExpenses());
          setIsSyncing(false);
      } else {
          setIsSyncing(true);
          const hasReceivedData = { current: false };
          const unsubscribe = storage.subscribeToWalletExpenses(
            activeWallet.id,
            (data) => {
              hasReceivedData.current = true;
              setExpenses(data);
              setIsSyncing(false);
            },
            () => {
              setIsSyncing(false);
              if (hasReceivedData.current) {
                showNotification('error', 'Sync issue — showing last saved data');
              }
            }
          );
          return () => unsubscribe();
      }
  }, [user, activeWallet, showNotification]);

  useEffect(() => {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();

      const monthStartStr = isoMonthStart(y, m);
      const monthEndStr = isoMonthEnd(y, m);

      let currentMonthExpense = 0;

      // Compare date-only strings (YYYY-MM-DD) lexicographically — TZ-safe
      expenses.forEach(e => {
          if (e.date >= monthStartStr && e.date <= monthEndStr) {
              currentMonthExpense += e.amount;
          }
      });

      setMonthlyStats({
          currentMonthSpending: Math.round(currentMonthExpense * 100) / 100,
      });

    }, [expenses]);

  // Check app notifications periodically
  useEffect(() => {
    if (!user || !activeWallet) {
      setAppNotifications([]);
      return;
    }
    
    const checkNotifications = () => {
      const currentDate = format(new Date(), 'yyyy-MM-dd');
      const newNotifications = getAllNotifications(
        expenses,
        monthlyStats.currentMonthSpending,
        budget,
        user.id,
        currentDate
      );
      // Respect persisted read/dismissed state
      const visible = newNotifications
        .filter(n => !dismissedNotificationIds.has(n.id))
        .map(n => ({ ...n, read: readNotificationIds.has(n.id) }));
      setAppNotifications(visible);
    };
    
    // Check immediately
    checkNotifications();
    
    // Check every 5 minutes
    const interval = setInterval(checkNotifications, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [user, activeWallet, expenses, monthlyStats.currentMonthSpending, budget, readNotificationIds, dismissedNotificationIds]);
  
  const updateAppNotifications = useCallback((notifications: AppNotification[]) => {
    // Re-apply persisted read/dismissed state when the list is replaced externally
    const visible = notifications
      .filter(n => !dismissedNotificationIds.has(n.id))
      .map(n => ({ ...n, read: readNotificationIds.has(n.id) }));
    setAppNotifications(visible);
  }, [readNotificationIds, dismissedNotificationIds]);

  const markAppNotificationRead = useCallback((id: string) => {
    const next = new Set(readNotificationIds);
    next.add(id);
    persistReadIds(next);
    setAppNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, [readNotificationIds, persistReadIds]);

  const dismissAppNotification = useCallback((id: string) => {
    const next = new Set(dismissedNotificationIds);
    next.add(id);
    persistDismissedIds(next);
    setAppNotifications(prev => prev.filter(n => n.id !== id));
  }, [dismissedNotificationIds, persistDismissedIds]);

  const markAllAppNotificationsRead = useCallback(() => {
    setAppNotifications(prev => {
      const next = new Set(readNotificationIds);
      prev.forEach(n => next.add(n.id));
      persistReadIds(next);
      return prev.map(n => ({ ...n, read: true }));
    });
  }, [readNotificationIds, persistReadIds]);

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
            splitDetails,
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
        const updates: Partial<Expense> = { amount, note };

        const originalExpense = expenses.find(e => e.id === id);
        if (originalExpense?.splitDetails) {
            const updatedSplitDetails = { ...originalExpense.splitDetails };
            if (updatedSplitDetails.splitType === 'equal') {
                const perPerson = amount / updatedSplitDetails.participants.length;
                updatedSplitDetails.participants = updatedSplitDetails.participants.map(p => ({
                    ...p,
                    amount: Math.round(perPerson * 100) / 100
                }));
            }
            updates.splitDetails = updatedSplitDetails;
        }

        await storage.updateExpense(user, activeWallet.id, id, updates);
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
  }, [user, activeWallet, expenses, showNotification, triggerHaptic]);

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

  const restoreExpense = useCallback(async (expense: Expense) => {
      if (!user || !activeWallet) return;
      try {
          await storage.restoreExpense(user, activeWallet.id, expense);
          if (user.type === 'guest') setExpenses(storage.getGuestExpenses());
          showNotification('success', 'Restored');
          triggerHaptic();
      } catch (e: any) {
          const errorMsg = e?.message || 'Failed to restore';
          showNotification('error', errorMsg);
      }
  }, [user, activeWallet, showNotification, triggerHaptic]);

  // Calculate member balances from expenses
  const getMemberBalances = useCallback((): Record<string, number> => {
    if (!activeWallet || !expenses.length) return {};
    return calculateMemberBalances(activeWallet, expenses);
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
    wallets, activeWallet, switchWallet, createNewWallet, joinWallet, leaveWallet, deleteWallet,
    expenses, budget, setBudget, monthlyStats, isSyncing,
    addExpense, updateExpense, deleteExpense, restoreExpense, setExpenses,
    getMemberBalances, markSettlement,
    customCategories, addCustomCategory, updateCustomCategory, deleteCustomCategory, getAllCategories,
    notifications, showNotification, dismissNotification, triggerHaptic,
    appNotifications, updateAppNotifications,
    markAppNotificationRead, dismissAppNotification, markAllAppNotificationsRead
  }), [
    wallets, activeWallet, switchWallet, createNewWallet, joinWallet, leaveWallet, deleteWallet,
    expenses, budget, setBudget, monthlyStats, isSyncing,
    addExpense, updateExpense, deleteExpense, restoreExpense,
    getMemberBalances, markSettlement,
    customCategories, addCustomCategory, updateCustomCategory, deleteCustomCategory, getAllCategories,
    notifications, showNotification, dismissNotification, triggerHaptic,
    appNotifications, updateAppNotifications,
    markAppNotificationRead, dismissAppNotification, markAllAppNotificationsRead
  ]);

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  );
};