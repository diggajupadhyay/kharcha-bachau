import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Calendar, Tag, DollarSign, Filter } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Expense, Category } from '../types';
import { EXPENSE_CATEGORIES } from '../constants';
import { format, subDays, subMonths, startOfYear } from 'date-fns';

export interface FilterState {
  dateRange: {
    type: 'preset' | 'custom';
    preset?: 'today' | 'yesterday' | 'thisMonth' | 'lastMonth' | 'last7days' | 'last30days' | 'thisYear' | 'all';
    customStart?: string;
    customEnd?: string;
  };
  categories: string[];
  tags: string[];
  amountRange: {
    min?: number;
    max?: number;
  };
}

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: FilterState) => void;
  expenses: Expense[];
  availableTags: string[];
  currentFilters?: FilterState;
}

const FilterModal: React.FC<FilterModalProps> = ({
  isOpen,
  onClose,
  onApply,
  expenses,
  availableTags,
  currentFilters
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen);
  const [filters, setFilters] = useState<FilterState>(currentFilters || {
    dateRange: { type: 'preset', preset: 'all' },
    categories: [],
    tags: [],
    amountRange: {}
  });
  
  // Get all categories (default + custom)
  const allCategories = useMemo(() => {
    const categoryMap = new Map<string, Category>();
    EXPENSE_CATEGORIES.forEach(cat => categoryMap.set(cat.id, cat));
    expenses.forEach(exp => {
      if (!categoryMap.has(exp.categoryId)) {
        categoryMap.set(exp.categoryId, {
          id: exp.categoryId,
          name: exp.categoryName,
          emoji: exp.categoryEmoji,
          color: 'bg-gray-100 text-gray-600'
        });
      }
    });
    return Array.from(categoryMap.values());
  }, [expenses]);
  
  // Calculate amount range from expenses
  const amountRange = useMemo(() => {
    if (expenses.length === 0) return { min: 0, max: 0 };
    const amounts = expenses.map(e => e.amount);
    return {
      min: Math.min(...amounts),
      max: Math.max(...amounts)
    };
  }, [expenses]);
  
  useEffect(() => {
    if (currentFilters) {
      setFilters(currentFilters);
    }
  }, [currentFilters]);
  
  if (!isOpen) return null;
  
  const handlePresetDateRange = (preset: FilterState['dateRange']['preset']) => {
    setFilters(prev => ({
      ...prev,
      dateRange: { type: 'preset', preset }
    }));
  };
  
  const handleCustomDateRange = (start: string, end: string) => {
    setFilters(prev => ({
      ...prev,
      dateRange: { type: 'custom', customStart: start, customEnd: end }
    }));
  };
  
  const toggleCategory = (categoryId: string) => {
    setFilters(prev => ({
      ...prev,
      categories: prev.categories.includes(categoryId)
        ? prev.categories.filter(id => id !== categoryId)
        : [...prev.categories, categoryId]
    }));
  };
  
  const toggleTag = (tag: string) => {
    setFilters(prev => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag]
    }));
  };
  
  const handleAmountRange = (field: 'min' | 'max', value: string) => {
    const numValue = value === '' ? undefined : parseFloat(value);
    setFilters(prev => ({
      ...prev,
      amountRange: {
        ...prev.amountRange,
        [field]: numValue
      }
    }));
  };
  
  const handleClearAll = () => {
    setFilters({
      dateRange: { type: 'preset', preset: 'all' },
      categories: [],
      tags: [],
      amountRange: {}
    });
  };
  
  const handleApply = () => {
    onApply(filters);
    onClose();
  };
  
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.dateRange.type === 'custom' || (filters.dateRange.preset && filters.dateRange.preset !== 'all')) count++;
    if (filters.categories.length > 0) count++;
    if (filters.tags.length > 0) count++;
    if (filters.amountRange.min !== undefined || filters.amountRange.max !== undefined) count++;
    return count;
  }, [filters]);
  
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-2 md:p-4 lg:p-6 overflow-x-hidden">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-title"
        className="bg-white w-full sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl rounded-t-xl sm:rounded-xl shadow-2xl relative z-10 flex flex-col max-h-[90vh] max-w-full animate-slide-up-bottom sm:animate-scale-in"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))'
        }}
      >
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 sm:hidden" />
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Filter size={20} className="text-slate-700" />
            <h2 id="filter-title" className="text-base sm:text-lg font-bold text-slate-900">Filters</h2>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 bg-emerald-600 text-white text-[11px] font-bold rounded-full">{activeFilterCount}</span>
            )}
          </div>
          <button onClick={onClose} className="min-w-[44px] min-h-[44px] text-slate-600 hover:bg-slate-100 hover:bg-slate-200 transition-colors rounded-xl active:scale-95 flex items-center justify-center focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        
        {/* Filter Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Date Range */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={16} className="text-slate-600" />
              <h3 className="text-sm font-semibold text-slate-900">Date Range</h3>
            </div>
            
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                 <button onClick={() => handlePresetDateRange('last7days')}
                   className={`min-h-[44px] rounded-xl text-xs font-medium active:scale-95 transition-colors ${
                     filters.dateRange.preset === 'last7days' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                   } focus-visible:ring-2 focus-visible:ring-emerald-500`}>Last 7 days</button>
                 <button onClick={() => handlePresetDateRange('last30days')}
                   className={`min-h-[44px] rounded-xl text-xs font-medium active:scale-95 transition-colors ${
                     filters.dateRange.preset === 'last30days' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                   } focus-visible:ring-2 focus-visible:ring-emerald-500`}>Last 30 days</button>
                 <button onClick={() => handlePresetDateRange('thisYear')}
                   className={`min-h-[44px] rounded-xl text-xs font-medium active:scale-95 transition-colors ${
                     filters.dateRange.preset === 'thisYear' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                   } focus-visible:ring-2 focus-visible:ring-emerald-500`}>This year</button>
                 <button onClick={() => handlePresetDateRange('all')}
                   className={`min-h-[44px] rounded-xl text-xs font-medium active:scale-95 transition-colors ${
                     filters.dateRange.preset === 'all' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                   } focus-visible:ring-2 focus-visible:ring-emerald-500`}>All time</button>
              </div>
              
              <div className="pt-2 border-t border-slate-200">
                <label className="text-xs font-medium text-slate-600 block mb-2">Custom Range</label>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={filters.dateRange.customStart || ''}
                    onChange={(e) => handleCustomDateRange(e.target.value, filters.dateRange.customEnd || '')}
                    className="min-h-[44px] px-3 rounded-xl text-xs font-medium border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="date" value={filters.dateRange.customEnd || ''}
                    onChange={(e) => handleCustomDateRange(filters.dateRange.customStart || '', e.target.value)}
                    className="min-h-[44px] px-3 rounded-xl text-xs font-medium border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
            </div>
          </div>
          
          {/* Categories */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Filter size={16} className="text-slate-600" />
              <h3 className="text-sm font-semibold text-slate-900">Categories</h3>
              {filters.categories.length > 0 && <span className="text-xs text-slate-500">({filters.categories.length})</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {allCategories.map(category => (
                 <button key={category.id} onClick={() => toggleCategory(category.id)}
                   className={`min-h-[44px] px-3.5 rounded-xl text-xs font-medium active:scale-95 flex items-center gap-1.5 transition-colors ${
                     filters.categories.includes(category.id) ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                   } focus-visible:ring-2 focus-visible:ring-emerald-500`}>
                  <span>{category.emoji}</span>
                  <span>{category.name}</span>
                </button>
              ))}
            </div>
          </div>
          
          {/* Tags */}
          {availableTags.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Tag size={16} className="text-slate-600" />
                <h3 className="text-sm font-semibold text-slate-900">Tags</h3>
                {filters.tags.length > 0 && <span className="text-xs text-slate-500">({filters.tags.length})</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {availableTags.map(tag => (
                 <button key={tag} onClick={() => toggleTag(tag)}
                   className={`min-h-[44px] px-3.5 rounded-xl text-xs font-medium active:scale-95 flex items-center gap-1.5 transition-colors ${
                     filters.tags.includes(tag) ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                   } focus-visible:ring-2 focus-visible:ring-emerald-500`}>
                    <Tag size={12} />
                    <span>{tag}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Amount Range */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <DollarSign size={16} className="text-slate-600" />
              <h3 className="text-sm font-semibold text-slate-900">Amount Range</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Min</label>
                <input type="number" min={amountRange.min} max={amountRange.max}
                  value={filters.amountRange.min || ''} onChange={(e) => handleAmountRange('min', e.target.value)}
                  placeholder={`${amountRange.min}`}
                  className="w-full min-h-[44px] px-3 rounded-xl text-xs font-medium border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Max</label>
                <input type="number" min={amountRange.min} max={amountRange.max}
                  value={filters.amountRange.max || ''} onChange={(e) => handleAmountRange('max', e.target.value)}
                  placeholder={`${amountRange.max}`}
                  className="w-full min-h-[44px] px-3 rounded-xl text-xs font-medium border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="flex gap-2 p-4 sm:p-6 border-t border-slate-200 flex-shrink-0">
          <button onClick={handleClearAll} className="flex-1 min-h-[48px] rounded-xl text-sm font-medium text-slate-700 bg-slate-100 active:scale-95 hover:bg-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">Clear All</button>
          <button onClick={handleApply} className="flex-1 min-h-[48px] rounded-xl text-sm font-semibold text-white bg-emerald-600 active:scale-95 hover:bg-emerald-700 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">Apply Filters</button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(FilterModal);

