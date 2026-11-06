import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Keep a render failure visible instead of leaving a blank WebView. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("desktop render failed", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="desktop-shell">
        <div className="desktop-crash">
          <h1>Ошибка интерфейса</h1>
          <p>Локальная библиотека не пострадала. Причина: {this.state.error.message}</p>
          <pre>{this.state.error.stack ?? this.state.error.message}</pre>
          <button onClick={() => window.location.reload()} type="button">
            Перезагрузить окно
          </button>
        </div>
      </main>
    );
  }
}
