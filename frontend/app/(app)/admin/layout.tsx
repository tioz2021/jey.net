import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { backendFetch } from "@/lib/server-api";
import type { UserResponse } from "@/lib/types";

import { AdminNav } from "./admin-nav";
import styles from "./admin.module.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Админка — jey.net",
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const response = await backendFetch("/me");
  if (!response.ok) redirect("/login");
  const { user } = (await response.json()) as UserResponse;
  if (!user.is_admin) redirect("/items");

  return (
    <div className={styles.shell}>
      <AdminNav />
      {children}
    </div>
  );
}
