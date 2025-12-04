import React, { useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { TRANSLATIONS } from '../constants';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { Users, Check } from 'lucide-react';

interface BalanceSummaryProps {
  onSettle?: (expenseId: string, fromUserId: string, toUserId: string) => void;
}

const BalanceSummary: React.FC<BalanceSummaryProps> = ({ onSettle }) => {
  const { language, country, activeWallet, expenses, getMemberBalances } = useStore();
  const { user } = useAuth();
  
  const t = TRANSLATIONS[language];
  const currencySymbol = getCurrencySymbol(country);
  
  const balances = useMemo(() => getMemberBalances(), [getMemberBalances]);
  
  // Get member names
  const getMemberName = (userId: string): string => {
    if (userId === user?.id) return user.name;
    const expense = expenses.find(e => e.createdBy.uid === userId);
    if (expense) return expense.createdBy.name;
    return userId.substring(0, 8);
  };
  
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
  
  if (!activeWallet || activeWallet.isPersonal || activeWallet.members.length <= 1) {
    return null;
  }
  
  const currentUserBalance = user ? balances[user.id] || 0 : 0;
  
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Users size={18} className="text-slate-600" />
        <h3 className="text-sm font-semibold text-slate-900">{t.balanceSummary}</h3>
      </div>
      
      {/* Simple Explanation */}
      <p className="text-xs text-slate-500 mb-3">{t.simpleExplanation}</p>
      
      {/* Your Balance - Simplified */}
      {user && (
        <div className={`p-4 rounded-lg mb-4 ${
          currentUserBalance > 0 ? 'bg-emerald-50 border border-emerald-200' : 
          currentUserBalance < 0 ? 'bg-rose-50 border border-rose-200' : 
          'bg-slate-50 border border-slate-200'
        }`}>
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-xs font-medium text-slate-600 mb-1">{t.yourBalance}</p>
              {currentUserBalance > 0 && (
                <p className="text-xs text-emerald-700 font-medium">✓ {t.youGetBack}</p>
              )}
              {currentUserBalance < 0 && (
                <p className="text-xs text-rose-700 font-medium">⚠ {t.youNeedToPay}</p>
              )}
              {currentUserBalance === 0 && (
                <p className="text-xs text-slate-600 font-medium">✓ {t.allSettled}</p>
              )}
            </div>
            <span className={`text-2xl font-bold ${
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
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-700 mb-2">{t.whoOwesWho}</p>
          {debts.map((debt, index) => {
            const isYouOwing = user && debt.from === user.id;
            const isOwedToYou = user && debt.to === user.id;
            
            return (
              <div key={index} className={`p-3 rounded-lg border ${
                isYouOwing ? 'bg-rose-50 border-rose-200' : 
                isOwedToYou ? 'bg-emerald-50 border-emerald-200' : 
                'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-slate-900">
                        {getMemberName(debt.from)}
                      </span>
                      <span className="text-xs text-slate-500">{t.owes}</span>
                      <span className="text-sm font-semibold text-slate-900">
                        {getMemberName(debt.to)}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-slate-900">
                      {currencySymbol}{debt.amount.toFixed(2)}
                    </p>
                    {isYouOwing && (
                      <p className="text-xs text-rose-600 mt-1">You need to pay this</p>
                    )}
                    {isOwedToYou && (
                      <p className="text-xs text-emerald-600 mt-1">You will receive this</p>
                    )}
                  </div>
                  {onSettle && isYouOwing && (
                    <button
                      onClick={() => onSettle(debt.expenseIds[0], debt.from, debt.to)}
                      className="ml-3 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold active:scale-95 flex items-center gap-1.5 flex-shrink-0"
                    >
                      <Check size={14} />
                      <span>{t.settle}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm font-medium text-slate-600">{t.nothingToSettle}</p>
        </div>
      )}
    </div>
  );
};

export default React.memo(BalanceSummary);

