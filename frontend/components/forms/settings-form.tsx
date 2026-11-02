"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

import { Button, Dialog, Input, Select } from "@/components/ui";
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
  const { setUser } = useUser();
  const { notifyError } = useToast();

  // Profile, prefilled from the server so the page needs no loading state.
  const [displayName, setDisplayName] = useState(initialUser.display_name);
  const [locale, setLocale] = useState(initialUser.locale);
  const [isPublic, setIsPublic] = useState(initialUser.is_public);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordErrors, setPasswordErrors] = useState<{
    current?: string;
    new?: string;
    repeat?: string;
    form?: string;
  }>({});
  const [savingPassword, setSavingPassword] = useState(false);

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

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors: typeof passwordErrors = {};
    if (!currentPassword) {
      errors.current = "Введите текущий пароль";
    }
    if (newPassword.length < 10) {
      errors.new = "Минимум 10 символов";
    }
    if (newPassword !== repeatPassword) {
      errors.repeat = "Пароли не совпадают";
    }
    setPasswordErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSavingPassword(true);
    setPasswordMessage(null);

    try {
      await api.auth.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setRepeatPassword("");
      setPasswordMessage("Пароль изменён. Остальные сессии завершены");
    } catch (error) {
      if (error instanceof ApiError && error.field === "current_password") {
        setPasswordErrors({ current: "Неверный текущий пароль" });
      } else if (error instanceof ApiError && error.field === "new_password") {
        setPasswordErrors({ new: error.message });
      } else {
        notifyError(error);
      }
    } finally {
      setSavingPassword(false);
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
      await api.auth.deleteMe(deletePassword);
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
    deletePassword.length > 0 && confirmWord.trim().toLowerCase() === "удалить";

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2 className={styles.title}>Профиль</h2>
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
      </section>

      <section className={styles.section}>
        <h2 className={styles.title}>Пароль</h2>
        <form className={styles.form} onSubmit={savePassword} noValidate>
          <Input
            label="Текущий пароль"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            error={passwordErrors.current}
            required
          />
          <Input
            label="Новый пароль"
            type="password"
            autoComplete="new-password"
            hint="Минимум 10 символов"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            error={passwordErrors.new}
            required
          />
          <Input
            label="Повторите новый пароль"
            type="password"
            autoComplete="new-password"
            value={repeatPassword}
            onChange={(event) => setRepeatPassword(event.target.value)}
            error={passwordErrors.repeat}
            required
          />

          {passwordErrors.form ? (
            <p className={styles.error} role="alert">
              {passwordErrors.form}
            </p>
          ) : null}
          {passwordMessage ? (
            <p className={styles.success} role="status">
              {passwordMessage}
            </p>
          ) : null}

          <div>
            <Button type="submit" loading={savingPassword}>
              Сменить пароль
            </Button>
          </div>
        </form>
      </section>

      <section className={styles.section}>
        <h2 className={styles.title}>Сессии и аккаунт</h2>
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
            <Input
              label="Пароль"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
            />
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
      </section>
    </div>
  );
}
