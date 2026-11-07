import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";

import "@/app/globals.css";
import { LocaleProvider } from "@/lib/locale-context";

import { ErrorBoundary } from "./ErrorBoundary";
import { SourceProvider } from "./data/source-context";
import { tauriSource } from "./data/tauri-source";
import { AppRoutes } from "./router";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <LocaleProvider initialLocale="ru">
        <SourceProvider source={tauriSource}>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </SourceProvider>
      </LocaleProvider>
    </ErrorBoundary>
  </StrictMode>,
);
