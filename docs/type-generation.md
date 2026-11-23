# TS types from Rust

T198 идёт срезами: сначала типы, которые действительно являются wire-DTO,
затем response-views.

## Что уже генерируется

- `ItemKind`;
- `ItemStatus`;
- `NewItem`;
- `ItemPatch`;
- `ItemView` (реэкспортируется как `Item`);
- `UserView` (реэкспортируется как `User`);
- `PublicProfileResponse`, `PublicProfileView`, `PublicItemView`;
- `PublicItemDetail`, `PublicItemResponse`;
- `PublicUserEntry`, `PublicUserListResponse`;
- `PublicCollectionSummary`, `PublicTierListSummary`;
- `PublicCollectionResponse` / header / item;
- `TierListView`, `TierListItemView`, `TierListDetailResponse`, `TierListListResponse`;
- `CollectionView`, `CollectionDetailResponse`, `CollectionListView`;
- `PublicProfileView` (as `PublicProfile`);
- `PublicItem` (единый item shape для profile и detail);
- `PublicProfileResponse` (полностью).

Источник: `crates/core/src/items/model.rs`, `#[derive(TS)]`, `#[ts(export)]`.

```bash
bash scripts/generate-types.sh
```

Файлы лежат в `frontend/lib/generated/` и коммитятся. `frontend/lib/types.ts`
реэкспортирует их; ручных дублей этих типов больше нет. `MovieDetails`
пока остаётся общим фронтовым типом и подключается в `NewItem`/`ItemPatch`
через `ts(type=...)`.

## CI

`scripts/check.sh` запускает генерацию и:

```bash
git diff --exit-code -- frontend/lib/generated
```

Если Rust-тип изменился, а generated-файл не обновлён — gate падает.

## Следующие срезы

1. `NewItem` / `ItemPatch` (нужно аккуратно описать optional-поля).
2. Публичные profile/collection/tier DTO.

Полный T198 не закрыт, пока ручные response-типы не заменены.
