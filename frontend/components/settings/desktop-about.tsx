"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function tauri(): Invoke | null {
  const api = (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__;
  return api?.core?.invoke ?? null;
}

const PRODUCTION_URL = "https://j3ynet.site";

export function DesktopAbout() {
  const invoke = tauri();
  const { t } = useI18n();
  const { user } = useUser();
  const [version, setVersion] = useState("");
  const [server, setServer] = useState(PRODUCTION_URL);
  const [dataDir, setDataDir] = useState("");

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
    </Card>
  );
}
