import React from 'react';
import { useStore } from '../context/StoreContext';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

const ToastContainer: React.FC = () => {
  const { notifications, dismissNotification } = useStore();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-6 left-0 right-0 z-[150] flex flex-col items-center gap-3 px-4 pointer-events-none">
      {notifications.map((note) => (
        <div 
            key={note.id}
            className={`
                pointer-events-auto flex items-center gap-4 px-6 py-4 rounded-2xl border-2 max-w-sm w-full shadow-lg
                ${note.type === 'success' ? 'bg-white border-emerald-200 text-slate-900' : ''}
                ${note.type === 'error' ? 'bg-white border-red-200 text-slate-900' : ''}
                ${note.type === 'info' ? 'bg-white border-blue-200 text-slate-900' : ''}
            `}
        >
            <div className={`
                p-2 rounded-xl shrink-0
                ${note.type === 'success' ? 'bg-emerald-100 text-emerald-600' : ''}
                ${note.type === 'error' ? 'bg-red-100 text-red-600' : ''}
                ${note.type === 'info' ? 'bg-blue-100 text-blue-600' : ''}
            `}>
                {note.type === 'success' && <CheckCircle size={20} strokeWidth={2.5} />}
                {note.type === 'error' && <AlertCircle size={20} strokeWidth={2.5} />}
                {note.type === 'info' && <Info size={20} strokeWidth={2.5} />}
            </div>
            
            <p className="flex-1 text-base font-semibold">{note.message}</p>
            
            <button 
                onClick={() => dismissNotification(note.id)}
                className="p-2 text-slate-400 active:scale-95"
            >
                <X size={20} />
            </button>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;