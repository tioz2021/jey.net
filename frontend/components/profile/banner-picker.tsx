"use client";

import { useRef, useState } from "react";

import { useToast } from "@/components/toasts";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";

import styles from "./banner-picker.module.css";

export function BannerPicker({
  currentUrl,
  onUploaded,
  onCleared,
}: {
  currentUrl: string | null;
  onUploaded: (uploadId: string) => Promise<void>;
  onCleared: () => Promise<void>;
}) {
  const { notifyError } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) {
      return;
    }

    setPending(true);
    try {
      const upload = await api.uploads.upload(file);
      await onUploaded(upload.upload.id);
    } catch (cause) {
      notifyError(cause);
    } finally {
      setPending(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  async function clear() {
    setPending(true);
    try {
      await onCleared();
    } catch (cause) {
      notifyError(cause);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.preview}>
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user upload
          <img alt="" decoding="async" src={currentUrl} />
        ) : (
          <div className={styles.placeholder}>Баннер не выбран</div>
        )}
      </div>

      <div className={styles.actions}>
        <input
          accept="image/*"
          className={styles.file}
          onChange={(event) => pick(event.target.files?.[0])}
          ref={inputRef}
          type="file"
        />
        <Button
          loading={pending}
          size="sm"
          variant="secondary"
          onClick={() => inputRef.current?.click()}
        >
          {currentUrl ? "Заменить" : "Загрузить"}
        </Button>
        {currentUrl ? (
          <Button disabled={pending} size="sm" variant="ghost" onClick={clear}>
            Убрать
          </Button>
        ) : null}
      </div>

      <p className={styles.hint}>
        Широкая картинка, рекомендуется от 1200×300. Видна на публичном профиле.
      </p>
    </div>
  );
}
