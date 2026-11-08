import { AppLink } from "@/lib/navigation";
import { useI18n } from "@/lib/locale-context";

export function Home() {
  const { t } = useI18n();

  return (
    <main style={{ maxWidth: "48rem", margin: "4rem auto", padding: "0 1rem" }}>
      <h1>{t("notFound.title")}</h1>
      <p>{t("notFound.text")}</p>
      <AppLink href="/items">{t("notFound.action")}</AppLink>
    </main>
  );
}
