import type { ReactNode } from "react";
import { cookies } from "next/headers";

import { BACKEND_URL } from "@/lib/server-api";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";

import styles from "./layout.module.css";

/** Public pages (landing, shared profiles, legal) have a light classic header. */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const me = await fetch(`${BACKEND_URL}/api/v1/me`, {
    headers: { cookie: cookieStore.toString() },
    cache: "no-store",
  }).catch(() => null);

  return (
    <div className={styles.page}>
      <PublicHeader authenticated={Boolean(me?.ok)} />

      <main className={styles.main}>{children}</main>

      <PublicFooter />
    </div>
  );
}
