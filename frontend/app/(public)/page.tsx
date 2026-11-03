import type { Metadata } from "next";
import Link from "next/link";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "jey.net — фильмы, книги и картинки в одном месте",
  description:
    "Личный каталог того, что вы посмотрели, прочитали и сохранили: оценки, заметки, теги, обложки, поиск и экспорт данных.",
  openGraph: {
    title: "jey.net — фильмы, книги и картинки в одном месте",
    description:
      "Оценки, заметки, теги и обложки в одном списке. Публичный профиль — только по желанию.",
  },
};

const FEATURES = [
  {
    title: "Один список на всё",
    text: "Фильмы, книги, картинки и свои категории. Отмечайте статус, ставьте оценку, оставляйте заметку.",
  },
  {
    title: "Поиск и теги",
    text: "Находите по названию, автору и тексту заметки. Фильтры по типу, году, оценке и тегам.",
  },
  {
    title: "Приватность по умолчанию",
    text: "Профиль закрыт, пока вы сами его не откроете. В публичном видны только завершённые записи — без заметок и планов.",
  },
  {
    title: "Данные остаются вашими",
    text: "Экспорт всех записей в JSON или CSV в один клик. Без рекламы, трекеров и продажи данных.",
  },
];

const SCREENSHOTS = [
  {
    src: "/screenshots/items.webp",
    alt: "Список записей с обложками, статусами и тегами",
    caption: "Каталог: обложки, статусы, оценки и теги",
    width: 1000,
    height: 667,
  },
  {
    src: "/screenshots/item.webp",
    alt: "Карточка записи: постер слева, свойства справа",
    caption: "Карточка: заметка, свойства и обложка",
    width: 1000,
    height: 667,
  },
  {
    src: "/screenshots/profile.webp",
    alt: "Публичный профиль с завершёнными записями",
    caption: "Публичный профиль — только то, что вы разрешили",
    width: 1000,
    height: 667,
  },
];

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <p className={styles.kicker}>Личный портал</p>
        <h1 className={styles.title} id="hero-title">
          Фильмы, книги и картинки — в одном списке
        </h1>
        <p className={styles.lead}>
          Записывайте, что посмотрели, прочитали и сохранили. Ставьте оценки,
          добавляйте заметки и теги, находите нужное поиском — и делитесь только
          тем, чем хотите.
        </p>

        <div className={styles.actions}>
          <Link className={styles.primary} href="/api/v1/auth/google/start">
            Войти через Google
          </Link>
          <Link className={styles.secondary} href="/#features">
            Что внутри
          </Link>
        </div>

        <p className={styles.note}>
          Бесплатно, без рекламы. Экспорт данных доступен с первого дня.
        </p>
      </section>

      <section className={styles.features} id="features" aria-labelledby="features-title">
        <h2 className={styles.sectionTitle} id="features-title">
          Что внутри
        </h2>
        <ul className={styles.featureGrid}>
          {FEATURES.map((feature) => (
            <li className={styles.feature} key={feature.title}>
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureText}>{feature.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.shots} id="screenshots" aria-labelledby="shots-title">
        <h2 className={styles.sectionTitle} id="shots-title">
          Как это выглядит
        </h2>
        <div className={styles.shotGrid}>
          {SCREENSHOTS.map((shot) => (
            <figure className={styles.figure} key={shot.src}>
              {/* eslint-disable-next-line @next/next/no-img-element -- static WebP asset */}
              <img
                className={styles.shot}
                src={shot.src}
                alt={shot.alt}
                width={shot.width}
                height={shot.height}
                loading="lazy"
                decoding="async"
              />
              <figcaption className={styles.caption}>{shot.caption}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className={styles.final} aria-labelledby="final-title">
        <h2 className={styles.finalTitle} id="final-title">
          Начните с одной записи
        </h2>
        <p className={styles.finalText}>
          Вход через Google занимает полминуты: без пароля и подтверждений.
          Ник вы выберете сразу после входа.
        </p>
        <Link className={styles.primary} href="/api/v1/auth/google/start">
          Войти через Google
        </Link>
      </section>
    </div>
  );
}
