"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { BlockedProfile } from "@/lib/types";

import styles from "./blocked-profiles.module.css";

export function BlockedProfiles() {
  const { t } = useI18n();
  const [people, setPeople] = useState<BlockedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.follows
      .blocked()
      .then((response) => {
        if (!cancelled) setPeople(response.people);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  async function unblock(person: BlockedProfile) {
    setBusy(person.id);
    try {
      await api.follows.unblock(person.id);
      setPeople((current) => current.filter((item) => item.id !== person.id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title={t("settings.blockedTitle")}>
      <p className={styles.hint}>{t("settings.blockedHint")}</p>
      {!loading && people.length === 0 ? (
        <p className={styles.empty}>{t("settings.blockedEmpty")}</p>
      ) : (
        <ul className={styles.list}>
          {people.map((person) => (
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
                <span>{person.display_name}</span>
              </Link>
              <Button
                loading={busy === person.id}
                onClick={() => void unblock(person)}
                size="sm"
                variant="secondary"
              >
                {t("settings.unblock")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
