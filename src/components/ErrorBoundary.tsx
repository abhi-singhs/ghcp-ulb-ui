import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="error-boundary" role="alert">
        <div className="error-boundary__card">
          <h1>Something went wrong</h1>
          <p className="muted">
            An unexpected error occurred while rendering the app.
          </p>
          <pre className="error-boundary__detail">{error.message}</pre>
          <div className="row">
            <button
              type="button"
              className="error-boundary__button"
              onClick={this.reset}
            >
              Try again
            </button>
            <button
              type="button"
              className="error-boundary__button"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
