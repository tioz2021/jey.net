import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";

import { ToastProvider } from "@/components/toasts";
import { LocaleProvider } from "@/lib/locale-context";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { UserProvider } from "@/lib/user-context";

import "./globals.css";

const SITE_DESCRIPTION =
  "Фильмы, книги, картинки и заметки в одном месте: личный каталог того, что вы посмотрели, прочитали и сохранили.";

// The layout reads the locale cookie, so every route is rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_URL ?? "http://localhost:3000"),
  title: "jey.net — личный портал",
  description: SITE_DESCRIPTION,
  applicationName: "jey.net",
  openGraph: {
    type: "website",
    siteName: "jey.net",
    locale: "ru_RU",
    title: "jey.net — личный портал",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: "jey.net — личный портал",
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

// Runs before the first paint, so a stored theme never flashes its opposite.
const THEME_INIT = `try{var t=localStorage.getItem("jey-theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}`;

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
        <LocaleProvider initialLocale={locale}>
          <UserProvider>
            <ToastProvider>
              <div id="content" tabIndex={-1}>
                {children}
              </div>
            </ToastProvider>
          </UserProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
