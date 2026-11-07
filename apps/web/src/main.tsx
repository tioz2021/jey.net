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
import { CollectionsRoute } from "./screens/CollectionsRoute";
import { CollectionDetailRoute } from "./screens/CollectionDetailRoute";
import { FeedScreen } from "@/components/social/feed-screen";
import { RecommendationsScreen } from "@/components/social/recommendations-screen";
import { PeopleScreen } from "@/components/social/people-screen";
import { NotificationsScreen } from "@/components/social/notifications-screen";

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
            <Route path="/collections" element={<CollectionsRoute />} />
            <Route path="/collections/:id" element={<CollectionDetailRoute />} />
            <Route path="/feed" element={<FeedScreen />} />
            <Route path="/recommendations" element={<RecommendationsScreen />} />
            <Route path="/people" element={<PeopleScreen />} />
            <Route path="/notifications" element={<NotificationsScreen />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
      </ToastProvider>
      </UserProvider>
    </LocaleProvider>
  </StrictMode>,
);
