import {
  UtensilsCrossed, Car, ShoppingBag, Zap, HeartPulse,
  BookOpen, Film, Home, MoreHorizontal, type LucideIcon
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  food: UtensilsCrossed,
  transport: Car,
  shopping: ShoppingBag,
  bills: Zap,
  health: HeartPulse,
  education: BookOpen,
  entertainment: Film,
  rent: Home,
  other: MoreHorizontal,
};

export function getCategoryIcon(categoryId: string): LucideIcon | undefined {
  return ICON_MAP[categoryId];
}

export function parseCategoryColor(color?: string): { bg: string; text: string } {
  const [bg = 'bg-slate-100', text = 'text-slate-600'] = (color || 'bg-slate-100 text-slate-600').split(' ');
  return { bg, text };
}
