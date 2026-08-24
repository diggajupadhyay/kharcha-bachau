import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { buildMemberNameMap, memberNameFrom } from '../utils/memberNames';
import { Users, Check, Loader2 } from 'lucide-react';

const BalanceSummary: React.FC<{ onSettle?: (expenseId: string, fromUserId: string, toUserId: string) => void | Promise<void> }> = ({ onSettle }) => {
  const { activeWallet, expenses, getMemberBalances, unmarkSettlement } = useStore();
  const { user } = useAuth();
  const currencySymbol = getCurrencySymbol();
  const [settlingKey, setSettlingKey] = useState<string | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [pendingSettled, setPendingSettled] = useState<{ from: string; to: string; amount: number; expenseIds: string[] } | null>(null);

  const balances = useMemo(() => getMemberBalances(), [getMemberBalances]);
  const memberNames = useMemo(() => buildMemberNameMap(activeWallet, expenses, user?.id, user?.name), [activeWallet, expenses, user]);
  const getMemberName = useCallback((userId: string): string => memberNameFrom(memberNames, userId), [memberNames]);

  const debts = useMemo(() => {
    const debtList: Array<{ from: string; to: string; amount: number; expenseIds: string[] }> = [];
    expenses.forEach(expense => {
      if (!expense.splitDetails) return;
      const { paidBy, participants, settlements = [] } = expense.splitDetails;
      participants.forEach(participant => {
        if (participant.userId === paidBy || participant.amount <= 0) return;
        const isSettled = settlements.some(s => s.fromUserId === participant.userId && s.toUserId === paidBy);
        if (isSettled) return;
        const existing = debtList.find(d => d.from === participant.userId && d.to === paidBy);
        if (existing) { existing.amount += participant.amount; existing.expenseIds.push(expense.id); }
        else debtList.push({ from: participant.userId, to: paidBy, amount: participant.amount, expenseIds: [expense.id] });
      });
    });
    return debtList.filter(d => d.amount > 0.01);
  }, [expenses]);

  const handleSettle = useCallback(async (debt: { from: string; to: string; amount: number; expenseIds: string[] }) => {
    if (!onSettle) return;
    const key = `${debt.from}-${debt.to}`;
    setSettlingKey(key);
    // Each expense is settled independently, and one rejection must not abort the
    // rest. The Undo snackbar is offered only for what actually succeeded — the
    // previous version showed "Settled" with an Undo button even when every single
    // write had been denied.
    const settled: string[] = [];
    try {
      for (const id of debt.expenseIds) {
        try { await onSettle(id, debt.from, debt.to); settled.push(id); } catch { /* counted below */ }
      }
      if (settled.length > 0) setPendingSettled({ ...debt, expenseIds: settled });
    } finally { setSettlingKey(null); }
  }, [onSettle]);

  const handleUndoSettle = useCallback(async () => {
    if (!pendingSettled || isUndoing) return;
    setIsUndoing(true);
    try {
      for (const id of pendingSettled.expenseIds) await unmarkSettlement(id, pendingSettled.from, pendingSettled.to);
      setPendingSettled(null);
    } catch {
      // unmarkSettlement has already surfaced the reason. Keep the snackbar up so
      // the user can retry instead of silently leaving the debt marked paid.
    } finally { setIsUndoing(false); }
  }, [pendingSettled, isUndoing, unmarkSettlement]);

  useEffect(() => { if (!pendingSettled) return; const timer = setTimeout(() => setPendingSettled(null), 7000); return () => clearTimeout(timer); }, [pendingSettled]);

  if (!activeWallet || activeWallet.isPersonal || activeWallet.members.length <= 1) return null;

  const currentUserBalance = user ? balances[user.id] || 0 : 0;

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Users size={18} className="text-slate-600" />
        <h3 className="text-subhead">Balance Summary</h3>
      </div>
      <p className="text-xs text-slate-500 mb-3">When you split expenses, this shows who needs to pay whom.</p>

      {user && (
        <div className={`p-4 rounded-xl mb-4 border ${currentUserBalance > 0 ? 'bg-emerald-50 border-emerald-200' : currentUserBalance < 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs font-medium text-slate-600 mb-1">Your Balance</p>
              {currentUserBalance > 0 && <p className="text-xs text-emerald-700 font-medium">You will get back</p>}
              {currentUserBalance < 0 && <p className="text-xs text-rose-700 font-medium">You need to pay</p>}
              {currentUserBalance === 0 && <p className="text-xs text-slate-600 font-medium">All settled up</p>}
            </div>
            <span className={`text-2xl font-bold ${currentUserBalance > 0 ? 'text-emerald-700' : currentUserBalance < 0 ? 'text-rose-700' : 'text-slate-700'}`}>
              {currentUserBalance > 0 ? '+' : ''}{currencySymbol}{Math.abs(currentUserBalance).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {debts.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700 mb-2">Who owes who</p>
          {debts.map((debt) => {
            const isYouOwing = user && debt.from === user.id;
            const isOwedToYou = user && debt.to === user.id;
            // Keyed on the pair, not the array index: settling a debt removes a row
            // and React then reused the wrong DOM node, leaving the spinner spinning
            // on a different person's button.
            return (
              <div key={`${debt.from}-${debt.to}`} className={`p-3 rounded-xl border ${isYouOwing ? 'bg-rose-50 border-rose-200' : isOwedToYou ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{getMemberName(debt.from)}</span>
                      <span className="text-xs text-slate-500">owes</span>
                      <span className="text-sm font-semibold text-slate-900">{getMemberName(debt.to)}</span>
                    </div>
                    <p className="text-lg font-bold text-slate-900">{currencySymbol}{debt.amount.toFixed(2)}</p>
                    {isYouOwing && <p className="text-xs text-rose-600 mt-1">You need to pay this</p>}
                    {isOwedToYou && <p className="text-xs text-emerald-600 mt-1">You will receive this</p>}
                  </div>
                  {/* Every settle button is disabled while any one of them is in
                      flight. Settling two debts recorded against the same expense
                      concurrently made both writes build their settlements list from
                      the same pre-click snapshot, so the second silently overwrote
                      the first. */}
                  {onSettle && (isYouOwing || isOwedToYou) && (
                    <button onClick={() => handleSettle(debt)} disabled={settlingKey !== null}
                      className="min-h-[44px] px-3 bg-emerald-600 text-white rounded-xl text-xs font-semibold active:scale-95 flex items-center gap-1.5 flex-shrink-0 hover:bg-emerald-700 transition-colors disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
                      {settlingKey === `${debt.from}-${debt.to}` ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      <span>{isYouOwing ? 'I paid' : 'They paid me'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm font-medium text-slate-600">No money owed between members</p>
        </div>
      )}

      {/* Undo snackbar */}
      {pendingSettled && (
        <div className="fixed left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white rounded-xl shadow-2xl flex items-center gap-3 px-4 py-3 animate-slide-up-bottom"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))', maxWidth: 'calc(100% - 2rem)' }} role="status">
          <span className="text-sm">Settled</span>
          <button onClick={handleUndoSettle} disabled={isUndoing} className="text-sm font-semibold text-emerald-400 active:scale-95 min-h-[36px] px-2 hover:text-emerald-300 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500">
            {isUndoing ? 'Undoing...' : 'Undo'}
          </button>
        </div>
      )}
    </div>
  );
};

export default React.memo(BalanceSummary);
