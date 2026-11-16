"use client";

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { LoadingScreen } from "@/components/loading-screen";
import { Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { KIND_PLURAL_KEYS } from "@/lib/i18n/labels";
import { AppLink } from "@/lib/navigation";
import { mediaUrl } from "@/lib/media";
import type { TierListDetail, TierName } from "@/lib/types";

import styles from "./tiers.module.css";

const TIERS: TierName[] = ["S", "A", "B", "C", "D", "E", "F"];

export function PublicTierScreen() {
  const { id = "", slug = "" } = useParams();
  const { t } = useI18n();
  const [data, setData] = useState<TierListDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.tierLists.public(id, slug).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [id, slug]);

  if (loading) return <main><LoadingScreen /></main>;
  if (!data) return <main><Card title={t("tiers.notFound")}><AppLink href="/">jey.net</AppLink></Card></main>;

  return (
    <main className={styles.publicPage}>
      <PageHeader title={data.tier_list.auto ? t(KIND_PLURAL_KEYS[data.tier_list.kind as Exclude<typeof data.tier_list.kind, "all">]) : data.tier_list.title} />
      <p className={styles.publicBy}>{data.tier_list.handle ? `@${data.tier_list.handle}` : ""}</p>
      <div className={styles.tiers}>
        {TIERS.map((tier) => {
          const items = data.items.filter((item) => item.tier === tier);
          return (
            <section className={styles.tierRow} key={tier}>
              <div className={`${styles.tierLabel} ${styles[`tier${tier}`]}`}>{tier}</div>
              <div className={styles.tierItems}>
                {items.map((item) => (
                  <AppLink
                    className={styles.tierItem}
                    href={item.slug ? `/u/${data.tier_list.handle}/item/${item.slug}` : `/items/${item.id}`}
                    key={item.id}
                    title={item.title}
                  >
                    {item.cover_key ? <img alt="" src={mediaUrl(item.cover_key)} /> : <span className={styles.tierPlaceholder}>{item.title.slice(0, 1)}</span>}
                  </AppLink>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
