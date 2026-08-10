import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { clearLocalData } from '../utils/localData';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
      return;
    }

    // Production crashes were previously invisible — nothing was reported anywhere,
    // so a user hitting a white screen was the only signal it had happened.
    //
    // Set VITE_ERROR_REPORT_URL to an endpoint that accepts a JSON POST. Note the
    // Content-Security-Policy in firebase.json restricts connect-src, so the chosen
    // host must be added there too or the browser will block this request.
    const endpoint = import.meta.env.VITE_ERROR_REPORT_URL;
    if (!endpoint) return;

    try {
      const body = JSON.stringify({
        message: error.message,
        stack: error.stack?.slice(0, 4000),
        componentStack: errorInfo.componentStack?.slice(0, 4000),
        version: __APP_VERSION__,
        url: window.location.pathname, // pathname only — never query or hash
        userAgent: navigator.userAgent,
        at: new Date().toISOString(),
      });
      // keepalive so the report survives the user immediately reloading.
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => { /* reporting must never itself throw */ });
    } catch {
      /* ignore */
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null
    });
  };

  // Last resort for a crash that repeats on every load — corrupt data persisted in
  // local storage, for instance. Without this the only escape is clearing site data
  // through browser settings, which a non-technical user will not find.
  handleClearData = () => {
    const confirmed = window.confirm(
      'This deletes the expenses saved on this device and starts fresh. ' +
      'Anything already backed up to your account is not affected. Continue?'
    );
    if (!confirmed) return;
    clearLocalData();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 shadow-lg p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-rose-100 rounded-full">
                <AlertCircle className="text-rose-600" size={32} />
              </div>
            </div>
            
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              Something went wrong
            </h1>
            
            <p className="text-slate-600 mb-6">
              We're sorry, but something unexpected happened. Please try refreshing the page.
            </p>

            {import.meta.env.DEV && this.state.error && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-sm text-slate-500 mb-2">
                  Error details (dev only)
                </summary>
                <pre className="text-xs bg-slate-100 p-3 rounded overflow-auto max-h-40">
                  {this.state.error.toString()}
                  {this.state.error.stack && (
                    <>
                      {'\n\n'}
                      {this.state.error.stack}
                    </>
                  )}
                </pre>
              </details>
            )}

            <button
              onClick={this.handleReset}
              className="w-full bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-emerald-700 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 flex items-center justify-center gap-2"
            >
              <RefreshCw size={20} />
              Try Again
            </button>

            <button
              onClick={() => window.location.reload()}
              className="w-full mt-3 bg-slate-100 text-slate-700 px-6 py-3 rounded-xl font-semibold hover:bg-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              Reload Page
            </button>

            <div className="mt-6 pt-5 border-t border-slate-200">
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                Still not working after reloading? You can clear the data saved on this
                device and start again. Anything backed up to your account stays safe.
              </p>
              <button
                onClick={this.handleClearData}
                className="w-full bg-white text-rose-700 border border-rose-200 px-6 py-3 rounded-xl font-semibold hover:bg-rose-50 transition-colors focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
              >
                Clear data on this device
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

