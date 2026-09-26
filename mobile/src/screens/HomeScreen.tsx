import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Expense } from '../lib/types';
import { useStore } from '../store';
import { getCurrencySymbol, formatAmount } from '../lib/money';
import { colors, radius, parseCategoryColor } from '../lib/theme';
import { todayISO, parseISODate, shiftISODate } from '../lib/date';
import { format } from 'date-fns';
import EditExpenseSheet from '../components/EditExpenseSheet';
import ConfirmDialog from '../components/ConfirmDialog';

type Preset = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'all';

const PAGE_SIZE = 30;

const DATE_PRESETS: Array<{ key: Preset; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7days', label: '7 days' },
  { key: 'last30days', label: '30 days' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'thisYear', label: 'This year' },
  { key: 'all', label: 'All' },
];

interface Row {
  type: 'header' | 'expense';
  key: string;
  label?: string;
  item?: Expense;
}

// Home: wallet summary plus the full transaction list. Adding an expense happens
// only through the + in the nav bar.
const HomeScreen: React.FC = () => {
  const {
    expenses, budget, monthlyStats, activeWallet, isLoaded,
    deleteExpense, restoreExpense, showNotification, triggerHaptic,
  } = useStore();
  const currencySymbol = getCurrencySymbol();
  const insets = useSafeAreaInsets();

  const [searchTerm, setSearchTerm] = useState('');
  const [preset, setPreset] = useState<Preset>('thisMonth');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);

  const currentDate = todayISO();

  const todayTotal = useMemo(() => expenses
    .filter(e => e.date === currentDate)
    .reduce((s, e) => s + e.amount, 0), [expenses, currentDate]);

  const filteredExpenses = useMemo(() => {
    let filtered = expenses;
    const now = new Date();

    if (preset === 'today') {
      filtered = filtered.filter(e => e.date === currentDate);
    } else if (preset === 'yesterday') {
      filtered = filtered.filter(e => e.date === shiftISODate(currentDate, -1));
    } else if (preset === 'thisMonth') {
      const { start, end } = (() => {
        const y = now.getFullYear(), m = now.getMonth();
        const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m + 1, 0).getDate();
        return { start, end: `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` };
      })();
      filtered = filtered.filter(e => e.date >= start && e.date <= end);
    } else if (preset === 'lastMonth') {
      const lm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const ly = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const start = `${ly}-${String(lm + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(ly, lm + 1, 0).getDate();
      const end = `${ly}-${String(lm + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      filtered = filtered.filter(e => e.date >= start && e.date <= end);
    } else if (preset === 'last7days') {
      filtered = filtered.filter(e => e.date >= format(new Date(now.getTime() - 7 * 86400000), 'yyyy-MM-dd'));
    } else if (preset === 'last30days') {
      filtered = filtered.filter(e => e.date >= format(new Date(now.getTime() - 30 * 86400000), 'yyyy-MM-dd'));
    } else if (preset === 'thisYear') {
      filtered = filtered.filter(e => e.date >= `${now.getFullYear()}-01-01`);
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(e =>
        e.note?.toLowerCase().includes(q) ||
        e.categoryName.toLowerCase().includes(q) ||
        e.amount.toString().includes(q)
      );
    }

    return [...filtered].sort((a, b) => {
      const dc = b.date < a.date ? -1 : b.date > a.date ? 1 : 0;
      if (dc === 0) return (b.createdAt || 0) - (a.createdAt || 0);
      return dc;
    });
  }, [expenses, searchTerm, preset, currentDate]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchTerm, preset]);

  const rows = useMemo<Row[]>(() => {
    const visible = filteredExpenses.slice(0, visibleCount);
    const groups = new Map<string, Expense[]>();
    visible.forEach(t => {
      const list = groups.get(t.date) ?? [];
      list.push(t);
      groups.set(t.date, list);
    });
    const sortedDates = [...groups.keys()].sort((a, b) => b.localeCompare(a));

    const out: Row[] = [];
    sortedDates.forEach(date => {
      out.push({ type: 'header', key: `h_${date}`, label: getDateHeader(date) });
      groups.get(date)!.forEach(item => out.push({ type: 'expense', key: item.id, item }));
    });
    return out;
  }, [filteredExpenses, visibleCount]);

  const hasMore = filteredExpenses.length > Math.min(filteredExpenses.length, visibleCount);

  function getDateHeader(dateStr: string): string {
    if (dateStr === currentDate) return 'Today';
    if (dateStr === shiftISODate(currentDate, -1)) return 'Yesterday';
    // A malformed date on a document must never reach `format` as an Invalid Date,
    // which throws a RangeError and takes the whole screen down with it.
    const parsed = parseISODate(dateStr);
    return parsed ? format(parsed, 'MMM d, yyyy') : dateStr;
  }

  const hasActiveFilters = preset !== 'thisMonth' || searchTerm.length > 0;

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    // Awaited: the Undo snackbar must not appear before the delete has landed, or
    // tapping Undo quickly could re-create the expense and then have the delete
    // complete on top of it, losing the entry for good.
    await deleteExpense(target.id);
    setPendingDelete(target);
  };

  useEffect(() => {
    if (!pendingDelete) return;
    const timer = setTimeout(() => setPendingDelete(null), 7000);
    return () => clearTimeout(timer);
  }, [pendingDelete]);

  const handleUndo = useCallback(() => {
    if (pendingDelete) restoreExpense(pendingDelete);
    setPendingDelete(null);
  }, [pendingDelete, restoreExpense]);

  const renderItem = useCallback(({ item }: { item: Row }) => {
    if (item.type === 'header') {
      return <Text style={styles.dateHeader}>{item.label}</Text>;
    }
    const expense = item.item!;
    const { bg } = parseCategoryColor(
      expense.categoryId === 'other' ? 'bg-gray-100 text-gray-600' : undefined
    );
    return (
      <Pressable
        onPress={() => { triggerHaptic(); setEditingExpense(expense); }}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        android_ripple={{ color: '#f1f5f9' }}
      >
        <View style={[styles.rowIcon, { backgroundColor: bg }]}>
          <Text style={styles.rowEmoji}>{expense.categoryEmoji}</Text>
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={styles.rowName} numberOfLines={1}>{expense.categoryName}</Text>
            <Text style={styles.rowAmount} numberOfLines={1}>
              {currencySymbol} {formatAmount(expense.amount)}
            </Text>
          </View>
          {expense.note ? (
            <Text style={styles.rowNote} numberOfLines={1}>{expense.note}</Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => setConfirmDelete(expense)}
          style={styles.rowDelete}
          hitSlop={8}
          android_ripple={{ color: '#ffe4e6', radius: 20, borderless: false }}
        >
          <Text style={styles.rowDeleteIcon}>🗑</Text>
        </Pressable>
      </Pressable>
    );
  }, [currencySymbol, triggerHaptic]);

  const budgetPct = budget > 0 ? Math.min((monthlyStats.currentMonthSpending / budget) * 100, 100) : 0;
  const overBudget = budget > 0 && monthlyStats.currentMonthSpending > budget;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <FlatList
        data={rows}
        renderItem={renderItem}
        keyExtractor={row => row.key}
        contentContainerStyle={[styles.listContent, { paddingBottom: 120 + insets.bottom }]}
        onEndReached={() => setVisibleCount(c => c + PAGE_SIZE)}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.flex1}>
                <Text style={styles.caption}>My Wallet</Text>
                <Text style={styles.walletName} numberOfLines={1}>{activeWallet.name}</Text>
                <Text style={styles.caption}>A wallet is one pot of money — e.g. Home, or a Trip with friends.</Text>
              </View>
            </View>

            {/* Filters: search + preset chips */}
            <View style={styles.filters}>
              <View style={styles.searchWrap}>
                <TextInput
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                  placeholder="Search expenses..."
                  placeholderTextColor={colors.slate500}
                  style={styles.searchInput}
                />
              </View>
              <FlatList
                horizontal
                data={DATE_PRESETS}
                keyExtractor={p => p.key}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => { triggerHaptic(); setPreset(item.key); }}
                    style={({ pressed }) => [
                      styles.chip,
                      preset === item.key ? styles.chipActive : styles.chipIdle,
                      pressed && styles.chipPressed,
                    ]}
                  >
                    <Text style={preset === item.key ? styles.chipLabelActive : styles.chipLabel}>{item.label}</Text>
                  </Pressable>
                )}
              />
              {hasActiveFilters && (
                <Pressable onPress={() => { setPreset('thisMonth'); setSearchTerm(''); }} style={styles.clearButton}>
                  <Text style={styles.clearLabel}>Clear all filters</Text>
                </Pressable>
              )}
            </View>

            {/* Hero card — month total + budget + today */}
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.subhead}>This Month</Text>
                {budget > 0 && (
                  <Text style={[styles.badge, overBudget ? styles.badgeOver : styles.badgeOk]}>
                    {overBudget ? 'Over budget' : 'On track'}
                  </Text>
                )}
              </View>
              <View style={styles.amountRow}>
                <Text style={styles.amountSymbol}>{currencySymbol}</Text>
                <Text style={styles.amount}>{formatAmount(monthlyStats.currentMonthSpending)}</Text>
              </View>
              {budget > 0 && (
                <View style={styles.budgetWrap}>
                  <View style={styles.track}>
                    <View style={[
                      styles.fill,
                      { width: `${budgetPct}%` },
                      overBudget ? styles.fillOver : budgetPct > 80 ? styles.fillWarn : styles.fillOk,
                    ]} />
                  </View>
                  <Text style={styles.caption}>
                    {currencySymbol} {formatAmount(Math.max(0, budget - monthlyStats.currentMonthSpending))} left of {currencySymbol} {formatAmount(budget)}
                  </Text>
                </View>
              )}
              <View style={styles.todayRow}>
                <Text style={styles.subhead}>Today</Text>
                <Text style={styles.todayAmount}>{currencySymbol} {formatAmount(todayTotal)}</Text>
              </View>
            </View>

            {/* Section title */}
            {isLoaded && (
              <Text style={styles.sectionTitle}>Expenses</Text>
            )}
          </>
        }
        ListEmptyComponent={
          isLoaded ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Text style={styles.emptyEmoji}>🔍</Text></View>
              {expenses.length === 0 ? (
                <>
                  <Text style={styles.emptyTitle}>No expenses yet</Text>
                  <Text style={styles.emptyText}>Tap the big + button below to add your first expense</Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>No transactions found</Text>
                  <Text style={styles.emptyText}>Try adjusting your filters or date range</Text>
                </>
              )}
            </View>
          ) : null
        }
      />

      {/* Undo snackbar */}
      {pendingDelete && (
        <View style={[styles.snackbar, { bottom: 100 + insets.bottom }]}>
          <Text style={styles.snackbarLabel}>Deleted</Text>
          <Pressable onPress={handleUndo} hitSlop={8}>
            <Text style={styles.snackbarAction}>Undo</Text>
          </Pressable>
        </View>
      )}

      <EditExpenseSheet expense={editingExpense} isOpen={!!editingExpense} onClose={() => setEditingExpense(null)} />
      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Delete Expense"
        message="Remove this expense? You can undo for a few seconds."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDelete(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.slate50 },
  listContent: { paddingHorizontal: 16, gap: 8 },
  flex1: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  caption: { fontSize: 14, color: colors.slate600, lineHeight: 20 },
  walletName: { fontSize: 26, fontWeight: '800', color: colors.slate900, letterSpacing: -0.5, marginVertical: 2 },

  filters: { gap: 8, paddingBottom: 8 },
  searchWrap: {},
  searchInput: {
    minHeight: 48,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radius.input,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.slate900,
  },
  chips: { gap: 8, paddingRight: 16 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.emerald600 },
  chipIdle: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate300 },
  chipPressed: { transform: [{ scale: 0.96 }] },
  chipLabel: { fontSize: 14, fontWeight: '600', color: colors.slate700 },
  chipLabelActive: { fontSize: 14, fontWeight: '600', color: colors.white },
  clearButton: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  clearLabel: { fontSize: 14, fontWeight: '600', color: colors.slate500 },

  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.card,
    padding: 20,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subhead: { fontSize: 16, fontWeight: '600', color: colors.slate700 },
  badge: { fontSize: 14, fontWeight: '700' },
  badgeOk: { color: colors.emerald700 },
  badgeOver: { color: colors.rose600 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  amountSymbol: { fontSize: 20, fontWeight: '600', color: colors.slate500 },
  amount: { fontSize: 44, fontWeight: '800', color: colors.slate900, letterSpacing: -1 },
  budgetWrap: { gap: 8, marginTop: 12, marginBottom: 4 },
  track: { height: 12, backgroundColor: colors.slate100, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  fillOk: { backgroundColor: colors.emerald500 },
  fillWarn: { backgroundColor: colors.orange400 },
  fillOver: { backgroundColor: colors.rose500 },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
    paddingTop: 12,
    marginTop: 12,
  },
  todayAmount: { fontSize: 20, fontWeight: '700', color: colors.slate900 },

  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.slate700, marginTop: 16, marginBottom: 4 },

  dateHeader: { fontSize: 16, fontWeight: '600', color: colors.slate700, marginTop: 12, marginBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.card,
    padding: 14,
    overflow: 'hidden',
  },
  rowPressed: { transform: [{ scale: 0.99 }] },
  rowIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowEmoji: { fontSize: 24 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  rowName: { fontSize: 16, fontWeight: '700', color: colors.slate900, flexShrink: 1 },
  rowAmount: { fontSize: 16, fontWeight: '800', color: colors.rose600 },
  rowNote: { fontSize: 14, color: colors.slate600, marginTop: 2 },
  rowDelete: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDeleteIcon: { fontSize: 17 },

  empty: { alignItems: 'center', paddingTop: 48, paddingBottom: 24 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 999,
    backgroundColor: colors.slate100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyEmoji: { fontSize: 34 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.slate700 },
  emptyText: { fontSize: 16, color: colors.slate600, marginTop: 4, textAlign: 'center' },

  snackbar: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: colors.slate900,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  snackbarLabel: { color: colors.white, fontSize: 15 },
  snackbarAction: { color: colors.emerald400, fontSize: 15, fontWeight: '700' },
});

export default HomeScreen;
