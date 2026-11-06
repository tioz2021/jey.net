import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** One malformed record must not blank the whole library. */
export class CardBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("card render failed", this.props.title, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="desktop-crash">
        <strong>{this.props.title}</strong>
        <p>Не удалось отобразить запись: {this.state.error.message}</p>
        <pre>{this.state.error.stack ?? this.state.error.message}</pre>
      </div>
    );
  }
}
