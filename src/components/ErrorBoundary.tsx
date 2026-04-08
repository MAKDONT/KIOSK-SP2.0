import React, { Component, ReactNode, ErrorInfo } from "react";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare state: ErrorBoundaryState;
  declare props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-red-100 p-4 rounded-full">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">
              Something went wrong
            </h1>
            <p className="text-neutral-600 mb-4">
              An unexpected error occurred. Please refresh the page to continue.
            </p>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-sm font-mono text-red-600 hover:text-red-700">
                  Error details (Dev only)
                </summary>
                <pre className="mt-2 p-3 bg-neutral-100 rounded text-xs overflow-auto max-h-40 text-red-600">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-6 w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
