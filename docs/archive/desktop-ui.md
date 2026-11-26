# Desktop UI

Статус: актуально для 0.6.0.

## Главное

Web и desktop используют **один SPA**:

```text
apps/web/                  React 19 + Vite SPA (production)
frontend/                  общие компоненты, API, i18n, crypto
crates/desktop/            Tauri 2, SQLite, commands, offline outbox
```

`crates/desktop/tauri.conf.json` указывает:

```json
"frontendDist": "../../apps/web/dist"
```

Отдельного release-фронтенда больше нет. `apps/desktop` остаётся legacy
песочницей и не участвует в `scripts/desktop-build.sh`.

## Сборка

```bash
bash scripts/desktop-build.sh --bundles appimage,deb
```

Скрипт:

1. собирает `apps/web`;
2. запускает `cargo-tauri build --features tauri`;
3. кладёт AppImage/deb в `target/release/bundle/`.

## Данные

- каталог: SQLite через `local_list_items`, `local_create_item`, ...;
- sync: `/sync/*` + outbox;
- чат: `local_chat_*`, encrypted SQLite cache и outbox;
- ключи E2E: IndexedDB WebView, server хранит только public device keys.

## Bridge

`apps/web/src/desktop-bridge.ts` подменяет `fetch` для Tauri:

- `/me`, `/items`, `/collections`, `/chat/*`;
- неизвестные офлайн-запросы получают `503 offline_unsupported`;
- SSE остаётся сетевым; при недоступности клиент переходит на polling.

## Медиа

Медиа кешируется локально; `mediaUrl` в Tauri указывает на сервер, а
`local_cover_data` отдаёт локальную копию, если она есть.

## Ограничения

- первый вход требует сети;
- E2E recovery-фраза должна быть сохранена пользователем;
- multi-device E2E проверяется отдельно (T150.6);
- forward secrecy в MVP нет.
