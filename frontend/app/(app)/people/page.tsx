"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { IconBell, IconBellOff } from "@/components/icons";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { useUser } from "@/lib/user-context";
import type { FollowingProfile, PublicUserCard } from "@/lib/types";

import styles from "./people.module.css";

const PAGE_SIZE = 24;

type Tab = "following" | "search";

export default function PeoplePage() {
  const { t } = useI18n();
  const { user } = useUser();
  const [tab, setTab] = useState<Tab>("following");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("active");
  const [people, setPeople] = useState<PublicUserCard[]>([]);
  const [followingPeople, setFollowingPeople] = useState<FollowingProfile[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [followingQuery, setFollowingQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [followingLoading, setFollowingLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.follows
        .following()
        .then((response) => {
          if (!cancelled) {
            setFollowingPeople(response.people);
            setFollowing(new Set(response.people.map((person) => person.id)));
          }
        })
        .catch(() => {})
        .finally(() => !cancelled && setFollowingLoading(false));
    };
    load();
    window.addEventListener("jey:following-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("jey:following-changed", load);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      api.publicUsers
        .search(query.trim(), { sort, limit: PAGE_SIZE })
        .then((result) => {
          if (!cancelled) {
            setPeople(result.users);
            setNextOffset(result.next_offset);
          }
        })
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, sort]);

  async function loadMore() {
    if (nextOffset === null) return;
    setLoadingMore(true);
    try {
      const result = await api.publicUsers.search(query.trim(), {
        sort,
        offset: nextOffset,
        limit: PAGE_SIZE,
      });
      setPeople((current) => {
        const seen = new Set(current.map((person) => person.id));
        return [...current, ...result.users.filter((person) => !seen.has(person.id))];
      });
      setNextOffset(result.next_offset);
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggle(person: PublicUserCard) {
    setBusy(person.id);
    try {
      if (following.has(person.id)) {
        await api.follows.unfollow(person.id);
      } else {
        await api.follows.follow(person.id);
      }
      window.dispatchEvent(new Event("jey:following-changed"));
    } finally {
      setBusy(null);
    }
  }

  async function toggleNotifications(person: FollowingProfile) {
    const enabled = !person.notifications;
    await api.follows.notifications(person.id, enabled);
    setFollowingPeople((current) =>
      current.map((item) =>
        item.id === person.id ? { ...item, notifications: enabled } : item,
      ),
    );
  }

  const visibleFollowing = followingPeople.filter((person) =>
    person.display_name.toLowerCase().includes(followingQuery.trim().toLowerCase()),
  );

  return (
    <main>
      <PageHeader title={t("people.title")} />
      <div className={styles.tabs}>
        <button
          className={tab === "following" ? styles.tabActive : styles.tab}
          onClick={() => setTab("following")}
          type="button"
        >
          {t("people.followingTab")} ({followingPeople.length})
        </button>
        <button
          className={tab === "search" ? styles.tabActive : styles.tab}
          onClick={() => setTab("search")}
          type="button"
        >
          {t("people.findPeople")}
        </button>
      </div>

      {tab === "following" ? (
        <Card title={t("people.followingTitle")}>
          <div className={styles.followingTools}>
            <Input
              label={t("people.searchFollowing")}
              onChange={(event) => setFollowingQuery(event.target.value)}
              placeholder={t("people.searchFollowing")}
              value={followingQuery}
            />
          </div>
          {!followingLoading && visibleFollowing.length === 0 ? (
            <EmptyState
              text={
                followingQuery
                  ? t("people.emptyText")
                  : t("public.followingEmpty")
              }
              title={t("public.followingEmpty")}
            />
          ) : (
            <ul className={styles.followingList}>
              {visibleFollowing.map((person) => (
                <li className={styles.followingPerson} key={person.id}>
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
                    </span>
                  </Link>
                  <button
                    aria-label={t(
                      person.notifications
                        ? "public.muteFollowing"
                        : "public.unmuteFollowing",
                      { name: person.display_name },
                    )}
                    aria-pressed={person.notifications}
                    className={styles.bell}
                    onClick={() => void toggleNotifications(person)}
                    type="button"
                  >
                    {person.notifications ? <IconBell size={14} /> : <IconBellOff size={14} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <div className={styles.stack}>
          <div className={styles.toolbar}>
            <Input
              label={t("people.search")}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("people.searchPlaceholder")}
              value={query}
            />
            <Select
              label={t("people.sort")}
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="active">{t("people.sortActive")}</option>
              <option value="name">{t("people.sortName")}</option>
              <option value="new">{t("people.sortNew")}</option>
              <option value="items">{t("people.sortItems")}</option>
            </Select>
          </div>
          <Card title={t("people.all")}>
            {!loading && people.length === 0 ? (
              <EmptyState text={t("people.emptyText")} title={t("people.emptyTitle")} />
            ) : (
              <>
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
                {nextOffset !== null ? (
                  <Button
                    loading={loadingMore}
                    onClick={() => void loadMore()}
                    size="sm"
                    variant="secondary"
                  >
                    {t("people.loadMore")}
                  </Button>
                ) : null}
              </>
            )}
          </Card>
        </div>
      )}
    </main>
  );
}
