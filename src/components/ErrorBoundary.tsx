import React from 'react';
import { isStaleChunkError, autoRecoverFromStaleChunk } from '@/lib/updateRecovery';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
  isReloading: boolean;
  isRecoveringChunk: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: '',
      isReloading: false,
      isRecoveringChunk: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    if (isStaleChunkError(error)) {
      const initiated = autoRecoverFromStaleChunk('ErrorBoundary');
      if (initiated) {
        return { hasError: true, error, isRecoveringChunk: true };
      }
    }
    return { hasError: true, error, isRecoveringChunk: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (isStaleChunkError(error)) {
      if (!this.state.isRecoveringChunk) {
        const initiated = autoRecoverFromStaleChunk('ErrorBoundary');
        if (initiated) {
          this.setState({ isRecoveringChunk: true });
          return;
        }
      }
    }
    // Log non-chunk errors for debugging — visible in Android logcat / Chrome DevTools
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
    this.setState({ errorInfo: info.componentStack || '' });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: '', isReloading: false, isRecoveringChunk: false });
  };

  handleReload = () => {
    this.setState({ isReloading: true });
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Quiet recovery UI for stale chunk errors while reload takes place
      if (this.state.isRecoveringChunk) {
        return (
          <div className="fixed inset-0 z-9999 w-screen h-screen flex flex-col items-center justify-center bg-background p-4 animate-in fade-in duration-200">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <div className="space-y-1">
                <p className="text-base font-semibold text-foreground">Updating MeroByapar...</p>
                <p className="text-xs text-muted-foreground">Loading fresh application assets</p>
              </div>
            </div>
          </div>
        );
      }

      // Standard error boundary UI for actual application / runtime crashes
      return (
        <div className="fixed inset-0 z-9999 w-screen h-screen flex items-center justify-center p-4 bg-background">
          <div className="w-full max-w-md p-6 md:p-8 rounded-2xl border bg-card text-card-foreground shadow-2xl flex flex-col items-center text-center space-y-6 animate-in fade-in duration-300">
            {/* Warning Icon Container */}
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center text-destructive shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 animate-pulse">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>

            {/* Error Message */}
            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight">Something went wrong</h2>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                The application encountered an unexpected error. Tap below to reload the app.
              </p>
            </div>

            {/* Action Button */}
            <button
              onClick={this.handleReload}
              disabled={this.state.isReloading}
              className="w-full py-3 px-4 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-md hover:bg-primary/95 active:scale-95 transition-all disabled:opacity-85 disabled:cursor-not-allowed"
            >
              {this.state.isReloading ? (
                <svg className="animate-spin h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              )}
              {this.state.isReloading ? 'Reloading...' : 'Reload Application'}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

