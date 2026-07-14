import { Category } from './types';

export const EXPENSE_CATEGORIES: Category[] = [
  { id: 'food', name: 'Food', emoji: '🍔', color: 'bg-orange-100 text-orange-600' },
  { id: 'transport', name: 'Transport', emoji: '🚕', color: 'bg-blue-100 text-blue-600' },
  { id: 'shopping', name: 'Shopping', emoji: '🛍️', color: 'bg-pink-100 text-pink-600' },
  { id: 'bills', name: 'Bills', emoji: '💡', color: 'bg-yellow-100 text-yellow-600' },
  { id: 'health', name: 'Health', emoji: '💊', color: 'bg-red-100 text-red-600' },
  { id: 'education', name: 'Education', emoji: '📚', color: 'bg-indigo-100 text-indigo-600' },
  { id: 'entertainment', name: 'Fun', emoji: '🎬', color: 'bg-purple-100 text-purple-600' },
  { id: 'rent', name: 'Rent', emoji: '🏠', color: 'bg-teal-100 text-teal-600' },
  { id: 'other', name: 'Other', emoji: '📝', color: 'bg-gray-100 text-gray-600' },
];
