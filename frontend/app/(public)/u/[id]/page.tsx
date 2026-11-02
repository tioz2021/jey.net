import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui";
import { KIND_LABELS } from "@/lib/labels";
import { getPublicProfile } from "@/lib/public-profile";

import styles from "./page.module.css";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" });

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await getPublicProfile(id);

  // A private profile must not leak even through its <title>.
  if (!data) {
    return { title: "Профиль не найден — jey.net", robots: { index: false } };
  }

  const { profile, items } = data;
  const description =
    items.length > 0
      ? `Завершённых записей: ${items.length}. Фильмы, книги и картинки, собранные в jey.net.`
      : "Публичный профиль в jey.net.";

  return {
    title: `${profile.display_name} — jey.net`,
    description,
    alternates: { canonical: `/u/${id}` },
    openGraph: {
      type: "profile",
      title: profile.display_name,
      description,
      url: `/u/${id}`,
      images: profile.avatar_key ? [`/media/${profile.avatar_key}`] : undefined,
    },
    twitter: {
      card: "summary",
      title: profile.display_name,
      description,
    },
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPublicProfile(id);

  // A private profile and a missing one look the same on purpose.
  if (!data) {
    notFound();
  }

  const { profile, items } = data;

  return (
    <article>
      <header className={styles.header}>
        {profile.avatar_key ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded avatar
          <img
            className={styles.avatar}
            src={`/media/${profile.avatar_key}`}
            alt=""
            decoding="async"
          />
        ) : (
          <div className={styles.avatarPlaceholder} aria-hidden="true">
            {profile.display_name.trim().charAt(0).toUpperCase()}
          </div>
        )}

        <div className={styles.identity}>
          <h1 className={styles.name}>{profile.display_name}</h1>
          <p className={styles.meta}>
            {items.length > 0
              ? `Завершённых записей: ${items.length}`
              : "Пока нет завершённых записей"}
          </p>
          <p className={styles.meta}>
            на сайте с {dateFormat.format(new Date(profile.created_at))}
          </p>
        </div>
      </header>

      {items.length > 0 ? (
        <ul className={styles.grid}>
          {items.map((item) => (
            <li className={styles.card} key={item.id}>
              {item.cover_key ? (
                // eslint-disable-next-line @next/next/no-img-element -- WebP rendition
                <img
                  className={styles.cover}
                  src={`/media/${item.cover_key}`}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className={styles.coverPlaceholder} aria-hidden="true" />
              )}

              <div className={styles.cardBody}>
                <p className={styles.kind}>{KIND_LABELS[item.kind]}</p>
                <h2 className={styles.title}>{item.title}</h2>
                {item.subtitle ? (
                  <p className={styles.subtitle}>{item.subtitle}</p>
                ) : null}
                <p className={styles.cardMeta}>
                  {[item.year, item.rating ? `★ ${item.rating}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {item.tags.length > 0 ? (
                  <ul className={styles.tags}>
                    {item.tags.map((tag) => (
                      <li key={tag}>
                        <Badge>{tag}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <p className={styles.footer}>
        Заметки и планы видны только владельцу. Здесь — лишь завершённые записи.
      </p>
    </article>
  );
}
