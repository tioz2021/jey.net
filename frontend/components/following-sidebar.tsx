"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { FollowingProfile } from "@/lib/types";

import styles from "./following-sidebar.module.css";

/** Subscriptions in the left column, under the kind navigation. */
export function FollowingSidebar() {
  const { t } = useI18n();
  const [people, setPeople] = useState<FollowingProfile[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.follows
        .following()
        .then((response) => {
          if (!cancelled) setPeople(response.people);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("jey:following-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("jey:following-changed", load);
    };
  }, []);

  return (
    <section className={styles.panel} aria-label={t("public.followingTitle")}>
      <p className={styles.head}>{t("public.followingTitle")}</p>
      {people.length === 0 ? (
        <p className={styles.empty}>{t("public.followingEmpty")}</p>
      ) : (
        <ul className={styles.list}>
          {people.map((person) => (
            <li key={person.id}>
              <Link className={styles.person} href={`/u/${person.id}`}>
                {person.avatar_key ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local avatar
                  <img alt="" src={`/media/${person.avatar_key}`} />
                ) : (
                  <span aria-hidden="true" className={styles.initial}>
                    {person.display_name.trim().charAt(0).toUpperCase()}
                  </span>
                )}
                <span className={styles.name}>{person.display_name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link className={styles.settings} href="/settings#privacy">
        {t("public.privacy")}
      </Link>
    </section>
  );
}
