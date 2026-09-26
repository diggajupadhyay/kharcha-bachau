export type NotificationType = 'success' | 'error' | 'info';

export interface BackupData {
  version: string;
  exportDate: string;
  userId?: string;
  data: {
    expenses: Expense[];
    wallets: Wallet[];
    budget: number;
    customCategories: Category[];
  };
}

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

export interface MonthlyStats {
  currentMonthSpending: number;
}

export interface Notification2 {}
