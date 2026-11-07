import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** The shared catalogue owns its own sidebar, so this group omits AppNav. */
export default async function CatalogLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const response = await fetch(
    `${process.env.BACKEND_URL ?? "http://127.0.0.1:8080"}/api/v1/me`,
    { headers: { cookie: cookieStore.toString() }, cache: "no-store" },
  );
  if (!response.ok) redirect("/login");
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
