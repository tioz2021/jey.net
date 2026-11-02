import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";

import { ToastProvider } from "@/components/toasts";
import { UserProvider } from "@/lib/user-context";

import "./globals.css";

const SITE_DESCRIPTION =
  "Фильмы, книги, картинки и заметки в одном месте: личный каталог того, что вы посмотрели, прочитали и сохранили.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_URL ?? "http://localhost:3000"),
  title: "jey — личный портал",
  description: SITE_DESCRIPTION,
  applicationName: "jey",
  openGraph: {
    type: "website",
    siteName: "jey",
    locale: "ru_RU",
    title: "jey — личный портал",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: "jey — личный портал",
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

// Runs before the first paint, so a stored theme never flashes its opposite.
const THEME_INIT = `try{var t=localStorage.getItem("jey-theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT}
        </Script>
        <a className="skip-link" href="#content">
          Перейти к содержимому
        </a>
        <UserProvider>
          <ToastProvider>
            <div id="content" tabIndex={-1}>
              {children}
            </div>
          </ToastProvider>
        </UserProvider>
      </body>
    </html>
  );
}
