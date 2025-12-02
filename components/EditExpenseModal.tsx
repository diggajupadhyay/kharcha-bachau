import React, { useState, useEffect } from 'react';
import { Expense } from '../types';
import { useStore } from '../context/StoreContext';
import { TRANSLATIONS } from '../constants';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { X, CheckCircle2 } from 'lucide-react';

interface EditExpenseModalProps {
  expense: Expense | null;
  isOpen: boolean;
  onClose: () => void;
}

const EditExpenseModal: React.FC<EditExpenseModalProps> = ({ expense, isOpen, onClose }) => {
  const { language, country, updateExpense } = useStore();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  
  const t = TRANSLATIONS[language];
  const currencySymbol = getCurrencySymbol(country);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-900/60"
        onClick={onClose}
      />
      
      <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative z-10">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl bg-rose-50">
                 {expense.categoryEmoji}
             </div>
             <div>
                <h2 className="text-2xl font-bold text-slate-900">{t.edit}</h2>
                <p className="text-sm font-medium text-rose-600">{t.expense}</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-xl active:scale-95">
            <X size={24} className="text-slate-600" />
          </button>
        </div>

        <div className="space-y-6 mb-6">
          <div>
            <label className="text-base font-semibold text-slate-700 block mb-3">{t.amount}</label>
            <div className="relative">
                 <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xl font-bold">{currencySymbol}</span>
                 <input 
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-white border-2 border-slate-200 rounded-2xl py-5 pl-12 pr-4 text-2xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                 />
            </div>
          </div>
          
          <div>
            <label className="text-base font-semibold text-slate-700 block mb-3">{t.description}</label>
            <input 
               type="text"
               value={note}
               onChange={(e) => setNote(e.target.value)}
               className="w-full bg-white border-2 border-slate-200 rounded-2xl p-5 text-lg font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <button
          onClick={handleUpdate}
          className="w-full py-5 rounded-2xl text-lg font-bold text-white bg-emerald-600 active:scale-95 flex items-center justify-center gap-2"
        >
          <CheckCircle2 size={24} />
          <span>{t.update}</span>
        </button>
      </div>
    </div>
  );
};

export default React.memo(EditExpenseModal);