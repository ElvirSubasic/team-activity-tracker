import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string | null;
};

export class AppErrorBoundary extends Component<Props, State> {
  override state: State = {
    hasError: false,
    message: null
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Unhandled renderer error", error, errorInfo);
  }

  private reset = () => {
    this.setState({ hasError: false, message: null });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <main className="app-shell">
          <section className="panel">
            <h1>Something went wrong</h1>
            <p className="notice-toast notice-error">{this.state.message ?? "Unexpected renderer error."}</p>
            <button onClick={this.reset}>Dismiss</button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
