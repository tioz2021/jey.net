"use client";

import { useEffect, useState } from "react";

import { Button, Card, Dialog, PageHeader } from "@/components/ui";
import { useToast } from "@/components/toasts";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { SiteSettings } from "@/lib/types";

import styles from "./site-admin.module.css";

export function SiteAdminForm() {
  const { t } = useI18n();
  const { notify } = useToast();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.admin.site
      .get()
      .then(({ settings: value }) => {
        setSettings(value);
        setAnnouncementTitle(value.announcement_title ?? "");
        setAnnouncement(value.announcement ?? "");
      })
      .catch(() => notify({ tone: "error", title: t("admin.siteError"), text: "", requestId: null }));
  }, [notify, t]);

  async function save() {
    if (!settings) return;
    setBusy(true);
    try {
      const { settings: saved } = await api.admin.site.update({
        announcement_title: announcementTitle,
        announcement,
        announcement_active: settings.announcement_active,
        maintenance: settings.maintenance,
        registration_enabled: settings.registration_enabled,
      });
      setSettings(saved);
      setConfirmOpen(false);
      notify({ tone: "success", title: t("admin.siteSaved"), text: "", requestId: null });
    } catch {
      notify({ tone: "error", title: t("admin.siteError"), text: "", requestId: null });
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return <main><PageHeader title={t("admin.site")} /><p className={styles.muted}>{t("admin.loading")}</p></main>;
  }

  return (
    <main>
      <PageHeader subtitle={t("admin.siteSubtitle")} title={t("admin.site")} />
      <Card title={t("admin.siteAnnouncement")}>
        <label className={styles.label} htmlFor="site-announcement-title">{t("admin.siteAnnouncementTitle")}</label>
        <input
          className={styles.titleInput}
          id="site-announcement-title"
          maxLength={120}
          onChange={(event) => setAnnouncementTitle(event.target.value)}
          placeholder={t("admin.siteAnnouncementTitlePlaceholder")}
          value={announcementTitle}
        />
        <label className={styles.label} htmlFor="site-announcement">{t("admin.siteAnnouncementText")}</label>
        <textarea
          className={styles.textarea}
          id="site-announcement"
          maxLength={500}
          onChange={(event) => setAnnouncement(event.target.value)}
          rows={4}
          value={announcement}
        />
        <label className={styles.check}>
          <input
            checked={settings.announcement_active}
            onChange={(event) => setSettings({ ...settings, announcement_active: event.target.checked })}
            type="checkbox"
          />
          {t("admin.siteAnnouncementActive")}
        </label>
      </Card>
      <Card title={t("admin.siteMode")}>
        <label className={styles.check}>
          <input
            checked={settings.maintenance}
            onChange={(event) => setSettings({ ...settings, maintenance: event.target.checked })}
            type="checkbox"
          />
          {t("admin.siteMaintenance")}
        </label>
        <label className={styles.check}>
          <input
            checked={settings.registration_enabled}
            onChange={(event) => setSettings({ ...settings, registration_enabled: event.target.checked })}
            type="checkbox"
          />
          {t("admin.siteRegistration")}
        </label>
      </Card>
      <Button onClick={() => setConfirmOpen(true)}>{t("admin.siteSave")}</Button>
      <Dialog
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)} size="sm" variant="secondary">{t("common.cancel")}</Button>
            <Button loading={busy} onClick={() => void save()} size="sm">{t("admin.siteConfirm")}</Button>
          </>
        }
        onClose={() => setConfirmOpen(false)}
        open={confirmOpen}
        title={t("admin.siteConfirmTitle")}
      >
        <p>{t("admin.siteConfirmText")}</p>
      </Dialog>
    </main>
  );
}
