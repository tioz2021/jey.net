import type { Metadata } from "next";

import type { ReactNode } from "react";

import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: `${translate(locale, "reports.title")} — jey.net` };
}

export default function AdminReportsLayout({ children }: { children: ReactNode }) {
  return children;
}
