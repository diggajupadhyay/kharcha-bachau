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
  budget?: number; // monthly spending limit, stored on the wallet
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

export interface SplitParticipant {
  userId: string;
  userName: string;
  amount: number; // Amount this person owes
}

export interface SettlementRecord {
  fromUserId: string;
  toUserId: string;
  amount: number;
  settledAt: number;
  settledBy: string; // User ID who marked it as settled
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
    participants: SplitParticipant[];
    paidBy: string; // User ID who paid
    settlements?: SettlementRecord[]; // Track which debts have been paid
  };
}

export type SplitDetails = Expense['splitDetails'];
/** The same shape, guaranteed present — for code that has already checked. */
export type Split = NonNullable<SplitDetails>;

export interface MonthlyStats {
  currentMonthSpending: number;
}
