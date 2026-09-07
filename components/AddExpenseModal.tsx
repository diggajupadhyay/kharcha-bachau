import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Category } from '../types';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { getCategoryIcon, parseCategoryColor } from '../utils/categoryIcons';
import { X, Delete, Check, Users, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { todayISO } from '../utils/date';
import { buildMemberNameMap, memberNameFrom } from '../utils/memberNames';
import ConfirmDialog from './ConfirmDialog';

interface AddExpenseModalProps {
  category: Category;
  isOpen: boolean;
  onClose: () => void;
}

const AddExpenseModal: React.FC<AddExpenseModalProps> = ({ category, isOpen, onClose }) => {
  const { addExpense, activeWallet, expenses, showNotification } = useStore();
  const { user } = useAuth();
  const [amount, setAmount] = useState('0');
  const [amountError, setAmountError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [note, setNote] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [paidBy, setPaidBy] = useState<string>('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const modalRef = React.useRef<HTMLDivElement>(null);
  const currencySymbol = getCurrencySymbol();

  const isGroupWallet = useMemo(() => activeWallet && !activeWallet.isPersonal, [activeWallet]);

  const memberNames = useMemo(() => buildMemberNameMap(activeWallet, expenses, user?.id, user?.name), [activeWallet, expenses, user]);
  const getMemberName = useCallback((userId: string): string => memberNameFrom(memberNames, userId), [memberNames]);

  const availableMembers = useMemo(() => {
    if (!activeWallet || !isGroupWallet) return [];
    return activeWallet.members.map(memberId => ({ id: memberId, name: getMemberName(memberId) }));
  }, [activeWallet, isGroupWallet, getMemberName]);

  // Seeded once, when split mode is switched on. Keyed on `selectedMembers.length`
  // the effect re-ran the moment the list became empty, so unticking the last person
  // instantly re-ticked everybody — the selection could never be cleared.
  const splitSeededRef = useRef(false);
  useEffect(() => {
    if (!isSplitMode) { splitSeededRef.current = false; return; }
    if (splitSeededRef.current || availableMembers.length === 0) return;
    splitSeededRef.current = true;
    if (user) setPaidBy(prev => prev || user.id);
    setSelectedMembers(availableMembers.map(m => m.id));
  }, [isSplitMode, availableMembers, user]);

  // A member who left the wallet must not stay selected, or be left as the payer —
  // the security rules require paidBy to be a current member and would reject the save.
  useEffect(() => {
    if (!isSplitMode) return;
    const ids = new Set(availableMembers.map(m => m.id));
    setSelectedMembers(prev => prev.every(id => ids.has(id)) ? prev : prev.filter(id => ids.has(id)));
    setPaidBy(prev => (prev && !ids.has(prev)) ? (user && ids.has(user.id) ? user.id : '') : prev);
  }, [isSplitMode, availableMembers, user]);

  useEffect(() => { if (isOpen) setAmountError(false); }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleViewportResize = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      const difference = window.innerHeight - vv.height;
      setKeyboardHeight(prev => { if (prev === 0 && difference > 100) return difference; if (prev > 0 && difference <= 100) return 0; return prev; });
    };
    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', handleViewportResize);
    return () => { if (vv) vv.removeEventListener('resize', handleViewportResize); setKeyboardHeight(0); };
  }, [isOpen]);

  const handleDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (!raw) return;
    const [y, m, d] = raw.split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return;
    if (y < 2000 || y > 2100) return;
    const parsed = new Date(y, m - 1, d);
    if (Number.isNaN(parsed.getTime())) return;
    if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) return;
    setSelectedDate(parsed);
  }, []);

  // Split configuration and a back-dated entry count as work too. Checking only the
  // amount and note meant tapping the scrim after setting all of that up closed the
  // sheet with no warning and threw it away.
  const hasUnsavedData = useMemo(
    () => amount !== '0' || note.trim().length > 0 || isSplitMode || format(selectedDate, 'yyyy-MM-dd') !== todayISO(),
    [amount, note, isSplitMode, selectedDate]
  );

  const resetForm = useCallback(() => {
    setAmount('0'); setAmountError(false); setNote(''); setSelectedDate(new Date());
    setIsSplitMode(false); setSelectedMembers([]); setPaidBy('');
  }, []);

  const safeClose = useCallback(() => {
    if (hasUnsavedData) { setShowDiscardConfirm(true); return; }
    onClose(); resetForm();
  }, [hasUnsavedData, onClose, resetForm]);

  const confirmDiscard = useCallback(() => { setShowDiscardConfirm(false); onClose(); resetForm(); }, [onClose, resetForm]);

  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t) {
      const tag = t.tagName;
      const editable = (tag === 'INPUT' && !(t as HTMLInputElement).readOnly) || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
      if (editable) return;
    }
    if (e.key >= '0' && e.key <= '9') handleNumClick(e.key);
    else if (e.key === '.') handleNumClick('.');
    else if (e.key === 'Backspace' || e.key === 'Delete') handleDelete();
    else if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  // Moved above the early return. Sitting below it, this useMemo was called only on
  // renders where the sheet was open, so the hook count changed between renders —
  // React's "Rendered more hooks than during the previous render" crash, waiting for
  // the first caller that keeps the modal mounted while toggling isOpen.
  const calculateSplitAmounts = useMemo(() => {
    const total = parseFloat(amount) || 0;
    if (!isSplitMode || selectedMembers.length === 0 || total === 0) return null;
    const totalCents = Math.round(total * 100);
    const n = selectedMembers.length;
    const baseCents = Math.floor(totalCents / n);
    let remainder = totalCents - baseCents * n;
    return selectedMembers.map(memberId => {
      const cents = baseCents + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      return { userId: memberId, userName: getMemberName(memberId), amount: cents / 100 };
    });
  }, [amount, isSplitMode, selectedMembers, getMemberName]);

  useFocusTrap(modalRef, isOpen, safeClose);

  if (!isOpen) return null;

  // Every branch reads and writes `prev`. The old version mixed the two — it tested
  // the `amount` captured at render time but appended to `prev` — so two taps landing
  // in the same React batch both saw "0" and one digit was lost. The digit and
  // decimal caps are also applied per character, because the "00" key appends two and
  // used to slip a 10th digit or a 3rd decimal past a check written for one.
  const MAX_DIGITS = 9;
  const MAX_DECIMALS = 2;

  const appendChar = (prev: string, ch: string): string => {
    const dotIdx = prev.indexOf('.');
    if (dotIdx !== -1 && prev.length - dotIdx - 1 >= MAX_DECIMALS) return prev;
    if (prev.replace('.', '').length >= MAX_DIGITS) return prev;
    if (prev === '0') return ch;
    return prev + ch;
  };

  const handleNumClick = (num: string) => {
    setAmountError(false);
    if (num === '.') {
      setAmount(prev => prev.includes('.') ? prev : prev + '.');
      return;
    }
    setAmount(prev => Array.from(num).reduce(appendChar, prev));
  };

  const handleDelete = () => {
    setAmountError(false);
    setAmount(prev => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    const val = parseFloat(amount);
    if (!(val > 0)) { setAmountError(true); return; }
    // Splitting with nobody selected, or with no payer chosen, used to fall through
    // and save a plain unsplit expense — the split the user had just configured
    // disappeared without a word.
    if (isSplitMode) {
      if (selectedMembers.length === 0) { showNotification('error', 'Pick at least one person to split with'); return; }
      if (!paidBy) { showNotification('error', 'Choose who paid'); return; }
      if (!calculateSplitAmounts) { showNotification('error', 'Could not work out the split'); return; }
    }
    let splitDetails: { splitType: 'equal'; participants: { userId: string; userName: string; amount: number }[]; paidBy: string } | undefined;
    if (isSplitMode && calculateSplitAmounts && paidBy) {
      splitDetails = { splitType: 'equal' as const, participants: calculateSplitAmounts, paidBy };
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await addExpense(val, category, note, selectedDate, splitDetails);
      submittingRef.current = false; setIsSubmitting(false);
      submitAndClose();
    } catch {
      submittingRef.current = false; setIsSubmitting(false);
    }
  };

  const submitAndClose = () => { onClose(); resetForm(); };

  return (
    <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center pointer-events-none overflow-hidden p-2 md:p-4 lg:p-6">
      <div className="absolute inset-0 bg-slate-900/60 pointer-events-auto animate-fade-in" onClick={safeClose} />
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="add-expense-title"
        className="bg-white w-full sm:max-w-md md:max-w-lg lg:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl pointer-events-auto flex flex-col overflow-hidden relative max-w-full animate-slide-up-bottom sm:animate-scale-in"
        style={{
          height: keyboardHeight > 0 ? `calc(100dvh - ${keyboardHeight}px - env(safe-area-inset-top, 0px))` : 'auto',
          maxHeight: keyboardHeight > 0 ? `calc(100dvh - ${keyboardHeight}px)` : '92vh',
          paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
          paddingBottom: keyboardHeight > 0 ? '0.5rem' : 'max(1rem, env(safe-area-inset-bottom, 0px))'
        }}>

        {/* Drag Handle */}
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${parseCategoryColor(category.color).bg}`}>
              {(() => {
                const Icon = getCategoryIcon(category.id);
                const { text } = parseCategoryColor(category.color);
                return Icon ? <Icon size={20} className={text} /> : <span className="text-lg">{category.emoji}</span>;
              })()}
            </div>
            <div>
              <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">Add</p>
              <h2 id="add-expense-title" className="text-lg font-bold text-slate-900">{category.name}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" aria-label="Date" value={format(selectedDate, 'yyyy-MM-dd')} max={todayISO()} onChange={handleDateChange}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]" />
            <button onClick={safeClose} className="min-w-[44px] min-h-[44px] bg-slate-100 rounded-xl active:scale-95 flex items-center justify-center hover:bg-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2" aria-label="Close">
              <X size={20} className="text-slate-600" />
            </button>
          </div>
        </div>

        {/* Amount */}
        <div className="px-4 sm:px-6 mb-4">
          <div className="relative">
            <span className="text-lg font-medium absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">{currencySymbol}</span>
            <input readOnly aria-label={`Amount, ${currencySymbol}${amount}`} aria-live="polite" value={amount}
              className={`w-full text-right text-3xl font-bold bg-white border rounded-xl p-3.5 pr-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${amountError ? 'border-rose-400' : 'border-slate-300'}`} />
          </div>
          {amountError && <p className="text-xs text-rose-600 mt-1.5 ml-1">Enter an amount greater than 0</p>}
        </div>

        {/* Note */}
        <div className="px-4 sm:px-6 mb-4">
          {/* Capped to match the storage layer and the security rules; without it an
              over-long note was only rejected at save time. */}
          <input type="text" placeholder="Add a note (optional)" value={note} onChange={e => setNote(e.target.value)}
            maxLength={500} className="input" />
        </div>

        {/* Split */}
        {isGroupWallet && (
          <div className="px-4 sm:px-6 mb-4">
            <button onClick={() => setIsSplitMode(!isSplitMode)}
              className={`w-full min-h-[52px] rounded-xl border flex items-center justify-between px-4 active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                isSplitMode ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-300 hover:bg-slate-50'
              }`}>
              <div className="flex items-center gap-2.5">
                <Users size={20} className={isSplitMode ? 'text-emerald-600' : 'text-slate-600'} />
                <span className={`text-sm font-semibold ${isSplitMode ? 'text-emerald-700' : 'text-slate-700'}`}>Split expense</span>
              </div>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isSplitMode ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300'}`}>
                {isSplitMode && <Check size={12} className="text-white" strokeWidth={3} />}
              </div>
            </button>

            {isSplitMode && (
              <div className="mt-3 space-y-3 p-4 bg-slate-50 rounded-xl">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-2">Who paid?</label>
                  <select value={paidBy} onChange={e => setPaidBy(e.target.value)} className="input">
                    {/* A placeholder for the case where paidBy is empty. Without it the
                        select silently displayed the first member while `paidBy` held
                        '', and submitting looked like it had chosen that person. */}
                    {!paidBy && <option value="">Select who paid</option>}
                    {availableMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-2">Split with</label>
                  <div className="space-y-2">
                    {availableMembers.map(member => {
                      const isSelected = selectedMembers.includes(member.id);
                      return (
                        <button key={member.id} onClick={() => setSelectedMembers(prev => isSelected ? prev.filter(id => id !== member.id) : [...prev, member.id])}
                          className={`w-full min-h-[48px] rounded-xl border flex items-center gap-3 px-3 active:scale-[0.98] transition-all ${isSelected ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-300 hover:bg-slate-50'}`}>
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${isSelected ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300'}`}>
                            {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                          </div>
                          <span className="text-sm font-medium text-slate-700 flex-1 text-left">{member.name}</span>
                          {/* Reads the real per-person figure off the same cent
                              distribution that gets saved. Dividing here instead
                              showed everyone an identical share while the stored
                              split gave the remainder paisa to the first few. */}
                          {isSelected && (
                            <span className="text-xs text-slate-500">
                              {currencySymbol}{(calculateSplitAmounts?.find(p => p.userId === member.id)?.amount ?? 0).toFixed(2)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Keypad — 3 columns so every cell holds a real key, then one big
            labeled Save button. The old 4-column grid left a blank cell and hid
            the most important action behind a bare check icon. */}
        <div className="px-4 sm:px-6 pb-2 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {[1,2,3,4,5,6,7,8,9].map(n => <button key={n} onClick={() => handleNumClick(n.toString())} className="btn-secondary !py-4 text-xl font-bold">{n}</button>)}
            <button onClick={() => handleNumClick('.')} className="btn-secondary !py-4 text-xl font-bold" aria-label="Decimal point">.</button>
            <button onClick={() => handleNumClick('0')} className="btn-secondary !py-4 text-xl font-bold">0</button>
            <button onClick={handleDelete} className="btn-secondary !py-4" aria-label="Erase last digit"><Delete size={22} /></button>
          </div>
          <button onClick={handleSubmit} disabled={isSubmitting} className="btn-primary w-full !py-4 text-lg">
            {isSubmitting ? <Loader2 size={24} className="animate-spin" /> : <Check size={24} />}
            {isSubmitting ? 'Saving…' : 'Save expense'}
          </button>
        </div>

      </div>

      {/* Deliberately a sibling of the panel, not a child. The panel keeps a
          transform after its open animation (`forwards`), and a transformed ancestor
          becomes the containing block for `position: fixed` descendants — so nested
          here the discard dialog was positioned and clipped inside the sheet instead
          of covering the screen. */}
      <ConfirmDialog isOpen={showDiscardConfirm} title="Discard this expense?" message="The amount and note you typed will be lost." confirmLabel="Discard" cancelLabel="Keep editing" destructive onConfirm={confirmDiscard} onCancel={() => setShowDiscardConfirm(false)} />
    </div>
  );
};

export default React.memo(AddExpenseModal);
