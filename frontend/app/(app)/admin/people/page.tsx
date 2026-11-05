import type { Metadata } from "next";

import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";

import { AdminPeople } from "./admin-people";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: `${translate(locale, "admin.people")} — jey.net` };
}

export default function AdminPeoplePage() {
  return <AdminPeople />;
}
