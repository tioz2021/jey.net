import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppNav } from "@/components/app-nav";
import { SiteHeader } from "@/components/site-header";

import styles from "./layout.module.css";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8080";

// Everything behind the login form is private: no indexing, no following.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Layout for authenticated pages.
 *
 * The middleware already redirects requests without a session cookie; here the
 * session is actually verified against the API, so a stale cookie does not
 * render a logged-in shell.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();

  const response = await fetch(`${BACKEND_URL}/api/v1/me`, {
    headers: { cookie: cookieStore.toString() },
    cache: "no-store",
  });

  if (!response.ok) {
    redirect("/login");
  }

  return (
    <>
      <SiteHeader />
      <div className={styles.shell}>
        <AppNav />
        <div className={styles.content}>{children}</div>
      </div>
    </>
  );
}
