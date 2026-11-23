import { AppLink } from "@/lib/navigation";
import { useI18n } from "@/lib/locale-context";

export function Home() {
  const { t } = useI18n();

  return (
    <main className="u-home">
      <h1>{t("notFound.title")}</h1>
      <p>{t("notFound.text")}</p>
      <AppLink href="/items">{t("notFound.action")}</AppLink>
    </main>
  );
}
