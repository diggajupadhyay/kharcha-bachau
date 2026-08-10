import React, { useState, Suspense, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { LayoutGrid, Clock, Settings as SettingsIcon, Plus, Loader2 } from 'lucide-react';
import { useCurrentDate } from './hooks/useCurrentDate';
import { useRegisterSW } from 'virtual:pwa-register/react';

const Tracker = React.lazy(() => import('./pages/Tracker'));
const History = React.lazy(() => import('./pages/History'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
const Privacy = React.lazy(() => import('./pages/Privacy'));
import { StoreProvider } from './context/StoreContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import ToastContainer from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import InstallPrompt from './components/InstallPrompt';
import UpdatePrompt from './components/UpdatePrompt';
import OfflineBanner from './components/OfflineBanner';
import QuickAddModal from './components/QuickAddModal';

const AppContent: React.FC = () => {
  const { isLoading } = useAuth();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const handleCloseQuickAdd = useCallback(() => setShowQuickAdd(false), []);
  const handleOpenQuickAdd = useCallback(() => setShowQuickAdd(true), []);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedRefresh() {
      setNeedRefresh(true);
    },
    onOfflineReady() {
      console.log('App ready for offline use');
    },
  });

  const currentDate = useCurrentDate();

  if (isLoading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-emerald-600" /></div>;

  return (
      <div className="font-sans text-slate-900 bg-slate-100 min-h-screen flex justify-center overflow-x-hidden">
        <div className="w-full max-w-lg sm:max-w-xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl bg-white h-[100dvh] md:h-auto md:min-h-screen relative shadow-2xl flex flex-col overflow-hidden mx-auto">

          <InstallPrompt />
          <OfflineBanner />
          <ToastContainer />
          <UpdatePrompt
            needRefresh={needRefresh}
            updateServiceWorker={updateServiceWorker}
            onClose={() => setNeedRefresh(false)}
          />

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

          {/* Fixed bottom area: Nav with FAB — centered with container */}
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg sm:max-w-xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl z-40 pointer-events-none">

            <nav className="relative pointer-events-auto bg-white border-t border-slate-300 flex justify-between items-center px-4 md:px-6 pt-0 pb-1 md:pb-2" style={{ paddingBottom: 'max(4px, env(safe-area-inset-bottom, 0px))' }}>

              {/* Home */}
              <NavLink to="/" className="flex flex-col items-center justify-center gap-1 flex-1 pt-6 pb-2 md:py-3 rounded-lg hover:bg-slate-50 active:bg-slate-100 transition-colors">
                {({ isActive }) => (
                  <>
                    <LayoutGrid size={22} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-emerald-600' : 'text-slate-500'} />
                    <span className={`text-[11px] md:text-xs leading-tight font-medium ${isActive ? 'text-emerald-600' : 'text-slate-500'}`}>Home</span>
                  </>
                )}
              </NavLink>

              {/* History */}
              <NavLink to="/history" className="flex flex-col items-center justify-center gap-1 flex-1 pt-6 pb-2 md:py-3 rounded-lg hover:bg-slate-50 active:bg-slate-100 transition-colors">
                {({ isActive }) => (
                  <>
                    <Clock size={22} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-emerald-600' : 'text-slate-500'} />
                    <span className={`text-[11px] md:text-xs leading-tight font-medium ${isActive ? 'text-emerald-600' : 'text-slate-500'}`}>History</span>
                  </>
                )}
              </NavLink>

              {/* FAB — centered, bigger, floating above the nav */}
              <div className="flex-1 flex items-center justify-center">
                <button
                  onClick={handleOpenQuickAdd}
                  className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-emerald-600 text-white shadow-xl active:scale-95 hover:bg-emerald-700 hover:shadow-2xl hover:scale-105 transition-all -mt-8 md:-mt-9"
                  aria-label="Add expense"
                >
                  <Plus size={28} strokeWidth={2.5} className="mx-auto" />
                </button>
              </div>

              {/* Settings */}
              <NavLink to="/settings" className="flex flex-col items-center justify-center gap-1 flex-1 pt-6 pb-2 md:py-3 rounded-lg hover:bg-slate-50 active:bg-slate-100 transition-colors">
                {({ isActive }) => (
                  <>
                    <SettingsIcon size={22} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-emerald-600' : 'text-slate-500'} />
                    <span className={`text-[11px] md:text-xs leading-tight font-medium ${isActive ? 'text-emerald-600' : 'text-slate-500'}`}>Settings</span>
                  </>
                )}
              </NavLink>
            </nav>
          </div>
        </div>
        <QuickAddModal isOpen={showQuickAdd} onClose={handleCloseQuickAdd} />
      </div>
  );
};

const App: React.FC = () => (
  <BrowserRouter>
    <ErrorBoundary>
      <AuthProvider>
        <StoreProvider>
          <AppContent />
        </StoreProvider>
      </AuthProvider>
    </ErrorBoundary>
  </BrowserRouter>
);

export default App;