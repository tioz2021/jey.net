"use client";

import { IconAnime, IconBook, IconFilm, IconGame, IconImage, IconList, IconOther, IconTv } from "@/components/icons";
import { KIND_PLURAL_KEYS } from "@/lib/i18n/labels";
import { useI18n } from "@/lib/locale-context";
import type { ItemKind } from "@/lib/types";

const KINDS: Array<ItemKind | null> = [null, "movie", "tv", "anime", "book", "game", "image", "other"];

const ICONS = {
  movie: IconFilm,
  tv: IconTv,
  anime: IconAnime,
  book: IconBook,
  game: IconGame,
  image: IconImage,
  other: IconOther,
} as const;

export function FeedKindFilter({
  value,
  onChange,
}: {
  value: ItemKind | null;
  onChange: (kind: ItemKind | null) => void;
}) {
  const { t } = useI18n();
  return (
    <div aria-label={t("feed.filter")} className="kind-chips feed-kind-filter" role="group">
      {KINDS.map((kind) => {
        const Icon = kind ? ICONS[kind] : IconList;
        return (
          <button
            aria-pressed={value === kind}
            key={kind ?? "all"}
            onClick={() => onChange(kind)}
            type="button"
          >
            <Icon size={14} />
            {kind ? t(KIND_PLURAL_KEYS[kind]) : t("nav.all")}
          </button>
        );
      })}
    </div>
  );
}
