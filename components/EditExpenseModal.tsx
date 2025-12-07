import React, { useState, useEffect } from 'react';
import { Expense } from '../types';
import { useStore } from '../context/StoreContext';
import { TRANSLATIONS } from '../constants';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { X, CheckCircle2, Users } from 'lucide-react';

interface EditExpenseModalProps {
  expense: Expense | null;
  isOpen: boolean;
  onClose: () => void;
}

const EditExpenseModal: React.FC<EditExpenseModalProps> = ({ expense, isOpen, onClose }) => {
  const { language, updateExpense, expenses } = useStore();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  
  const t = TRANSLATIONS[language];
  const currencySymbol = getCurrencySymbol();
  
  // Get member name helper
  const getMemberName = (userId: string): string => {
    const expenseWithUser = expenses.find(e => e.createdBy.uid === userId);
    if (expenseWithUser) return expenseWithUser.createdBy.name;
    return userId.substring(0, 8);
  };

  useEffect(() => {
    if (isOpen && expense) {
      setAmount(expense.amount.toString());
      setNote(expense.note);
    }
  }, [isOpen, expense]);

  if (!isOpen || !expense) return null;

  const handleUpdate = () => {
      const val = parseFloat(amount);
      if (!isNaN(val) && val > 0) {
          updateExpense(expense.id, val, note);
          onClose();
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-x-hidden">
      <div 
        className="absolute inset-0 bg-slate-900/60"
        onClick={onClose}
      />
      
      <div 
        className="bg-white w-full max-w-sm rounded-xl p-4 shadow-2xl relative z-10 max-w-full"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))'
        }}
      >
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
             <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg bg-rose-50">
                 {expense.categoryEmoji}
             </div>
             <div>
                <h2 className="text-lg font-bold text-slate-900">{t.edit}</h2>
                <p className="text-xs font-medium text-rose-600">{t.expense}</p>
             </div>
          </div>
          <button onClick={onClose} className="p-1.5 bg-slate-100 rounded-lg active:scale-95">
            <X size={18} className="text-slate-600" />
          </button>
        </div>

        <div className="space-y-4 mb-4">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-2">{t.amount}</label>
            <div className="relative">
                 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-base font-bold">{currencySymbol}</span>
                 <input 
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-10 pr-3 text-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                 />
            </div>
          </div>
          
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-2">{t.description}</label>
            <input 
               type="text"
               value={note}
               onChange={(e) => setNote(e.target.value)}
               className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          
          {/* Split Details Display */}
          {expense.splitDetails && (
            <div className="pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Users size={16} className="text-emerald-600" />
                <span className="text-sm font-semibold text-slate-900">Split Expense</span>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 space-y-2">
                <div className="text-xs text-slate-600">
                  <span className="font-medium">Paid by:</span> {getMemberName(expense.splitDetails.paidBy)}
                </div>
                <div className="text-xs text-slate-600">
                  <span className="font-medium">Split type:</span> {expense.splitDetails.splitType}
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-slate-600 block">Participants:</span>
                  {expense.splitDetails.participants.map((participant, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <span className="text-slate-700">{participant.userName}</span>
                      <span className="font-semibold text-slate-900">
                        {currencySymbol}{participant.amount.toFixed(2)}
                        {participant.percentage && ` (${participant.percentage}%)`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleUpdate}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-emerald-600 active:scale-95 flex items-center justify-center gap-2"
        >
          <CheckCircle2 size={18} />
          <span>{t.update}</span>
        </button>
      </div>
    </div>
  );
};

export default React.memo(EditExpenseModal);