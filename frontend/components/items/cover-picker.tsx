/* eslint-disable @next/next/no-img-element -- covers are already WebP renditions served by our API */
"use client";

import { useState } from "react";
import type { ChangeEvent } from "react";

import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

import { useI18n } from "@/lib/locale-context";

import styles from "./cover-picker.module.css";

/**
 * Uploads a cover immediately and reports the upload id to the form.
 *
 * The image preview uses a local object URL, so it shows up before the item
 * is saved and before the file is served by the API.
 */
export function CoverPicker({
  currentUrl,
  onUploaded,
  onCleared,
  label,
}: {
  currentUrl?: string | null;
  onUploaded: (uploadId: string) => void;
  onCleared: () => void;
  label?: string;
}) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setUploading(true);
    setError(null);
    setBroken(false);

    try {
      const response = await api.uploads.upload(file);
      setPreview(URL.createObjectURL(file));
      onUploaded(response.upload.id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setUploading(false);
    }
  }

  function clear() {
    setPreview(null);
    setBroken(false);
    onCleared();
  }

  return (
    <div className={styles.field}>
      <span className={styles.label}>{label ?? t("cover.label")}</span>

      {preview && !broken ? (
        <img
          className={styles.preview}
          src={preview}
          alt={label ?? t("cover.label")}
          onError={() => setBroken(true)}
        />
      ) : (
        <div className={styles.placeholder}>{t("cover.none")}</div>
      )}

      <div className={styles.actions}>
        <label className={styles.choose}>
          <span>{preview ? t("cover.replace") : t("cover.choose")}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFile}
            disabled={uploading}
            className={styles.input}
          />
        </label>

        {preview ? (
          <Button variant="ghost" size="sm" onClick={clear}>
            {t("cover.clear")}
          </Button>
        ) : null}

        {uploading ? (
          <span className={styles.hint}>{t("cover.uploading")}</span>
        ) : null}
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
