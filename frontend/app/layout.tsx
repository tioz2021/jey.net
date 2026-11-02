import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";

import "./globals.css";

export const metadata: Metadata = {
  title: "jey — личный портал",
  description: "Фильмы, книги, картинки и заметки в одном месте",
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
        {children}
      </body>
    </html>
  );
}
