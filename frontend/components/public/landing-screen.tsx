"use client";

import { AppLink } from "@/lib/navigation";
import { useI18n } from "@/lib/locale-context";
import type { TranslationKey } from "@/lib/i18n";

import styles from "./landing-screen.module.css";

const FEATURE_KEYS: Array<{ title: TranslationKey; text: TranslationKey }> = [
  { title: "landing.f1.title", text: "landing.f1.text" },
  { title: "landing.f2.title", text: "landing.f2.text" },
  { title: "landing.f3.title", text: "landing.f3.text" },
  { title: "landing.f4.title", text: "landing.f4.text" },
];

const SCREENSHOT_KEYS = [
  { src: "/screenshots/items.webp", alt: "landing.shot1.alt", caption: "landing.shot1.caption", width: 1200, height: 800 },
  { src: "/screenshots/item.webp", alt: "landing.shot2.alt", caption: "landing.shot2.caption", width: 1200, height: 800 },
  { src: "/screenshots/profile.webp", alt: "landing.shot3.alt", caption: "landing.shot3.caption", width: 1200, height: 800 },
] as const;

export function LandingScreen() {
  const { t } = useI18n();

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <p className={styles.kicker}>{t("landing.kicker")}</p>
        <h1 className={styles.title} id="hero-title">
          {t("landing.title")}
        </h1>
        <p className={styles.lead}>
          {t("landing.lead")}
        </p>

        <div className={styles.actions}>
          <AppLink className={styles.primary} href="/api/v1/auth/google/start">
            {t("landing.google")}
          </AppLink>
          <AppLink className={styles.secondary} href="/u/tios23">
            {t("landing.example")}
          </AppLink>
        </div>

        <p className={styles.note}>
          {t("landing.note")}
        </p>
      </section>

      <section className={styles.features} id="features" aria-labelledby="features-title">
        <h2 className={styles.sectionTitle} id="features-title">
          {t("landing.features")}
        </h2>
        <ul className={styles.featureGrid}>
          {FEATURE_KEYS.map((feature) => (
            <li className={styles.feature} key={feature.title}>
              <h3 className={styles.featureTitle}>{t(feature.title)}</h3>
              <p className={styles.featureText}>{t(feature.text)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.shots} id="screenshots" aria-labelledby="shots-title">
        <h2 className={styles.sectionTitle} id="shots-title">
          {t("landing.shots")}
        </h2>
        <div className={styles.shotGrid}>
          {SCREENSHOT_KEYS.map((shot) => (
            <figure className={styles.figure} key={shot.src}>
              {/* eslint-disable-next-line @next/next/no-img-element -- static WebP asset */}
              <img
                className={styles.shot}
                src={shot.src}
                alt={t(shot.alt)}
                width={shot.width}
                height={shot.height}
                loading="lazy"
                decoding="async"
              />
              <figcaption className={styles.caption}>
                {t(shot.caption)}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className={styles.final} aria-labelledby="final-title">
        <h2 className={styles.finalTitle} id="final-title">
          {t("landing.finalTitle")}
        </h2>
        <p className={styles.finalText}>
          {t("landing.finalText")}
        </p>
        <AppLink className={styles.primary} href="/api/v1/auth/google/start">
          {t("landing.google")}
        </AppLink>
      </section>
    </div>
  );
}
