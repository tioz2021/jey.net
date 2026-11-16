# Архитектура

Документ описывает, **как** устроен проект: принципы, компоненты, модель
данных и синхронизацию. Продуктовые требования — в [spec.md](spec.md),
протокол API — в [protocol.md](protocol.md), протокол синхронизации —
в [sync.md](sync.md).

## 1. Принципы

1. **Local-first.** Данные пользователя живут на его устройстве. Десктопное
   приложение работает без интернета и без сервера.
2. **Сервер — хаб, а не хозяин.** Он хранит копию, присваивает порядковые
   номера изменениям и раздаёт их другим устройствам.
3. **Веб — полноценный клиент.** Веб-клиент — React SPA; в браузере доступны
   каталог, социальные функции и чат. Веб работает онлайн; PWA даёт offline-shell.
4. **Один домен на всех.** Десктоп и сервер используют общий крейт `jey-core`,
   поэтому правила не расходятся.
5. **Конфликты решаются по записи**, а не по всей базе: записи независимы,
   поэтому расхождения редки и локальны.

## 2. Общая схема

```
┌──────────────────────────┐         ┌──────────────────────────┐
│  Desktop (Tauri 2)       │         │  Browser / PWA           │
│  SPA + SQLite + Rust     │         │  React SPA               │
│  офлайн-каталог и чат    │         │  онлайн + offline shell  │
└────────────┬─────────────┘         └────────────┬─────────────┘
             │  /api/v1/* + /sync/*              │  /api/v1/*
             │  SSE /chat/stream                 │  SSE /chat/stream
             ▼                                    ▼
        ┌─────────────────────────────────────────────┐
        │  Caddy (TLS, статика, прокси)               │
        └───────────────────┬─────────────────────────┘
                            ▼
        ┌─────────────────────────────────────────────┐
        │  jey-api (axum, Rust)                       │
        │  каталог, social, chat, auth, sync, SSE     │
        └───┬───────────────────────────┬─────────────┘
            ▼                           ▼
     ┌─────────────────────┐     ┌─────────────┐
     │ PostgreSQL           │     │ диск VPS    │
     │ данные, sync, chat   │     │ медиа       │
     │ LISTEN/NOTIFY        │     └─────────────┘
     └─────────────────────┘
```

## 3. Компоненты

| Компонент | Ответственность |
|---|---|
| `jey-core` | доменные типы, валидация, правила слияния; не знает про HTTP и БД |
| `jey-api` | HTTP, auth, social, chat, sync, SSE, PostgreSQL |
| `jey-desktop` | Tauri-оболочка, SQLite-кеш, offline outbox, команды для web SPA |
| `apps/web` | React SPA; production static build, desktop frontendDist |
| `frontend` | общие компоненты, API-клиент, i18n, chat/E2E crypto |
| PostgreSQL | серверная копия данных и журнал изменений |
| SQLite | локальная база устройства |
| Caddy | TLS, статика, прокси |
| локальный диск | медиа; бэкапы — позже, когда появится вторая машина |

## 4. Структура репозитория

```
Cargo.toml              воркспейс
crates/
  core/                 jey-core: домен, репозиторные трейты, sync
  api/                  jey-api: axum, sqlx, PostgreSQL
  desktop/              Tauri 2 + SQLite + offline outbox
  repo-contract/        контрактные тесты репозиториев
apps/
  web/                  React 19 + Vite SPA
  desktop/              legacy UI-песочница; release грузит apps/web/dist
frontend/               общие компоненты и API-клиент
migrations/             серверные миграции (sqlx)
docs/                   документация
scripts/                check.sh, deploy.sh, desktop-build.sh
```

Правило: домен не знает про HTTP. Обработчики превращают запрос в вызов
домена и результат в JSON.

## 5. Модель данных

### users

`id uuid`, `email citext unique`, `email_verified_at`, `password_hash`,
`display_name`, `locale`, `is_public`, `created_at`, `updated_at`,
`deleted_at`.

### devices

`id uuid`, `user_id`, `name`, `platform`, `created_at`, `last_seen_at`,
`last_sync_seq`. Устройство регистрируется при первом входе и живёт до
удаления аккаунта.

### sessions

`id uuid`, `user_id`, `device_id`, `token_hash bytea unique`, `created_at`,
`last_seen_at`, `expires_at`, `ip`, `user_agent`. Сессии не синхронизируются.

### items

`id uuid`, `user_id`, `kind`, `title`, `subtitle`, `year`, `status`, `rating`,
`review`, `source_url`, `cover_key`, `meta jsonb`, `created_at`, `updated_at`,
`deleted_at`, плюс **`revision`**, **`sync_seq`**, **`device_id`**.

Индексы: `(user_id, created_at desc)`, `(user_id, kind)`, `(user_id, status)`,
`(user_id, sync_seq)`, GIN и `pg_trgm` для поиска.

### tier_lists, tier_list_items

Тир-листы S–D: пользователь раскладывает свои записи по фиксированным
полосам. `visibility private/public`; публичная выдача фильтрует закрытые и
незавершённые записи. Позиция хранится в `tier_list_items.position`.

### collections, collection_items

Пользовательские коллекции и позиции записей. Видимость `private/public`,
публичные коллекции доступны по `/u/{handle}/collection/{slug}`.

### social

- `follows`, `follow_notifications` — подписки;
- `blocks` — блокировки;
- `notifications` — in-app уведомления;
- `reports` — жалобы на item/comment/profile/chat_message;
- `item_likes`/`comment_reactions` — реакции и лайки;
- `comments` — комментарии и ответы.

Теги удалены миграциями `0019_wipe_tags` и `0020_drop_tags`; их больше нет
в API и UI.

### chat

