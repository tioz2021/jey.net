"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";

import styles from "./pwa-install-prompt.module.css";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "jey-pwa-install-dismissed";

export function PwaInstallPrompt() {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 700px)").matches) return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if (localStorage.getItem(DISMISSED_KEY) === "1") return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      localStorage.setItem(DISMISSED_KEY, "1");
      setVisible(false);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") {
      localStorage.setItem(DISMISSED_KEY, "1");
    }
    setVisible(false);
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside aria-live="polite" className={styles.banner}>
      <div>
        <p className={styles.title}>{t("pwa.installTitle")}</p>
        <p className={styles.text}>{t("pwa.installText")}</p>
      </div>
      <div className={styles.actions}>
        <Button onClick={() => void install()} size="sm">
          {t("pwa.install")}
        </Button>
        <Button onClick={dismiss} size="sm" variant="secondary">
          {t("pwa.later")}
        </Button>
      </div>
    </aside>
  );
}
