"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button, Card, Input, PageHeader } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";
import type { PublicUserCard } from "@/lib/types";

import styles from "./people.module.css";

export default function PeoplePage() {
  const { t } = useI18n();
  const { user } = useUser();
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PublicUserCard[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      Promise.all([api.publicUsers.search(query.trim()), api.follows.following().catch(() => ({ people: [] }))])
        .then(([result, follow]) => {
          if (!cancelled) {
            setPeople(result.users);
            setFollowing(new Set(follow.people.map((person) => person.id)));
          }
        })
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  async function toggle(person: PublicUserCard) {
    setBusy(person.id);
    try {
      if (following.has(person.id)) {
        await api.follows.unfollow(person.id);
        setFollowing((current) => {
          const next = new Set(current);
          next.delete(person.id);
          return next;
        });
      } else {
        await api.follows.follow(person.id);
        setFollowing((current) => new Set(current).add(person.id));
      }
      window.dispatchEvent(new Event("jey:following-changed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main>
      <PageHeader title={t("people.title")} />
      <div className={styles.stack}>
        <Input
          label={t("people.search")}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("people.searchPlaceholder")}
          value={query}
        />
        <Card title={t("people.all")}>
          {!loading && people.length === 0 ? (
            <EmptyState
              text={t("people.emptyText")}
              title={t("people.emptyTitle")}
            />
          ) : (
            <ul className={styles.list}>
              {people
                .filter((person) => person.id !== user?.id)
                .map((person) => (
                  <li className={styles.person} key={person.id}>
                    <Link className={styles.profile} href={`/u/${person.id}`}>
                      {person.avatar_key ? (
                        // eslint-disable-next-line @next/next/no-img-element -- local avatar
                        <img alt="" src={`/media/${person.avatar_key}`} />
                      ) : (
                        <span aria-hidden="true" className={styles.initial}>
                          {person.display_name.trim().charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span>
                        <span className={styles.name}>{person.display_name}</span>
                        <span className={styles.meta}>
                          {t("people.records", { count: person.item_count })} ·{" "}
                          {t("public.followers", { count: person.followers })}
                        </span>
                      </span>
                    </Link>
                    {user ? (
                      <Button
                        loading={busy === person.id}
                        onClick={() => void toggle(person)}
                        size="sm"
                        variant={following.has(person.id) ? "secondary" : "primary"}
                      >
                        {following.has(person.id)
                          ? t("public.following")
                          : t("public.follow")}
                      </Button>
                    ) : null}
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
