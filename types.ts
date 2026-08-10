
export type NotificationType = 'success' | 'error' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  type: 'guest' | 'user';
  createdAt: number;
}

export interface Wallet {
  id: string;
  name: string;
  ownerId: string;
  members: string[]; // Array of User IDs
  currency: string;
  createdAt: number;
  isPersonal?: boolean; // true = personal-only wallet (not shareable), false/undefined = shared wallet
  inviteCode?: string; // set once for shared wallets; lets members look the code up without listing /invites
  // uid -> display name. users/{uid} is readable only by its owner, so without this
  // there is no way to show a member's name until they happen to log an expense.
  memberProfiles?: Record<string, string>;
}

export interface Category {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export interface Expense {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryEmoji: string;
  amount: number;
  note: string;
  date: string; // YYYY-MM-DD
  walletId: string;
  createdBy: {
    uid: string;
    name: string;
  };
  createdAt: number;
  splitDetails?: {
    splitType: 'equal';
    participants: Array<{
      userId: string;
      userName: string;
      amount: number; // Amount this person owes
    }>;
    paidBy: string; // User ID who paid
    settlements?: Array<{
      fromUserId: string;
      toUserId: string;
      amount: number;
      settledAt: number;
      settledBy: string; // User ID who marked it as settled
    }>; // Track which debts have been paid
  };
}

export interface Settlement {
  id: string;
  expenseId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  settled: boolean;
  settledAt?: number;
  walletId: string;
}

export type SplitDetails = Expense['splitDetails'];

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  continueAsGuest: () => void;
  deleteAccount: () => Promise<void>;
}

export interface MonthlyStats {
  currentMonthSpending: number;
}

export interface StoreContextType {
  // Wallet Management
  wallets: Wallet[];
  activeWallet: Wallet | null;
  switchWallet: (walletId: string) => void;
  createNewWallet: (name: string, isPersonal?: boolean) => Promise<void>;
  joinWallet: (code: string) => Promise<void>;
  leaveWallet: (walletId: string) => Promise<void>;
  deleteWallet: (walletId: string) => Promise<void>;
  
  expenses: Expense[];
  budget: number;
  setBudget: (amount: number) => void;
  monthlyStats: MonthlyStats;
  isSyncing: boolean;

  // Expenses stranded in this device's local storage by an incomplete migration.
  pendingGuestExpenses: number;
  retryGuestSync: () => Promise<void>;
  
  addExpense: (amount: number, category: Category, note: string, date?: Date, splitDetails?: SplitDetails) => Promise<void>;
  updateExpense: (id: string, amount: number, note: string) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  restoreExpense: (expense: Expense) => Promise<void>;
  setExpenses: (expenses: Expense[]) => void;
  
  // Expense Splitting
  getMemberBalances: () => Record<string, number>; // userId -> net balance (positive = owed money, negative = owes money)
  markSettlement: (expenseId: string, fromUserId: string, toUserId: string) => Promise<void>;
  unmarkSettlement: (expenseId: string, fromUserId: string, toUserId: string) => Promise<void>;
  
  // Category Management
  customCategories: Category[];
  addCustomCategory: (category: Category) => Promise<void>;
  updateCustomCategory: (categoryId: string, updates: Partial<Category>) => Promise<void>;
  deleteCustomCategory: (categoryId: string) => Promise<void>;
  getAllCategories: () => Category[]; // Returns default + custom categories merged
  
  // UI
  notifications: Notification[];
  showNotification: (type: NotificationType, message: string) => void;
  dismissNotification: (id: string) => void;
  triggerHaptic: () => void;
  
}

