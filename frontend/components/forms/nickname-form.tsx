"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { ApiError } from "@/lib/errors";
import { useUser } from "@/lib/user-context";

import styles from "./nickname-form.module.css";

export function NicknameForm({ initial }: { initial: string }) {
  const router = useRouter();
  const { setUser } = useUser();
  const { t } = useI18n();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await api.auth.updateMe({ display_name: name.trim() });
      setUser(response.user);
      router.push("/items");
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiError && cause.field === "display_name") {
        setError(cause.message);
      } else {
        setError(t("error.fallbackText"));
      }
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <div className={styles.preview}>
        <span aria-hidden="true" className={styles.avatar}>
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className={styles.previewText}>
          <span className={styles.previewLabel}>
            {t("auth.welcomePreview")}
          </span>
          <span className={styles.previewName}>
            {name.trim() || t("auth.welcomeNameFallback")}
          </span>
        </div>
      </div>

      <Input
        autoFocus
        error={error ?? undefined}
        hint={t("auth.nicknameHint")}
        label={t("auth.nickname")}
        maxLength={60}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <div style={{ marginTop: "var(--space-4)" }}>
        <Button
          disabled={name.trim().length === 0}
          loading={pending}
          type="submit"
        >
          {t("auth.nicknameSave")}
        </Button>
      </div>
    </form>
  );
}
