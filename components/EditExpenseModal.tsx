import React, { useState, useEffect, useRef } from 'react';
import { Expense } from '../types';
import { useStore } from '../context/StoreContext';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { X, CheckCircle2, Users, Tag } from 'lucide-react';

interface EditExpenseModalProps {
  expense: Expense | null;
  isOpen: boolean;
  onClose: () => void;
}

const EditExpenseModal: React.FC<EditExpenseModalProps> = ({ expense, isOpen, onClose }) => {
  const { updateExpense, expenses } = useStore();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [passengers, setPassengers] = useState('1');
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  
  const currencySymbol = getCurrencySymbol();
  const isTransport = expense?.categoryId === 'transport';
  
  // Get all existing tags from expenses for autocomplete
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen);

  const existingTags = React.useMemo(() => {
    const allTags = new Set<string>();
    expenses.forEach(exp => {
      if (exp.tags) {
        exp.tags.forEach(tag => allTags.add(tag));
      }
    });
    return Array.from(allTags).sort();
  }, [expenses]);
  
  // Filter tag suggestions based on input
  const tagSuggestions = React.useMemo(() => {
    if (!tagInput.trim()) return existingTags.slice(0, 5);
    const lowerInput = tagInput.trim().toLowerCase();
    return existingTags
      .filter(tag => tag.toLowerCase().includes(lowerInput) && !tags.includes(tag))
      .slice(0, 5);
  }, [tagInput, existingTags, tags]);
  
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
      setTags(expense.tags || []);
      setTagInput('');
      setShowTagSuggestions(false);
      if (expense.transportDetails) {
        setPassengers(expense.transportDetails.passengers.toString());
        setFromLocation(expense.transportDetails.from);
        setToLocation(expense.transportDetails.to);
      } else {
        setPassengers('1');
        setFromLocation('');
        setToLocation('');
      }
    }
  }, [isOpen, expense]);

  if (!isOpen || !expense) return null;

  const handleAddTag = (tag: string) => {
    const normalizedTag = tag.trim().toLowerCase();
    if (normalizedTag && normalizedTag.length <= 20 && !tags.includes(normalizedTag) && tags.length < 5) {
      setTags([...tags, normalizedTag]);
      setTagInput('');
      setShowTagSuggestions(false);
    }
  };
  
  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };
  
  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      handleAddTag(tagInput);
    } else if (e.key === 'Escape') {
      setShowTagSuggestions(false);
    }
  };

  const handleUpdate = () => {
      const val = parseFloat(amount);
      if (!isNaN(val) && val > 0) {
          let transportDetails: { passengers: number; from: string; to: string } | undefined;
          if (isTransport && fromLocation.trim() && toLocation.trim()) {
            const passengerCount = parseInt(passengers) || 1;
            transportDetails = {
              passengers: passengerCount,
              from: fromLocation.trim(),
              to: toLocation.trim()
            };
          }
          updateExpense(expense.id, val, note, tags.length > 0 ? tags : undefined, transportDetails);
          onClose();
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-2 md:p-4 lg:p-6 overflow-x-hidden">
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
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl min-h-[48px] pl-9 pr-3.5 text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500"
                 />
            </div>
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
          
          {isTransport && (
            <div className="space-y-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <h3 className="text-[11px] font-semibold text-blue-900">{'Route'}</h3>
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1.5">{'From'}</label>
                <input type="text" placeholder={'Origin'} value={fromLocation} onChange={(e) => setFromLocation(e.target.value)}
                  className="w-full bg-white border border-slate-200 min-h-[44px] px-3 rounded-lg text-sm font-medium text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1.5">{'To'}</label>
                <input type="text" placeholder={'Destination'} value={toLocation} onChange={(e) => setToLocation(e.target.value)}
                  className="w-full bg-white border border-slate-200 min-h-[44px] px-3 rounded-lg text-sm font-medium text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1.5">{'Number of People'}</label>
                <input type="number" min="1" max="50" value={passengers}
                  onChange={(e) => { const val = e.target.value; if (val === '' || (parseInt(val) >= 1 && parseInt(val) <= 50)) setPassengers(val); }}
                  className="w-full bg-white border border-slate-200 min-h-[44px] px-3 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500" />
              </div>
            </div>
          )}
          
          <div>
            <label className="text-xs font-medium text-slate-700 block mb-2 flex items-center gap-1.5">
              <Tag size={14} /> {'Tags'}
              {tags.length > 0 && <span className="text-slate-400">({tags.length}/5)</span>}
            </label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map(tag => (
                  <div key={tag} className="inline-flex items-center gap-1.5 px-3 min-h-[36px] bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-700">
                    <span>{tag}</span>
                    <button onClick={() => handleRemoveTag(tag)} className="text-emerald-600 hover:text-emerald-800 active:scale-95 p-0.5 transition-colors"><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            {tags.length < 5 && (
              <div className="relative">
                <input type="text" placeholder={'Enter tag name'} value={tagInput}
                  onChange={(e) => { setTagInput(e.target.value); setShowTagSuggestions(e.target.value.trim().length > 0); }}
                  onKeyDown={handleTagInputKeyDown}
                  onFocus={() => setShowTagSuggestions(tagInput.trim().length > 0 && tagSuggestions.length > 0)}
                  className="w-full bg-white border border-slate-200 rounded-xl min-h-[44px] px-3.5 text-sm font-medium text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500" maxLength={20} />
                {showTagSuggestions && tagSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
                    {tagSuggestions.map(suggestion => (
                      <button key={suggestion} onClick={() => handleAddTag(suggestion)} className="w-full text-left min-h-[44px] px-3.5 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500">{suggestion}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          
          {expense.splitDetails && (
            <div className="pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Users size={16} className="text-emerald-600" />
                <span className="text-sm font-semibold text-slate-900">Split Expense</span>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 space-y-2">
                <div className="text-xs text-slate-600"><span className="font-medium">Paid by:</span> {getMemberName(expense.splitDetails.paidBy)}</div>
                <div className="text-xs text-slate-600"><span className="font-medium">Split type:</span> {expense.splitDetails.splitType}</div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-slate-600 block">Participants:</span>
                  {expense.splitDetails.participants.map((participant, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <span className="text-slate-700">{participant.userName}</span>
                      <span className="font-semibold text-slate-900">{currencySymbol}{participant.amount.toFixed(2)}{participant.percentage && ` (${participant.percentage}%)`}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <button onClick={handleUpdate} className="w-full min-h-[48px] rounded-xl text-sm font-semibold text-white bg-emerald-600 active:scale-95 flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
          <CheckCircle2 size={20} />
          <span>{'Update'}</span>
        </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(EditExpenseModal);