import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@/app/globals.css";
import { LocaleProvider } from "@/lib/locale-context";

import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";

// A thrown event handler or a WebView error would otherwise leave a blank
// window with no way to report the cause.
function showRuntimeError(message: string) {
  const node = document.createElement("pre");
  node.className = "desktop-runtime-error";
  node.textContent = `Ошибка: ${message}`;
  document.body.appendChild(node);
}
window.addEventListener("error", (event) => {
  showRuntimeError(event.error?.stack ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  showRuntimeError(String(event.reason));
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <LocaleProvider initialLocale="ru">
        <App />
      </LocaleProvider>
    </ErrorBoundary>
  </StrictMode>,
);
