
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StoreContextType, Expense, Notification, NotificationType, Category, MonthlyStats, Wallet, SplitDetails } from '../types';
import * as storage from '../services/storageService';
import { useAuth } from './AuthContext';
import { format } from 'date-fns';
import { EXPENSE_CATEGORIES } from '../constants';
import { calculateMemberBalances } from '../utils/balances';
import { useCurrentDate } from '../hooks/useCurrentDate';

const StoreContext = createContext<StoreContextType | undefined>(undefined);

const ACTIVE_WALLET_KEY = 'kharcha_bachau_active_wallet_id';
const WALLETS_CACHE_KEY = 'kharcha_bachau_wallets_cache';

// Last known wallet list for a signed-in user, used when the Firestore read fails.
const readCachedWallets = (): Wallet[] => {
  try {
    const raw = localStorage.getItem(WALLETS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Wallet[]) : [];
  } catch {
    return [];
  }
};

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

  // Persist full wallet list to localStorage for offline fallback.
  // Never write an empty list: this effect also runs on mount, while `wallets` is
  // still [], which used to erase the cache before the loader could ever read it —
  // leaving signed-in users with no wallets at all when offline.
  // Guest wallets are excluded so the synthetic 'guest_wallet' cannot leak into a
  // signed-in session's fallback.
  useEffect(() => {
    if (user?.type !== 'user' || wallets.length === 0) return;
    try {
      localStorage.setItem(WALLETS_CACHE_KEY, JSON.stringify(wallets));
    } catch {
      // Storage full or blocked — the cache is best-effort.
    }
  }, [wallets, user]);

  // Data State
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budget, setBudgetState] = useState(storage.DEFAULT_BUDGET);
  const [customCategories, setCustomCategoriesState] = useState<Category[]>([]);
  // False until the saved list has actually been read back. See the loader below.
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);
  // Expenses left behind on this device by a migration that did not finish.
  const [pendingGuestExpenses, setPendingGuestExpenses] = useState(0);
  
  // Derived Stats
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats>({
      currentMonthSpending: 0
  });

  // Keyed on the wallet *id*, not the wallet object: every refreshWallets() produces
  // fresh objects, which re-ran this on each mutation. And guarded against a stale
  // resolve — two overlapping loads could land out of order and leave the previous
  // wallet's budget on screen.
  const activeWalletId = activeWallet?.id;
  useEffect(() => {
    let cancelled = false;
    const loadBudget = async () => {
      const saved = await storage.getStoredBudget(user, activeWalletId);
      if (!cancelled) setBudgetState(saved);
    };
    loadBudget();
    return () => { cancelled = true; };
  }, [user, activeWalletId]);

  const setBudget = useCallback((amount: number) => {
      setBudgetState(amount);
      storage.saveStoredBudget(user, activeWallet?.id, amount);
  }, [user, activeWallet?.id]);

  // Publish this user's display name onto the active shared wallet so other members
  // see a name rather than "Member 8f3a". No-ops when already correct.
  useEffect(() => {
    if (!user || !activeWallet) return;
    storage.ensureMemberProfile(user, activeWallet);
  }, [user, activeWallet]);

  // Notification/haptic helpers — declared ahead of every effect that lists them as a
  // dependency, since a dep array is evaluated during render and would otherwise hit
  // the temporal dead zone.
  // Auto-dismiss timers are tracked so they can be cleared on unmount; they used to
  // be fired and forgotten, leaving stray timers running after navigation.
  const toastTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => () => {
    toastTimersRef.current.forEach(clearTimeout);
    toastTimersRef.current.clear();
  }, []);

  // Toasts are stacked vertically from the top of the screen with nothing capping
  // them. A burst — a failing import skipping rows one at a time, say — buried the
  // entire UI under a column of cards. Oldest are dropped past this many.
  const MAX_VISIBLE_TOASTS = 3;

  const showNotification = useCallback((type: NotificationType, message: string) => {
    const id = Math.random().toString(36).substring(2, 11);
    setNotifications(prev => [...prev, { id, type, message }].slice(-MAX_VISIBLE_TOASTS));
    const timer = setTimeout(() => {
      toastTimersRef.current.delete(timer);
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
    toastTimersRef.current.add(timer);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const triggerHaptic = useCallback(() => {
    if (navigator.vibrate) navigator.vibrate(10);
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
                  setPendingGuestExpenses(0);
              } catch (error) {
                  // Do NOT fail silently. The expenses are still in local storage, but
                  // cloud mode never reads local storage, so from the user's side they
                  // have simply vanished right after pressing "Back up Data to Cloud".
                  const stranded = storage.getPendingGuestExpenseCount();
                  setPendingGuestExpenses(stranded);
                  if (stranded > 0) {
                      showNotification(
                          'error',
                          `${stranded} expense${stranded === 1 ? '' : 's'} could not be backed up yet — open Settings to retry`
                      );
                  }
              }
              
              // Get all wallets after sync
              let userWallets: Wallet[];
              try {
                  userWallets = await storage.getUserWallets(user);
              } catch {
                  // The read failed outright — offline with a cold Firestore cache, or a
                  // transient error. Show the last known list and stop here. Falling
                  // through to wallet creation (the old behaviour) is what produced
                  // duplicate personal wallets.
                  const cached = readCachedWallets();
                  if (cached.length > 0) {
                      setWallets(cached);
                      setActiveWallet(cached.find(w => w.id === savedWalletId) || cached[0]);
                      showNotification('info', 'Offline — showing wallets saved on this device');
                  } else {
                      showNotification('error', 'Could not load your wallets. Check your connection and reopen the app.');
                  }
                  return;
              }

              // Cleanup duplicate personal wallets (in case they exist from previous bugs)
              // This also runs after syncGuestData, but we do it here too as a safety measure
              try {
                  await storage.cleanupDuplicatePersonalWallets(user);
                  // Refresh wallets after cleanup
                  userWallets = await storage.getUserWallets(user);
              } catch (error) {
                  // Continue even if cleanup fails — userWallets still holds the pre-cleanup list
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
                  // The read succeeded and really did come back empty: a brand-new
                  // account. Give them a wallet to start in.
                  try {
                      await storage.createWallet(user, 'Personal Wallet', true);
                      const updatedWallets = await storage.getUserWallets(user);
                      if (updatedWallets.length > 0) {
                          setWallets(updatedWallets);
                          setActiveWallet(updatedWallets.find(w => w.isPersonal) || updatedWallets[0]);
                      }
                  } catch {
                      showNotification('error', 'Could not set up your wallet. Check your connection and reopen the app.');
                  }
              }
          }
      };
      loadWallets();
  }, [user, showNotification]);

  // Re-attempt a migration that previously failed. The local copy was never deleted,
  // so this is safe to run repeatedly; it is surfaced in Settings whenever
  // pendingGuestExpenses is non-zero.
  const retryGuestSync = useCallback(async () => {
    if (!user || user.type === 'guest') return;
    try {
      await storage.syncGuestData(user);
      const remaining = storage.getPendingGuestExpenseCount();
      setPendingGuestExpenses(remaining);
      // The backup itself has already succeeded by this point. Refreshing the wallet
      // list is presentation only, so a failure here must not be reported as a
      // failed backup.
      try {
        const refreshed = await storage.getUserWallets(user);
        if (refreshed.length > 0) {
          setWallets(refreshed);
          const personal = refreshed.find(w => w.isPersonal);
          if (personal) setActiveWallet(personal);
        }
      } catch {
        // Keep the current list; the next app open will reconcile it.
      }
      showNotification('success', 'Your device data is now backed up');
    } catch (e: any) {
      setPendingGuestExpenses(storage.getPendingGuestExpenseCount());
      showNotification('error', e?.message || 'Backup failed — your data is still on this device');
    }
  }, [user, showNotification]);

  // Depends on the wallet id rather than the wallet object. Keyed on the object, any
  // wallet-list refresh tore the Firestore listener down and re-established it,
  // re-downloading the whole expense list and flashing the sync skeleton.
  useEffect(() => {
      if (!user || !activeWalletId) {
          setExpenses([]);
          setIsSyncing(false);
          return;
      }

      if (user.type === 'guest') {
          setExpenses(storage.getGuestExpenses());
          setIsSyncing(false);
          // Keep this tab in step with any other tab the user has open.
          return storage.subscribeToGuestDataChanges(() => {
              setExpenses(storage.getGuestExpenses());
          });
      } else {
          setIsSyncing(true);
          const hasReceivedData = { current: false };
          const unsubscribe = storage.subscribeToWalletExpenses(
            activeWalletId,
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
  }, [user, activeWalletId, showNotification]);

  // The month window has to be a dependency, not a value read once inside the effect.
  // Keyed on `expenses` alone, an app left open across midnight on the 1st kept
  // totalling the previous month until the user happened to add an expense.
  const currentDay = useCurrentDate();

  useEffect(() => {
      const [y, m] = currentDay.split('-').map(Number);
      const monthStartStr = isoMonthStart(y, m - 1);
      const monthEndStr = isoMonthEnd(y, m - 1);

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

    }, [expenses, currentDay]);

  const switchWallet = useCallback((walletId: string) => {
      const wallet = wallets.find(w => w.id === walletId);
      if (wallet) setActiveWallet(wallet);
  }, [wallets]);

  // Re-reads the wallet list after a mutation. Never throws: the write it follows has
  // already succeeded, so a failed refresh is a display problem, not a failed action —
  // reporting it as one would tell users their wallet was not created when it was.
  const refreshWallets = useCallback(async (): Promise<Wallet[] | null> => {
      if (!user || user.type === 'guest') return null;
      try {
          const list = await storage.getUserWallets(user);
          setWallets(list);
          return list;
      } catch {
          return null;
      }
  }, [user]);

  const createNewWallet = useCallback(async (name: string, isPersonal: boolean = false) => {
      if (!user || user.type === 'guest') return;
      try {
          // Match on the id createWallet returns, not on the name. Two wallets are
          // allowed to share a name, and matching by name switched the user into
          // whichever one the query happened to return first — usually the old one.
          const newWalletId = await storage.createWallet(user, name, isPersonal);
          const updatedWallets = await refreshWallets();
          const newWallet = updatedWallets?.find(w => w.id === newWalletId);
          if (newWallet) setActiveWallet(newWallet);
          showNotification('success', 'New Wallet Created');
      } catch (e: any) {
          const errorMsg = e?.message || 'Failed to create wallet';
          showNotification('error', errorMsg);
          if (import.meta.env.DEV) {
              console.error('Error creating wallet:', e);
          }
      }
  }, [user, showNotification, refreshWallets]);

  const joinWallet = useCallback(async (code: string) => {
      if (!user || user.type === 'guest') return;
      try {
          await storage.joinWalletByCode(user, code);
          await refreshWallets();
          showNotification('success', 'Joined Wallet Successfully');
      } catch (e: any) {
          const errorMsg = e?.message || 'Invalid Invite Code';
          showNotification('error', errorMsg);
          if (import.meta.env.DEV) {
              console.error('Error joining wallet:', e);
          }
          throw e;
      }
  }, [user, showNotification, refreshWallets]);

  const leaveWallet = useCallback(async (walletId: string) => {
      if (!user || user.type === 'guest') return;
      try {
          await storage.leaveWallet(user, walletId);
          const updatedWallets = await refreshWallets();
          if (updatedWallets) {
              if (updatedWallets.length > 0) {
                  // Land on the personal wallet rather than whatever the query
                  // returned first, which could be another shared wallet.
                  setActiveWallet(updatedWallets.find(w => w.isPersonal) || updatedWallets[0]);
              } else {
                  // Safety: If no wallets left, recreate personal wallet
                  await createNewWallet('Personal Wallet', true);
              }
          }
          showNotification('success', 'Left Wallet');
      } catch(e: any) {
          const errorMsg = e?.message || 'Failed to leave wallet';
          showNotification('error', errorMsg);
          if (import.meta.env.DEV) {
              console.error('Error leaving wallet:', e);
          }
      }
  }, [user, createNewWallet, showNotification, refreshWallets]);

  const deleteWallet = useCallback(async (walletId: string) => {
      if (!user || user.type === 'guest') return;
      try {
          await storage.deleteWallet(user, walletId);
          const updatedWallets = await refreshWallets();
          if (updatedWallets) {
              if (updatedWallets.length > 0) {
                  setActiveWallet(updatedWallets.find(w => w.isPersonal) || updatedWallets[0]);
              } else {
                  // Safety: If no wallets left, recreate personal wallet
                  await createNewWallet('Personal Wallet', true);
              }
          }
          showNotification('success', 'Wallet Deleted');
      } catch(e: any) {
          const errorMsg = e?.message || 'Failed to delete wallet';
          showNotification('error', errorMsg);
          if (import.meta.env.DEV) {
              console.error('Error deleting wallet:', e);
          }
      }
  }, [user, createNewWallet, showNotification, refreshWallets]);

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
        // Rethrow so the caller can keep its form open. Swallowing here made the add
        // modal close on failure and discard whatever the user had typed.
        throw e;
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
                // Rounding each share independently could drift far enough from the
                // total to fail validation — 3 people on Rs 100 gave 33.33 x 3 = 99.99,
                // which the 0.01 tolerance rejected. Distribute the remainder instead.
                const totalCents = Math.round(amount * 100);
                const n = updatedSplitDetails.participants.length;
                const baseCents = Math.floor(totalCents / n);
                let remainder = totalCents - baseCents * n;
                updatedSplitDetails.participants = updatedSplitDetails.participants.map(p => {
                    const cents = baseCents + (remainder > 0 ? 1 : 0);
                    if (remainder > 0) remainder -= 1;
                    return { ...p, amount: cents / 100 };
                });
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
        // Rethrow so the edit sheet stays open. Resolving on failure made the modal
        // close over an error toast, silently discarding the user's correction.
        throw e;
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

  // Load custom categories from Firestore/localStorage.
  //
  // `categoriesLoaded` gates every write. saveCustomCategories persists the whole
  // array, so acting on a list that never loaded (offline, denied) would replace the
  // user's real categories with whatever the empty in-memory list plus their one new
  // entry happened to be.
  useEffect(() => {
    if (!user) {
      setCustomCategoriesState([]);
      setCategoriesLoaded(false);
      return;
    }

    let cancelled = false;
    setCategoriesLoaded(false);
    const loadCategories = async () => {
      try {
        const categories = await storage.getCustomCategories(user);
        if (cancelled) return;
        setCustomCategoriesState(Array.isArray(categories) ? categories : []);
        setCategoriesLoaded(true);
      } catch (error) {
        if (cancelled) return;
        setCustomCategoriesState([]);
        if (import.meta.env.DEV) {
          console.error('Error loading custom categories:', error);
        }
      }
    };

    loadCategories();
    return () => { cancelled = true; };
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
    
    if (!categoriesLoaded) {
      showNotification('error', 'Your categories are still loading. Please try again in a moment.');
      return;
    }

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
    
    const previous = customCategories;
    try {
      const updatedCategories = [...customCategories, category];
      setCustomCategoriesState(updatedCategories);
      await storage.saveCustomCategories(user, updatedCategories);
      showNotification('success', 'Category added');
      triggerHaptic();
    } catch (error: any) {
      // Roll the optimistic update back. Leaving it applied showed a category that
      // was never persisted, which then vanished on the next reload.
      setCustomCategoriesState(previous);
      showNotification('error', error.message || 'Failed to save category');
      if (import.meta.env.DEV) {
        console.error('Error adding category:', error);
      }
      throw error;
    }
  }, [user, customCategories, categoriesLoaded, showNotification, triggerHaptic]);

  const updateCustomCategory = useCallback(async (categoryId: string, updates: Partial<Category>) => {
    if (!user) return;
    
    if (!categoriesLoaded) {
      showNotification('error', 'Your categories are still loading. Please try again in a moment.');
      return;
    }

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
    
    const previous = customCategories;
    try {
      const updatedCategories = customCategories.map(c =>
        c.id === categoryId ? { ...c, ...updates } : c
      );
      setCustomCategoriesState(updatedCategories);
      await storage.saveCustomCategories(user, updatedCategories);
      showNotification('success', 'Category updated');
      triggerHaptic();
    } catch (error: any) {
      setCustomCategoriesState(previous);
      showNotification('error', error.message || 'Failed to update category');
      if (import.meta.env.DEV) {
        console.error('Error updating category:', error);
      }
      throw error;
    }
  }, [user, customCategories, categoriesLoaded, showNotification, triggerHaptic]);

  const deleteCustomCategory = useCallback(async (categoryId: string) => {
    if (!user) return;
    
    if (!categoriesLoaded) {
      showNotification('error', 'Your categories are still loading. Please try again in a moment.');
      return;
    }

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

    const previous = customCategories;
    try {
      const updatedCategories = customCategories.filter(c => c.id !== categoryId);
      setCustomCategoriesState(updatedCategories);
      await storage.saveCustomCategories(user, updatedCategories);
      showNotification('success', 'Category deleted');
      triggerHaptic();
    } catch (error: any) {
      setCustomCategoriesState(previous);
      showNotification('error', error.message || 'Failed to delete category');
      if (import.meta.env.DEV) {
        console.error('Error deleting category:', error);
      }
      throw error;
    }
  }, [user, customCategories, categoriesLoaded, expenses, showNotification, triggerHaptic]);

  const markSettlement = useCallback(async (expenseId: string, fromUserId: string, toUserId: string) => {
    if (!user || !activeWallet) return;
    try {
        const expense = expenses.find(e => e.id === expenseId);
        if (!expense || !expense.splitDetails) {
          throw new Error('Expense not found or not split');
        }

        // Find the debt amount
        const participant = expense.splitDetails.participants.find(p => p.userId === fromUserId);
        if (!participant || participant.amount <= 0) {
          throw new Error('Invalid settlement');
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
        // Rethrow so the caller can tell a real settlement from a failed one. Balance
        // Summary used to show "Settled" with an Undo button even when every write
        // had been rejected.
        throw e;
    }
  }, [user, activeWallet, expenses, showNotification, triggerHaptic, setExpenses]);

  // Reverses a settlement recorded by the current user. Backs the Undo shown right
  // after settling — previously that button only hid the snackbar, leaving the debt
  // marked paid while telling the user it had been taken back.
  const unmarkSettlement = useCallback(async (expenseId: string, fromUserId: string, toUserId: string) => {
    if (!user || !activeWallet) return;
    try {
        const expense = expenses.find(e => e.id === expenseId);
        if (!expense || !expense.splitDetails) {
          showNotification('error', 'Expense not found or not split');
          return;
        }

        const settlements = expense.splitDetails.settlements || [];
        const target = settlements.find(
          s => s.fromUserId === fromUserId && s.toUserId === toUserId && s.settledBy === user.id
        );
        if (!target) {
          // Either already reversed, or recorded by somebody else — only the person
          // who marked it paid is allowed to take it back.
          return;
        }

        const updatedSplitDetails = {
          ...expense.splitDetails,
          settlements: settlements.filter(s => s !== target)
        };

        await storage.updateExpense(user, activeWallet.id, expenseId, {
          splitDetails: updatedSplitDetails
        });

        if (user.type === 'guest') {
          setExpenses(storage.getGuestExpenses());
        }
    } catch (e: any) {
        showNotification('error', e?.message || 'Failed to undo settlement');
        if (import.meta.env.DEV) {
            console.error('Error reversing settlement:', e);
        }
        throw e;
    }
  }, [user, activeWallet, expenses, showNotification]);

  const contextValue = useMemo(() => ({
    wallets, activeWallet, switchWallet, createNewWallet, joinWallet, leaveWallet, deleteWallet,
    expenses, budget, setBudget, monthlyStats, isSyncing,
    pendingGuestExpenses, retryGuestSync,
    addExpense, updateExpense, deleteExpense, restoreExpense, setExpenses,
    getMemberBalances, markSettlement, unmarkSettlement,
    customCategories, addCustomCategory, updateCustomCategory, deleteCustomCategory, getAllCategories,
    notifications, showNotification, dismissNotification, triggerHaptic,
  }), [
    wallets, activeWallet, switchWallet, createNewWallet, joinWallet, leaveWallet, deleteWallet,
    expenses, budget, setBudget, monthlyStats, isSyncing,
    pendingGuestExpenses, retryGuestSync,
    addExpense, updateExpense, deleteExpense, restoreExpense,
    getMemberBalances, markSettlement, unmarkSettlement,
    customCategories, addCustomCategory, updateCustomCategory, deleteCustomCategory, getAllCategories,
    notifications, showNotification, dismissNotification, triggerHaptic,
  ]);

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  );
};