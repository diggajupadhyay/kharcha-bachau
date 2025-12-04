import React from 'react';
import { useStore } from '../context/StoreContext';
import { Language } from '../types';
import { X } from 'lucide-react';

interface LanguagePickerProps {
  isOpen: boolean;
  onClose: () => void;
}

const LanguagePicker: React.FC<LanguagePickerProps> = ({ isOpen, onClose }) => {
  const { language, setLanguage, triggerHaptic } = useStore();

  if (!isOpen) return null;

  const handleSelectLanguage = (lang: Language) => {
    triggerHaptic();
    setLanguage(lang);
    onClose();
  };

  const languages: { code: Language; name: string; nameNative: string; flag: string }[] = [
    { code: 'en', name: 'English', nameNative: 'English', flag: '🇬🇧' },
    { code: 'np', name: 'Nepali', nameNative: 'नेपाली', flag: '🇳🇵' }
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center pointer-events-none overflow-x-hidden">
      <div 
        className="absolute inset-0 bg-slate-900/60 pointer-events-auto"
        onClick={onClose}
      />
      
      <div 
        className="bg-white w-full sm:max-w-md rounded-t-xl sm:rounded-xl p-4 shadow-2xl pointer-events-auto relative max-w-full overflow-y-auto max-h-[90vh]"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))'
        }}
      >
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-900">
            {language === 'en' ? 'Select Language' : 'भाषा छान्नुहोस्'}
          </h2>
          <button onClick={onClose} className="p-1.5 bg-slate-100 rounded-lg active:scale-95">
            <X size={18} className="text-slate-500"/>
          </button>
        </div>

        <div className="space-y-2">
          {languages.map(lang => {
            const isSelected = language === lang.code;
            
            return (
              <button
                key={lang.code}
                onClick={() => handleSelectLanguage(lang.code)}
                className={`w-full p-3 rounded-xl flex items-center justify-between border active:scale-95 ${
                  isSelected 
                    ? 'bg-emerald-50 border-emerald-300' 
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{lang.flag}</span>
                  <div className="text-left">
                    <p className={`text-sm font-medium ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>
                      {lang.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {lang.nameNative}
                    </p>
                  </div>
                </div>
                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default React.memo(LanguagePicker);

