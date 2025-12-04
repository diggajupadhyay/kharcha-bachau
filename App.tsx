import React, { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { ViewState } from './types';
import { LayoutGrid, Clock, Loader2 } from 'lucide-react';

// Lazy load routes for code splitting
const Tracker = React.lazy(() => import('./pages/Tracker'));
const History = React.lazy(() => import('./pages/History'));
import { StoreProvider } from './context/StoreContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import ToastContainer from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import InstallPrompt from './components/InstallPrompt';

const VIEW_STATE_KEY = 'kharcha_bachau_current_view';

const AppContent: React.FC = () => {
  const { isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<ViewState>(() => {
    const saved = localStorage.getItem(VIEW_STATE_KEY);
    if (saved && Object.values(ViewState).includes(saved as ViewState)) {
      return saved as ViewState;
    }
    return ViewState.HOME;
  });
  const [viewHistory, setViewHistory] = useState<ViewState[]>([]);

  useEffect(() => {
    localStorage.setItem(VIEW_STATE_KEY, currentView);
  }, [currentView]);

  // Memoize currentDate calculation
  const currentDate = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  // Handle view changes and update history
  const changeView = useCallback((newView: ViewState) => {
    if (newView !== currentView) {
      setViewHistory(prev => [...prev, currentView].slice(-10)); // Keep last 10 views
      setCurrentView(newView);
      // Push state to history to enable back navigation
      window.history.pushState({ view: newView, isAppNavigation: true }, '');
    }
  }, [currentView]);

  // Handle browser back/forward navigation (swipe gestures)
  useEffect(() => {
    // Initialize history state
    window.history.replaceState({ view: currentView, isAppNavigation: true }, '');

    const handlePopState = (e: PopStateEvent) => {
      // If navigating back within app
      if (viewHistory.length > 0) {
        const previousView = viewHistory[viewHistory.length - 1];
        setViewHistory(prev => prev.slice(0, -1));
        setCurrentView(previousView);
        // Push state again to prevent browser from going back further
        window.history.pushState({ view: previousView, isAppNavigation: true }, '');
      } else {
        // If at the first view, prevent navigation out of app
        // Push state to keep browser in app
        window.history.pushState({ view: currentView, isAppNavigation: true }, '');
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [currentView, viewHistory]);

  if (isLoading) return <div className="h-screen flex items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-emerald-600" /></div>;

  return (
    <div className="font-sans text-slate-900 bg-slate-100 min-h-screen flex justify-center overflow-x-hidden">
      <div className="w-full sm:max-w-md bg-white h-[100dvh] relative shadow-2xl flex flex-col overflow-hidden max-w-full">
        
        <InstallPrompt />
        <ToastContainer />
        
        <main className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar scroll-smooth bg-gray-50/50">
          <Suspense fallback={
            <div className="h-full flex items-center justify-center bg-gray-50">
              <Loader2 className="animate-spin text-emerald-600" size={32} />
            </div>
          }>
            {currentView === ViewState.HOME && <Tracker currentDate={currentDate} />}
            {currentView === ViewState.HISTORY && <History />}
          </Suspense>
        </main>

        {/* Simplified Bottom Nav */}
        <div className="fixed bottom-0 w-full sm:max-w-md z-40 pointer-events-none" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <nav className="pointer-events-auto bg-white border-t border-slate-200 flex justify-between items-center px-6 py-2">
              <NavButton 
                active={currentView === ViewState.HOME} 
                onClick={() => changeView(ViewState.HOME)} 
                icon={<LayoutGrid size={20} />} 
                label="Home"
              />
              <NavButton 
                active={currentView === ViewState.HISTORY} 
                onClick={() => changeView(ViewState.HISTORY)} 
                icon={<Clock size={20} />} 
                label="History"
              />
            </nav>
        </div>
      </div>
    </div>
  );
};

const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = React.memo(({ active, onClick, icon, label }) => {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 active:scale-95"
    >
      <div className={`${active ? 'text-emerald-600' : 'text-slate-400'}`}>
          {React.cloneElement(icon as React.ReactElement<any>, { 
              strokeWidth: active ? 2.5 : 2
          })}
      </div>
      <span className={`text-xs font-medium ${active ? 'text-emerald-600' : 'text-slate-400'}`}>
          {label}
      </span>
    </button>
  );
});

const App: React.FC = () => (
  <ErrorBoundary>
    <AuthProvider>
      <StoreProvider>
        <AppContent />
      </StoreProvider>
    </AuthProvider>
  </ErrorBoundary>
);

export default App;