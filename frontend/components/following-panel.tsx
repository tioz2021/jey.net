"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { FollowingProfile } from "@/lib/types";

import styles from "./following-panel.module.css";

/** The current account's subscriptions, shown under "My records". */
export function FollowingPanel() {
  const { t } = useI18n();
  const [people, setPeople] = useState<FollowingProfile[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.follows
      .following()
      .then((response) => {
        if (!cancelled) setPeople(response.people);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card
      action={
        <Link className={styles.privacy} href="/settings#privacy">
          {t("public.privacy")}
        </Link>
      }
      title={t("public.followingTitle")}
    >
      {people.length === 0 ? (
        <p className={styles.empty}>{t("public.followingEmpty")}</p>
      ) : (
        <ul className={styles.people}>
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
                {person.display_name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
