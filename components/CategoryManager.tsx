import React, { useState, useMemo, useRef } from 'react';
import { Category } from '../types';
import { useStore } from '../context/StoreContext';
import { EXPENSE_CATEGORIES } from '../constants';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { X, Plus, Edit2, Trash2, Save } from 'lucide-react';

interface CategoryManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

const CategoryManager: React.FC<CategoryManagerProps> = ({ isOpen, onClose }) => {
  const { customCategories, addCustomCategory, updateCustomCategory, deleteCustomCategory, getAllCategories, showNotification } = useStore();
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ name: '', emoji: '', id: '' });
  
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen);

  const allCategories = useMemo(() => getAllCategories(), [getAllCategories]);
  const defaultCategories = useMemo(() => EXPENSE_CATEGORIES, []);
  
  if (!isOpen) return null;

  const handleAdd = () => {
    setIsAdding(true);
    setEditingCategory(null);
    setFormData({ name: '', emoji: '', id: '' });
  };

  const handleEdit = (category: Category) => {
    // Can't edit default categories
    if (EXPENSE_CATEGORIES.find(c => c.id === category.id)) {
      showNotification('error', 'Cannot modify default categories');
      return;
    }
    setEditingCategory(category);
    setIsAdding(false);
    setFormData({
      name: category.name,
      emoji: category.emoji,
      id: category.id
    });
  };

  const handleDelete = async (categoryId: string) => {
    await deleteCustomCategory(categoryId);
  };

  const validateForm = (): string => {
    const name = formData.name.trim();
    const emoji = formData.emoji.trim();
    if (!emoji) return 'Pick an emoji for the category';
    if (!name) return 'Enter a category name';
    if (name.length > 30) return 'Category name too long (max 30 characters)';
    if (emoji.length > 8) return 'Emoji too long';
    const duplicate = allCategories.some(
      c => c.name.toLowerCase() === name.toLowerCase() && c.id !== editingCategory?.id
    );
    if (duplicate) return 'A category with this name already exists';
    return '';
  };

  const formError = (isAdding || editingCategory) ? validateForm() : '';

  const handleSave = async () => {
    const name = formData.name.trim();
    const emoji = formData.emoji.trim();
    const validationError = validateForm();
    if (validationError) {
      showNotification('error', validationError);
      return;
    }

    
    if (isAdding) {
      // Generate a collision-proof custom ID (prefixed so it never clashes with default categories)
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'cat';
      const id = `custom_${slug}`;
      const newCategory: Category = {
        id,
        name,
        emoji,
        color: 'bg-slate-100 text-slate-600'
      };
      await addCustomCategory(newCategory);
      setIsAdding(false);
      setFormData({ name: '', emoji: '', id: '' });
    } else if (editingCategory) {
      await updateCustomCategory(editingCategory.id, {
        name,
        emoji
      });
      setEditingCategory(null);
      setFormData({ name: '', emoji: '', id: '' });
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingCategory(null);
    setFormData({ name: '', emoji: '', id: '' });
  };

  return (
    <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center pointer-events-none overflow-x-hidden p-2 md:p-4 lg:p-6">
      <div 
        className="absolute inset-0 bg-slate-900/60 pointer-events-auto"
        onClick={onClose}
      />
      
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-manager-title"
        className="bg-white w-full sm:max-w-md md:max-w-lg lg:max-w-2xl xl:max-w-3xl rounded-t-xl sm:rounded-xl p-4 md:p-6 lg:p-8 shadow-2xl pointer-events-auto relative max-w-full overflow-y-auto max-h-[90vh]"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))'
        }}
      >
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex justify-between items-center mb-4 md:mb-6">
          <h2 id="category-manager-title" className="text-lg md:text-xl lg:text-2xl font-bold text-slate-900">{'Manage Categories'}</h2>
          <div className="flex gap-2">
            {!isAdding && !editingCategory && (
              <button
                onClick={handleAdd}
                className="w-9 h-9 bg-emerald-600 text-white rounded-lg flex items-center justify-center active:scale-95 hover:bg-emerald-700 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                aria-label="Add Category"
              >
                <Plus size={18} />
              </button>
            )}
            <button 
              onClick={onClose} 
              className="w-9 h-9 bg-white border border-slate-200 rounded-lg active:scale-95 flex items-center justify-center hover:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              <X size={18} className="text-slate-600" />
            </button>
          </div>
        </div>

        {/* Add/Edit Form */}
        {(isAdding || editingCategory) && (
          <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              {isAdding ? 'Add Category' : 'Edit Category'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">{'Emoji'}</label>
                <div className="grid grid-cols-6 gap-1.5">
                  {['🍔','🚌','🏠','💊','📚','🎮','👕','🐾','🎵','🌸','⚽','🛒'].map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => setFormData(prev => ({ ...prev, emoji }))}
                      className={`w-full aspect-square rounded-lg text-xl flex items-center justify-center active:scale-95 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        formData.emoji === emoji ? 'bg-emerald-100 ring-2 ring-emerald-500' : 'bg-white border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">{'Category Name'}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Food"
                  className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {formData.name.trim() && formError && (
                <p className="text-xs text-rose-600">{formError}</p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSave}
                  disabled={!!formError}
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold active:scale-95 flex items-center justify-center gap-1.5 hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:active:scale-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                >
                  <Save size={16} />
                  <span>{'Save Category'}</span>
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold active:scale-95 hover:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                >
                  {'Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Default Categories */}
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">{'Default Categories'}</h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {defaultCategories.map(cat => (
              <div
                key={cat.id}
                className="flex flex-col items-center gap-1.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200"
              >
                <div className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl bg-white">
                  {cat.emoji}
                </div>
                <p className="text-xs font-medium text-slate-700 text-center">
                  {cat.name}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Categories */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold text-slate-700">{'Custom Categories'}</h3>
            {!isAdding && !editingCategory && customCategories.length > 0 && (
              <button
                onClick={handleAdd}
                className="text-xs font-medium text-emerald-600 active:scale-95 hover:text-emerald-700 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                + {'Add Category'}
              </button>
            )}
          </div>
          {customCategories.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
              {customCategories.map(cat => (
                <div
                  key={cat.id}
                  className="flex flex-col items-center gap-1.5 p-2.5 bg-white rounded-lg border border-slate-200 relative group"
                >
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl bg-slate-50">
                    {cat.emoji}
                  </div>
                  <p className="text-xs font-medium text-slate-700 text-center">
                    {cat.name}
                  </p>
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEdit(cat)}
                      className="w-6 h-6 bg-emerald-100 text-emerald-600 rounded flex items-center justify-center active:scale-95 hover:bg-emerald-200 transition-colors focus-visible:ring-2"
                      aria-label="Edit"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="w-6 h-6 bg-rose-100 text-rose-600 rounded flex items-center justify-center active:scale-95 hover:bg-rose-200 transition-colors focus-visible:ring-2"
                      aria-label="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-sm text-slate-500 mb-2">No custom categories yet</p>
              {!isAdding && (
                <button
                  onClick={handleAdd}
                  className="text-sm font-medium text-emerald-600 active:scale-95 hover:text-emerald-700 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
+ {'Add Category'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(CategoryManager);


