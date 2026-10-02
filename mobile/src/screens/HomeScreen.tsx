import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../AuthContext';
import { Expense } from '../lib/types';
import { useStore } from '../store';
import { getCurrencySymbol, formatAmount } from '../lib/money';
import { useTheme } from '../lib/theme-context';
import { type, space, radius, touchTarget, getCategoryTint, Theme } from '../lib/tokens';
import { todayISO, parseISODate, shiftISODate } from '../lib/date';
import { format } from 'date-fns';
import EditExpenseSheet from '../components/EditExpenseSheet';
import WalletSelector from '../components/WalletSelector';
import BalanceSummary from '../components/BalanceSummary';
import ConfirmDialog from '../components/ConfirmDialog';
import { Icon, IconName } from '../components/Icon';

type Preset = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'all';

const PAGE_SIZE = 30;

const monthRange = (year: number, monthIndex: number) => {
  const start = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return { start, end: `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` };
};

/**
 * Whether an expense falls inside the active date chip.
 *
 * One definition on purpose. The list and the "N entries hidden by this filter"
 * count both need it, and when they were written separately they drifted, which is
 * how a wallet holding 39 expenses could show an empty list with nothing telling the
 * user that 39 were simply filtered out.
 */
const matchesPreset = (
  expense: Expense,
  preset: Preset,
  now: Date,
  today: string
): boolean => {
  if (preset === 'all') return true;
  if (preset === 'today') return expense.date === today;
  if (preset === 'yesterday') return expense.date === shiftISODate(today, -1);
  if (preset === 'last7days') return expense.date >= format(new Date(now.getTime() - 7 * 86400000), 'yyyy-MM-dd');
  if (preset === 'last30days') return expense.date >= format(new Date(now.getTime() - 30 * 86400000), 'yyyy-MM-dd');
  if (preset === 'thisMonth') {
    const { start, end } = monthRange(now.getFullYear(), now.getMonth());
    return expense.date >= start && expense.date <= end;
  }
  if (preset === 'lastMonth') {
    const idx = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const { start, end } = monthRange(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), idx);
    return expense.date >= start && expense.date <= end;
  }
  return expense.date >= `${now.getFullYear()}-01-01`;
};

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
    expenses, budget, monthlyStats, activeWallet, wallets, isLoaded, monthSpendByWallet,
    totalSpendByWallet,
    historyLoadError, retryHistory,
    deleteExpense, restoreExpense, showNotification, triggerHaptic,
    setActiveWallet, createWallet, renameWallet, deleteWallet,
    balances, transfers, settleUp, undoSettleUp, memberName, getInviteCode,
  } = useStore();
  const { user: session } = useAuth();
  const { theme } = useTheme();
  const currencySymbol = getCurrencySymbol();
  const insets = useSafeAreaInsets();

  const [searchTerm, setSearchTerm] = useState('');
  const [preset, setPreset] = useState<Preset>('thisMonth');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);
  const [walletsOpen, setWalletsOpen] = useState(false);
  const chipListRef = useRef<FlatList<{ key: Preset; label: string }>>(null);
  const [lastSettled, setLastSettled] = useState<{ from: string; to: string } | null>(null);

  const currentDate = todayISO();

  /**
   * Themed styles are built per render from the active theme. A module-level
   * StyleSheet cannot hold theme colours, and the alternative — hardcoding light
   * values and overriding a dozen rows for dark — is how the two drift apart.
   */
  const s = useMemo(() => {
    const money = { fontVariant: theme.fontVariant } as const;
    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.background },
      listContent: { paddingHorizontal: space.lg, gap: space.sm, paddingTop: space.sm },
      flex1: { flex: 1 },

      header: { paddingTop: space.xs, paddingBottom: space.sm },
      overlineLabel: { ...type.overline, color: theme.textTertiary, textTransform: 'uppercase' },
      walletButton: { alignSelf: 'flex-start', paddingRight: space.md },
      walletNameRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
      walletName: { ...type.title, color: theme.text, flexShrink: 1 },
      headerHint: { ...type.caption, color: theme.textTertiary, marginTop: space.xs },

      filters: { gap: space.sm, paddingBottom: space.sm },
      searchWrap: {
        flexDirection: 'row', alignItems: 'center', gap: space.sm,
        backgroundColor: theme.surfaceSunken,
        borderWidth: 1, borderColor: theme.border,
        borderRadius: radius.md,
        paddingHorizontal: space.md,
        minHeight: touchTarget,
      },
      searchInput: {
        flex: 1, fontSize: type.body.fontSize, color: theme.text,
        // The row supplies the height; without this Android adds its own padding.
        paddingVertical: 0,
      },

      chips: { gap: space.sm, paddingRight: space.lg },
      chip: {
        minHeight: 38, paddingHorizontal: space.md, borderRadius: radius.pill,
        alignItems: 'center', justifyContent: 'center',
      },
      // Idle chips are recessed rather than outlined. Eight outlined pills read as
      // eight competing buttons; only the selected one is allowed an edge.
      chipIdle: { backgroundColor: theme.surfaceSunken },
      chipActive: { backgroundColor: theme.accent },
      chipLabel: { ...type.label, fontSize: 14, color: theme.textSecondary },
      chipLabelActive: { ...type.label, fontSize: 14, color: theme.textOnAccent },
      clearButton: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
      clearLabel: { ...type.caption, color: theme.accent, fontWeight: '600' },

      hiddenNote: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        paddingTop: space.sm,
        paddingBottom: space.xs,
      },
      hiddenNoteText: { ...type.caption, color: theme.textTertiary, flexShrink: 1 },

      card: {
        backgroundColor: theme.surface,
        borderWidth: 1, borderColor: theme.border,
        borderRadius: radius.xl,
        padding: space.xl,
        ...(theme.name === 'dark'
          ? { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 }
          : { shadowColor: '#1a1a18', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 }),
      },
      cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
      subhead: { ...type.label, color: theme.textSecondary },
      pill: {
        ...type.caption, fontWeight: '600',
        paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill,
        overflow: 'hidden',
      },
      pillOk: { color: theme.positive, backgroundColor: theme.positiveSoft },
      pillOver: { color: theme.negative, backgroundColor: theme.negativeSoft },

      amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs, marginTop: space.sm },
      amountSymbol: { fontSize: 19, fontWeight: '600', color: theme.textTertiary },
      amount: { ...type.display, ...money, color: theme.text },

      budgetWrap: { gap: space.sm, marginTop: space.lg },
      track: { height: 6, backgroundColor: theme.surfaceSunken, borderRadius: radius.pill, overflow: 'hidden' },
      fill: { height: '100%', borderRadius: radius.pill },
      fillOk: { backgroundColor: theme.accent },
      fillWarn: { backgroundColor: theme.warning },
      fillOver: { backgroundColor: theme.negative },
      budgetText: { ...type.caption, color: theme.textTertiary },

      todayRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.divider,
        paddingTop: space.md, marginTop: space.lg,
      },
      todayAmount: { ...type.heading, ...money, color: theme.text },

      dateHeader: {
        ...type.overline, color: theme.textTertiary, textTransform: 'uppercase',
        marginTop: space.lg, marginBottom: space.xs,
      },

      row: {
        flexDirection: 'row', alignItems: 'center', gap: space.md,
        backgroundColor: theme.surface,
        borderWidth: 1, borderColor: theme.border,
        borderRadius: radius.lg,
        paddingVertical: space.md, paddingLeft: space.md, paddingRight: space.xs,
        overflow: 'hidden',
      },
      rowIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
      rowEmoji: { fontSize: 19 },
      rowBody: { flex: 1, minWidth: 0 },
      rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm },
      rowName: { ...type.label, color: theme.text, flexShrink: 1 },
      rowAmount: { ...type.label, ...money, color: theme.text },
      rowMetaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 },
      rowNote: { ...type.caption, color: theme.textTertiary, flexShrink: 1 },
      rowSplit: {
        fontSize: 11, fontWeight: '700', color: theme.accent,
        backgroundColor: theme.accentSoft, paddingHorizontal: 6, paddingVertical: 2,
        borderRadius: 5, overflow: 'hidden',
      },
      rowDelete: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },

      empty: { alignItems: 'center', paddingTop: space.xxl, paddingBottom: space.xl, paddingHorizontal: space.lg },
      emptyIcon: {
        width: 64, height: 64, borderRadius: radius.pill,
        backgroundColor: theme.surfaceSunken,
        alignItems: 'center', justifyContent: 'center', marginBottom: space.lg,
      },
      emptyTitle: { ...type.heading, color: theme.text, textAlign: 'center' },
      emptyText: { ...type.body, color: theme.textTertiary, marginTop: space.xs, textAlign: 'center', maxWidth: 280 },
      emptyAction: {
        marginTop: space.lg, minHeight: touchTarget, paddingHorizontal: space.xl,
        borderRadius: radius.pill, borderWidth: 1, borderColor: theme.border,
        alignItems: 'center', justifyContent: 'center',
      },
      emptyActionLabel: { ...type.label, color: theme.accent },

      snackbar: {
        position: 'absolute', left: space.lg, right: space.lg,
        backgroundColor: theme.surface,
        borderWidth: 1, borderColor: theme.border,
        borderRadius: radius.lg,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: space.lg, paddingVertical: space.md,
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.22, shadowRadius: 20, elevation: 10,
      },
      snackbarLabel: { ...type.label, color: theme.text },
      snackbarAction: { ...type.label, color: theme.accent },
    });
  }, [theme]);

  const todayTotal = useMemo(() => expenses
    .filter(e => e.date === currentDate)
    .reduce((sum, e) => sum + e.amount, 0), [expenses, currentDate]);

  const filteredExpenses = useMemo(() => {
    const now = new Date();
    let filtered = expenses.filter(e => matchesPreset(e, preset, now, currentDate));

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

  /**
   * How many expenses the date chip is hiding. Shown so an empty-looking list is never
   * mistaken for an empty wallet — the default chip is "This month", so a wallet whose
   * spending is all older renders as nothing at all with no hint that anything exists.
   */
  const hiddenByPreset = useMemo(() => {
    if (preset === 'all' || searchTerm) return 0;
    const now = new Date();
    let n = 0;
    for (const e of expenses) if (!matchesPreset(e, preset, now, currentDate)) n++;
    return n;
  }, [expenses, preset, searchTerm, currentDate]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchTerm, preset]);

  // Scroll the active date chip into view. "This month" is the default and sits
  // fifth of eight, so on a narrow screen it renders off the right edge on launch
  // and the app looks like no filter is applied at all.
  useEffect(() => {
    const index = DATE_PRESETS.findIndex(p => p.key === preset);
    if (index < 0) return;
    // Deferred one tick: the list has no measurements on the first pass, and
    // scrollToIndex against an unmeasured list throws.
    const timer = setTimeout(() => {
      chipListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    }, 80);
    return () => clearTimeout(timer);
  }, [preset]);

  const handleChipScrollFail = useCallback((info: { index: number; averageItemLength: number }) => {
    // Chips have no fixed width, so there is no getItemLayout to lean on. Fall
    // back to an estimate and retry once the rows have been measured.
    chipListRef.current?.scrollToOffset({
      offset: Math.max(0, info.averageItemLength * info.index - 40),
      animated: true,
    });
    setTimeout(() => {
      chipListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
    }, 120);
  }, []);

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

  function getDateHeader(dateStr: string): string {
    if (dateStr === currentDate) return 'Today';
    if (dateStr === shiftISODate(currentDate, -1)) return 'Yesterday';
    // A malformed date on a document must never reach `format` as an Invalid Date,
    // which throws a RangeError and takes the whole screen down with it.
    const parsed = parseISODate(dateStr);
    return parsed ? format(parsed, 'MMM d, yyyy') : dateStr;
  }

  const hasActiveFilters = preset !== 'thisMonth' || searchTerm.length > 0;

  // Non-null when this wallet's full history could not be read.
  const historyError = historyLoadError[activeWallet.id] ?? null;

  const clearFilters = useCallback(() => {
    setPreset('thisMonth');
    setSearchTerm('');
  }, []);

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

  const nameOf = useCallback(
    (userId: string) => memberName(activeWallet, userId),
    [activeWallet, memberName]
  );

  const handleSettle = useCallback(async (fromUserId: string, toUserId: string) => {
    try {
      const { settled, unsettled } = await settleUp(fromUserId, toUserId);
      if (settled > 0) {
        setLastSettled({ from: fromUserId, to: toUserId });
        // A share is marked paid in full or not at all, so a small debt can need
        // more than one round. Saying "settled" when money is still owed would
        // leave the user staring at a balance that refuses to clear.
        showNotification(
          unsettled > 0 ? 'info' : 'success',
          unsettled > 0
            ? `Partly settled — ${formatAmount(unsettled)} still to pay`
            : 'Marked as settled'
        );
      }
    } catch (e: any) {
      showNotification('error', e?.message || 'Could not settle that');
    }
  }, [settleUp, showNotification]);

  const handleUndoSettle = useCallback(async () => {
    if (!lastSettled) return;
    const { from, to } = lastSettled;
    setLastSettled(null);
    try {
      const touched = await undoSettleUp(from, to);
      showNotification('info', touched > 0 ? 'Settlement undone' : 'Nothing to undo');
    } catch (e: any) {
      showNotification('error', e?.message || 'Could not undo that');
    }
  }, [lastSettled, undoSettleUp, showNotification]);

  useEffect(() => {
    if (!lastSettled) return;
    const timer = setTimeout(() => setLastSettled(null), 7000);
    return () => clearTimeout(timer);
  }, [lastSettled]);

  const renderItem = useCallback(({ item }: { item: Row }) => {
    if (item.type === 'header') {
      return <Text style={s.dateHeader}>{item.label}</Text>;
    }
    const expense = item.item!;
    const tint = getCategoryTint(expense.categoryId, theme.name);
    const meta = [
      expense.splitDetails ? `Split ${expense.splitDetails.participants.length} ways` : null,
      expense.note,
    ].filter(Boolean).join(' · ');

    return (
      <Pressable
        onPress={() => { triggerHaptic(); setEditingExpense(expense); }}
        style={s.row}
        android_ripple={{ color: theme.surfacePressed }}
        accessibilityRole="button"
        accessibilityLabel={`${expense.categoryName}, ${currencySymbol} ${formatAmount(expense.amount)}${expense.note ? `, ${expense.note}` : ''}. Tap to edit.`}
      >
        <View style={[s.rowIcon, { backgroundColor: tint.bg }]}>
          <Text style={s.rowEmoji}>{expense.categoryEmoji}</Text>
        </View>
        <View style={s.rowBody}>
          <View style={s.rowTop}>
            <Text style={s.rowName} numberOfLines={1}>{expense.categoryName}</Text>
            <Text style={s.rowAmount} numberOfLines={1}>
              {currencySymbol} {formatAmount(expense.amount)}
            </Text>
          </View>
          {(meta || expense.splitDetails) && (
            <View style={s.rowMetaRow}>
              {expense.splitDetails ? (
                <Text style={s.rowSplit}>Split {expense.splitDetails.participants.length} ways</Text>
              ) : null}
              {expense.note ? <Text style={s.rowNote} numberOfLines={1}>{expense.note}</Text> : null}
            </View>
          )}
        </View>
        <Pressable
          onPress={() => setConfirmDelete(expense)}
          style={s.rowDelete}
          hitSlop={10}
          android_ripple={{ color: theme.negativeSoft, radius: 22 }}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${expense.categoryName}`}
        >
          <Icon name="trash" size={16} color={theme.textTertiary} theme={theme} />
        </Pressable>
      </Pressable>
    );
  }, [s, theme, currencySymbol, triggerHaptic]);

  /**
   * An empty list means two very different things and used to look identical: a
   * brand-new wallet that needs its first entry, or a filtered view that needs
   * its filters loosened. Each gets its own icon, wording and next action.
   */
  const emptyState = useMemo(() => {
    const firstRun = expenses.length === 0;
    const icon: IconName = firstRun ? 'file-text' : 'search';
    // "There is nothing recorded in this wallet yet" is only true when the wallet is
    // genuinely empty. With the default "This month" chip and no search, a wallet whose
    // spending is all older looks filtered-but-empty, and the old message here claimed
    // the data did not exist.
    const filteredNotEmpty = !firstRun && hiddenByPreset > 0;
    return {
      firstRun,
      icon,
      title: filteredNotEmpty ? 'Nothing this period' : firstRun ? 'No expenses yet' : 'Nothing matches',
      text: firstRun
        ? wallets.length > 1
          ? 'Add your first expense with the + button below.'
          : 'Add your first expense with the + button below, or tap your wallet name to set up a shared one.'
        : filteredNotEmpty
          ? `${hiddenByPreset} older ${hiddenByPreset === 1 ? 'entry is' : 'entries are'} hidden by this date filter.`
          : hasActiveFilters
            ? 'Try a wider date range, or clear what you have typed.'
            : 'There is nothing recorded in this wallet yet.',
    };
  }, [expenses.length, wallets.length, hasActiveFilters, hiddenByPreset]);

  const budgetPct = budget > 0 ? Math.min((monthlyStats.currentMonthSpending / budget) * 100, 100) : 0;
  const overBudget = budget > 0 && monthlyStats.currentMonthSpending > budget;

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <FlatList
        data={rows}
        renderItem={renderItem}
        keyExtractor={row => row.key}
        contentContainerStyle={[s.listContent, { paddingBottom: 120 + insets.bottom }]}
        onEndReached={() => setVisibleCount(c => c + PAGE_SIZE)}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <View style={s.header}>
              <Text style={s.overlineLabel}>My wallet</Text>
              <Pressable
                onPress={() => { triggerHaptic(); setWalletsOpen(true); }}
                style={({ pressed }) => [s.walletButton, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={`Wallet: ${activeWallet.name}. Tap to switch.`}
              >
                <View style={s.walletNameRow}>
                  <Text style={s.walletName} numberOfLines={1}>{activeWallet.name}</Text>
                  <Icon name="chevron-down" size={20} color={theme.textTertiary} theme={theme} strokeWidth={2.5} />
                </View>
              </Pressable>
              <Text style={s.headerHint}>
                {wallets.length > 1
                  ? 'Tap the wallet name to switch or add another.'
                  : 'A wallet is one pot of money — e.g. Home, or a Trip with friends.'}
              </Text>
            </View>

            <View style={s.filters}>
              <View style={s.searchWrap}>
                <Icon name="search" size={17} color={theme.textTertiary} theme={theme} />
                <TextInput
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                  placeholder="Search expenses"
                  placeholderTextColor={theme.textTertiary}
                  style={s.searchInput}
                  returnKeyType="search"
                  accessibilityLabel="Search expenses"
                />
              </View>
              <FlatList
                horizontal
                ref={chipListRef}
                data={DATE_PRESETS}
                keyExtractor={p => p.key}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.chips}
                onScrollToIndexFailed={handleChipScrollFail}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => { triggerHaptic(); setPreset(item.key); }}
                    style={({ pressed }) => [
                      s.chip,
                      preset === item.key ? s.chipActive : s.chipIdle,
                      pressed && { opacity: 0.7 },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: preset === item.key }}
                  >
                    <Text style={preset === item.key ? s.chipLabelActive : s.chipLabel}>{item.label}</Text>
                  </Pressable>
                )}
              />
              {hasActiveFilters && (
                <Pressable
                  onPress={clearFilters}
                  style={s.clearButton}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all filters"
                >
                  <Text style={s.clearLabel}>Clear all filters</Text>
                </Pressable>
              )}
            </View>

            {hiddenByPreset > 0 && (
              <Pressable
                onPress={() => setPreset('all')}
                style={({ pressed }) => [s.hiddenNote, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={`${hiddenByPreset} entries hidden by this date filter. Show all.`}
              >
                <Icon name="eye-off" size={14} color="" theme={theme} tone="muted" strokeWidth={2} />
                <Text style={s.hiddenNoteText}>
                  {hiddenByPreset} older {hiddenByPreset === 1 ? 'entry' : 'entries'} hidden — tap to show all
                </Text>
              </Pressable>
            )}

            <View style={s.card}>
              <View style={s.cardTop}>
                <Text style={s.subhead}>This month</Text>
                {budget > 0 && (
                  <Text style={[s.pill, overBudget ? s.pillOver : s.pillOk]}>
                    {overBudget ? 'Over budget' : 'On track'}
                  </Text>
                )}
              </View>
              <View style={s.amountRow}>
                <Text style={s.amountSymbol}>{currencySymbol}</Text>
                <Text style={s.amount}>{formatAmount(monthlyStats.currentMonthSpending)}</Text>
              </View>
              {budget > 0 && (
                <View style={s.budgetWrap}>
                  <View style={s.track}>
                    <View style={[
                      s.fill,
                      { width: `${budgetPct}%` },
                      overBudget ? s.fillOver : budgetPct > 80 ? s.fillWarn : s.fillOk,
                    ]} />
                  </View>
                  <Text style={s.budgetText}>
                    {currencySymbol} {formatAmount(Math.max(0, budget - monthlyStats.currentMonthSpending))} left of {currencySymbol} {formatAmount(budget)}
                  </Text>
                </View>
              )}
              <View style={s.todayRow}>
                <Text style={s.subhead}>Today</Text>
                <Text style={s.todayAmount}>{currencySymbol} {formatAmount(todayTotal)}</Text>
              </View>
            </View>

            <BalanceSummary
              wallet={activeWallet}
              balances={balances}
              transfers={transfers}
              nameOf={nameOf}
              onSettle={handleSettle}
            />

          </>
        }
        ListEmptyComponent={
          isLoaded ? (
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Icon
                  name={historyError ? 'alert-circle' : emptyState.icon}
                  size={26}
                  color=""
                  tone={historyError ? 'negative' : 'muted'}
                  theme={theme}
                />
              </View>
              <Text style={s.emptyTitle}>{historyError ? 'History not loaded' : emptyState.title}</Text>
              <Text style={s.emptyText}>
                {historyError
                  // Without this, a failed load is indistinguishable from a wallet
                  // that genuinely has nothing in it, and the answer to "where did my
                  // September expenses go" is unanswerable from the screen.
                  ? `${historyError} Any expense shown below is only the most recent. Pull to refresh once you are back online.`
                  : emptyState.text}
              </Text>
              {!historyError && !emptyState.firstRun && hasActiveFilters && (
                <Pressable
                  onPress={clearFilters}
                  style={({ pressed }) => [s.emptyAction, pressed && { opacity: 0.6 }]}
                  accessibilityRole="button"
                >
                  <Text style={s.emptyActionLabel}>Clear filters</Text>
                </Pressable>
              )}
              {historyError && (
                <Pressable
                  onPress={() => retryHistory(activeWallet.id)}
                  style={({ pressed }) => [s.emptyAction, pressed && { opacity: 0.6 }]}
                  accessibilityRole="button"
                >
                  <Text style={s.emptyActionLabel}>Try again</Text>
                </Pressable>
              )}
            </View>
          ) : null
        }
      />

      {/* Undo snackbar for a settlement */}
      {lastSettled && (
        <View style={[s.snackbar, { bottom: 100 + insets.bottom }]}>
          <Text style={s.snackbarLabel}>Settled</Text>
          <Pressable onPress={handleUndoSettle} hitSlop={8} accessibilityRole="button">
            <Text style={s.snackbarAction}>Undo</Text>
          </Pressable>
        </View>
      )}

      {/* Undo snackbar */}
      {pendingDelete && !lastSettled && (
        <View style={[s.snackbar, { bottom: 100 + insets.bottom }]}>
          <Text style={s.snackbarLabel}>Deleted</Text>
          <Pressable onPress={handleUndo} hitSlop={8} accessibilityRole="button">
            <Text style={s.snackbarAction}>Undo</Text>
          </Pressable>
        </View>
      )}

      <EditExpenseSheet expense={editingExpense} isOpen={!!editingExpense} onClose={() => setEditingExpense(null)} />
      <WalletSelector
        isOpen={walletsOpen}
        wallets={wallets}
        activeWalletId={activeWallet.id}
        monthSpend={monthSpendByWallet}
        totalSpend={totalSpendByWallet}
        onSwitch={setActiveWallet}
        onCreate={async (name, isPersonal = true) => { await createWallet(name, isPersonal); }}
        onRename={renameWallet}
        onDelete={deleteWallet}
        onInvite={session.type === 'cloud' ? getInviteCode : undefined}
        onClose={() => setWalletsOpen(false)}
      />
      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Delete expense"
        message="Remove this expense? You can undo for a few seconds."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDelete(null)}
      />
    </View>
  );
};

export default HomeScreen;