import React, { useState, Suspense, useCallback, useEffect } from 'react';
import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { LayoutGrid, Settings as SettingsIcon, Plus, Loader2 } from 'lucide-react';
import { useCurrentDate } from './hooks/useCurrentDate';
import { StoreProvider } from './context/StoreContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import ToastContainer from './components/Toast';
import InstallPrompt from './components/InstallPrompt';
import UpdatePrompt from './components/UpdatePrompt';
import OfflineBanner from './components/OfflineBanner';
import QuickAddModal from './components/QuickAddModal';

// Set on first entry to the app. The landing page checks this flag and sends
// returning visitors straight to /app, so daily users never see the landing.
export const HAS_OPENED_APP_KEY = 'kharcha_bachau_has_opened_app';

interface AppShellProps {
  needRefresh: boolean;
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  onDismissUpdate: () => void;
}

const Shell: React.FC<AppShellProps> = ({ needRefresh, updateServiceWorker, onDismissUpdate }) => {
  const { isLoading } = useAuth();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const handleCloseQuickAdd = useCallback(() => setShowQuickAdd(false), []);
  const handleOpenQuickAdd = useCallback(() => setShowQuickAdd(true), []);

  const currentDate = useCurrentDate();

  // Mark the app as opened so the landing page redirects returning visitors
  // straight here next time. Private browsing can block storage — the redirect
  // just won't happen.
  useEffect(() => {
    try {
      localStorage.setItem(HAS_OPENED_APP_KEY, '1');
    } catch {
      // no-op
    }
  }, []);

  if (isLoading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-emerald-600" /></div>;

  return (
      <div className="font-sans text-slate-900 bg-slate-100 min-h-screen flex justify-center overflow-x-hidden">
        {/* The shell is a fixed-height viewport at every breakpoint and <main> is
            always the scroll container. Previously md+ switched to document
            scrolling via md:h-auto/md:overflow-visible, but md:overflow-visible
            also disabled main's own scrolling, leaving nothing scrollable. */}
        <div className="w-full max-w-lg sm:max-w-xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl bg-white h-[100dvh] relative shadow-2xl flex flex-col overflow-hidden mx-auto">

          <InstallPrompt />
          <OfflineBanner />
          <ToastContainer />
          <UpdatePrompt
            needRefresh={needRefresh}
            updateServiceWorker={updateServiceWorker}
            onClose={onDismissUpdate}
          />

          <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar scroll-smooth bg-slate-50/50 overscroll-y-contain">
            <Suspense fallback={
              <div className="h-full min-h-[60vh] flex items-center justify-center bg-slate-50">
                <Loader2 className="animate-spin text-emerald-600" size={32} />
              </div>
            }>
              <Outlet />
            </Suspense>
          </main>

          {/* Fixed bottom area: Nav with FAB — centered with container */}
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg sm:max-w-xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl z-40 pointer-events-none">

            <nav className="relative pointer-events-auto bg-white border-t border-slate-300 flex justify-between items-center px-4 md:px-6 pt-0 pb-1 md:pb-2" style={{ paddingBottom: 'max(4px, env(safe-area-inset-bottom, 0px))' }}>

              {/* Home */}
              <NavLink to="/app" className="flex flex-col items-center justify-center gap-1 flex-1 pt-5 pb-2 md:py-3 rounded-lg hover:bg-slate-50 active:bg-slate-100 transition-colors">
                {({ isActive }) => (
                  <>
                    <LayoutGrid size={26} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-emerald-600' : 'text-slate-600'} />
                    <span className={`text-[13px] md:text-sm leading-tight font-semibold ${isActive ? 'text-emerald-600' : 'text-slate-600'}`}>Home</span>
                  </>
                )}
              </NavLink>

              {/* FAB — centered, bigger, floating above the nav */}
              <div className="flex-1 flex items-center justify-center">
                <button
                  onClick={handleOpenQuickAdd}
                  className="w-16 h-16 md:w-[4.5rem] md:h-[4.5rem] rounded-full bg-emerald-600 text-white shadow-xl active:scale-95 hover:bg-emerald-700 hover:shadow-2xl hover:scale-105 transition-all -mt-9 md:-mt-10"
                  aria-label="Add expense"
                >
                  <Plus size={32} strokeWidth={3} className="mx-auto" />
                </button>
              </div>

              {/* Settings */}
              <NavLink to="/app/settings" className="flex flex-col items-center justify-center gap-1 flex-1 pt-5 pb-2 md:py-3 rounded-lg hover:bg-slate-50 active:bg-slate-100 transition-colors">
                {({ isActive }) => (
                  <>
                    <SettingsIcon size={26} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-emerald-600' : 'text-slate-600'} />
                    <span className={`text-[13px] md:text-sm leading-tight font-semibold ${isActive ? 'text-emerald-600' : 'text-slate-600'}`}>Settings</span>
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

const AppShell: React.FC<AppShellProps> = (props) => (
  <AuthProvider>
    <StoreProvider>
      <Shell {...props} />
    </StoreProvider>
  </AuthProvider>
);

export default AppShell;
