import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";

import "@/app/globals.css";
import { LocaleProvider } from "@/lib/locale-context";

import { Home } from "./screens/Home";
import { ItemDetailScreen } from "./screens/ItemDetailScreen";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider initialLocale="ru">
      <HashRouter>
        <Routes>
          <Route path="/items/:id" element={<ItemDetailScreen />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </HashRouter>
    </LocaleProvider>
  </StrictMode>,
);
