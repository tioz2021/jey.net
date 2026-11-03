"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { describeError } from "@/lib/messages";
import { useI18n } from "@/lib/locale-context";

import styles from "./toasts.module.css";

export type ToastTone = "error" | "success" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  text: string;
  requestId: string | null;
}

interface ToastContextValue {
  notify: (toast: Omit<Toast, "id">) => void;
  notifyError: (error: unknown) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_TOASTS = 3;
const AUTO_HIDE_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const i18n = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...toast, id }].slice(-MAX_TOASTS));
      window.setTimeout(() => dismiss(id), AUTO_HIDE_MS);
    },
    [dismiss],
  );

  const notifyError = useCallback(
    (error: unknown) => {
      const described = describeError(error, i18n);
      notify({ tone: "error", ...described });
    },
    [notify, i18n],
  );

  return (
    <ToastContext.Provider value={{ notify, notifyError }}>
      {children}

      <div className={styles.stack} aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => dismiss(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }

  return context;
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyRequestId() {
    if (!toast.requestId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(toast.requestId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`${styles.toast} ${styles[toast.tone]}`} role="alert">
      <div className={styles.body}>
        <p className={styles.title}>{toast.title}</p>
        <p className={styles.text}>{toast.text}</p>

        {toast.requestId ? (
          <p className={styles.meta}>
            <code className={styles.requestId}>
              {toast.requestId.slice(0, 8)}…
            </code>
            <button
              className={styles.copy}
              type="button"
              onClick={copyRequestId}
            >
              {copied ? "Скопировано" : "Копировать ID"}
            </button>
          </p>
        ) : null}
      </div>

      <button
        className={styles.close}
        type="button"
        onClick={onDismiss}
        aria-label="Закрыть уведомление"
      >
        ✕
      </button>
    </div>
  );
}
