import type { Metadata } from "next";
import Link from "next/link";

import { translate, type TranslationKey } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { languageAlternates } from "@/lib/seo";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const title = translate(locale, "landing.metaTitle");
  const description = translate(locale, "landing.metaDescription");

  return {
    title,
    description,
    alternates: {
      canonical: "/",
      languages: languageAlternates("/"),
    },
    openGraph: { title, description },
  };
}

const FEATURE_KEYS: Array<{ title: TranslationKey; text: TranslationKey }> = [
  { title: "landing.f1.title", text: "landing.f1.text" },
  { title: "landing.f2.title", text: "landing.f2.text" },
  { title: "landing.f3.title", text: "landing.f3.text" },
  { title: "landing.f4.title", text: "landing.f4.text" },
];

const SCREENSHOT_KEYS = [
  { src: "/screenshots/items.webp", alt: "landing.shot1.alt", caption: "landing.shot1.caption", width: 1000, height: 667 },
  { src: "/screenshots/item.webp", alt: "landing.shot2.alt", caption: "landing.shot2.caption", width: 1000, height: 667 },
  { src: "/screenshots/profile.webp", alt: "landing.shot3.alt", caption: "landing.shot3.caption", width: 1000, height: 667 },
] as const;

export default async function LandingPage() {
  const locale = await getServerLocale();
  const t = (key: TranslationKey) => translate(locale, key);

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
          <Link className={styles.primary} href="/api/v1/auth/google/start">
            {t("landing.google")}
          </Link>
          <Link className={styles.secondary} href="/#features">
            {t("landing.features")}
          </Link>
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
        <Link className={styles.primary} href="/api/v1/auth/google/start">
          {t("landing.google")}
        </Link>
      </section>
    </div>
  );
}
