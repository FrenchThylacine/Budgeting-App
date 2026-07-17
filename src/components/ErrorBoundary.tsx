import React, { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  retry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback ? (
        this.props.fallback(this.state.error!, this.retry)
      ) : (
        <ErrorFallback error={this.state.error} errorInfo={this.state.errorInfo} onRetry={this.retry} />
      );
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  onRetry: () => void;
}

function ErrorFallback({ error, errorInfo, onRetry }: ErrorFallbackProps) {
  return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center mb-4">
          <AlertTriangle className="w-6 h-6 text-red-600 mr-3" />
          <h1 className="text-xl font-bold text-red-600">Something went wrong</h1>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          The app encountered an unexpected error. Please try again.
        </p>

        {error && (
          <details className="mb-4">
            <summary className="text-sm font-semibold text-gray-700 cursor-pointer">
              Error details
            </summary>
            <div className="mt-2 p-3 bg-gray-100 rounded text-xs font-mono text-gray-700 overflow-auto max-h-32">
              {error.message}
              {errorInfo && <pre className="text-xs mt-2">{errorInfo.componentStack}</pre>}
            </div>
          </details>
        )}

        <button
          onClick={onRetry}
          className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>

        <button
          onClick={() => window.location.reload()}
          className="w-full mt-2 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}
