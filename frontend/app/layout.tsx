import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";

import { BackToTop } from "@/components/back-to-top";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { PwaRegister } from "@/components/pwa-register";
import { ToastProvider } from "@/components/toasts";
import { LocaleProvider } from "@/lib/locale-context";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { UserProvider } from "@/lib/user-context";

import "./globals.css";

// The layout reads the locale cookie, so every route is rendered per request.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#7c3aed",
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const title = `${translate(locale, "app.name")} — ${translate(locale, "app.tagline")}`;
  const description = translate(locale, "landing.metaDescription");
  const ogLocale =
    locale === "uk" ? "uk_UA" : locale === "en" ? "en_US" : "ru_RU";

  return {
    metadataBase: new URL(process.env.PUBLIC_URL ?? "http://localhost:3000"),
    title,
    description,
    applicationName: "jey.net",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "jey.net",
    },
    openGraph: {
      type: "website",
      siteName: "jey.net",
      locale: ogLocale,
      title,
      description,
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: "jey.net — личный каталог фильмов, сериалов и книг",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
    robots: { index: true, follow: true },
  };
}

// Runs before the first paint, so a stored theme never flashes its opposite.
const THEME_INIT = `try{var s=localStorage.getItem("jey-theme");var t=(s==="light"||s==="dark")?s:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getServerLocale();

  return (
    <html lang={locale}>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT}
        </Script>
        <a className="skip-link" href="#content">
          {translate(locale, "app.skip")}
        </a>
        <PwaRegister />
        <LocaleProvider initialLocale={locale}>
          <UserProvider>
            <ToastProvider>
              <div id="content" tabIndex={-1}>
                {children}
              </div>
              <PwaInstallPrompt />
              <BackToTop />
            </ToastProvider>
          </UserProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
