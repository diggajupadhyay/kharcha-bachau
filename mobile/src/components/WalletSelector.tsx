import React, { useState, useMemo, useCallback } from 'react';
import {
  Modal, View, Text, Pressable, StyleSheet, ScrollView, TextInput,
  useWindowDimensions, Share, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Wallet } from '../lib/types';
import { useTheme } from '../lib/theme-context';
import { type, space, radius, touchTarget } from '../lib/tokens';
import { Icon } from './Icon';
import { useSheetDrag } from '../lib/useSheetDrag';
import { useScrollTop } from '../lib/useScrollTop';
import { SheetHandle, SheetPanel } from './Sheet';
import { formatAmount, getCurrencySymbol } from '../lib/money';
import { MAX_WALLET_NAME_LENGTH } from '../lib/storage';

interface WalletSelectorProps {
  isOpen: boolean;
  wallets: Wallet[];
  activeWalletId: string;
  /** This month's spend per wallet id, used only for the row subtitle. */
  monthSpend: Record<string, number>;
  /** All-time spend per wallet id, so a wallet with only older expenses still reads as used. */
  totalSpend: Record<string, number>;
  onSwitch: (walletId: string) => Promise<void>;
  onCreate: (name: string, isPersonal?: boolean) => Promise<void>;
  onRename: (walletId: string, name: string) => Promise<void>;
  onDelete: (walletId: string) => Promise<void>;
  /** Only provided when signed in. Personal wallets cannot be invited to. */
  onInvite?: (walletId: string) => Promise<{ code: string; name: string }>;
  onClose: () => void;
}

