import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { TagsBrowser } from "@/components/items/tags-browser";
import { Card, PageHeader } from "@/components/ui";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";
import { backendFetch } from "@/lib/server-api";
import type { TagsResponse } from "@/lib/types";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();

  return { title: `${translate(locale, "tags.title")} — jey.net` };
}

export default async function TagsPage() {
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
    translate(locale, key, values);
  const response = await backendFetch("/tags");

  if (!response.ok) {
    return (
      <main>
        <Card title={t("tags.errorTitle")}>
          <p className={styles.muted}>{t("tags.errorText")}</p>
          <p>
            <Link href="/items">{t("item.back")}</Link>
          </p>
        </Card>
      </main>
    );
  }

  const { tags } = (await response.json()) as TagsResponse;

  return (
    <main>
      <PageHeader
        subtitle={
          tags.length === 0
            ? t("tags.subtitleEmpty")
            : t("tags.subtitle", { count: tags.length })
        }
        title={t("tags.title")}
      />

      {tags.length === 0 ? (
        <EmptyState
          title={t("tags.emptyTitle")}
          text={t("tags.emptyText")}
          actionHref="/items/new"
          actionLabel={t("tags.emptyAction")}
          variant="tags"
        />
      ) : (
        <Card>
          <TagsBrowser tags={tags} />
        </Card>
      )}
    </main>
  );
}
