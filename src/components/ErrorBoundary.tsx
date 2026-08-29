import React, { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "../i18n/useTranslation";

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

/**
 * What the application shows when a render throws.
 *
 * It was styled with Tailwind utility classes — `min-h-screen`, `bg-red-50`,
 * `rounded-lg` — and this project has no Tailwind. Every one of them resolved
 * to nothing, so the one screen a user sees when something has already gone
 * wrong was unstyled black text on white. It uses the application's own classes
 * now, and its own words.
 */
function ErrorFallback({ error, errorInfo, onRetry }: ErrorFallbackProps) {
  const { t } = useTranslation();
  return (
    <div className="error-screen" role="alert">
      <div className="card card-body error-card">
        <div className="error-head">
          <AlertTriangle size={22} aria-hidden="true" />
          <h1 className="text-title">{t("error.title")}</h1>
        </div>

        <p className="text-note">{t("error.body")}</p>

        {error && (
          <details className="sheet-advanced">
            <summary>{t("error.details")}</summary>
            <div className="sheet-advanced-body">
              <p className="text-caption user-text">{error.message}</p>
              {errorInfo && <pre className="error-stack">{errorInfo.componentStack}</pre>}
            </div>
          </details>
        )}

        <div className="error-actions">
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            {t("error.retry")}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
            {t("error.reload")}
          </button>
        </div>
      </div>
    </div>
  );
}
