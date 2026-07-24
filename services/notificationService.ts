import { Expense } from '../types';

const currencySymbol = 'Rs.';

export interface AppNotification {
  id: string;
  type: 'budget' | 'settlement' | 'daily';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  timestamp: number;
  read: boolean;
  actionUrl?: string;
}

export interface NotificationPreferences {
  budgetAlerts: boolean;
  settlementReminders: boolean;
  dailyReminders: boolean;
  budgetThresholds: {
    warning: number; // 80%
    critical: number; // 90%
    exceeded: number; // 100%
  };
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  budgetAlerts: true,
  settlementReminders: true,
  dailyReminders: true,
  budgetThresholds: {
    warning: 80,
    critical: 90,
    exceeded: 100
  }
};

const PREFERENCES_KEY = 'kharcha_bachau_notification_preferences';

export const getNotificationPreferences = (): NotificationPreferences => {
  try {
    const stored = localStorage.getItem(PREFERENCES_KEY);
    if (stored) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch (e) {
    if (import.meta.env.DEV) {
      console.error('Error loading notification preferences:', e);
    }
  }
  return DEFAULT_PREFERENCES;
};

export const saveNotificationPreferences = (prefs: NotificationPreferences): void => {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  } catch (e) {
    if (import.meta.env.DEV) {
      console.error('Error saving notification preferences:', e);
    }
  }
};

/**
 * Check budget alerts based on current spending vs budget
 */
export const checkBudgetAlerts = (
  currentSpending: number,
  budget: number,
  preferences: NotificationPreferences = getNotificationPreferences()
): AppNotification[] => {
  if (!preferences.budgetAlerts || budget <= 0) return [];
  
  const percentage = (currentSpending / budget) * 100;
  const notifications: AppNotification[] = [];
  
  let level: 'warning' | 'critical' | 'exceeded' | null = null;
  let title = '';
  let message = '';
  let severity: AppNotification['severity'] = 'info';
  
  if (percentage >= preferences.budgetThresholds.exceeded) {
    level = 'exceeded';
    title = 'Budget Exceeded';
    message = `You've exceeded your monthly budget by ${currencySymbol}${(currentSpending - budget).toLocaleString()}`;
    severity = 'error';
  } else if (percentage >= preferences.budgetThresholds.critical) {
    level = 'critical';
    title = 'Budget Warning';
    message = `You've used ${percentage.toFixed(0)}% of your monthly budget (${currencySymbol}${budget.toLocaleString()})`;
    severity = 'warning';
  } else if (percentage >= preferences.budgetThresholds.warning) {
    level = 'warning';
    title = 'Budget Alert';
    message = `You've used ${percentage.toFixed(0)}% of your monthly budget`;
    severity = 'info';
  }
  
  if (level) {
    notifications.push({
      id: `budget-${level}`,
      type: 'budget',
      title,
      message,
      severity,
      timestamp: Date.now(),
      read: false
    });
  }
  
  return notifications;
};

/**
 * Check settlement reminders for unpaid debts in split expenses
 */
export const checkSettlementReminders = (
  expenses: Expense[],
  currentUserId: string,
  preferences: NotificationPreferences = getNotificationPreferences()
): AppNotification[] => {
  if (!preferences.settlementReminders) return [];
  
  const notifications: AppNotification[] = [];
  const unpaidDebts: Array<{ fromUserId: string; toUserId: string; amount: number; expenseId: string; expenseNote: string }> = [];
  
  expenses.forEach(expense => {
    if (!expense.splitDetails) return;
    
    const { participants, paidBy, settlements = [] } = expense.splitDetails;
    
    // Find debts where current user owes money
    participants.forEach(participant => {
      if (participant.userId === currentUserId && participant.userId !== paidBy) {
        // Check if this debt is already settled
        const isSettled = settlements.some(
          s => s.fromUserId === currentUserId && 
               s.toUserId === paidBy && 
               Math.abs(s.amount - participant.amount) < 0.01
        );
        
        if (!isSettled) {
          unpaidDebts.push({
            fromUserId: currentUserId,
            toUserId: paidBy,
            amount: participant.amount,
            expenseId: expense.id,
            expenseNote: expense.note || expense.categoryName
          });
        }
      }
    });
  });
  
  // Group debts by creditor
  const debtsByCreditor: Record<string, { total: number; expenses: string[] }> = {};
  unpaidDebts.forEach(debt => {
    if (!debtsByCreditor[debt.toUserId]) {
      debtsByCreditor[debt.toUserId] = { total: 0, expenses: [] };
    }
    debtsByCreditor[debt.toUserId].total += debt.amount;
    debtsByCreditor[debt.toUserId].expenses.push(debt.expenseNote);
  });
  
  // Create notifications for each creditor
  Object.entries(debtsByCreditor).forEach(([creditorId, data]) => {
    const expenseCount = data.expenses.length;
    notifications.push({
      id: `settlement-${creditorId}`,
      type: 'settlement',
      title: 'Unpaid Debt',
      message: `You owe ${currencySymbol}${data.total.toFixed(2)} from ${expenseCount} ${expenseCount === 1 ? 'expense' : 'expenses'}`,
      severity: 'warning',
      timestamp: Date.now(),
      read: false,
      actionUrl: '/history'
    });
  });
  
  return notifications;
};

/**
 * Check daily expense reminders (if no expense logged today)
 */
export const checkDailyReminders = (
  expenses: Expense[],
  currentDate: string,
  preferences: NotificationPreferences = getNotificationPreferences()
): AppNotification[] => {
  if (!preferences.dailyReminders) return [];
  
  const hasExpenseToday = expenses.some(e => e.date === currentDate);
  
  if (!hasExpenseToday) {
    // Only show reminder after 6 PM (18:00)
    const now = new Date();
    const hour = now.getHours();
    
    if (hour >= 18) {
      return [{
        id: `daily-reminder-${currentDate}`,
        type: 'daily',
        title: 'Daily Reminder',
        message: "Don't forget to log your expenses today!",
        severity: 'info',
        timestamp: Date.now(),
        read: false
      }];
    }
  }
  
  return [];
};

/**
 * Get all active notifications
 */
export const getAllNotifications = (
  expenses: Expense[],
  currentSpending: number,
  budget: number,
  currentUserId: string,
  currentDate: string,
  preferences: NotificationPreferences = getNotificationPreferences()
): AppNotification[] => {
  const notifications: AppNotification[] = [];
  
  // Budget alerts
  notifications.push(...checkBudgetAlerts(currentSpending, budget, preferences));
  
  // Settlement reminders
  notifications.push(...checkSettlementReminders(expenses, currentUserId, preferences));
  
  // Daily reminders
  notifications.push(...checkDailyReminders(expenses, currentDate, preferences));
  
  // Sort by timestamp (newest first)
  return notifications.sort((a, b) => b.timestamp - a.timestamp);
};

/**
 * Mark notification as read
 */
export const markNotificationAsRead = (notificationId: string, notifications: AppNotification[]): AppNotification[] => {
  return notifications.map(n => 
    n.id === notificationId ? { ...n, read: true } : n
  );
};

/**
 * Dismiss notification (remove it)
 */
export const dismissNotification = (notificationId: string, notifications: AppNotification[]): AppNotification[] => {
  return notifications.filter(n => n.id !== notificationId);
};

