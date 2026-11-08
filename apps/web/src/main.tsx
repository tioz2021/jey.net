import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { LoginScreen } from "@/components/auth/login-screen";
import { AuthShell } from "@/components/auth/auth-shell";
import { LegalScreen } from "@/components/legal/legal-screen";
import { PublicShell } from "@/components/legal/public-shell";
import { AppFrame } from "./screens/AppFrame";
import { DocumentTitle } from "./DocumentTitle";
import { NavigationBridge } from "./NavigationBridge";
import { installDesktopBridge } from "./desktop-bridge";
import { installDesktopExternalLinks } from "./desktop-external-links";

installDesktopBridge();
installDesktopExternalLinks();
import { ItemsRoute } from "./screens/ItemsRoute";
import { SettingsScreen } from "@/components/settings/settings-screen";
import { LandingRoute, PublicProfileRoute, PublicCollectionRoute } from "./screens/PublicRoutes";
import { PublicItemRoute } from "./screens/PublicItemRoute";
import { OfflineScreen } from "./screens/OfflineScreen";

import "./globals.css";
import { ToastProvider } from "@/components/toasts";
import { LocaleProvider } from "@/lib/locale-context";
import { BackToTop } from "@/components/back-to-top";
import type { Locale } from "@/lib/i18n";
import { UserProvider } from "@/lib/user-context";
import { CatalogueSourceProvider, webCatalogueSource } from "@/lib/data-source";
import { activeCatalogueSource } from "./data/desktop-source";

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
import { AdminSubRoute } from "./screens/AdminSubRoute";

const initialLocale = ((): Locale => {
  const match = document.cookie.match(/(?:^|; )jey_lang=(ru|uk|en)(?:;|$)/);
  return (match?.[1] as Locale | undefined) ?? "ru";
})();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider initialLocale={initialLocale}>
      <CatalogueSourceProvider source={activeCatalogueSource ?? webCatalogueSource}>
      <UserProvider>
      <ToastProvider>
      <BrowserRouter>
        <DocumentTitle />
        <NavigationBridge />
        <Routes>
          <Route path="/" element={<PublicShell><LandingRoute /></PublicShell>} />
          <Route path="/u/:id" element={<PublicShell><PublicProfileRoute /></PublicShell>} />
          <Route path="/u/:id/collection/:slug" element={<PublicShell><PublicCollectionRoute /></PublicShell>} />
          <Route path="/u/:id/item/:itemId" element={<PublicShell><PublicItemRoute /></PublicShell>} />
          <Route path="/u/:id/cart/:itemId" element={<PublicShell><PublicItemRoute /></PublicShell>} />
          <Route path="/u/:id/:itemId" element={<PublicShell><PublicItemRoute /></PublicShell>} />
          <Route path="/offline" element={<OfflineScreen />} />
          <Route path="/login" element={<AuthShell><LoginScreen /></AuthShell>} />
          <Route path="/privacy" element={<PublicShell><LegalScreen page="privacy" /></PublicShell>} />
          <Route path="/terms" element={<PublicShell><LegalScreen page="terms" /></PublicShell>} />
          <Route element={<AppFrame />}>
            <Route path="/items" element={<ItemsRoute />} />
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
            <Route path="/welcome" element={<ItemsRoute />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/admin" element={<AdminRoute />} />
            <Route path="/admin/reports" element={<AdminSubRoute page="reports" />} />
            <Route path="/admin/people" element={<AdminSubRoute page="people" />} />
            <Route path="/admin/site" element={<AdminSubRoute page="site" />} />
            <Route path="/admin/errors" element={<AdminSubRoute page="errors" />} />
            <Route path="/admin/system" element={<AdminSubRoute page="system" />} />
            <Route path="/admin/audit" element={<AdminSubRoute page="audit" />} />
            <Route path="/admin/analytics" element={<AdminSubRoute page="analytics" />} />
            <Route path="/reports" element={<AdminRedirectRoute target="/admin/reports" />} />
            <Route path="/analytics" element={<AdminRedirectRoute target="/admin/analytics" />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <BackToTop />
      </ToastProvider>
      </UserProvider>
      </CatalogueSourceProvider>
    </LocaleProvider>
  </StrictMode>,
);

// Register the shell worker in the browser. Tauri has its own asset protocol.
if ("serviceWorker" in navigator && import.meta.env.PROD && !("__TAURI__" in window)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
