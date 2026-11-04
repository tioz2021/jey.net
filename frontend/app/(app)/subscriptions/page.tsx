"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { FollowingProfile } from "@/lib/types";

import styles from "./subscriptions.module.css";

export default function SubscriptionsPage() {
  const { t } = useI18n();
  const [people, setPeople] = useState<FollowingProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.follows
      .following()
      .then((response) => {
        if (!cancelled) setPeople(response.people);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <PageHeader title={t("public.allFollowing", { count: people.length })} />
      <Card title={t("public.followingTitle")}>
        {!loading && people.length === 0 ? (
          <EmptyState
            text={t("public.followingEmpty")}
            title={t("public.followingEmpty")}
          />
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
                  <span>{person.display_name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
