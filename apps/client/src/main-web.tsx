import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "@/app/globals.css";
import { LocaleProvider } from "@/lib/locale-context";

import { ErrorBoundary } from "./ErrorBoundary";
import { SourceProvider } from "./data/source-context";
import { httpSource } from "./data/http-source";
import { AppRoutes } from "./router";

/** Web host entry for the shared client; wired to Next in T125.2. */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <LocaleProvider initialLocale="ru">
        <SourceProvider source={httpSource}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </SourceProvider>
      </LocaleProvider>
    </ErrorBoundary>
  </StrictMode>,
);
