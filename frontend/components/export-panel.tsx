"use client";

import { useState } from "react";

import { useToast } from "@/components/toasts";
import { Button, Card } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";

import styles from "./export-panel.module.css";

type Format = "json" | "csv";



function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function fileName(format: Format): string {
  const date = new Date().toISOString().slice(0, 10);
  return `jey-items-${date}.${format}`;
}

export function ExportPanel() {
  const { t } = useI18n();
  const { notify, notifyError } = useToast();
  const formats: { format: Format; label: string; description: string }[] = [
    {
      format: "json",
      label: t("settings.exportJson"),
      description: t("settings.exportJsonHint"),
    },
    {
      format: "csv",
      label: t("settings.exportCsv"),
      description: t("settings.exportCsvHint"),
    },
  ];
  const [busy, setBusy] = useState<Format | null>(null);

  async function exportAs(format: Format) {
    setBusy(format);

    try {
      const response = await fetch(`/api/v1/export?format=${format}`, {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`экспорт не удался (код ${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName(format);
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      notify({
        tone: "success",
        title: t("settings.exportReady"),
        text: `${fileName(format)} · ${formatSize(blob.size)}`,
        requestId: null,
      });
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title={t("settings.export")}>
      <p className={styles.text}>{t("settings.exportText")}</p>

      <div className={styles.actions}>
        {formats.map(({ format, label, description }) => (
          <div className={styles.option} key={format}>
            <Button
              disabled={busy !== null && busy !== format}
              loading={busy === format}
              onClick={() => exportAs(format)}
              variant={format === "json" ? "primary" : "secondary"}
            >
              {label}
            </Button>
            <p className={styles.hint}>{description}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
