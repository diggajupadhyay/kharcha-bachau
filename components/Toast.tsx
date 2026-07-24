import React from 'react';
import { useStore } from '../context/StoreContext';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

const ToastContainer: React.FC = () => {
  const { notifications, dismissNotification } = useStore();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 md:top-6 lg:top-8 left-0 right-0 z-notification flex flex-col items-center gap-3 px-4 md:px-6 lg:px-8 pointer-events-none">
      {notifications.map((note) => (
        <div 
            key={note.id}
            className={`
                pointer-events-auto flex items-center gap-3 md:gap-4 px-4 md:px-6 lg:px-8 py-3 md:py-4 rounded-xl border max-w-sm md:max-w-md lg:max-w-lg w-full shadow-lg
                ${note.type === 'success' ? 'bg-white border-emerald-200 text-slate-900' : ''}
                ${note.type === 'error' ? 'bg-white border-rose-200 text-slate-900' : ''}
                ${note.type === 'info' ? 'bg-white border-blue-200 text-slate-900' : ''}
            `}
        >
            <div className={`
                p-2 md:p-2.5 rounded-xl shrink-0
                ${note.type === 'success' ? 'bg-emerald-100 text-emerald-600' : ''}
                ${note.type === 'error' ? 'bg-rose-100 text-rose-600' : ''}
                ${note.type === 'info' ? 'bg-blue-100 text-blue-600' : ''}
            `}>
                {note.type === 'success' && <CheckCircle size={20} className="md:w-6 md:h-6 lg:w-7 lg:h-7" strokeWidth={2.5} />}
                {note.type === 'error' && <AlertCircle size={20} className="md:w-6 md:h-6 lg:w-7 lg:h-7" strokeWidth={2.5} />}
                {note.type === 'info' && <Info size={20} className="md:w-6 md:h-6 lg:w-7 lg:h-7" strokeWidth={2.5} />}
            </div>
            
            <p className="flex-1 text-sm md:text-base lg:text-lg font-semibold">{note.message}</p>
            
            <button 
                onClick={() => dismissNotification(note.id)}
                className="p-2 md:p-2.5 text-slate-400 active:scale-95 hover:text-slate-600 transition-colors"
            >
                <X size={20} className="md:w-5 md:h-5 lg:w-6 lg:h-6" />
            </button>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;