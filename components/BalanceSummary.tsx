import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { Users, Check, Loader2, X } from 'lucide-react';

interface BalanceSummaryProps {
  onSettle?: (expenseId: string, fromUserId: string, toUserId: string) => void | Promise<void>;
}

const BalanceSummary: React.FC<BalanceSummaryProps> = ({ onSettle }) => {
  const { activeWallet, expenses, getMemberBalances } = useStore();
  const { user } = useAuth();

  const currencySymbol = getCurrencySymbol();

  const [settlingKey, setSettlingKey] = useState<string | null>(null);
  const [pendingSettled, setPendingSettled] = useState<{ from: string; to: string; amount: number; expenseIds: string[] } | null>(null);

  const balances = useMemo(() => getMemberBalances(), [getMemberBalances]);
  
  // Memoize member names to avoid repeated lookups
  const memberNames = useMemo(() => {
    const names: Record<string, string> = {};
    if (user) names[user.id] = user.name;
    expenses.forEach(e => {
      if (e.createdBy?.uid && !names[e.createdBy.uid]) {
        names[e.createdBy.uid] = e.createdBy.name;
      }
    });
    return names;
  }, [user, expenses]);

  const getMemberName = useCallback((userId: string): string => {
    return memberNames[userId] || `Member ${userId.substring(0, 4)}`;
  }, [memberNames]);
  
  // Calculate who owes whom (only unsettled debts)
  const debts = useMemo(() => {
    const debtList: Array<{ from: string; to: string; amount: number; expenseIds: string[] }> = [];
    
    expenses.forEach(expense => {
      if (expense.splitDetails) {
        const { paidBy, participants, settlements = [] } = expense.splitDetails;
        participants.forEach(participant => {
          // Only include if this person owes money and hasn't paid yet
          if (participant.userId !== paidBy && participant.amount > 0) {
            // Check if this debt has been settled
            const isSettled = settlements.some(
              s => s.fromUserId === participant.userId && s.toUserId === paidBy
            );
            
            if (!isSettled) {
              const existingDebt = debtList.find(d => d.from === participant.userId && d.to === paidBy);
              if (existingDebt) {
                existingDebt.amount += participant.amount;
                existingDebt.expenseIds.push(expense.id);
              } else {
                debtList.push({
                  from: participant.userId,
                  to: paidBy,
                  amount: participant.amount,
                  expenseIds: [expense.id]
                });
              }
            }
          }
        });
      }
    });
    
    return debtList.filter(d => d.amount > 0.01); // Filter out tiny amounts due to rounding
  }, [expenses]);
  
  const handleSettle = useCallback(async (debt: { from: string; to: string; amount: number; expenseIds: string[] }) => {
    if (!onSettle) return;
    const key = `${debt.from}-${debt.to}`;
    setSettlingKey(key);
    try {
      for (const id of debt.expenseIds) {
        await onSettle(id, debt.from, debt.to);
      }
      setPendingSettled(debt);
    } finally {
      setSettlingKey(null);
    }
  }, [onSettle]);

  // Auto-dismiss the snackbar after 7 seconds
  useEffect(() => {
    if (!pendingSettled) return;
    const timer = setTimeout(() => setPendingSettled(null), 7000);
    return () => clearTimeout(timer);
  }, [pendingSettled]);

  if (!activeWallet || activeWallet.isPersonal || activeWallet.members.length <= 1) {
    return null;
  }
  
  const currentUserBalance = user ? balances[user.id] || 0 : 0;
  
  return (
    <div className="bg-white rounded-xl p-4 md:p-6 lg:p-8 border border-slate-200 mb-4 md:mb-6">
      <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
        <Users size={18} className="md:w-5 md:h-5 lg:w-6 lg:h-6 text-slate-600" />
        <h3 className="text-sm md:text-base lg:text-lg font-semibold text-slate-900">{'Balance Summary'}</h3>
      </div>
      
      {/* Simple Explanation */}
      <p className="text-xs md:text-sm text-slate-500 mb-3 md:mb-4">{'When you split expenses, this shows who needs to pay whom.'}</p>
      
      {/* Your Balance - Simplified */}
      {user && (
        <div className={`p-4 md:p-5 lg:p-6 rounded-lg mb-4 md:mb-6 ${
          currentUserBalance > 0 ? 'bg-emerald-50 border border-emerald-200' : 
          currentUserBalance < 0 ? 'bg-rose-50 border border-rose-200' : 
          'bg-slate-50 border border-slate-200'
        }`}>
          <div className="flex justify-between items-start mb-2 md:mb-3">
            <div>
              <p className="text-xs md:text-sm font-medium text-slate-600 mb-1 md:mb-2">{'Your Balance'}</p>
              {currentUserBalance > 0 && (
                <p className="text-xs md:text-sm text-emerald-700 font-medium">✓ {'You will get back'}</p>
              )}
              {currentUserBalance < 0 && (
                <p className="text-xs md:text-sm text-rose-700 font-medium">⚠ {'You need to pay'}</p>
              )}
              {currentUserBalance === 0 && (
                <p className="text-xs md:text-sm text-slate-600 font-medium">✓ {'All settled! No money owed.'}</p>
              )}
            </div>
            <span className={`text-2xl md:text-3xl lg:text-4xl font-bold ${
              currentUserBalance > 0 ? 'text-emerald-700' : 
              currentUserBalance < 0 ? 'text-rose-700' : 
              'text-slate-700'
            }`}>
              {currentUserBalance > 0 ? '+' : ''}{currencySymbol}{Math.abs(currentUserBalance).toFixed(2)}
            </span>
          </div>
        </div>
      )}
      
      {/* Who Owes Who - Simplified */}
      {debts.length > 0 ? (
        <div className="space-y-3 md:space-y-4">
          <p className="text-xs md:text-sm font-semibold text-slate-700 mb-2 md:mb-3">{'Who owes who?'}</p>
          {debts.map((debt, index) => {
            const isYouOwing = user && debt.from === user.id;
            const isOwedToYou = user && debt.to === user.id;
            
            return (
              <div key={index} className={`p-3 md:p-4 lg:p-5 rounded-lg border ${
                isYouOwing ? 'bg-rose-50 border-rose-200' : 
                isOwedToYou ? 'bg-emerald-50 border-emerald-200' : 
                'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between gap-3 md:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 md:mb-2 flex-wrap">
                      <span className="text-sm md:text-base font-semibold text-slate-900">
                        {getMemberName(debt.from)}
                      </span>
                      <span className="text-xs md:text-sm text-slate-500">{'owes'}</span>
                      <span className="text-sm md:text-base font-semibold text-slate-900">
                        {getMemberName(debt.to)}
                      </span>
                    </div>
                    <p className="text-lg md:text-xl lg:text-2xl font-bold text-slate-900">
                      {currencySymbol}{debt.amount.toFixed(2)}
                    </p>
                    {isYouOwing && (
                      <p className="text-xs md:text-sm text-rose-600 mt-1 md:mt-2">You need to pay this</p>
                    )}
                    {isOwedToYou && (
                      <p className="text-xs md:text-sm text-emerald-600 mt-1 md:mt-2">You will receive this</p>
                    )}
                  </div>
                  {onSettle && isYouOwing && (
                    <button
                      onClick={() => handleSettle(debt)}
                      disabled={settlingKey === `${debt.from}-${debt.to}`}
                      className="ml-3 px-3 py-2 md:px-4 md:py-2.5 lg:px-5 lg:py-3 bg-emerald-600 text-white rounded-lg text-xs md:text-sm font-semibold active:scale-95 flex items-center gap-1.5 flex-shrink-0 hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:active:scale-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                    >
                      {settlingKey === `${debt.from}-${debt.to}` ? (
                        <Loader2 size={14} className="md:w-4 md:h-4 lg:w-5 lg:h-5 animate-spin" />
                      ) : (
                        <Check size={14} className="md:w-4 md:h-4 lg:w-5 lg:h-5" />
                      )}
                      <span>{settlingKey === `${debt.from}-${debt.to}` ? 'Settling…' : 'Settle'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-4 md:py-6">
          <p className="text-sm md:text-base font-medium text-slate-600">{'No money owed between members'}</p>
        </div>
      )}

      {/* Undo snackbar */}
      {pendingSettled && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white rounded-xl shadow-2xl flex items-center gap-3 px-4 py-3 animate-slide-up-bottom"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))', maxWidth: 'calc(100% - 2rem)' }}
          role="status"
        >
          <span className="text-sm">Settled</span>
          <button
            onClick={() => setPendingSettled(null)}
            className="text-sm font-semibold text-emerald-400 active:scale-95 min-h-[36px] px-2 hover:text-emerald-300 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
};

export default React.memo(BalanceSummary);

