"use client";

import { useEffect, useState } from "react";

import { Card, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { ChatSettings } from "@/lib/types";

export function ChatPrivacySettings() {
  const { t } = useI18n();
  const [policy, setPolicy] = useState<ChatSettings["message_policy"] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.chat
      .settings()
      .then((response) => setPolicy(response.message_policy))
      .catch(() => setError(true));
  }, []);

  async function change(next: ChatSettings["message_policy"]) {
    setPolicy(next);
    try {
      await api.chat.updateSettings(next);
    } catch {
      setError(true);
    }
  }

  return (
    <Card title={t("chat.privacyTitle")}>
      <p className="u-note">
        {t("chat.privacyText")}
      </p>
      <Select
        label={t("chat.policy")}
        onChange={(event) => void change(event.target.value as ChatSettings["message_policy"])}
        value={policy ?? "all"}
      >
        <option value="all">{t("chat.policyAll")}</option>
        <option value="following">{t("chat.policyFollowing")}</option>
        <option value="nobody">{t("chat.policyNobody")}</option>
      </Select>
      {error ? <p className="u-error-text-sm">{t("error.requestFailed")}</p> : null}
    </Card>
  );
}
