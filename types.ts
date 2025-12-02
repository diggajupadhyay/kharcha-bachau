
export type Language = 'en' | 'np';
export type CountryCode = 'np' | 'in' | 'au';
export type NotificationType = 'success' | 'error' | 'info';
export type Season = 'basanta' | 'grishma' | 'barsha' | 'sharad' | 'hemanta' | 'shishir' | 'all';
export type DateRange = 'thisMonth' | 'lastMonth' | 'all';

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
}

export interface Category {
  id: string;
  name: string;
  name_np: string;
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
}

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  continueAsGuest: () => void;
  resetPassword: (email: string) => Promise<void>;
}

export interface MonthlyStats {
  currentMonthSpending: number;
  lastMonthSpending: number;
  percentChange: number;
}

export interface PieChartData {
  name: string;
  value: number;
  color: string;
  emoji: string;
}

export interface StoreContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  country: CountryCode;
  setCountry: (country: CountryCode) => void;
  
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
  pieChartData: PieChartData[];
  
  addExpense: (amount: number, category: Category, note: string, date?: Date) => Promise<void>;
  updateExpense: (id: string, amount: number, note: string) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  setExpenses: (expenses: Expense[]) => void;
  
  // UI
  notifications: Notification[];
  showNotification: (type: NotificationType, message: string) => void;
  dismissNotification: (id: string) => void;
  triggerHaptic: () => void;
}

export enum ViewState {
  HOME = 'HOME',
  HISTORY = 'HISTORY'
}
