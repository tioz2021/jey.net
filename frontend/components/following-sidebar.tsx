"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { IconBell, IconBellOff } from "@/components/icons";
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

  async function toggleNotifications(person: FollowingProfile) {
    const enabled = !person.notifications;
    await api.follows.notifications(person.id, enabled);
    setPeople((current) =>
      current.map((item) =>
        item.id === person.id ? { ...item, notifications: enabled } : item,
      ),
    );
    window.dispatchEvent(new Event("jey:following-changed"));
  }

  return (
    <section className={styles.panel} aria-label={t("public.followingTitle")}>
      <p className={styles.head}>{t("public.followingTitle")}</p>
      {people.length === 0 ? (
        <p className={styles.empty}>{t("public.followingEmpty")}</p>
      ) : (
        <ul className={styles.list}>
          {people.slice(0, 10).map((person) => (
            <li className={styles.personRow} key={person.id}>
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
                title={t(
                  person.notifications
                    ? "public.muteFollowing"
                    : "public.unmuteFollowing",
                  { name: person.display_name },
                )}
                type="button"
              >
                {person.notifications ? (
                  <IconBell size={14} />
                ) : (
                  <IconBellOff size={14} />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
     {people.length > 0 ? (
        <Link className={styles.all} href="/subscriptions">
          {t("public.allFollowing", { count: people.length })}
        </Link>
      ) : null}
    </section>
  );
}