- `chat_threads`, `chat_members`, `chat_messages` — direct 1:1;
- `chat_settings` — `all/following/nobody`;
- `chat_reactions` — реакции на сообщения;
- `chat_devices` — публичные X25519-ключи устройств;
- `chat_messages.encrypted jsonb`, `encryption_version` — E2E-конверты;
- `chat_members.muted_at`, `hidden_at`, `last_read_at`.

### conflicts

Проигравшие версии при синхронизации: `id`, `user_id`, `entity`, `entity_id`,
`payload jsonb`, `winning_revision`, `created_at`, `resolved_at`.

### rate_limits

Счётчики защиты от перебора: `key text primary key`, `window_started_at`,
`attempts`, `blocked_until`, `updated_at`. Ключ включает действие и адрес
(`login:{ip}:{email}`, `register:{ip}`). Живут в PostgreSQL, поэтому переживают
перезапуск и работают при нескольких инстансах; старые строки удаляются
самим лимитером.

### uploads, auth_tokens

Медиа и одноразовые токены почты. Не синхронизируются между устройствами.

## 6. Синхронизация

Подробно — в [sync.md](sync.md). Коротко:

- каждая запись имеет `revision` (клиент) и `sync_seq` (сервер);
- клиент отправляет изменения через `POST /sync/push`;
- забирает чужие через `GET /sync/pull?since=N`;
- `GET /sync/status` — дешёвая проверка «есть ли новое»;
- конфликты решаются по `updated_at`, проигравшая версия сохраняется;
- удаление — надгробие, а не физическое удаление.

Чат не входит в sync-протокол: сообщения живут на сервере, клиент получает
историю через `/chat`, realtime — SSE. Desktop хранит encrypted-конверты и
outbox отдельно от каталога.

## 7. Жизненный цикл запроса

**Веб-клиент:**

1. Caddy принимает TLS и проксирует `/api/v1/*`.
2. Middleware: `X-Request-Id`, логирование, лимит тела, проверка `Origin`.
3. Сессия из cookie → пользователь.
4. Хендлер → домен → PostgreSQL.
5. Ответ JSON по контракту; ошибки — единый формат.

**Десктоп:**

1. Действие пользователя → домен `jey-core` → локальная SQLite.
2. Изменение попадает в `outbox` и сразу видно в интерфейсе.
3. Кнопка Sync (или ручной запуск) отправляет `outbox` и забирает изменения.
4. После успеха `outbox` очищается, `last_sync_seq` обновляется.

## 8. Безопасность

- **Пароли**: argon2id, параметры подбираются замером (~250 мс).
- **Сессии**: 32 байта CSPRNG, в БД только SHA-256; cookie `HttpOnly`,
  `Secure` в проде, `SameSite=Lax`.
- **CSRF**: `SameSite=Lax` плюс проверка `Origin` для небезопасных методов.
- **Перебор**: лимиты на вход и регистрацию по IP и email.
- **Валидация**: только на сервере; клиент дублирует для удобства.
- **SQL**: параметризованные запросы, без конкатенации.
- **XSS**: React экранирует по умолчанию; `dangerouslySetInnerHTML` запрещён.
- **Файлы**: проверка MIME по содержимому, лимиты, перекодирование изображений.
- **Заголовки**: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`.
- **Чат**: membership checks, блокировки, `message_policy`, лимит тела и
  opaque E2E-конверты. Private keys не попадают на сервер.
- **E2E**: X25519 + HKDF-SHA256 + AES-256-GCM; recovery-фраза BIP39;
  forward secrecy в MVP нет, сервер видит метаданные.

## 9. Масштабирование и деградация

Порядок действий при росте:

1. Кэш статики и изображений на CDN.
2. Индексы и оптимизация запросов.
3. Вынос фронтенда на CDN — API остаётся один.
4. Вертикальный апгрейд VPS.
5. Отдельная машина под PostgreSQL.
6. Несколько инстансов API (сессии в БД, API stateless).
7. Realtime-чат между инстансами уже идёт через PostgreSQL `LISTEN/NOTIFY`;
   при большом fan-out — отдельный pub/sub (Redis/NATS).

Деградация:

- **Сервер недоступен** → десктоп продолжает работать, изменения копятся
  в `outbox`, веб недоступен.
- **Интернет есть, сервер лежит** → десктоп показывает статус «нет связи»,
  повторяет синхронизацию по кнопке.
- **Устройство потеряно** → данные остаются на сервере и других устройствах.

## 10. Решения и компромиссы

| Решение | Альтернатива | Почему так |
|---|---|---|
| Local-first | server-first | независимость от сервера, офлайн-работа |
| Rust + axum | C++, Go, Node | безопасность памяти, зрелая экосистема |
| PostgreSQL на сервере | SQLite на сервере | конкурентная запись, рост, бэкапы |
| SQLite на клиенте | встроенный Postgres | нечего устанавливать, файл на диске |
| Tauri | Electron | бинарник ~10 МБ вместо ~150, системный WebView |
| Общий крейт `core` | две реализации | правила не расходятся между клиентом и сервером |
| LWW по записи | CRDT | проще, для личных записей достаточно |
| Надгробия | жёсткое удаление | иначе записи воскресают при синхронизации |
| Web SPA | Next.js SSR | один статический клиент для web и Tauri |
| SSE + LISTEN/NOTIFY | WebSocket + Redis | нет лишней инфраструктуры; Postgres уже есть |
| E2E MVP X25519 | Double Ratchet | быстрее и проще проверить; FS — следующий этап |

## 11. Ограничения текущей среды

Разработка идёт на Fedora 44:

- Rust edition 2024, toolchain через rustup; Node.js 22;
- PostgreSQL, API и static SPA разворачиваются systemd/Caddy без Docker;
- сервер, Tauri и SPA собираются из одного репозитория.
