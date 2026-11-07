import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import "@/app/globals.css";
import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/toasts";
import { LocaleProvider } from "@/lib/locale-context";
import { UserProvider } from "@/lib/user-context";

import { Home } from "./screens/Home";
import { ItemDetailRoute } from "./screens/ItemDetailRoute";
import { ItemFormRoute } from "./screens/ItemFormRoute";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider initialLocale="ru">
      <UserProvider>
      <ToastProvider>
      <BrowserRouter basename="/spa">
        <AppShell>
          <Routes>
            <Route path="/items/new" element={<ItemFormRoute mode="new" />} />
            <Route path="/items/:id/edit" element={<ItemFormRoute mode="edit" />} />
            <Route path="/items/:id" element={<ItemDetailRoute />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
      </ToastProvider>
      </UserProvider>
    </LocaleProvider>
  </StrictMode>,
);
