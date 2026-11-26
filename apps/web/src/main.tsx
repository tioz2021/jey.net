import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthShell } from "@/components/auth/auth-shell";
import { PublicShell } from "@/components/legal/public-shell";
import { AppFrame } from "./screens/AppFrame";
import { DocumentTitle } from "./DocumentTitle";
import { NavigationBridge } from "./NavigationBridge";
import { installClientErrorReporter } from "@/lib/client-error-reporter";
import { installMasonryLayout } from "@/lib/masonry-layout";
import { installDesktopBridge } from "./desktop-bridge";
import { installDesktopExternalLinks } from "./desktop-external-links";

installClientErrorReporter();
installMasonryLayout();
installDesktopBridge();
installDesktopExternalLinks();

// Route-level chunks keep the public shell and providers in the entry bundle.
const LoginScreen = lazy(() => import("@/components/auth/login-screen").then((m) => ({ default: m.LoginScreen })));
const LegalScreen = lazy(() => import("@/components/legal/legal-screen").then((m) => ({ default: m.LegalScreen })));
const DownloadScreen = lazy(() => import("@/components/public/download-screen").then((m) => ({ default: m.DownloadScreen })));
const LandingRoute = lazy(() => import("./screens/PublicRoutes").then((m) => ({ default: m.LandingRoute })));
const PublicProfileRoute = lazy(() => import("./screens/PublicRoutes").then((m) => ({ default: m.PublicProfileRoute })));
const PublicCollectionRoute = lazy(() => import("./screens/PublicRoutes").then((m) => ({ default: m.PublicCollectionRoute })));
const PublicItemRoute = lazy(() => import("./screens/PublicItemRoute").then((m) => ({ default: m.PublicItemRoute })));
const OfflineScreen = lazy(() => import("./screens/OfflineScreen").then((m) => ({ default: m.OfflineScreen })));
const Home = lazy(() => import("./screens/Home").then((m) => ({ default: m.Home })));
const ItemFormRoute = lazy(() => import("./screens/ItemFormRoute").then((m) => ({ default: m.ItemFormRoute })));
const ItemDetailRoute = lazy(() => import("./screens/ItemDetailRoute").then((m) => ({ default: m.ItemDetailRoute })));
const CollectionsRoute = lazy(() => import("./screens/CollectionsRoute").then((m) => ({ default: m.CollectionsRoute })));
const CollectionDetailRoute = lazy(() => import("./screens/CollectionDetailRoute").then((m) => ({ default: m.CollectionDetailRoute })));
const RecommendationsScreen = lazy(() => import("@/components/social/recommendations-screen").then((m) => ({ default: m.RecommendationsScreen })));
const PeopleScreen = lazy(() => import("@/components/social/people-screen").then((m) => ({ default: m.PeopleScreen })));
const NotificationsScreen = lazy(() => import("@/components/social/notifications-screen").then((m) => ({ default: m.NotificationsScreen })));
const TierListsScreen = lazy(() => import("@/components/tiers/tier-lists-screen").then((m) => ({ default: m.TierListsScreen })));
const TierDetailScreen = lazy(() => import("@/components/tiers/tier-detail-screen").then((m) => ({ default: m.TierDetailScreen })));
const PublicTierScreen = lazy(() => import("@/components/tiers/public-tier-screen").then((m) => ({ default: m.PublicTierScreen })));
const LikedScreen = lazy(() => import("@/components/liked-screen").then((m) => ({ default: m.LikedScreen })));
const ChatInboxScreen = lazy(() => import("@/components/chat/inbox-screen").then((m) => ({ default: m.ChatInboxScreen })));
const ChatThreadScreen = lazy(() => import("@/components/chat/thread-screen").then((m) => ({ default: m.ChatThreadScreen })));
const SettingsScreen = lazy(() => import("@/components/settings/settings-screen").then((m) => ({ default: m.SettingsScreen })));
const DashboardRoute = lazy(() => import("./screens/DashboardRoute").then((m) => ({ default: m.DashboardRoute })));
const TrashRoute = lazy(() => import("./screens/TrashRoute").then((m) => ({ default: m.TrashRoute })));
const AdminRoute = lazy(() => import("./screens/AdminRoute").then((m) => ({ default: m.AdminRoute })));
const AdminSubRoute = lazy(() => import("./screens/AdminSubRoute").then((m) => ({ default: m.AdminSubRoute })));
const AdminRedirectRoute = lazy(() => import("./screens/AdminRedirectRoute").then((m) => ({ default: m.AdminRedirectRoute })));
import { ErrorBoundary } from "@/components/error-boundary";
import { ItemsRoute } from "./screens/ItemsRoute";
import { FeedScreen } from "@/components/social/feed-screen";
import { LoadingScreen } from "@/components/loading-screen";

import "./globals.css";
import { ToastProvider } from "@/components/toasts";
import { LocaleProvider } from "@/lib/locale-context";
import { BackToTop } from "@/components/back-to-top";
import { FastTooltip } from "@/components/fast-tooltip";
import type { Locale } from "@/lib/i18n";
import { UserProvider } from "@/lib/user-context";
import { CatalogueSourceProvider, webCatalogueSource } from "@/lib/data-source";
import { activeCatalogueSource } from "./data/desktop-source";


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
        <ErrorBoundary>
        <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<PublicShell><LandingRoute /></PublicShell>} />
          <Route path="/download" element={<PublicShell><DownloadScreen /></PublicShell>} />
          <Route path="/u/:id" element={<PublicShell><PublicProfileRoute /></PublicShell>} />
          <Route path="/u/:id/collection/:slug" element={<PublicShell><PublicCollectionRoute /></PublicShell>} />
          <Route path="/u/:id/item/:itemId" element={<PublicShell><PublicItemRoute /></PublicShell>} />
          <Route path="/u/:id/cart/:itemId" element={<PublicShell><PublicItemRoute /></PublicShell>} />
          <Route path="/u/:id/tier/:slug" element={<PublicShell><PublicTierScreen /></PublicShell>} />
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
            <Route path="/liked" element={<LikedScreen />} />
            <Route path="/tiers" element={<TierListsScreen />} />
            <Route path="/tiers/:id" element={<TierDetailScreen />} />
            <Route path="/collections/:id" element={<CollectionDetailRoute />} />
            <Route path="/feed" element={<FeedScreen />} />
            <Route path="/recommendations" element={<RecommendationsScreen variant="friends" />} />
            <Route path="/recommendations/all" element={<RecommendationsScreen variant="community" />} />
            <Route path="/people" element={<PeopleScreen />} />
            <Route path="/messages" element={<ChatInboxScreen />} />
            <Route path="/messages/:id" element={<ChatThreadScreen />} />
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
        </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
      <BackToTop />
      <FastTooltip />
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
