import { useI18n } from "@/lib/locale-context";

export function OfflineScreen() {
  const { t } = useI18n();

  return (
    <main className="u-offline">
      <h1>{t("offline.title")}</h1>
      <p className="u-offline-text">{t("offline.text")}</p>
      <button onClick={() => window.location.reload()} type="button">
        {t("offline.action")}
      </button>
    </main>
  );
}
