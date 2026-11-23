# TS types from Rust

T198 идёт срезами: сначала типы, которые действительно являются wire-DTO,
затем response-views.

## Что уже генерируется

- `ItemKind`;
- `ItemStatus`.

Источник: `crates/core/src/items/model.rs`, `#[derive(TS)]`, `#[ts(export)]`.

```bash
bash scripts/generate-types.sh
```

Файлы лежат в `frontend/lib/generated/` и коммитятся. `frontend/lib/types.ts`
реэкспортирует их; ручных дублей этих двух union-типов больше нет.

## CI

`scripts/check.sh` запускает генерацию и:

```bash
git diff --exit-code -- frontend/lib/generated
```

Если Rust-тип изменился, а generated-файл не обновлён — gate падает.

## Следующие срезы

1. `NewItem` / `ItemPatch` (нужно аккуратно описать optional-поля).
2. `ItemView`.
3. `UserView`.
4. Публичные profile/collection/tier DTO.

Полный T198 не закрыт, пока ручные response-типы не заменены.
