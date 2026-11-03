"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

import { CoverPicker } from "@/components/items/cover-picker";
import { BannerPicker } from "@/components/profile/banner-picker";
import { Button, Card, Dialog, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
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
  const { notifyError } = useToast();

  // Profile, prefilled from the server so the page needs no loading state.
  const [displayName, setDisplayName] = useState(initialUser.display_name);
  const [locale, setLocale] = useState(initialUser.locale);
  const [isPublic, setIsPublic] = useState(initialUser.is_public);
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
      });
      setUser(response.user);
      setProfileMessage("Сохранено");
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
        setDeleteError("Неверный пароль");
      } else {
        setDeleteError(null);
        notifyError(error);
      }
      setDeleting(false);
    }
  }

  const deleteReady =
    (!initialUser.has_password || deletePassword.length > 0) &&
    confirmWord.trim().toLowerCase() === "удалить";

  return (
    <div className={styles.sections}>
      <Card title="Аватар">
        <CoverPicker
          label="Фотография профиля"
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

      <Card title="Баннер профиля">
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

      <Card title="Профиль">
        <form className={styles.form} onSubmit={saveProfile} noValidate>
          <Input
            label="Имя"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />

          <Select
            label="Язык"
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
            Публичный профиль
          </label>

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
              Сохранить профиль
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Сессии и аккаунт">
        <p className={styles.muted}>
          «Выйти на всех устройствах» завершит все сессии, включая текущую.
        </p>

        <div>
          <Button
            variant="secondary"
            loading={revoking}
            onClick={revokeAll}
          >
            Выйти на всех устройствах
          </Button>
        </div>

        <hr className={styles.divider} />

        <p className={styles.danger}>
          Удаление аккаунта необратимо: записи и теги будут стёрты.
        </p>
        <div>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            Удалить аккаунт
          </Button>
        </div>

        <Dialog
          open={deleteOpen}
          title="Удалить аккаунт?"
          onClose={() => setDeleteOpen(false)}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
              >
                Отмена
              </Button>
              <Button
                variant="danger"
                loading={deleting}
                disabled={!deleteReady}
                onClick={deleteAccount}
              >
                Удалить навсегда
              </Button>
            </>
          }
        >
          <div className={styles.form}>
            <p className={styles.danger}>
              Это действие нельзя отменить. Все записи, теги и настройки будут
              удалены.
            </p>
            {initialUser.has_password ? (
              <Input
                label="Пароль"
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
            ) : null}
            <Input
              label="Введите слово «удалить»"
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
