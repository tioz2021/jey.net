"use client";

import { useEffect, useState } from "react";

import { Button, Card } from "@/components/ui";
import { isNewerVersion } from "@/lib/version";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";
import styles from "./desktop-storage.module.css";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function tauri(): Invoke | null {
  const api = (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__;
  return api?.core?.invoke ?? null;
}

const PRODUCTION_URL = "https://j3ynet.site";

interface ReleaseFile {
  url: string;
  name?: string;
  sha256?: string;
}

interface LatestRelease {
  version: string;
  notes?: string;
  files?: Record<string, ReleaseFile>;
}

export function DesktopAbout() {
  const invoke = tauri();
  const { t } = useI18n();
  const { user } = useUser();
  const [version, setVersion] = useState("");
  const [server, setServer] = useState(PRODUCTION_URL);
  const [dataDir, setDataDir] = useState("");
  const [checking, setChecking] = useState(false);
  const [latest, setLatest] = useState<LatestRelease | null>(null);
  const [updateState, setUpdateState] = useState<"idle" | "current" | "available" | "error">("idle");

  useEffect(() => {
    if (!invoke) return;
    invoke<string>("app_version").then(setVersion).catch(() => {});
    invoke<{ server_url?: string }>("local_access_status")
      .then((status) => {
        if (status.server_url?.startsWith("http")) setServer(status.server_url.replace(/\/$/, ""));
      })
      .catch(() => {});
    invoke<{ data_dir: string }>("local_storage_info").then((info) => setDataDir(info.data_dir)).catch(() => {});
  }, [invoke]);

  async function checkUpdates() {
    const api = invoke;
    if (!api || !version) return;
    setChecking(true);
    setLatest(null);
    try {
      const response = await api<LatestRelease>("local_latest_release");
      if (isNewerVersion(response.version, version)) {
        setLatest(response);
        setUpdateState("available");
      } else {
        setUpdateState("current");
      }
    } catch {
      setUpdateState("error");
    } finally {
      setChecking(false);
    }
  }

  if (!invoke) return null;

  const href = user?.handle && user.handle !== "local" ? `${server}/u/${user.handle}` : server;

  return (
    <Card title={t("about.title")}>
      <dl className="about-list">
        <div><dt>{t("about.version")}</dt><dd>{version || "…"}</dd></div>
        <div><dt>{t("about.server")}</dt><dd>{server}</dd></div>
        <div><dt>{t("about.data")}</dt><dd>{dataDir || "…"}</dd></div>
      </dl>
      <p><a href={href} rel="noreferrer" target="_blank">{t("about.open")} ↗</a></p>
      <Button loading={checking} onClick={() => void checkUpdates()} size="sm" variant="secondary">
        {t("about.checkUpdates")}
      </Button>
      {updateState === "current" ? <p className={styles.hint}>{t("about.upToDate")}</p> : null}
      {updateState === "error" ? <p className={styles.warn}>{t("about.updateError")}</p> : null}
      {updateState === "available" && latest ? (
        <div className={styles.body}>
          <p className={styles.hint}>{t("about.available", { version: latest.version })}</p>
          {latest.notes ? <p className={styles.hint}>{latest.notes}</p> : null}
          <div className={styles.downloads}>
            {Object.entries(latest.files ?? {}).map(([key, file]) => (
              <Button
                key={key}
                onClick={() => void invoke("local_open_external", { url: file.url })}
                size="sm"
                variant="secondary"
              >
                {t("about.download")} · {file.name ?? key}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
