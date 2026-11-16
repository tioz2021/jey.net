"use client";

import { useEffect, useState } from "react";

import { ItemCard } from "@/components/items/item-card";
import { RemoveFromCollection } from "@/components/remove-from-collection";
import { AppLink } from "@/lib/navigation";
import { NotebookTabs } from "@/components/notebook-tabs";
import { Badge, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { CollectionDetail } from "@/lib/types";

import styles from "./collection-detail-screen.module.css";
import { LoadingScreen } from "@/components/loading-screen";
import { ViewSwitch, type ViewMode } from "@/components/view-switch";
import { readViewPreference, saveViewPreference } from "@/lib/view-preference";

export function CollectionDetailScreen({ id }: { id: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<CollectionDetail | null>(null);
  const [error, setError] = useState(false);
  const [view, setView] = useState<ViewMode>(() => readViewPreference("jey:view:collections", "grid"));

  useEffect(() => {
    api.collections.detail(id).then(setData).catch(() => setError(true));
  }, [id]);

  if (error) {
    return (
      <main>
        <NotebookTabs />
        <Card title={t("collections.loadError")}>
          <AppLink href="/collections">{t("collections.title")}</AppLink>
        </Card>
      </main>
    );
  }

  if (!data) return <main><LoadingScreen /></main>;

  return (
    <main>
      <NotebookTabs />
      <header className={styles.header}>
        <div className={styles.titleLine}>
          <h1>{data.collection.title}</h1>
          <Badge tone={data.collection.visibility === "public" ? "success" : "neutral"}>
            {data.collection.visibility === "public"
              ? t("collections.public")
              : t("collections.private")}
          </Badge>
        </div>
      </header>
      <div className="section-toolbar">
        <ViewSwitch
          onChange={(value) => {
            setView(value);
            saveViewPreference("jey:view:collections", value);
          }}
          value={view}
        />
      </div>
      {data.items.length === 0 ? (
        <p className={styles.empty}>{t("collections.empty")}</p>
      ) : (
        <ul className={`${styles.list} ${view === "grid" ? styles.grid : ""}`}>
          {data.items.map((item) => (
            <li key={item.id}>
              <ItemCard
                footer={<RemoveFromCollection collectionId={id} itemId={item.id} />}
                href={`/items/${item.id}`}
                item={item}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
