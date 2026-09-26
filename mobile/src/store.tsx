import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Expense, Category, Wallet, Notification, NotificationType, MonthlyStats } from './lib/types';
import {
  createGuestWallet, getGuestExpenses, mutateGuestExpenses,
  getGuestCategories, saveGuestCategories,
  getStoredBudget, saveStoredBudget, clearLocalData, DEFAULT_BUDGET,
} from './lib/storage';
import { EXPENSE_CATEGORIES } from './lib/constants';
import { todayISO } from './lib/date';
import * as Haptics from 'expo-haptics';

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export const useStore = (): StoreContextValue => {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within a StoreProvider');
  return context;
};

interface StoreContextValue {
  activeWallet: Wallet;
  expenses: Expense[];
  budget: number;
  monthlyStats: MonthlyStats;
  isLoaded: boolean;
  isSaving: boolean;

  addExpense: (amount: number, category: Category, note: string, date?: Date) => Promise<void>;
  updateExpense: (id: string, amount: number, note: string) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  restoreExpense: (expense: Expense) => Promise<void>;
  replaceExpenses: (expenses: Expense[]) => Promise<void>;

  setBudget: (amount: number) => Promise<void>;

  customCategories: Category[];
  addCustomCategory: (category: Category) => Promise<void>;
  deleteCustomCategory: (categoryId: string) => Promise<void>;
  getAllCategories: () => Category[];

  // Data management
  clearAllData: () => Promise<void>;

  // UI
  notifications: Notification[];
  showNotification: (type: NotificationType, message: string) => void;
  dismissNotification: (id: string) => void;
  triggerHaptic: () => void;
}

// Hermes has no built-in crypto.randomUUID; expense ids need uniqueness, not
// cryptography, so the standard Math.random RFC-4122 shape is sufficient.
const uuid = (): string => {
  let out = '';
  for (let i = 0; i < 32; i++) {
    if (i === 12) { out += '4'; continue; }
    if (i === 16) { out += '8'; continue; }
    if (i === 8 || i === 20) { out += '-'; continue; }
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
};

// Cloud writes are bounded by the security rules; local writes are not, so the
// same limits are applied here.
const validateAmount = (amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter an amount greater than 0');
  if (amount > 1000000000) throw new Error('That amount is too large');
};

const validateNote = (note: string) => {
  if (note && note.length > 500) throw new Error('Note too long (max 500 characters)');
};

const isoMonthBounds = (): { start: string; end: string } => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
};

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budget, setBudgetState] = useState<number>(DEFAULT_BUDGET);
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  const activeWallet = useMemo(() => createGuestWallet(), []);

  // Load everything once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loadedExpenses, loadedBudget, loadedCategories] = await Promise.all([
          getGuestExpenses(),
          getStoredBudget(activeWallet.id),
          getGuestCategories(),
        ]);
        if (cancelled) return;
        setExpenses(loadedExpenses);
        setBudgetState(loadedBudget);
        setCustomCategories(loadedCategories);
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [activeWallet]);

  const monthlyStats = useMemo<MonthlyStats>(() => {
    const { start, end } = isoMonthBounds();
    const currentMonthSpending = expenses
      .filter(e => e.date >= start && e.date <= end)
      .reduce((s, e) => s + e.amount, 0);
    return { currentMonthSpending };
  }, [expenses]);

  // ---- UI ---------------------------------------------------------------

  const showNotification = useCallback((type: NotificationType, message: string) => {
    const id = uuid();
    setNotifications(prev => [...prev, { id, type, message }]);
    // Auto-dismiss after 4s, matching the web toast.
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, []);

  // ---- Expenses ----------------------------------------------------------

  const addExpense = useCallback(async (
    amount: number, category: Category, note: string, date?: Date
  ): Promise<void> => {
    if (savingRef.current) return;
    validateAmount(amount);
    validateNote(note);

    const newExpense: Expense = {
      id: uuid(),
      categoryId: category.id,
      categoryName: category.name,
      categoryEmoji: category.emoji,
      amount,
      note: note.trim(),
      date: date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : todayISO(),
      walletId: activeWallet.id,
      createdBy: { uid: 'guest', name: 'Guest' },
      createdAt: Date.now(),
    };

    savingRef.current = true;
    setIsSaving(true);
    try {
      const next = await mutateGuestExpenses(current => [...current, newExpense]);
      setExpenses(next);
      showNotification('success', 'Expense added');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [activeWallet, showNotification]);

  const updateExpense = useCallback(async (id: string, amount: number, note: string): Promise<void> => {
    if (savingRef.current) return;
    validateAmount(amount);
    validateNote(note);

    savingRef.current = true;
    setIsSaving(true);
    try {
      const next = await mutateGuestExpenses(current =>
        current.map(p => (p.id === id ? { ...p, amount, note: note.trim() } : p))
      );
      setExpenses(next);
      showNotification('success', 'Expense updated');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [showNotification]);

  const deleteExpense = useCallback(async (id: string): Promise<void> => {
    const next = await mutateGuestExpenses(current => current.filter(p => p.id !== id));
    setExpenses(next);
  }, []);

  const restoreExpense = useCallback(async (expense: Expense): Promise<void> => {
    const next = await mutateGuestExpenses(current =>
      current.some(p => p.id === expense.id) ? current : [...current, expense]
    );
    setExpenses(next);
  }, []);

  const replaceExpenses = useCallback(async (next: Expense[]): Promise<void> => {
    const saved = await mutateGuestExpenses(() => next);
    setExpenses(saved);
  }, []);

  // ---- Budget ------------------------------------------------------------

  const setBudget = useCallback(async (amount: number): Promise<void> => {
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Enter a valid budget');
    await saveStoredBudget(activeWallet.id, amount);
    setBudgetState(amount);
  }, [activeWallet]);

  // ---- Categories ----------------------------------------------------------

  const getAllCategories = useCallback((): Category[] => {
    // "Other" sorts last, matching the web picker.
    const all = [...EXPENSE_CATEGORIES, ...customCategories];
    return [...all].sort((a, b) => {
      const aOther = a.name.toLowerCase() === 'other';
      const bOther = b.name.toLowerCase() === 'other';
      if (aOther && !bOther) return 1;
      if (!aOther && bOther) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [customCategories]);

  const addCustomCategory = useCallback(async (category: Category): Promise<void> => {
    const next = [...customCategories, category];
    await saveGuestCategories(next);
    setCustomCategories(next);
  }, [customCategories]);

  const deleteCustomCategory = useCallback(async (categoryId: string): Promise<void> => {
    const next = customCategories.filter(c => c.id !== categoryId);
    await saveGuestCategories(next);
    setCustomCategories(next);
  }, [customCategories]);

  // ---- Data management -----------------------------------------------------

  const clearAllData = useCallback(async (): Promise<void> => {
    await clearLocalData();
    setExpenses([]);
    setBudgetState(DEFAULT_BUDGET);
    setCustomCategories([]);
  }, []);

  const value: StoreContextValue = {
    activeWallet,
    expenses,
    budget,
    monthlyStats,
    isLoaded,
    isSaving,
    addExpense,
    updateExpense,
    deleteExpense,
    restoreExpense,
    replaceExpenses,
    setBudget,
    customCategories,
    addCustomCategory,
    deleteCustomCategory,
    getAllCategories,
    clearAllData,
    notifications,
    showNotification,
    dismissNotification,
    triggerHaptic,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};
