"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

import { CoverPicker } from "@/components/items/cover-picker";
import { BannerPicker } from "@/components/profile/banner-picker";
import { Button, Card, Dialog, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { STATUS_KEYS } from "@/lib/i18n/labels";
import { useI18n } from "@/lib/locale-context";
import { ApiError } from "@/lib/errors";
import { useToast } from "@/components/toasts";
import { useUser } from "@/lib/user-context";
import type { User } from "@/lib/types";

import styles from "./settings-form.module.css";

const LOCALES: [string, string][] = [
  ["ru", "Русский"],
  ["en", "English"],
  ["uk", "Українська"],
];

export function SettingsForm({ initialUser }: { initialUser: User }) {
  const router = useRouter();
  const { setUser, user: currentUser } = useUser();
  const { t } = useI18n();
  const { notifyError } = useToast();

  // Profile, prefilled from the server so the page needs no loading state.
  const [displayName, setDisplayName] = useState(initialUser.display_name);
  const [locale, setLocale] = useState(initialUser.locale);
  const [isPublic, setIsPublic] = useState(initialUser.is_public);
  const [publicStatuses, setPublicStatuses] = useState<string[]>(
    initialUser.public_statuses ?? ["done"],
  );
  const [publicShowProgress, setPublicShowProgress] = useState(
    initialUser.public_show_progress ?? true,
  );
  const publicStatusLabels = publicStatuses
    .map((status) => STATUS_KEYS[status as keyof typeof STATUS_KEYS])
    .filter(Boolean)
    .map((key) => t(key))
    .join(", ");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Danger zone
  const [revoking, setRevoking] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [confirmWord, setConfirmWord] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    setProfileMessage(null);

    try {
      const response = await api.auth.updateMe({
        display_name: displayName.trim(),
        locale,
        is_public: isPublic,
        public_statuses: publicStatuses,
        public_show_progress: publicShowProgress,
      });
      setUser(response.user);
      setProfileMessage(t("settings.saved"));
    } catch (error) {
      if (error instanceof ApiError && error.field === "display_name") {
        setProfileError(error.message);
      } else {
        notifyError(error);
      }
    } finally {
      setSavingProfile(false);
    }
  }

  async function revokeAll() {
    setRevoking(true);

    try {
      await api.auth.logoutAll();
      setUser(null);
      router.push("/login");
      router.refresh();
    } catch {
      setRevoking(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError(null);

    try {
      await api.auth.deleteMe(
        initialUser.has_password ? deletePassword : undefined,
      );
      setUser(null);
      router.push("/");
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.field === "password") {
        setDeleteError(t("settings.wrongPassword"));
      } else {
        setDeleteError(null);
        notifyError(error);
      }
      setDeleting(false);
    }
  }

  const deleteReady =
    (!initialUser.has_password || deletePassword.length > 0) &&
    confirmWord.trim().toLowerCase() === t("settings.deleteWordValue");

  return (
    <div className={styles.sections}>
      <Card title={t("settings.avatar")}>
        <CoverPicker
          label={t("settings.photo")}
          currentUrl={
            initialUser.avatar_key ? `/media/${initialUser.avatar_key}` : null
          }
          onUploaded={async (uploadId) => {
            const response = await api.auth.setAvatar(uploadId);
            setUser(response.user);
            router.refresh();
          }}
          onCleared={async () => {
            const response = await api.auth.clearAvatar();
            setUser(response.user);
            router.refresh();
          }}
        />
      </Card>

      <Card title={t("settings.banner")}>
        <BannerPicker
          currentUrl={
            (currentUser?.banner_key ?? initialUser.banner_key)
              ? `/media/${currentUser?.banner_key ?? initialUser.banner_key}`
              : null
          }
          onUploaded={async (uploadId) => {
            const response = await api.auth.setBanner(uploadId);
            setUser(response.user);
            router.refresh();
          }}
          onCleared={async () => {
            const response = await api.auth.clearBanner();
            setUser(response.user);
            router.refresh();
          }}
        />
      </Card>

      <div className={styles.privacyAnchor} id="privacy">
      <Card title={t("settings.profile")}>
        <form className={styles.form} onSubmit={saveProfile} noValidate>
          <Input
            label={t("settings.name")}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />

          <Select
            label={t("settings.language")}
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
          >
            {LOCALES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
            />
            {t("settings.public")}
          </label>

          <fieldset className={styles.statuses}>
            <legend>{t("settings.publicStatuses")}</legend>
            {(["planned", "in_progress", "done", "dropped"] as const).map(
              (status) => (
                <label className={styles.checkbox} key={status}>
                  <input
                    type="checkbox"
                    checked={publicStatuses.includes(status)}
                    onChange={(event) =>
                      setPublicStatuses((current) =>
                        event.target.checked
                          ? [...current, status]
                          : current.filter((value) => value !== status),
                      )
                    }
                  />
                  {t(STATUS_KEYS[status])}
                </label>
              ),
            )}
          </fieldset>

          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={publicShowProgress}
              onChange={(event) => setPublicShowProgress(event.target.checked)}
            />
            {t("settings.progress")}
          </label>

          <div className={styles.summary}>
            <p className={styles.summaryTitle}>
              {t("settings.publicSummary")}
            </p>
            {isPublic ? (
              <>
                <p>
                  {publicStatusLabels
                    ? t("settings.publicSummaryOn", {
                        statuses: publicStatusLabels,
                      })
                    : t("settings.publicSummaryNone")}
                </p>
                <p>
                  {publicShowProgress
                    ? t("settings.publicSummaryProgressOn")
                    : t("settings.publicSummaryProgressOff")}
                </p>
                <p>{t("settings.publicSummaryNotes")}</p>
                <a
                  className={styles.summaryLink}
                  href={`/u/${initialUser.id}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t("settings.openPublic")}
                </a>
              </>
            ) : (
              <p>{t("settings.publicSummaryOff")}</p>
            )}
            <p className={styles.summaryHint}>
              {t("settings.publicSummaryHint")}
            </p>
          </div>

          {profileError ? (
            <p className={styles.error} role="alert">
              {profileError}
            </p>
          ) : null}
          {profileMessage ? (
            <p className={styles.success} role="status">
              {profileMessage}
            </p>
          ) : null}

          <div>
            <Button type="submit" loading={savingProfile}>
              {t("settings.saveProfile")}
            </Button>
          </div>
        </form>
      </Card>
      </div>

      <Card title={t("settings.sessions")}>
        <p className={styles.muted}>
          {t("settings.sessionsText")}
        </p>

        <div>
          <Button
            variant="secondary"
            loading={revoking}
            onClick={revokeAll}
          >
            {t("settings.logoutAll")}
          </Button>
        </div>

        <hr className={styles.divider} />

        <p className={styles.danger}>
          {t("settings.deleteHint")}
        </p>
        <div>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            {t("settings.deleteAccount")}
          </Button>
        </div>

        <Dialog
          open={deleteOpen}
          title={t("settings.deleteTitle")}
          onClose={() => setDeleteOpen(false)}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                loading={deleting}
                disabled={!deleteReady}
                onClick={deleteAccount}
              >
                {t("settings.deleteForever")}
              </Button>
            </>
          }
        >
          <div className={styles.form}>
            <p className={styles.danger}>
              {t("settings.deleteText")}
            </p>
            {initialUser.has_password ? (
              <Input
                label={t("settings.password")}
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
            ) : null}
            <Input
              label={t("settings.deleteWord")}
              value={confirmWord}
              onChange={(event) => setConfirmWord(event.target.value)}
            />
            {deleteError ? (
              <p className={styles.error} role="alert">
                {deleteError}
              </p>
            ) : null}
          </div>
        </Dialog>
      </Card>
    </div>
  );
}
