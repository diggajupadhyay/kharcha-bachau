import React, { useState, Suspense, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { LayoutGrid, Clock, Settings as SettingsIcon, Plus, Loader2 } from 'lucide-react';
import { useCurrentDate } from './hooks/useCurrentDate';

const Tracker = React.lazy(() => import('./pages/Tracker'));
const History = React.lazy(() => import('./pages/History'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
const Privacy = React.lazy(() => import('./pages/Privacy'));
const NotificationCenter = React.lazy(() => import('./components/NotificationCenter'));
import { StoreProvider, useStore } from './context/StoreContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationUIProvider, useNotificationUI } from './context/NotificationUIContext';
import ToastContainer from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import InstallPrompt from './components/InstallPrompt';
import QuickAddModal from './components/QuickAddModal';
import OfflineBanner from './components/OfflineBanner';

const AppContent: React.FC = () => {
  const { isLoading } = useAuth();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const { isOpen: showNotificationCenter, close: closeNotifications } = useNotificationUI();

  const currentDate = useCurrentDate();
  const handleCloseQuickAdd = useCallback(() => setShowQuickAdd(false), []);
  const handleOpenQuickAdd = useCallback(() => setShowQuickAdd(true), []);

  if (isLoading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-emerald-600" /></div>;

  return (
      <div className="font-sans text-slate-900 bg-slate-100 min-h-screen flex justify-center overflow-x-hidden">
        <div className="w-full max-w-lg sm:max-w-xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl bg-white h-[100dvh] md:h-auto md:min-h-screen relative shadow-2xl flex flex-col overflow-hidden mx-auto">

          <InstallPrompt />
          <OfflineBanner />
          <ToastContainer />

          <main className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar scroll-smooth bg-slate-50/50 overscroll-behavior-y-contain">
            <Suspense fallback={
              <div className="h-full flex items-center justify-center bg-slate-50">
                <Loader2 className="animate-spin text-emerald-600" size={32} />
              </div>
            }>
              <Routes>
                <Route path="/" element={<Tracker currentDate={currentDate} />} />
                <Route path="/history" element={<History />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/privacy" element={<Privacy />} />
              </Routes>
            </Suspense>
          </main>

          {/* Fixed bottom area: FAB + Nav — centered with container */}
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg sm:max-w-xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl z-40 pointer-events-none">
            <button
              onClick={handleOpenQuickAdd}
              className="absolute bottom-20 flex items-center justify-center w-14 h-14 rounded-full bg-emerald-600 text-white shadow-xl active:scale-95 hover:bg-emerald-700 hover:shadow-2xl hover:scale-105 transition-all pointer-events-auto"
              style={{ right: 'max(1.25rem, env(safe-area-inset-right, 0px))' }}
              aria-label="Add expense"
            >
              <Plus size={26} strokeWidth={2.5} />
            </button>

            <nav className="pointer-events-auto bg-white border-t border-slate-200 flex justify-between items-center px-4 md:px-6 py-1 md:py-2" style={{ paddingBottom: 'max(4px, env(safe-area-inset-bottom, 0px))' }}>
              {[
                { to: '/', icon: LayoutGrid, label: 'Home' },
                { to: '/history', icon: Clock, label: 'History' },
                { to: '/settings', icon: SettingsIcon, label: 'Settings' },
              ].map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className="flex flex-col items-center justify-center gap-1 flex-1 py-2 md:py-3 rounded-lg hover:bg-slate-50 active:bg-slate-100 transition-colors"
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={22} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-emerald-600' : 'text-slate-400'} />
                      <span className={`text-[10px] md:text-xs leading-tight font-medium ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {label}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>

          <Suspense fallback={null}>
            <NotificationCenter
              isOpen={showNotificationCenter}
              onClose={closeNotifications}
            />
          </Suspense>

          <QuickAddModal isOpen={showQuickAdd} onClose={handleCloseQuickAdd} />
        </div>
      </div>
  );
};

const App: React.FC = () => (
  <BrowserRouter>
    <ErrorBoundary>
      <AuthProvider>
        <StoreProvider>
          <NotificationUIProvider>
            <AppContent />
          </NotificationUIProvider>
        </StoreProvider>
      </AuthProvider>
    </ErrorBoundary>
  </BrowserRouter>
);

export default App;