const WalletSelector: React.FC<WalletSelectorProps> = ({
  isOpen, wallets, activeWalletId, monthSpend, totalSpend,
  onSwitch, onCreate, onRename, onDelete, onInvite, onClose,
}) => {
  const { height: windowHeight } = useWindowDimensions();
  const { theme } = useTheme();
  const symbol = getCurrencySymbol();
  // Pull-down dismiss, so the sheet is reachable on a tall screen where its close
  // button sits off the thumb.
  const { atTop, onScroll } = useScrollTop(isOpen);
  const { translateY, panHandlers, onPanelLayout } = useSheetDrag(isOpen, onClose, atTop);

  /**
   * A wallet row has to be identifiable at a glance, and "Nothing this month" is not:
   * it reads as an empty wallet when every expense is simply older than the current
   * month, so two wallets holding 37 expenses and 2 expenses looked identical. Falls
   * back to the all-time total, and only calls a wallet empty when it truly is.
   */
  const walletSubtitle = useCallback((walletId: string): string => {
    const thisMonth = monthSpend[walletId] ?? 0;
    if (thisMonth > 0) return `${symbol} ${formatAmount(thisMonth)} this month`;
    const total = totalSpend[walletId] ?? 0;
    if (total > 0) return `${symbol} ${formatAmount(total)} in total`;
    return 'Nothing recorded yet';
  }, [monthSpend, totalSpend, symbol]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [shareAsShared, setShareAsShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ code: string; name: string } | null>(null);

  const reset = () => {
    setEditingId(null);
    setCreating(false);
    setDraft('');
    setShareAsShared(false);
    setError(null);
  };

  /** Themed styles; `styles` below stays for the theme-neutral layout entries. */
  const st = useMemo(() => StyleSheet.create({
    scrim: { backgroundColor: theme.scrim },
    panel: { backgroundColor: theme.surface },
    heading: { ...type.title, fontSize: 20, color: theme.text },
    closeButton: { backgroundColor: theme.surfaceSunken },
    row: { backgroundColor: theme.surface, borderColor: theme.border },
    rowActive: { backgroundColor: theme.accentSoft, borderColor: theme.accent },
    name: { ...type.label, color: theme.text },
    sharedBadge: {
      fontSize: 11, fontWeight: '700', color: theme.accent, backgroundColor: theme.accentSoft,
      paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, overflow: 'hidden',
    },
    sub: { ...type.caption, color: theme.textTertiary },
    actionLabel: { ...type.caption, fontWeight: '600', color: theme.textSecondary },
    shareLabel: { ...type.caption, fontWeight: '700', color: theme.accent },
    deleteLabel: { ...type.caption, fontWeight: '700', color: theme.negative },
    addButton: { borderColor: theme.border, backgroundColor: theme.surfaceSunken },
    kindChip: { backgroundColor: theme.surfaceSunken, borderColor: theme.border },
    kindChipOn: { backgroundColor: theme.accent, borderColor: theme.accent },
    kindLabel: { ...type.label, fontSize: 14, color: theme.textSecondary },
    kindLabelOn: { ...type.label, fontSize: 14, color: theme.textOnAccent },
    input: {
      backgroundColor: theme.surfaceSunken, borderColor: theme.accent, color: theme.text,
    },
    cancelButton: { backgroundColor: theme.surfaceSunken },
    saveButton: { backgroundColor: theme.accent },
    cancelLabel: { ...type.label, fontSize: 14, color: theme.textSecondary },
    saveLabel: { ...type.label, fontSize: 14, color: theme.textOnAccent },
    error: { ...type.caption, color: theme.negative },
    hint: { ...type.caption, color: theme.textTertiary },
    invitePanel: { backgroundColor: theme.accentSoft, borderColor: theme.accent },
    inviteTitle: { ...type.label, color: theme.text },
    inviteBody: { ...type.caption, color: theme.textSecondary },
    // The code is the one thing a user reads off the screen and types by hand, so
    // it needs unambiguous letterforms rather than the app's normal tracking.
    inviteCode: {
      fontSize: 28, fontWeight: '700', color: theme.accent,
      letterSpacing: 4, textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    inviteCancel: { backgroundColor: theme.surface, borderColor: theme.border },
    inviteCancelLabel: { ...type.label, color: theme.textSecondary },
    inviteShare: { backgroundColor: theme.accent },
    inviteShareLabel: { ...type.label, color: theme.textOnAccent },
  }), [theme]);

  const handleSwitch = async (walletId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await onSwitch(walletId);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not switch wallet');
    } finally {
      setBusy(false);
    }
  };

  const handleInvite = async (walletId: string) => {
    if (!onInvite || busy) return;
    setBusy(true);
    try {
      setInvite(await onInvite(walletId));
    } catch (e: any) {
      setError(e?.message || 'Could not create an invite code');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveNew = async () => {
    const name = draft.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(name, !shareAsShared);
      reset();
    } catch (e: any) {
      setError(e?.message || 'Could not create the wallet');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveRename = async (walletId: string) => {
    const name = draft.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onRename(walletId, name);
      reset();
    } catch (e: any) {
      setError(e?.message || 'Could not rename the wallet');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (walletId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(walletId);
      reset();
    } catch (e: any) {
      setError(e?.message || 'Could not delete the wallet');
    } finally {
      setBusy(false);
    }
  };

  const renderInput = (walletId?: string) => (
    <View style={styles.editor}>
      <TextInput
        style={[styles.input, st.input]}
        value={draft}
        onChangeText={setDraft}
        maxLength={MAX_WALLET_NAME_LENGTH}
        autoFocus
        placeholder="Wallet name"
        placeholderTextColor={theme.textTertiary}
        onSubmitEditing={() => (walletId ? handleSaveRename(walletId) : handleSaveNew())}
        returnKeyType="done"
      />
      <View style={styles.editorActions}>
        <Pressable
          onPress={reset}
          style={[styles.smallButton, st.cancelButton]}
          android_ripple={{ color: theme.surfacePressed }}
        >
          <Text style={[st.cancelLabel]}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => (walletId ? handleSaveRename(walletId) : handleSaveNew())}
          disabled={busy || draft.trim().length === 0}
          style={[styles.smallButton, st.saveButton, (busy || draft.trim().length === 0) && styles.disabled]}
          android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
        >
          <Text style={[st.saveLabel]}>{walletId ? 'Save' : 'Create'}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
      {/* A Modal is its own window, so it does not inherit the activity's
          adjustResize: the soft keyboard simply covers the sheet. The panel is
          bottom-anchored and content-sized, so the type chips and the Create button
          ended up underneath the keyboard and could not be tapped at all. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flexFill}
        pointerEvents="box-none"
      >
      <View style={[styles.scrim, st.scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <SheetPanel translateY={translateY} panHandlers={panHandlers} onLayout={onPanelLayout} style={[styles.panel, st.panel, { maxHeight: Math.round(windowHeight * 0.85) }]}>
          <SheetHandle />
          <View style={styles.headerRow}>
            <Text style={[styles.heading, st.heading]}>Wallets</Text>
            <Pressable
              onPress={onClose}
              style={[styles.closeButton, st.closeButton]}
              hitSlop={10}
              android_ripple={{ color: theme.surfacePressed, radius: 20 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Icon name="x" size={18} color="" theme={theme} tone="muted" strokeWidth={2.4} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled" onScroll={onScroll}>
            {wallets.map(wallet => {
              const isActive = wallet.id === activeWalletId;
              if (editingId === wallet.id) {
                return (
                  <View key={wallet.id} style={[styles.row, st.row]}>
                    <View style={styles.flex1}>{renderInput(wallet.id)}</View>
                  </View>
                );
              }
              return (
                <View key={wallet.id} style={[styles.row, st.row, isActive && st.rowActive]}>
                  <Pressable
                    onPress={() => handleSwitch(wallet.id)}
                    disabled={busy}
                    style={({ pressed }) => [styles.rowMain, pressed && styles.rowPressed]}
                    android_ripple={{ color: theme.surfacePressed }}
                    accessibilityRole="button"
                    accessibilityLabel={`${wallet.name}${wallet.isPersonal ? '' : ', shared'}. ${isActive ? 'Active. ' : ''}Tap to switch.`}
                  >
                    <View style={styles.flex1}>
                      <View style={styles.nameRow}>
                        <Text style={[styles.name, st.name]} numberOfLines={1}>{wallet.name}</Text>
                        {wallet.isPersonal ? null : (
                          <Text style={[st.sharedBadge]}>Shared</Text>
                        )}
                      </View>
                      <Text style={[styles.sub, st.sub]}>
                        {walletSubtitle(wallet.id)}
                      </Text>
                    </View>
                    {isActive
                      ? <Icon name="check" size={18} color="" theme={theme} tone="accent" strokeWidth={2.6} />
                      : null}
                  </Pressable>

                  <View style={styles.rowActions}>
                    {/* Only shared wallets can be invited to. The rules refuse an
                        invite for a personal wallet, so offering the button there
                        would be a control that can only ever fail. */}
                    {onInvite && !wallet.isPersonal ? (
                      <Pressable
                        onPress={() => handleInvite(wallet.id)}
                        disabled={busy}
                        style={[styles.actionButton, busy && styles.disabled]}
                        hitSlop={6}
                        android_ripple={{ color: theme.surfacePressed, radius: 18 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Invite people to ${wallet.name}`}
                      >
                        <Text style={[st.shareLabel]}>Invite</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => {
                        setEditingId(wallet.id);
                        setCreating(false);
                        setShareAsShared(false);
                        setDraft(wallet.name);
                        setError(null);
                      }}
                      style={styles.actionButton}
                      hitSlop={6}
                      android_ripple={{ color: theme.surfacePressed, radius: 18 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Rename ${wallet.name}`}
                    >
                      <Text style={[st.actionLabel]}>Rename</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleDelete(wallet.id)}
                      disabled={busy || wallets.length <= 1}
                      style={[styles.actionButton, (busy || wallets.length <= 1) && styles.disabled]}
                      hitSlop={6}
                      android_ripple={{ color: theme.negativeSoft, radius: 18 }}
                      accessibilityRole="button"
                      accessibilityLabel={wallets.length <= 1 ? 'Cannot delete the last wallet' : `Delete ${wallet.name}`}
                    >
                      <Text style={[st.deleteLabel]}>
                        {wallets.length <= 1 ? 'Last wallet' : 'Delete'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {creating ? (
              <>
                {onInvite ? (
                  <View style={styles.kindRow}>
                    <Pressable
                      onPress={() => setShareAsShared(false)}
                      style={[styles.kindChip, st.kindChip, !shareAsShared && st.kindChipOn]}
                      android_ripple={{ color: theme.surfacePressed }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: !shareAsShared }}
                    >
                      <Text style={shareAsShared ? st.kindLabel : st.kindLabelOn}>Only me</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setShareAsShared(true)}
                      style={[styles.kindChip, st.kindChip, shareAsShared && st.kindChipOn]}
                      android_ripple={{ color: theme.surfacePressed }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: shareAsShared }}
                    >
                      <Text style={shareAsShared ? st.kindLabelOn : st.kindLabel}>Share with others</Text>
                    </Pressable>
                  </View>
                ) : null}
                {renderInput()}
              </>
            ) : (
              <Pressable
                onPress={() => {
                  setCreating(true);
                  setEditingId(null);
                  setShareAsShared(false);
                  setDraft('');
                  setError(null);
                }}
                style={({ pressed }) => [styles.addButton, st.addButton, pressed && styles.rowPressed]}
                android_ripple={{ color: theme.surfacePressed }}
                accessibilityRole="button"
                accessibilityLabel="New wallet"
              >
                <Icon name="plus" size={16} color="" theme={theme} tone="accent" strokeWidth={2.6} />
              </Pressable>
            )}

            {error ? <Text style={[st.error]}>{error}</Text> : null}
            {wallets.length > 0 && wallets.every(w => w.isPersonal) ? (
              <Text style={[st.hint]}>
                Personal wallets are yours alone. Create one as “Share with others” to invite people.
              </Text>
            ) : null}
          </ScrollView>
        </SheetPanel>

        {invite ? (
          <View style={[styles.invitePanel, st.invitePanel]}>
            <Text style={[st.inviteTitle]}>Invite to {invite.name}</Text>
            <Text style={[st.inviteBody]}>
              They need a Google account, then they enter this code in Settings to join.
            </Text>
            <Text style={[st.inviteCode]} selectable>{invite.code}</Text>
            <View style={styles.inviteActions}>
              <Pressable
                onPress={() => setInvite(null)}
                style={[styles.button, st.inviteCancel]}
                android_ripple={{ color: theme.surfacePressed }}
              >
                <Text style={[st.inviteCancelLabel]}>Close</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void Share.share({ message: `Join my "${invite.name}" wallet in Kharcha Bachau with code ${invite.code}` });
                }}
                style={[styles.button, st.inviteShare]}
                android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
              >
                <Text style={[st.inviteShareLabel]}>Share</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

/** Layout only. Every colour here is supplied by the themed `st` above. */
const styles = StyleSheet.create({
  flexFill: { flex: 1 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: space.md,
  },
  heading: { flexShrink: 1 },
  closeButton: {
    width: 40, height: 40, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { gap: space.sm },

  row: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  rowMain: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm,
    minHeight: touchTarget,
  },
  rowPressed: { opacity: 0.85 },
  flex1: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { flexShrink: 1 },
  sub: { marginTop: 2 },

  rowActions: {
    flexDirection: 'row', gap: space.sm,
    paddingHorizontal: space.md, paddingBottom: space.sm, justifyContent: 'flex-end',
  },
  actionButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10 },
  disabled: { opacity: 0.4 },

  kindRow: { flexDirection: 'row', gap: space.sm, marginBottom: 2 },
  kindChip: {
    flex: 1, minHeight: 44, borderRadius: radius.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },

  invitePanel: { marginTop: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, gap: space.sm },
  inviteActions: { flexDirection: 'row', gap: 10, marginTop: space.xs },
  button: { flex: 1, minHeight: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },

  addButton: {
    minHeight: touchTarget, borderRadius: radius.lg,
    borderWidth: 1, borderStyle: 'dashed',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs,
  },

  editor: { padding: space.md, gap: 10 },
  input: {
    minHeight: 48, borderWidth: 2, borderRadius: radius.md,
    paddingHorizontal: space.lg, fontSize: 16,
  },
  editorActions: { flexDirection: 'row', gap: 10 },
  smallButton: {
    flex: 1, minHeight: 44, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
});

export default WalletSelector;