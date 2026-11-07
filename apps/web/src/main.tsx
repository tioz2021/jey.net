import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import "@/app/globals.css";
import { SiteHeader } from "@/components/site-header";
import { ToastProvider } from "@/components/toasts";
import { LocaleProvider } from "@/lib/locale-context";
import { UserProvider } from "@/lib/user-context";

import { Home } from "./screens/Home";
import { ItemDetailRoute } from "./screens/ItemDetailRoute";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider initialLocale="ru">
      <UserProvider>
      <ToastProvider>
      <SiteHeader />
      <BrowserRouter basename="/spa">
        <Routes>
          <Route path="/items/:id" element={<ItemDetailRoute />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
      </UserProvider>
    </LocaleProvider>
  </StrictMode>,
);
