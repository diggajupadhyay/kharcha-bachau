import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, ArrowRight, Loader2, UserPlus, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { login, signup, isLoading, resetPassword } = useAuth();
  const { showNotification } = useStore();
  
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isResetMode, setIsResetMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');

  if (!isOpen) return null;

  // Email validation
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    
    if (value && !validateEmail(value)) {
      setEmailError('Please enter a valid email address');
    } else {
      setEmailError('');
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      showNotification('error', 'Please enter your email address');
      return;
    }
    
    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    
    try {
      await resetPassword(email);
      showNotification('success', 'Password reset email sent! Check your inbox.');
      setIsResetMode(false);
      setEmail('');
    } catch (error: any) {
      let msg = 'Failed to send reset email';
      if (error.code === 'auth/user-not-found') msg = 'No account found with this email';
      if (error.code === 'auth/invalid-email') msg = 'Invalid email address';
      if (error.code === 'auth/too-many-requests') msg = 'Too many requests. Please try again later';
      showNotification('error', msg);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    // Validate email before submission
    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    
    try {
        if (isLoginMode) {
            await login(email, password);
            showNotification('success', 'Welcome back!');
        } else {
            await signup(email, password);
            showNotification('success', 'Account created successfully!');
        }
        onClose();
        setEmail('');
        setPassword('');
        setEmailError('');
    } catch (error: any) {
        let msg = 'Authentication failed';
        if (error.code === 'auth/invalid-credential') msg = 'Invalid email or password';
        if (error.code === 'auth/email-already-in-use') msg = 'Email already in use';
        if (error.code === 'auth/weak-password') msg = 'Password should be at least 6 characters';
        if (error.code === 'auth/invalid-email') msg = 'Invalid email address';
        showNotification('error', msg);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 overflow-x-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60"
        onClick={onClose}
      />

      {/* Modal */}
      <div 
        className="bg-white w-full max-w-sm rounded-xl p-4 shadow-2xl relative z-10 overflow-hidden max-w-full"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))'
        }}
      >
        <button 
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 bg-slate-100 rounded-lg active:scale-95"
        >
            <X size={18} className="text-slate-600" />
        </button>

        <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900 mb-2">
                {isResetMode ? 'Reset Password' : isLoginMode ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-sm text-slate-600">
                {isResetMode 
                    ? 'Enter your email to receive a password reset link.'
                    : isLoginMode 
                    ? 'Log in to sync your data securely.' 
                    : 'Join Kharcha Bachau to backup your data.'}
            </p>
        </div>

        {isResetMode ? (
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="email" 
                  value={email}
                  onChange={handleEmailChange}
                  placeholder="name@example.com"
                  className={`w-full bg-white border pl-10 pr-3 py-2.5 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 ${
                    emailError ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20'
                  }`}
                  required
                />
              </div>
              {emailError && (
                <p className="text-xs text-red-600">{emailError}</p>
              )}
            </div>

            <button 
              type="submit"
              disabled={isLoading || !email || !!emailError}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl text-sm font-medium active:scale-95 flex items-center justify-center gap-2 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <span>Send Reset Link</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            <div className="mt-4 text-center">
              <button 
                type="button"
                onClick={() => {
                  setIsResetMode(false);
                  setEmail('');
                  setEmailError('');
                }}
                className="text-sm font-medium text-slate-600 active:scale-95"
              >
                Back to Login
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="email" 
                  value={email}
                  onChange={handleEmailChange}
                  placeholder="name@example.com"
                  className={`w-full bg-gray-50 pl-10 pr-3 py-2.5 rounded-lg font-medium text-sm text-gray-900 focus:outline-none focus:bg-white focus:ring-2 transition-all border ${
                    emailError ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-transparent focus:border-green-500/50 focus:ring-green-500/20'
                  }`}
                  required
                />
              </div>
              {emailError && (
                <p className="text-xs text-red-500 ml-1">{emailError}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white border border-slate-200 pl-10 pr-3 py-2.5 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            {isLoginMode && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetMode(true);
                    setPassword('');
                  }}
                  className="text-sm font-medium text-emerald-600 active:scale-95"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoading || !email || !password || !!emailError}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl text-sm font-medium active:scale-95 flex items-center justify-center gap-2 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <span>{isLoginMode ? 'Log In' : 'Sign Up'}</span>
                  {isLoginMode ? <ArrowRight size={16} /> : <UserPlus size={16} />}
                </>
              )}
            </button>
          </form>
        )}

        {!isResetMode && (
          <div className="mt-4 text-center pt-4 border-t border-slate-100">
            <button 
              type="button"
              onClick={() => {
                setIsLoginMode(!isLoginMode);
                setEmail('');
                setPassword('');
                setEmailError('');
              }}
              className="text-sm font-medium text-emerald-600 active:scale-95"
            >
              {isLoginMode ? "Don't have an account? Sign Up" : "Already have an account? Log In"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(AuthModal);