"use client";

import { useEffect, useState } from "react";

import { AppLink } from "@/lib/navigation";
import { useI18n } from "@/lib/locale-context";

import styles from "./download-screen.module.css";

interface ReleaseFile {
  name: string;
  url: string;
  sha256: string;
  size: number;
}

interface Release {
  version: string;
  notes?: string;
  files: Record<string, ReleaseFile>;
}

function sizeLabel(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function safeUrl(value: string): string | null {
  return value.startsWith("https://") ? value : null;
}

export function DownloadScreen() {
  const { t } = useI18n();
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    fetch("/downloads/desktop/latest.json", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`release manifest: ${response.status}`);
        return response.json() as Promise<Release>;
      })
      .then((body) => setRelease(body))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [attempt]);

  const linux = release
    ? [
        ["appimage", release.files["linux-x86_64"]],
        ["deb", release.files["linux-x86_64-deb"]],
      ].filter((entry): entry is [string, ReleaseFile] => Boolean(entry[1]))
    : [];
  const windows = release?.files["windows-x86_64"];
  const fileFor = (name: string) => linux.find(([key]) => key === name)?.[1] ?? windows;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.kicker}>{t("download.kicker")}</p>
        <h1 className={styles.title}>{t("download.title")}</h1>
        <p className={styles.lead}>{t("download.lead")}</p>
        {release ? (
          <p className={styles.version}>
            {t("download.version", { version: release.version })}
          </p>
        ) : null}
      </header>

      {loading ? <p className={styles.status}>{t("download.loading")}</p> : null}
      {failed ? (
        <section className={styles.status} role="status">
          <p>{t("download.error")}</p>
          <button className={styles.retry} onClick={() => setAttempt((value) => value + 1)} type="button">
            {t("download.retry")}
          </button>
        </section>
      ) : null}

      {release ? (
        <section aria-labelledby="download-linux" className={styles.platform}>
          <h2 className={styles.sectionTitle} id="download-linux">{t("download.linux")}</h2>
          <p className={styles.hint}>{t("download.linuxHint")}</p>
          <div className={styles.downloads}>
            {linux.map(([key, file]) => {
              const url = safeUrl(file.url);
              return url ? (
                <a className={styles.download} href={url} key={key} rel="noreferrer" target="_blank">
                  <span className={styles.format}>{key === "appimage" ? "AppImage" : "DEB"}</span>
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.meta}>{sizeLabel(file.size)}</span>
                  <span className={styles.action}>{t("download.download")}</span>
                  <code className={styles.sha} title={file.sha256}>{file.sha256}</code>
                </a>
              ) : null;
            })}
          </div>
          {linux.length === 0 ? <p className={styles.status}>{t("download.noBuild")}</p> : null}
        </section>
      ) : null}

      {release ? (
        <section aria-labelledby="download-windows" className={styles.platform}>
          <h2 className={styles.sectionTitle} id="download-windows">{t("download.windows")}</h2>
          <p className={styles.hint}>{t("download.windowsHint")}</p>
          {windows && safeUrl(windows.url) ? (
            <div className={styles.downloads}>
              <a className={styles.download} href={safeUrl(windows.url)!} rel="noreferrer" target="_blank">
                <span className={styles.format}>NSIS</span>
                <span className={styles.fileName}>{windows.name}</span>
                <span className={styles.meta}>{sizeLabel(windows.size)}</span>
                <span className={styles.action}>{t("download.download")}</span>
                <code className={styles.sha} title={windows.sha256}>{windows.sha256}</code>
              </a>
            </div>
          ) : <p className={styles.status}>{t("download.noBuild")}</p>}
          <p className={styles.warning}>{t("download.windowsWarning")}</p>
        </section>
      ) : null}

      <section className={styles.instructions} aria-labelledby="download-install">
        <h2 className={styles.sectionTitle} id="download-install">{t("download.installTitle")}</h2>
        <div className={styles.steps}>
          <article className={styles.step}>
            <h3>{t("download.appimageTitle")}</h3>
            <pre><code>{`chmod +x ${fileFor("appimage")?.name ?? "jey.net_0.7.1_amd64.AppImage"}
./${fileFor("appimage")?.name ?? "jey.net_0.7.1_amd64.AppImage"}`}</code></pre>
          </article>
          <article className={styles.step}>
            <h3>{t("download.debTitle")}</h3>
            <pre><code>{`sudo apt install ./${fileFor("deb")?.name ?? "jey.net_0.7.1_amd64.deb"}`}</code></pre>
          </article>
          <article className={styles.step}>
            <h3>{t("download.windowsTitle")}</h3>
            <p>{t("download.windowsStep")}</p>
          </article>
        </div>
      </section>

      <section className={styles.instructions} aria-labelledby="download-verify">
        <h2 className={styles.sectionTitle} id="download-verify">{t("download.verifyTitle")}</h2>
        <p className={styles.hint}>{t("download.verifyHint")}</p>
        <pre><code>{`sha256sum ${fileFor("appimage")?.name ?? "jey.net_0.7.1_amd64.AppImage"}`}</code></pre>
        <pre><code>Get-FileHash .\jey.net_0.7.1_x64-setup.exe -Algorithm SHA256</code></pre>
      </section>

      <section className={styles.note}>
        <h2 className={styles.sectionTitle}>{t("download.updateTitle")}</h2>
        <p>{t("download.updateText")}</p>
        <p>{t("download.dataText")}</p>
        <p className={styles.actions}>
          <AppLink className={styles.secondary} href="/login">{t("download.login")}</AppLink>
          <AppLink className={styles.secondary} href="/privacy">{t("footer.privacy")}</AppLink>
        </p>
      </section>
    </div>
  );
}
