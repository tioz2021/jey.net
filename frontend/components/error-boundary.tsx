"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

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

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("jey render error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main style={{ maxWidth: "42rem", margin: "4rem auto", padding: "0 1rem" }}>
        <h1>Что-то пошло не так</h1>
        <p>Страница не загрузилась. Можно вернуться к записям или перезагрузить приложение.</p>
        <pre style={{ overflow: "auto", whiteSpace: "pre-wrap" }}>
          {this.state.error.message}
        </pre>
        <p>
          <a href="/items">К записям</a>{" "}
          <button onClick={() => window.location.reload()} type="button">
            Перезагрузить
          </button>
        </p>
      </main>
    );
  }
}
