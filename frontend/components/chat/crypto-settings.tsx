"use client";

import { useEffect, useState } from "react";

import { Button, Card, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import {
  createMnemonic,
  decryptForDevice,
  encryptToDevices,
  fingerprint,
  identityFromMnemonic,
  isRecoveryPhrase,
  newDeviceId,
  type ChatIdentity,
} from "@/lib/chat-crypto";
import { clearIdentity, loadIdentity, saveIdentity } from "@/lib/chat-identity";
import { useI18n } from "@/lib/locale-context";
import { useToast } from "@/components/toasts";

import styles from "./crypto-settings.module.css";

export function ChatCryptoSettings() {
  const { t } = useI18n();
  const { notify, notifyError } = useToast();
  const [identity, setIdentity] = useState<ChatIdentity | null>(null);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [restore, setRestore] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadIdentity()
      .then(async (stored) => {
        setIdentity(stored);
        if (stored) await register(stored);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function register(value: ChatIdentity) {
    try {
      await api.chat.registerDevice({
        device_id: value.device_id,
        public_key: value.public_key,
        name: "Browser",
      });
      setServerError(false);
    } catch {
      setServerError(true);
    }
  }

  async function selfTest(value: ChatIdentity) {
    const message = await encryptToDevices(
      value,
      [{ device_id: value.device_id, public_key: value.public_key }],
      "self-test",
      "self",
      "self",
    );
    const decrypted = await decryptForDevice(value, message, "self", "self");
    if (decrypted !== "self-test") throw new Error("crypto self-test failed");
  }

  async function create() {
    setBusy(true);
    try {
      const phrase = createMnemonic();
      const value = identityFromMnemonic(phrase, newDeviceId());
      await selfTest(value);
      await saveIdentity(value);
      setIdentity(value);
      setMnemonic(phrase);
      await register(value);
      notify({ tone: "success", title: t("chat.cryptoReady"), text: "", requestId: null });
    } catch {
      notifyError(new Error(t("chat.cryptoError")));
    } finally {
      setBusy(false);
    }
  }

  async function restoreIdentity(event: React.FormEvent) {
    event.preventDefault();
    if (!isRecoveryPhrase(restore)) {
      notifyError(new Error(t("chat.cryptoInvalidPhrase")));
      return;
    }
    setBusy(true);
    try {
      const value = identityFromMnemonic(restore, newDeviceId());
      await selfTest(value);
      await saveIdentity(value);
      setIdentity(value);
      setRestore("");
      setMnemonic(null);
      await register(value);
      notify({ tone: "success", title: t("chat.cryptoReady"), text: "", requestId: null });
    } catch {
      notifyError(new Error(t("chat.cryptoError")));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!identity || !window.confirm(t("chat.cryptoRevokeConfirm"))) return;
    setBusy(true);
    try {
      await api.chat.revokeDevice(identity.device_id);
      await clearIdentity();
      setIdentity(null);
      setMnemonic(null);
    } catch {
      notifyError(new Error(t("chat.cryptoError")));
    } finally {
      setBusy(false);
    }
  }

  async function copyPhrase() {
    if (!mnemonic) return;
    try {
      await navigator.clipboard.writeText(mnemonic);
      notify({ tone: "success", title: t("chat.cryptoCopied"), text: "", requestId: null });
    } catch {
      notifyError(new Error(t("chat.cryptoError")));
    }
  }

  return (
    <Card title={t("chat.cryptoTitle")}>
      <p className={styles.hint}>{t("chat.cryptoText")}</p>
      {loading ? <p className={styles.hint}>…</p> : null}

      {identity ? (
        <div className={styles.identity}>
          <p><strong>{t("chat.cryptoDevice")}:</strong> <code>{identity.device_id}</code></p>
          <p><strong>{t("chat.cryptoFingerprint")}:</strong> <code>{fingerprint(identity)}</code></p>
          {serverError ? (
            <div className={styles.errorRow}>
              <span>{t("chat.cryptoServerError")}</span>
              <Button onClick={() => void register(identity)} size="sm" variant="secondary">
                {t("chat.cryptoRegisterRetry")}
              </Button>
            </div>
          ) : <p className={styles.ready}>{t("chat.cryptoRegistered")}</p>}
          <Button disabled={busy} onClick={() => void revoke()} size="sm" variant="secondary">
            {t("chat.cryptoRevoke")}
          </Button>
        </div>
      ) : (
        <Button disabled={busy || loading} onClick={() => void create()}>
          {t("chat.cryptoCreate")}
        </Button>
      )}

      {mnemonic ? (
        <div className={styles.recovery}>
          <strong>{t("chat.cryptoRecovery")}</strong>
          <p>{t("chat.cryptoRecoveryText")}</p>
          <pre>{mnemonic}</pre>
          <Button onClick={() => void copyPhrase()} size="sm" variant="secondary">
            {t("chat.cryptoCopy")}
          </Button>
        </div>
      ) : null}

      <form className={styles.restore} onSubmit={restoreIdentity}>
        <Textarea
          label={t("chat.cryptoRestore")}
          onChange={(event) => setRestore(event.target.value)}
          placeholder={t("chat.cryptoRestorePlaceholder")}
          rows={3}
          value={restore}
        />
        <Button disabled={busy || !restore.trim()} size="sm" type="submit" variant="secondary">
          {t("chat.cryptoRestoreButton")}
        </Button>
      </form>
    </Card>
  );
}
