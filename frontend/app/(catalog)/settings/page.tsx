import type { Metadata } from "next";

import { SettingsClient } from "@/components/settings/settings-client";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: `${translate(locale, "settings.title")} — jey.net` };
}

export default function SettingsPage() {
  return <SettingsClient />;
}
