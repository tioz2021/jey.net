import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@/app/globals.css";
import { LocaleProvider } from "@/lib/locale-context";

import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider initialLocale="ru">
      <App />
    </LocaleProvider>
  </StrictMode>,
);
