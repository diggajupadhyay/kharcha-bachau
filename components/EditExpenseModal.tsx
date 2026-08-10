import React, { useState, useEffect, useRef } from 'react';
import { Expense } from '../types';
import { useStore } from '../context/StoreContext';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { buildMemberNameMap, memberNameFrom } from '../utils/memberNames';
import { X, CheckCircle2, Users } from 'lucide-react';

interface EditExpenseModalProps {
  expense: Expense | null;
  isOpen: boolean;
  onClose: () => void;
}

const EditExpenseModal: React.FC<EditExpenseModalProps> = ({ expense, isOpen, onClose }) => {
  const { updateExpense, expenses, activeWallet } = useStore();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const currencySymbol = getCurrencySymbol();
  
  // Get all existing tags from expenses for autocomplete
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen, onClose);

  const getMemberName = (userId: string): string =>
    memberNameFrom(buildMemberNameMap(activeWallet, expenses), userId);

  useEffect(() => {
    if (isOpen && expense) {
      setAmount(expense.amount.toString());
      setNote(expense.note);
      setError('');

    }
  }, [isOpen, expense]);

  if (!isOpen || !expense) return null;

  const handleUpdate = async () => {
      if (isSaving) return;
      const val = parseFloat(amount);
      if (isNaN(val) || val <= 0) {
          // Previously this branch did nothing whatsoever — the button simply
          // appeared not to work.
          setError('Enter an amount greater than 0');
          return;
      }
      setError('');
      setIsSaving(true);
      try {
          await updateExpense(expense.id, val, note);
          onClose();
      } finally {
          setIsSaving(false);
      }
  };

  return (
    <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center p-0 sm:p-2 md:p-4 lg:p-6 overflow-x-hidden">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-expense-title"
        className="bg-white w-full sm:max-w-md md:max-w-lg lg:max-w-xl rounded-t-xl sm:rounded-xl shadow-2xl relative z-10 max-w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto animate-slide-up-bottom sm:animate-scale-in"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))'
        }}
      >
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3 sm:hidden" />
        
        <div className="px-4 sm:px-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
             <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-rose-50">
                 {expense.categoryEmoji}
             </div>
             <div>
                <h2 id="edit-expense-title" className="text-base font-bold text-slate-900">{'Edit Transaction'}</h2>
                <p className="text-[11px] font-medium text-rose-600">{'Expense'}</p>
             </div>
          </div>
          <button onClick={onClose} className="min-w-[44px] min-h-[44px] bg-slate-100 rounded-xl active:scale-95 flex items-center justify-center hover:bg-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
            <X size={20} className="text-slate-600" />
          </button>
        </div>

        <div className="space-y-4 mb-4">
          <div>
            <label className="text-xs font-medium text-slate-700 block mb-2">{'Amount'}</label>
            <div className="relative">
                 <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">{currencySymbol}</span>
                 <input 
                    type="number" inputMode="decimal"
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); if (error) setError(''); }}
                    aria-invalid={!!error}
                    className="w-full bg-white border border-slate-200 rounded-xl min-h-[48px] pl-9 pr-3.5 text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500"
                 />
            </div>
            {error && <p className="text-xs text-rose-600 mt-1.5">{error}</p>}
          </div>
          
          <div>
            <label className="text-xs font-medium text-slate-700 block mb-2">{'Note'}</label>
            <input 
               type="text"
               value={note}
               onChange={(e) => setNote(e.target.value)}
               className="w-full bg-white border border-slate-200 rounded-xl min-h-[44px] px-3.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
          </div>
          
          {expense.splitDetails && (
            <div className="pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Users size={16} className="text-emerald-600" />
                <span className="text-sm font-semibold text-slate-900">Split Expense</span>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 space-y-2">
                <div className="text-xs text-slate-600"><span className="font-medium">Paid by:</span> {getMemberName(expense.splitDetails.paidBy)}</div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-slate-600 block">Participants:</span>
                  {expense.splitDetails.participants.map((participant, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <span className="text-slate-700">{participant.userName}</span>
                      <span className="font-semibold text-slate-900">{currencySymbol}{participant.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <button onClick={handleUpdate} disabled={isSaving} className="w-full min-h-[48px] rounded-xl text-sm font-semibold text-white bg-emerald-600 active:scale-95 flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:active:scale-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
          <CheckCircle2 size={20} />
          <span>{isSaving ? 'Saving…' : 'Update'}</span>
        </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(EditExpenseModal);