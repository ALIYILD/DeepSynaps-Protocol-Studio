import { Component, ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<Props, State> {
  override state: State = {
    hasError: false,
  };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error) {
    console.error("DeepSynaps Studio rendering error", error);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-[var(--bg)] px-6 py-16 text-[var(--text)]">
          <div className="mx-auto max-w-3xl rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[var(--shadow-soft)]">
            <p className="text-sm uppercase tracking-[0.24em] text-[var(--accent)]">DeepSynaps Studio</p>
            <h1 className="mt-4 font-display text-4xl">Workspace error</h1>
            <p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">
              For professional use only. The interface hit an unexpected rendering error. Refresh the page and verify
              that the backend is available before continuing. This MVP is not a substitute for clinician judgment.
            </p>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
