import type { Metadata } from "next";

import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";

import { SiteAdminForm } from "./site-admin-form";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: `${translate(locale, "admin.site")} — jey.net` };
}

export default function AdminSitePage() {
  return <SiteAdminForm />;
}
