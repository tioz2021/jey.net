"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { NotebookTabs } from "@/components/notebook-tabs";
import { ListSkeleton } from "@/components/skeletons";
import { AppLink } from "@/lib/navigation";
import { Badge, Button, Card, Dialog, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { KIND_PLURAL_KEYS } from "@/lib/i18n/labels";
import type { TierList, TierListKind } from "@/lib/types";

import styles from "./tiers.module.css";

export function TierListsScreen() {
  const { t, date } = useI18n();
  const [lists, setLists] = useState<TierList[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [kind, setKind] = useState<TierListKind>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  function load() {
    setLoading(true);
    api.tierLists
      .list()
      .then((response) => setLists(response.tier_lists))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.tierLists.create({ title: title.trim(), visibility, kind });
      setTitle("");
      setCreating(false);
      load();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <NotebookTabs />
      <div className={styles.toolbar}>
        <Button onClick={() => setCreating(true)} size="sm">{t("tiers.create")}</Button>
      </div>
      {loading ? <Card><ListSkeleton /></Card> : error ? (
        <Card><p className={styles.empty}>{t("error.requestFailed")}</p></Card>
      ) : lists.length === 0 ? (
        <Card><EmptyState text={t("tiers.emptyText")} title={t("tiers.emptyTitle")} /></Card>
      ) : (
        <ul className={styles.lists}>
          {lists.map((list) => (
            <li key={list.id}>
              <AppLink className={styles.listCard} href={`/tiers/${list.id}`}>
                <span className={styles.listMark}>S</span>
                <span className={styles.listBody}>
                  <strong>{list.title}</strong>
                  <span>{list.kind === "all" ? t("tiers.allKinds") : t(KIND_PLURAL_KEYS[list.kind])} · {t("tiers.items", { count: list.item_count })} · {date(list.updated_at, { dateStyle: "medium" })}</span>
                </span>
                <Badge tone={list.visibility === "public" ? "success" : "neutral"}>
                  {list.visibility === "public" ? t("tiers.public") : t("tiers.private")}
                </Badge>
              </AppLink>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        footer={<Button onClick={() => setCreating(false)} size="sm" variant="secondary">{t("common.cancel")}</Button>}
        onClose={() => setCreating(false)}
        open={creating}
        title={t("tiers.new")}
      >
        <form className={styles.form} onSubmit={create}>
          <Input autoFocus label={t("tiers.name")} maxLength={80} onChange={(event) => setTitle(event.target.value)} required value={title} />
          <Select label={t("tiers.kind")} onChange={(event) => setKind(event.target.value as TierListKind)} value={kind}>
            <option value="all">{t("tiers.allKinds")}</option>
            {(["movie", "tv", "anime", "book", "game", "image", "other"] as TierListKind[]).map((entry) => (
              <option key={entry} value={entry}>{t(KIND_PLURAL_KEYS[entry as Exclude<TierListKind, "all">])}</option>
            ))}
          </Select>
          <Select label={t("tiers.visibility")} onChange={(event) => setVisibility(event.target.value as "private" | "public")} value={visibility}>
            <option value="private">{t("tiers.private")}</option>
            <option value="public">{t("tiers.public")}</option>
          </Select>
          <Button disabled={busy || !title.trim()} type="submit">{t("tiers.create")}</Button>
        </form>
      </Dialog>
    </main>
  );
}
