import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { LoginScreen } from "@/components/auth/login-screen";
import { AuthShell } from "@/components/auth/auth-shell";
import { LegalScreen } from "@/components/legal/legal-screen";
import { PublicShell } from "@/components/legal/public-shell";
import { AppFrame } from "./screens/AppFrame";

import "@/app/globals.css";
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
import { DashboardRoute } from "./screens/DashboardRoute";
import { TrashRoute } from "./screens/TrashRoute";
import { AdminRedirectRoute } from "./screens/AdminRedirectRoute";
import { AdminRoute } from "./screens/AdminRoute";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider initialLocale="ru">
      <UserProvider>
      <ToastProvider>
      <BrowserRouter basename="/spa">
        <Routes>
          <Route path="/login" element={<AuthShell><LoginScreen /></AuthShell>} />
          <Route path="/privacy" element={<PublicShell><LegalScreen page="privacy" /></PublicShell>} />
          <Route path="/terms" element={<PublicShell><LegalScreen page="terms" /></PublicShell>} />
          <Route element={<AppFrame />}>
            <Route path="/items/new" element={<ItemFormRoute mode="new" />} />
            <Route path="/items/:id/edit" element={<ItemFormRoute mode="edit" />} />
            <Route path="/items/:id" element={<ItemDetailRoute />} />
            <Route path="/collections" element={<CollectionsRoute />} />
            <Route path="/collections/:id" element={<CollectionDetailRoute />} />
            <Route path="/feed" element={<FeedScreen />} />
            <Route path="/recommendations" element={<RecommendationsScreen />} />
            <Route path="/people" element={<PeopleScreen />} />
            <Route path="/notifications" element={<NotificationsScreen />} />
            <Route path="/dashboard" element={<DashboardRoute />} />
            <Route path="/trash" element={<TrashRoute />} />
            <Route path="/admin" element={<AdminRoute />} />
            <Route path="/reports" element={<AdminRedirectRoute target="/admin/reports" />} />
            <Route path="/analytics" element={<AdminRedirectRoute target="/admin/analytics" />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </ToastProvider>
      </UserProvider>
    </LocaleProvider>
  </StrictMode>,
);
