"use client";

import { useEffect, useState } from "react";

import { useI18n } from "@/lib/locale-context";

import styles from "./back-to-top.module.css";

export function BackToTop() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > 450);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <button
      aria-label={t("common.backToTop")}
      className={`${styles.button} ${visible ? styles.visible : ""}`}
      onClick={scrollTop}
      title={t("common.backToTop")}
      type="button"
    >
      <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
        <path
          d="m6 14 6-6 6 6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    </button>
  );
}
