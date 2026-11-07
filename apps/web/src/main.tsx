import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";

import "@/app/globals.css";
import { SiteHeader } from "@/components/site-header";
import { ToastProvider } from "@/components/toasts";
import { LocaleProvider } from "@/lib/locale-context";
import { UserProvider } from "@/lib/user-context";

import { Home } from "./screens/Home";
import { ItemDetailScreen } from "./screens/ItemDetailScreen";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider initialLocale="ru">
      <UserProvider>
      <ToastProvider>
      <SiteHeader />
      <HashRouter>
        <Routes>
          <Route path="/items/:id" element={<ItemDetailScreen />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </HashRouter>
      </ToastProvider>
      </UserProvider>
    </LocaleProvider>
  </StrictMode>,
);
