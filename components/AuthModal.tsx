import React, { useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { X, Loader2 } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { signInWithGoogle, isLoading } = useAuth();
  const { showNotification } = useStore();
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      showNotification('success', 'Signed in with Google');
      onClose();
    } catch (error: any) {
      if (error.code !== 'auth/popup-closed-by-user') {
        const msg = error.code === 'auth/popup-blocked' ? 'Pop-up blocked — allow pop-ups or try again' : 'Could not sign in. Make sure pop-ups are allowed and try again.';
        showNotification('error', msg);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-auth flex items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="auth-title" className="bg-white w-full sm:max-w-sm rounded-t-xl sm:rounded-xl p-6 shadow-2xl relative z-10 mx-4 animate-slide-up-bottom sm:animate-scale-in" style={{
        paddingTop: 'max(1.5rem, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))'
      }}>
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />
        
        <button 
          onClick={onClose}
          className="absolute top-3 right-3 min-w-[44px] min-h-[44px] bg-slate-100 rounded-xl active:scale-95 flex items-center justify-center hover:bg-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          <X size={20} className="text-slate-600" />
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">☁️</span>
          </div>
          <h2 id="auth-title" className="text-lg font-bold text-slate-900 mb-2">Back Up Your Data</h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Sign in with Google to sync your expenses across devices. Your data stays private and secure.
          </p>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full min-h-[48px] bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-800 flex items-center justify-center gap-3 active:scale-95 hover:border-slate-300 transition-all disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          {isLoading ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" className="flex-shrink-0">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </button>

        <p className="text-[11px] text-slate-500 text-center mt-4 leading-relaxed">
          Your guest data will be synced to your account. You can continue as guest anytime.
        </p>
      </div>
    </div>
  );
};

export default React.memo(AuthModal);
