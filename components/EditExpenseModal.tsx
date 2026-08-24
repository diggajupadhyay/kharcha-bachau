import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Expense } from '../types';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { buildMemberNameMap, memberNameFrom } from '../utils/memberNames';
import { X, CheckCircle2, Users } from 'lucide-react';

const EditExpenseModal: React.FC<{ expense: Expense | null; isOpen: boolean; onClose: () => void }> = ({ expense, isOpen, onClose }) => {
  const { updateExpense, expenses, activeWallet } = useStore();
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const currencySymbol = getCurrencySymbol();

  const isOwner = !user || user.type === 'guest' || expense?.createdBy?.uid === user.id;

  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen, onClose);

  // Closing was previously done by calling setTimeout straight out of the render
  // body — a side effect scheduled on every render pass, including the ones React
  // throws away. Moved into an effect so it runs once, after commit.
  useEffect(() => {
    if (isOpen && expense && !isOwner) onClose();
  }, [isOpen, expense, isOwner, onClose]);

  // Built once per (wallet, expenses) change rather than once per participant row.
  const memberNames = useMemo(() => buildMemberNameMap(activeWallet, expenses, user?.id, user?.name), [activeWallet, expenses, user]);
  const getMemberName = useCallback((userId: string): string => memberNameFrom(memberNames, userId), [memberNames]);

  useEffect(() => {
    if (isOpen && expense) { setAmount(expense.amount.toString()); setNote(expense.note); setError(''); }
  }, [isOpen, expense]);

  if (!isOpen || !expense) return null;

  const handleUpdate = async () => {
    if (isSaving) return;
    const val = parseFloat(amount);
    if (!Number.isFinite(val) || val <= 0) { setError('Enter an amount greater than 0'); return; }
    if (val > 1000000000) { setError('That amount is too large'); return; }
    if (note.length > 500) { setError('Note too long (max 500 characters)'); return; }
    setError('');
    setIsSaving(true);
    try {
      await updateExpense(expense.id, val, note);
      // Only closed on success. `updateExpense` used to swallow its error, so the
      // sheet closed over a red toast and threw away the user's correction.
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not save. Please try again.');
    } finally { setIsSaving(false); }
  };

  // The wrapper is pointer-events-none so the page behind stays scrollable at the
  // edges; the scrim and the panel must opt back in, or nothing inside the sheet can
  // be clicked at all.
  return (
    <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center pointer-events-none overflow-x-hidden p-0 sm:p-2 md:p-4 lg:p-6">
      <div className="absolute inset-0 bg-slate-900/60 pointer-events-auto" onClick={onClose} />
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="edit-expense-title"
        className="bg-white w-full sm:max-w-md md:max-w-lg lg:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl pointer-events-auto relative z-10 max-w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto animate-slide-up-bottom sm:animate-scale-in"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}>
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3 sm:hidden" />
        <div className="px-4 sm:px-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-rose-50">
                {expense.categoryEmoji}
              </div>
              <div>
                <h2 id="edit-expense-title" className="text-heading text-slate-900">Edit Transaction</h2>
                <p className="text-caption">Update the details below</p>
              </div>
            </div>
            <button onClick={onClose} className="min-w-[44px] min-h-[44px] bg-slate-100 rounded-xl active:scale-95 flex items-center justify-center hover:bg-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
              <X size={20} className="text-slate-600" />
            </button>
          </div>

          <div className="space-y-4 mb-5">
            <div>
              <label htmlFor="edit-amount" className="text-subhead block mb-2">Amount</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">{currencySymbol}</span>
                <input id="edit-amount" type="number" inputMode="decimal" min={0} step="0.01" value={amount}
                  onChange={e => { setAmount(e.target.value); if (error) setError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleUpdate(); } }}
                  aria-invalid={!!error} aria-describedby={error ? 'edit-amount-error' : undefined} className="input pl-12" />
              </div>
              {error && <p id="edit-amount-error" className="text-xs text-rose-600 mt-1.5 ml-1">{error}</p>}
            </div>
            <div>
              <label htmlFor="edit-note" className="text-subhead block mb-2">Note</label>
              <input id="edit-note" type="text" value={note} onChange={e => setNote(e.target.value)} maxLength={500} className="input" />
            </div>
            {expense.splitDetails && (
              <div className="pt-3 border-t border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={16} className="text-emerald-600" />
                  <span className="text-sm font-semibold text-slate-900">Split Expense</span>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 space-y-2">
                  <div className="text-xs text-slate-600"><span className="font-medium">Paid by:</span> {getMemberName(expense.splitDetails.paidBy)}</div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-slate-600 block">Participants:</span>
                    {expense.splitDetails.participants.map((participant, idx) => (
                      <div key={participant.userId || idx} className="flex justify-between items-center text-xs">
                        {/* Resolved live rather than trusting `userName`, which is a
                            snapshot taken when the expense was created and goes stale
                            when someone changes their Google display name. */}
                        <span className="text-slate-700">{getMemberName(participant.userId) || participant.userName}</span>
                        <span className="font-semibold text-slate-900">{currencySymbol}{participant.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button onClick={handleUpdate} disabled={isSaving} className="btn-primary w-full">
            <CheckCircle2 size={20} />
            <span>{isSaving ? 'Saving...' : 'Update'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(EditExpenseModal);
