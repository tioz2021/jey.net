import { useI18n } from "@/lib/locale-context";

export function OfflineScreen() {
  const { t } = useI18n();

  return (
    <main
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <h1>{t("offline.title")}</h1>
      <p style={{ maxWidth: "28rem" }}>{t("offline.text")}</p>
      <button onClick={() => window.location.reload()} type="button">
        {t("offline.action")}
      </button>
    </main>
  );
}
