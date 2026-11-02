# ROADMAP — jey.net

План работ: 89 задач со сквозной нумерацией `T01`–`T91`.
Стек: Rust (edition 2024) + axum + sqlx + PostgreSQL, фронтенд Next.js + TypeScript.
Ветка разработки: `main`. Деплой: VPS + Caddy + systemd.

---

## Как мы работаем

1. Ты называешь задачу: «ЗАДАЧА 5» или «делаем T14».
2. Я реализую её целиком: код, проверка сборки, прогон тестов.
3. Останавливаюсь и отчитываюсь: изменённые файлы, что сделано, вывод проверок, что осталось за рамками, текст коммита.
4. Ты смотришь `git diff` и проверяешь по разделу **Проверить**.
5. Говоришь «коммить» — я делаю ровно один коммит и ставлю `[x]`.
6. Без твоей команды следующую задачу не начинаю.

Подробный регламент, шаблон отчёта и Definition of Done — в
[docs/workflow.md](docs/workflow.md).

**Правила для меня:**
- Не начинаю следующую задачу без твоей команды.
- Не трогаю файлы, не относящиеся к задаче.
- Не расширяю объём: нашёл недочёт — предлагаю новую задачу с ID, а не чиню молча.
- Если задача больше описанного — останавливаюсь до кода и предлагаю разбить.
- Не коммичу без явного разрешения.
- Секреты не попадают в код, логи и сообщения коммитов.

**Языковые правила:**
- Документация `.md` (включая этот файл) — **на русском**.
- Код, идентификаторы, комментарии в коде, SQL, сообщения коммитов — **на английском**.
- Тексты ошибок API — **на английском**; пользовательские строки интерфейса — **на русском** и хранятся в одном модуле для будущей локализации.

**Легенда:** `[ ]` не начата · `[~]` в работе · `[x]` принята · `[!]` заблокирована (причина в строке).

---

## Сводка по этапам

| Этап | Задачи | Результат к концу этапа |
|---|---|---|
| **M0 · Каркас** | T01–T09 | Репозиторий собирается, `/health` отвечает, миграции применяются, CI и `check.sh` зелёные |
| **M1 · Ядро** | T10–T11 | Workspace `core` + `api`, примитивы синхронизации и протокол |
| **M2 · Аккаунты** | T12–T27 | Регистрация, вход, сессии, устройства, сброс пароля, подтверждение email, профиль |
| **M3 · Записи** | T28–T44 | CRUD записей, теги, фильтры, поиск, статистика, экспорт и импорт |
| **M4 · Интерфейс** | T45–T62 | Все экраны: список, карточка, формы, поиск, статистика, настройки |
| **M5 · Медиа** | T63–T70 | Загрузка, ресайз, хранение, обложки, квоты, сборка мусора |
| **M6 · Деплой** | T71–T81 | VPS, Postgres, Caddy, TLS, бэкапы, мониторинг, регламент миграций |
| **M7 · Полировка** | T82–T91 | Экспорт в UI, приватность, SEO, безопасность, релиз 0.1.0 |
| **M8 · Десктоп и синхронизация** | T92–T105 | Tauri-приложение на локальной базе, sync-протокол, конфликты, релиз 0.2.0 |

**Текущий статус:** T01–T73 приняты. Следующая — T74.

---

## M0 · Каркас

- [x] **T01 · Инициализация репозитория**
  **Файлы:** `.gitignore`, `.editorconfig`, `README.md`, `docs/`
  **Сделать:** `git init`; игнорировать `backend/target/`, `frontend/node_modules/`, `.next/`, `.env`, `data/`, `.toolchain/`; отступы: Rust — 4, TS/CSS/MD — 2, LF, UTF-8; README с описанием, стеком и ссылками на документы.
  **Проверить:** `git status --short` пуст после коммита; `git check-ignore backend/target .env frontend/node_modules` показывает все три; README открывается и ссылки на `docs/*` рабочие.
  **Коммит:** `chore: initialize repository with documentation`

- [x] **T02 · Каркас бэкенда на axum**
  **Файлы:** `backend/Cargo.toml`, `backend/src/main.rs`, `rust-toolchain.toml`
  **Сделать:** крейт `jey-api`, edition 2024; зависимости: `axum`, `tokio`, `tower-http`, `tracing`, `serde`; сервер слушает `BIND_ADDR`; `GET /health` → `{"status":"ok","version":"0.1.0"}`; корректное завершение по `SIGINT`/`SIGTERM`.
  **Проверить:** `cargo run` стартует; `curl -s localhost:8080/health` → JSON; `Ctrl+C` завершает процесс без паники; `cargo clippy -- -D warnings` чист.
  **Коммит:** `feat(api): bootstrap axum server with health endpoint`

- [x] **T03 · Конфигурация из окружения**
  **Файлы:** `backend/src/config.rs`, `backend/src/main.rs`, `.env.example`
  **Сделать:** структура `Config` с полями `app_env`, `bind_addr`, `database_url`, `session_ttl_days`, `allowed_origins`, `log_format`; загрузка через `dotenvy`; дефолты для dev; падение на старте с внятным сообщением при некорректных значениях.
  **Проверить:** запуск с `.env`; без `BIND_ADDR` используется `127.0.0.1:8080`; неверный `APP_ENV` даёт ошибку с текстом, а не панику; `.env.example` содержит все переменные.
  **Коммит:** `feat(api): load typed configuration from environment`

- [x] **T04 · Логирование и request id**
  **Файлы:** `backend/src/telemetry.rs`, `backend/src/main.rs`
  **Сделать:** `tracing-subscriber` с двумя форматами: pretty для dev, JSON для prod; `tower-http::TraceLayer`; `X-Request-Id` из запроса или генерация UUID; id попадает в ответ и в каждую запись лога.
  **Проверить:** запрос к `/health` даёт строку лога с `request_id`, `method`, `status`, `latency_ms`; ответ содержит `x-request-id`; переданный клиентом id сохраняется.
  **Коммит:** `feat(api): add structured logging with request ids`

- [x] **T05 · Единый формат ошибок**
  **Файлы:** `backend/src/error.rs`, `backend/src/main.rs`
  **Сделать:** `AppError` с вариантами `Validation`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `RateLimited`, `Internal`; реализация `IntoResponse` по контракту из `docs/protocol.md`; JSON для 404 и 405 вместо пустого тела.
  **Проверить:** неизвестный путь → `404` с `error.code = "not_found"` и `request_id`; неверный метод → `405`; внутренняя ошибка не раскрывает детали, но пишется в лог.
  **Коммит:** `feat(api): add unified error responses`

- [x] **T06 · Подключение PostgreSQL**
  **Файлы:** `backend/src/db.rs`, `backend/src/main.rs`, `backend/src/config.rs`
  **Сделать:** `sqlx::PgPool` с настройками (max connections 10, timeout 5 с); проверка соединения на старте; `GET /health/ready` возвращает `503`, если БД недоступна.
  **Проверить:** без `DATABASE_URL` приложение падает на старте с понятным сообщением; с рабочей БД `/health/ready` → `200`; при остановленной БД → `503`; `/health` при этом остаётся `200`.
  **Коммит:** `feat(api): connect to postgres via sqlx pool`

- [x] **T07 · Миграции и sqlx-cli**
  **Файлы:** `migrations/0001_init.sql`, `scripts/db.sh`, `backend/src/db.rs`, `backend/src/config.rs`, `backend/src/main.rs`
  **Сделать:** миграции встроены в бинарник через `sqlx::migrate!` (внешний `sqlx-cli` не нужен); каталог `migrations/`; скрипт `db.sh` с командами `create`, `migrate`, `drop`, `reset`; подкоманда `jey-api migrate`; применение миграций при старте с флагом `RUN_MIGRATIONS` (по умолчанию включён вне продакшена).
  **Проверить:** `bash scripts/db.sh migrate` применяет миграции и создаёт служебную таблицу `_sqlx_migrations`; повторный запуск ничего не ломает; `db.sh reset` пересоздаёт чистую БД.
  **Коммит:** `feat(db): introduce migrations workflow`

- [x] **T08 · CI: сборка и тесты**
  **Файлы:** `.github/workflows/ci.yml`
  **Сделать:** на push и PR: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo build`, `cargo test`; кэш cargo; сервис Postgres в job для интеграционных тестов.
  **Проверить:** workflow зелёный на текущем коммите; искусственно сломанный fmt валит job; лог показывает все шаги.
  **Коммит:** `ci: add build and test workflow`

- [x] **T09 · Локальный скрипт проверки**
  **Файлы:** `scripts/check.sh`
  **Сделать:** последовательно: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `cargo build --release`; остановка на первой ошибке; понятный вывод.
  **Проверить:** `bash scripts/check.sh` проходит на чистом дереве; при неотформатированном файле возвращает код ≠ 0 и указывает файл; время выполнения < 3 минут.
  **Коммит:** `chore: add local verification script`

---

## M1 · Ядро

- [x] **T10 · Cargo workspace: core и api**
  **Файлы:** `Cargo.toml` (воркспейс в корне), `crates/core/Cargo.toml`, `crates/core/src/lib.rs`, `crates/api/Cargo.toml`, перенос `backend/*` → `crates/api/*`
  **Сделать:** воркспейс с членами `crates/core` (крейт `jey-core`) и `crates/api` (крейт `jey-api`); `core` содержит доменные типы, ошибки и правила и не зависит от `axum` и `sqlx`; `api` — текущий бинарник, зависит от `core`; обновить пути в `scripts/db.sh`, `scripts/check.sh` и CI.
  **Проверить:** `cargo build --workspace` и `cargo test --workspace` из корня проходят; `bash scripts/check.sh` зелёный; `/health` и `/health/ready` отвечают как раньше; в `crates/core/Cargo.toml` нет `axum` и `sqlx`.
  **Коммит:** `refactor: split the project into core and api crates`

- [x] **T11 · Протокол синхронизации и примитивы слияния**
  **Файлы:** `docs/sync.md`, `crates/core/src/sync/mod.rs`, `crates/core/src/sync/merge.rs`
  **Сделать:** описать протокол: `revision`, `sync_seq`, `device_id`, надгробия, `push`/`pull`/`status`, правила конфликтов и конфликтные копии; типы `Revision`, `SyncSeq`, `DeviceId`; чистая функция разрешения конфликта по `(updated_at, device_id)`.
  **Проверить:** `cargo test -p jey-core` зелёный; таблица случаев в `docs/sync.md` совпадает с тестами; в документе есть сценарии «два устройства без сети» и «удаление против правки».
  **Коммит:** `feat(core): define sync protocol and merge rules`

---

## M2 · Аккаунты

- [x] **T12 · Схема users**
  **Файлы:** `migrations/0002_users.sql`
  **Сделать:** расширение `citext`; таблица `users`: `id uuid pk`, `email citext unique not null`, `email_verified_at timestamptz`, `password_hash text not null`, `display_name text not null`, `locale text not null default 'ru'`, `is_public boolean not null default false`, `created_at`, `updated_at`, `deleted_at`; CHECK на длину `display_name`; индекс по `deleted_at`.
  **Проверить:** миграция применяется на чистой БД; дубликат email (в другом регистре) отклоняется; `display_name` длиной 61 символ отклоняется; `updated_at` обновляется триггером.
  **Коммит:** `feat(db): add users table`

- [x] **T13 · Схема devices и sessions**
  **Файлы:** `migrations/0003_devices_sessions.sql`
  **Сделать:** `devices` (`id`, `user_id` cascade, `installation_id`, `name`, `platform`, `created_at`, `last_seen_at`, `last_sync_seq`, уникальность `(user_id, installation_id)`); `sessions` (`id`, `user_id` cascade, `device_id` set null, `token_hash bytea unique`, `created_at`, `last_seen_at`, `expires_at`, `ip`, `user_agent`); индексы по `sessions(user_id)`, `sessions(expires_at)`, `devices(user_id)`.
  **Проверить:** удаление пользователя уносит его устройства и сессии; дубликат `token_hash` отклоняется; повторная установка с тем же `installation_id` не создаёт второе устройство; запрос «активные сессии пользователя» использует индекс.
  **Коммит:** `feat(db): add devices and sessions tables`

- [x] **T14 · Хеширование паролей**
  **Файлы:** `crates/api/src/auth/mod.rs`, `crates/api/src/auth/password.rs`
  **Сделать:** `hash_password`, `verify_password` на argon2id; параметры подобраны замером (64 МиБ, 3 прохода, 1 полоса → ~105 мс в release); проверка длины 10–128; unit-тесты.
  **Проверить:** `cargo test auth::password` зелёный; корректный пароль проходит, неверный — нет; хеш двух одинаковых паролей различается (соль); время хеширования в логе теста 150–400 мс.
  **Коммит:** `feat(auth): hash passwords with argon2id`

- [x] **T15 · Регистрация**
  **Файлы:** `crates/api/src/auth/register.rs`, `crates/api/src/http/mod.rs`, `crates/api/src/auth/mod.rs`
  **Сделать:** `POST /api/v1/auth/register`; нормализация email; валидация email, пароля (10–128), `display_name` (1–60); `409` на существующий email; создание пользователя и сессии; ответ `201` с объектом `user` и cookie.
  **Проверить:** `curl` с валидными данными → `201` и `Set-Cookie`; повторный email → `409`; пароль из 9 символов → `400` с `details.field = "password"`; email с пробелами по краям нормализуется.
  **Коммит:** `feat(auth): add registration endpoint`

- [x] **T16 · Вход**
  **Файлы:** `crates/api/src/auth/login.rs`, `crates/api/src/http/mod.rs`
  **Сделать:** `POST /api/v1/auth/login`; поиск по email, проверка пароля; при неверных данных — одинаковый ответ `401` без указания, что именно неверно; создание сессии и cookie `jey_session`; обновление `last_seen_at`.
  **Проверить:** верные данные → `200` и cookie с `HttpOnly`, `SameSite=Lax`, `Path=/`; неверный пароль → `401`; несуществующий email → `401` с тем же временем ответа (±20%).
  **Коммит:** `feat(auth): add login with session cookie`

- [x] **T17 · Сессия в middleware и GET /me**
  **Файлы:** `crates/api/src/auth/session.rs`, `crates/api/src/auth/middleware.rs`, `crates/api/src/http/mod.rs`
  **Сделать:** извлечение `CurrentUser` из cookie: sha256 токена → поиск активной сессии → пользователь; слой `require_auth`; `GET /api/v1/me`.
  **Проверить:** без cookie → `401`; с валидной cookie → `200` и объект пользователя; после истечения `expires_at` → `401`; чужая/битая cookie → `401`, без паники.
  **Коммит:** `feat(auth): resolve sessions in middleware`

- [x] **T18 · Выход**
  **Файлы:** `crates/api/src/auth/logout.rs`, `crates/api/src/http/mod.rs`
  **Сделать:** `POST /api/v1/auth/logout`; удаление текущей сессии; очистка cookie (`Max-Age=0`).
  **Проверить:** после выхода `/me` → `401`; повторный выход не падает и возвращает `204`; в БД не осталось строки сессии.
  **Коммит:** `feat(auth): add logout`

- [x] **T19 · Проверка Origin для небезопасных методов**
  **Файлы:** `crates/api/src/http/origin.rs`, `crates/api/src/http/mod.rs`
  **Сделать:** для `POST`, `PATCH`, `PUT`, `DELETE` требовать `Origin` или `Referer` из списка `ALLOWED_ORIGINS`; иначе `403`; для `GET`/`HEAD` не проверять.
  **Проверить:** запрос с чужим `Origin` → `403`; со своим → проходит; без заголовка → `403`; `curl` с `Origin: http://localhost:3000` работает при соответствующей настройке.
  **Коммит:** `feat(auth): enforce origin checks for state changes`

- [x] **T20 · Ограничение частоты попыток**
  **Файлы:** `migrations/0004_rate_limits.sql`, `crates/api/src/http/ratelimit.rs`, `crates/api/src/http/mod.rs`, `crates/api/src/auth/login.rs`, `crates/api/src/auth/register.rs`
  **Сделать:** счётчики в PostgreSQL (fixed window, переживают рестарт); лимиты из `docs/protocol.md`: вход 5/мин на IP+email, регистрация 3/час на IP, сброс пароля 3/час на email; `429` с `Retry-After`; IP берётся из `X-Forwarded-For`, иначе из peer-адреса.
  **Проверить:** 6-й вход за минуту → `429` и `Retry-After`; после окна запрос снова проходит; разные IP не мешают друг другу; лимит не влияет на `GET /me`.
  **Коммит:** `feat(auth): rate limit credential endpoints`

- [x] **T21 · Интеграционные тесты аутентификации**
  **Файлы:** `crates/api/tests/auth.rs`, `crates/api/tests/common/mod.rs`
  **Сделать:** тестовая БД из `TEST_DATABASE_URL`; схема создаётся миграциями; каждый тест работает в своей транзакции или на своей схеме; сценарии: регистрация → вход → `/me` → выход; ошибки валидации; дубликат email.
  **Проверить:** `cargo test --test auth` зелёный; тесты не зависят от порядка запуска; после прогона БД не содержит мусора.
  **Коммит:** `test(auth): cover registration, login and logout`

- [x] **T22 · Смена пароля**
  **Файлы:** `crates/api/src/auth/password_change.rs`, `crates/api/src/http/mod.rs`
  **Сделать:** `POST /api/v1/me/password`; проверка текущего пароля; обновление хеша; удаление всех сессий, кроме текущей.
  **Проверить:** со верным текущим паролем → `204`, старый пароль больше не подходит; неверный текущий → `400`; прочие сессии получают `401`; текущая сессия продолжает работать.
  **Коммит:** `feat(auth): add password change`

- [x] **T23 · Профиль**
  **Файлы:** `crates/api/src/users/mod.rs`, `crates/api/src/users/profile.rs`, `crates/api/src/http/mod.rs`
  **Сделать:** `GET /api/v1/me` и `PATCH /api/v1/me` (`display_name`, `locale`, `is_public`); валидация; `PATCH` с пустым телом — `400`.
  **Проверить:** изменение `display_name` сохраняется и видно в `GET /me`; невалидное значение → `400`; `locale` принимает только поддерживаемые коды; пустой `PATCH` отклоняется.
  **Коммит:** `feat(users): read and update profile`

- [x] **T24 · Удаление аккаунта**
  **Файлы:** `crates/api/src/users/delete.rs`, `crates/api/src/http/mod.rs`
  **Сделать:** `DELETE /api/v1/me` с подтверждением паролем; мягкое удаление (`deleted_at`), обезличивание email, удаление сессий; фоновое окончательное удаление — отдельной задачей.
  **Проверить:** после удаления вход невозможен; `/me` с прежней cookie → `401`; запись в БД помечена `deleted_at`, email не совпадает ни с одним новым; повторное удаление → `401`.
  **Коммит:** `feat(users): allow account deletion`

- [x] **T25 · Абстракция почты**
  **Файлы:** `crates/api/src/mail/mod.rs`, `crates/api/src/mail/dev.rs`, `crates/api/src/mail/templates.rs`
  **Сделать:** трейт `Mailer`; dev-транспорт пишет письма в `var/mail/*.eml`; шаблоны подтверждения email и сброса пароля; отправитель из конфига.
  **Проверить:** при `APP_ENV=dev` письмо появляется в `var/mail/` и содержит ссылку; в тестах используется фейковый `Mailer` с запоминанием писем; отсутствие SMTP-настроек не роняет приложение.
  **Коммит:** `feat(mail): add mailer abstraction with dev transport`

- [x] **T26 · Подтверждение email**
  **Файлы:** `migrations/0005_auth_tokens.sql`, `crates/api/src/auth/email_verify.rs`, `crates/api/src/http/mod.rs`
  **Сделать:** одноразовые токены (хеш в БД, срок 24 ч); отправка письма при регистрации; `POST /api/v1/auth/verify-email`; повторная отправка — не чаще раза в 10 минут.
  **Проверить:** письмо содержит рабочую ссылку; после подтверждения `email_verified_at` заполнен; повторное использование токена → `400`; просроченный токен → `400`; частый повторный запрос → `429`.
  **Коммит:** `feat(auth): verify email addresses`

- [x] **T27 · Сброс пароля**
  **Файлы:** `crates/api/src/auth/password_reset.rs`, `crates/api/src/http/mod.rs`
  **Сделать:** `POST /auth/password-reset/request` (всегда `202`, без раскрытия наличия аккаунта) и `POST /auth/password-reset/confirm`; одноразовый токен на 1 час; после сброса — удаление всех сессий.
  **Проверить:** письмо приходит только для существующего email, но ответ одинаковый; новый пароль работает; старый — нет; повторное использование токена → `400`; после сброса все сессии недействительны.
  **Коммит:** `feat(auth): add password reset via email`

---

## M3 · Записи

- [x] **T28 · Схема items**
  **Файлы:** `migrations/0006_items.sql`
  **Сделать:** таблица `items` по `docs/architecture.md`; CHECK на `kind`, `status`, `rating` (1–10), `year` (1800–2100); индексы `(user_id, created_at desc)`, `(user_id, kind)`, `(user_id, status)`; `updated_at` триггером.
  **Проверить:** миграция применяется; вставка с `rating = 11` отклоняется; `kind = 'game'` отклоняется; `deleted_at` по умолчанию `NULL`; индекс используется (`EXPLAIN`).
  **Коммит:** `feat(db): add items table`

- [x] **T29 · Схема тегов**
  **Файлы:** `migrations/0007_tags.sql`
  **Сделать:** `tags(id, user_id, name, created_at)` с уникальностью `(user_id, lower(name))`; `item_tags(item_id, tag_id)` с каскадным удалением; индексы.
  **Проверить:** дубликат тега в другом регистре отклоняется; удаление записи удаляет связи; удаление тега не удаляет записи.
  **Коммит:** `feat(db): add tags and item_tags`

- [x] **T30 · Домен записей**
  **Файлы:** `crates/core/src/items/mod.rs`, `crates/core/src/items/model.rs`, `crates/api/src/items/mod.rs`, `crates/api/src/items/repo.rs`
  **Сделать:** типы `Item`, `ItemKind`, `ItemStatus`, `NewItem`, `ItemPatch`; маппинг из строк БД; репозиторий с методами `create`, `get`, `list`, `update`, `soft_delete`, `restore`; все запросы ограничены `user_id`.
  **Проверить:** `cargo test items::repo` зелёный; попытка получить чужую запись возвращает `None`; `ItemKind::from_str` отвергает неизвестные значения.
  **Коммит:** `feat(items): add domain model and repository`

- [x] **T31 · Создание записи**
  **Файлы:** `crates/api/src/items/create.rs`, `crates/api/src/http/items.rs`, `crates/api/src/http/mod.rs`
  **Сделать:** `POST /api/v1/items`; валидация по правилам `docs/protocol.md`; нормализация тегов; ответ `201` с полным объектом.
  **Проверить:** `curl` создаёт запись и возвращает `201`; пустой `title` → `400`; `rating = 0` → `400`; 21 тег → `400`; теги создаются и привязываются.
  **Коммит:** `feat(items): create items`

- [x] **T32 · Чтение записи**
  **Файлы:** `crates/api/src/items/get.rs`, `crates/api/src/http/items.rs`
  **Сделать:** `GET /api/v1/items/{id}`; проверка владельца; `404` для чужих и несуществующих; корректный `400` на некорректный UUID.
  **Проверить:** своя запись → `200`; чужая → `404`; невалидный UUID → `400`; удалённая (в корзине) → `404` без `include_deleted`.
  **Коммит:** `feat(items): read item by id`

- [x] **T33 · Список и пагинация**
  **Файлы:** `crates/api/src/items/list.rs`, `crates/api/src/http/items.rs`
  **Сделать:** курсорная пагинация (base64 от `(sort_key, id)`), `limit` 1–100, сортировки из контракта; стабильный порядок без дублей.
  **Проверить:** 60 записей читаются тремя страницами по 20 без дублей и пропусков; `limit=0` и `limit=101` → `400`; битый курсор → `400`; сортировка по рейтингу корректна.
  **Коммит:** `feat(items): paginate item list`

- [x] **T34 · Обновление записи**
  **Файлы:** `crates/api/src/items/update.rs`, `crates/api/src/http/items.rs`
  **Сделать:** `PATCH /api/v1/items/{id}` с частичным обновлением; обновление `updated_at`; замена набора тегов; `404` для чужих.
  **Проверить:** изменение только `rating` не трогает остальные поля; пустой `PATCH` → `400`; невалидное значение → `400`; `updated_at` изменился.
  **Коммит:** `feat(items): update items`

- [x] **T35 · Мягкое удаление и восстановление**
  **Файлы:** `crates/api/src/items/delete.rs`, `crates/api/src/http/items.rs`
  **Сделать:** `DELETE /items/{id}` → `deleted_at`; `POST /items/{id}/restore`; параметр `include_deleted=true` для списка.
  **Проверить:** после удаления запись не видна; `include_deleted=true` показывает её; восстановление возвращает в список; повторное удаление → `404`.
  **Коммит:** `feat(items): soft delete and restore`

- [x] **T36 · Управление тегами**
  **Файлы:** `crates/api/src/items/tags.rs`, `crates/api/src/http/tags.rs`, `crates/api/src/http/mod.rs`
  **Сделать:** `GET /api/v1/tags` с количеством записей; привязка тегов при создании и обновлении; `DELETE /api/v1/tags/{id}`.
  **Проверить:** тег создаётся один раз при повторном использовании; счётчик совпадает с числом записей; удаление тега отвязывает его, но не удаляет записи; чужой тег → `404`.
  **Коммит:** `feat(items): manage tags`

- [x] **T37 · Фильтры**
  **Файлы:** `crates/api/src/items/filters.rs`, `crates/api/src/items/list.rs`
  **Сделать:** фильтры `kind`, `status`, `tag`, `year_from`, `year_to`, `rating_min`, `rating_max`; комбинирование через `AND`; параметризованные запросы.
  **Проверить:** комбинация «kind=movie & rating_min=8» даёт только подходящие; несуществующий тег → пустой список без ошибки; `rating_min=11` → `400`.
  **Коммит:** `feat(items): filter item list`

- [x] **T38 · Поиск**
  **Файлы:** `migrations/0008_search.sql`, `crates/api/src/items/search.rs`
  **Сделать:** расширение `pg_trgm`; GIN-индексы; поиск по `title`, `subtitle`, `review` с ранжированием; учёт регистра и раскладки не требуется, но `ILIKE` и триграммы должны работать.
  **Проверить:** поиск «интер» находит «Interstellar»; поиск по слову из заметки находит запись; пустой `q` игнорируется; поиск не возвращает чужие записи; время на 10 000 записей < 100 мс.
  **Коммит:** `feat(items): search by title and review`

- [x] **T39 · Правила статусов**
  **Файлы:** `crates/core/src/items/validate.rs` (реализовано в T31), `crates/api/tests/items.rs`
  **Сделать:** допустимость статуса по типу записи (`movie` и `image` не могут быть `in_progress`); проверка при создании и обновлении, включая смену типа вместе со статусом.
  **Проверить:** `movie` + `in_progress` → `400` с `details.field = "status"`; `book` + `in_progress` разрешён; изменение статуса на допустимый проходит; смена типа проверяется против нового типа.
  **Коммит:** `test(items): cover status rules`
  **Итог:** правило живёт в `jey_core::items::validate::status_allowed` и проверяется в создании (T31) и обновлении (T34); T39 добавила HTTP-тесты на все случаи.

- [x] **T40 · Оценки и рецензии**
  **Файлы:** `crates/api/src/items/validation.rs`
  **Сделать:** границы оценки 1–10; лимит рецензии 20 000 символов; обрезка пробелов; запрет управляющих символов.
  **Проверить:** `rating = 0` и `11` → `400`; рецензия из 20 001 символа → `400`; переводы строк сохраняются; управляющие символы вычищаются.
  **Коммит:** `feat(items): validate rating and review`

- [x] **T41 · Статистика**
  **Файлы:** `crates/api/src/stats/mod.rs`, `crates/api/src/http/stats.rs`
  **Сделать:** `GET /api/v1/stats`: всего, по типам, по статусам, средняя оценка, по годам; один запрос с агрегатами, без N+1.
  **Проверить:** цифры совпадают с ручным подсчётом на сидах; пустой аккаунт → нули, а не `null`; удалённые записи не учитываются; время < 50 мс на 10 000 записей.
  **Коммит:** `feat(stats): aggregate user statistics`

- [x] **T42 · Индексы и планы запросов**
  **Файлы:** `migrations/0009_indexes.sql`, `docs/perf.md`
  **Сделать:** прогнать `EXPLAIN ANALYZE` на списке, фильтрах и поиске с 10 000 записей; добавить недостающие индексы; записать планы и замеры в `docs/perf.md`.
  **Проверить:** ни один ключевой запрос не делает `Seq Scan`; время списка < 50 мс; документ содержит дату, конфигурацию и цифры до/после.
  **Коммит:** `perf(db): add indexes for item queries`

- [x] **T43 · Экспорт и импорт JSON**
  **Файлы:** `crates/api/src/export/mod.rs`, `crates/api/src/import/mod.rs`, `crates/api/src/http/mod.rs`
  **Сделать:** `GET /api/v1/export?format=json` — все записи и теги; `GET ...?format=csv`; `POST /api/v1/import` — идемпотентно по `id`, с валидацией и отчётом.
  **Проверить:** экспорт содержит все записи и восстанавливается импортом в пустой аккаунт; повторный импорт ничего не дублирует; битый JSON → `400` без частичного импорта; CSV открывается в таблице.
  **Коммит:** `feat(export): export and import user data`

- [x] **T44 · Сиды для разработки**
  **Файлы:** `scripts/seed.sh`, `crates/api/src/bin/seed.rs`
  **Сделать:** генерация пользователя и 200 записей разных типов с тегами и оценками; запуск против `DATABASE_URL`; защита от запуска в проде.
  **Проверить:** `bash scripts/seed.sh` создаёт данные; повторный запуск не дублирует (или создаёт нового пользователя); попытка запуска с `APP_ENV=prod` отклоняется.
  **Коммит:** `chore(dev): add seed data generator`

---

## M4 · Интерфейс

- [x] **T45 · Каркас Next.js**
  **Файлы:** `frontend/package.json`, `frontend/tsconfig.json`, `frontend/app/globals.css`, `frontend/app/layout.tsx`, `frontend/app/page.tsx`
  **Сделать:** Next.js (App Router), TypeScript strict, нативный CSS + CSS Modules (без Tailwind); структура `app/`, `components/`, `lib/`; глобальные переменные темы; страница-заглушка; проксирование `/api` на бэкенд в dev.
  **Проверить:** `npm run dev` открывает страницу; `npm run build` проходит; `npm run lint` без ошибок; запрос к `/api/v1/health` из браузера доходит до бэкенда.
  **Коммит:** `feat(web): bootstrap next.js application`

- [x] **T46 · Базовые компоненты**
  **Файлы:** `frontend/components/ui/*`, `frontend/app/globals.css`
  **Сделать:** токены (цвета, отступы, радиусы, типографика) в CSS-переменных; компоненты `Button`, `Input`, `Textarea`, `Select`, `Card`, `Dialog`, `Badge`, `Skeleton` на CSS Modules; тёмная тема через переменные.
  **Проверить:** компоненты отображаются на демо-странице; фокус видим; тёмная тема переключается; нет хардкода цветов вне токенов.
  **Коммит:** `feat(web): add design tokens and base components`

- [x] **T47 · API-клиент**
  **Файлы:** `frontend/lib/api.ts`, `frontend/lib/types.ts`, `frontend/lib/errors.ts`
  **Сделать:** типы запросов и ответов по `docs/protocol.md`; `fetch` с `credentials: "include"`; разбор ошибок в `{code, message, details}`; единая функция `request`.
  **Проверить:** ошибка `401` приводит к редиректу на вход; `400` возвращает типизированную ошибку; типы совпадают с ответами бэкенда (ручная сверка на 3 эндпоинтах).
  **Коммит:** `feat(web): add typed api client`

- [x] **T48 · Страница регистрации**
  **Файлы:** `frontend/app/(auth)/register/page.tsx`, `frontend/components/forms/register-form.tsx`
  **Сделать:** форма (email, пароль, имя); клиентская валидация zod; показ ошибок по полям; после успеха — переход в каталог.
  **Проверить:** невалидный email подсвечивается; серверная ошибка `409` показывается у поля email; успешная регистрация ведёт в каталог; форма работает с клавиатуры.
  **Коммит:** `feat(web): add registration page`

- [x] **T49 · Вход и выход**
  **Файлы:** `frontend/app/(auth)/login/page.tsx`, `frontend/components/forms/login-form.tsx`, `frontend/components/logout-button.tsx`
  **Сделать:** форма входа; состояние пользователя в контексте; выход с очисткой состояния; редирект после входа.
  **Проверить:** неверный пароль показывает общее сообщение; после входа имя видно в шапке; выход возвращает на страницу входа; обновление страницы сохраняет сессию.
  **Коммит:** `feat(web): add login and logout`

- [x] **T50 · Защита приватных маршрутов**
  **Файлы:** `frontend/middleware.ts`, `frontend/app/(app)/layout.tsx`
  **Сделать:** проверка сессии на сервере; редирект неавторизованных на `/login` с `next`-параметром; возврат после входа.
  **Проверить:** прямой заход на `/items` без сессии → редирект; после входа возвращает на исходный адрес; авторизованный не попадает на `/login`.
  **Коммит:** `feat(web): protect private routes`

- [x] **T51 · Список записей**
  **Файлы:** `frontend/app/(app)/items/page.tsx`, `frontend/components/items/item-list.tsx`, `frontend/components/items/filters.tsx`
  **Сделать:** список карточек; фильтры (тип, статус, тег); сортировка; подгрузка по курсору; состояние в URL.
  **Проверить:** фильтры меняют список и попадают в URL; «показать ещё» добавляет страницу; пустой результат показывает заглушку; на 360 px карточки не ломаются.
  **Коммит:** `feat(web): show item list with filters`

- [x] **T52 · Карточка записи**
  **Файлы:** `frontend/app/(app)/items/[id]/page.tsx`
  **Сделать:** детальный экран: обложка, метаданные, оценка, рецензия, теги, даты; кнопки редактирования и удаления.
  **Проверить:** открывается по ссылке; чужая запись → страница 404; длинная рецензия не ломает вёрстку; кнопки ведут на нужные действия.
  **Коммит:** `feat(web): add item details page`

- [x] **T53 · Форма создания**
  **Файлы:** `frontend/app/(app)/items/new/page.tsx`, `frontend/components/forms/item-form.tsx`
  **Сделать:** выбор типа; поля, зависящие от типа; теги; оценка; после сохранения — переход на карточку.
  **Проверить:** при `movie` показываются режиссёр и год, при `book` — автор; обязательное название; ошибка сервера показывается по полю; создание занимает < 20 секунд по таймеру.
  **Коммит:** `feat(web): create items from ui`

- [x] **T54 · Редактирование и удаление**
  **Файлы:** `frontend/app/(app)/items/[id]/edit/page.tsx`, `frontend/components/items/delete-dialog.tsx`
  **Сделать:** предзаполненная форма; сохранение; подтверждение удаления; восстановление из корзины.
  **Проверить:** изменения сохраняются и видны сразу; удаление требует подтверждения; после удаления карточка исчезает из списка; восстановление возвращает её.
  **Коммит:** `feat(web): edit and delete items`

- [x] **T55 · Поиск**
  **Файлы:** `frontend/components/items/search-box.tsx`, `frontend/app/(app)/items/page.tsx`
  **Сделать:** поле поиска с debounce 300 мс; синхронизация с URL; сброс; подсветка совпадений в названии.
  **Проверить:** ввод обновляет список без перезагрузки; `q` сохраняется в URL и переживает обновление страницы; очистка возвращает полный список; запросы не уходят на каждый символ.
  **Коммит:** `feat(web): search items`

- [x] **T56 · Теги в интерфейсе**
  **Файлы:** `frontend/components/items/tag-input.tsx`, `frontend/app/(app)/tags/page.tsx`
  **Сделать:** ввод тегов с автодополнением; создание на лету; страница тегов с количеством; удаление.
  **Проверить:** тег создаётся по Enter; повторный ввод не дублирует; удаление тега не удаляет записи; автодополнение работает с клавиатуры.
  **Коммит:** `feat(web): manage tags in ui`

- [x] **T57 · Дашборд статистики**
  **Файлы:** `frontend/app/(app)/dashboard/page.tsx`, `frontend/components/stats/*`
  **Сделать:** карточки с итогами; график по месяцам; распределение по типам и статусам; адаптивная сетка.
  **Проверить:** цифры совпадают с API; пустой аккаунт показывает нули и приглашение добавить запись; график читается на телефоне.
  **Коммит:** `feat(web): show statistics dashboard`

- [x] **T58 · Профиль и настройки**
  **Файлы:** `frontend/app/(app)/settings/page.tsx`, `frontend/components/forms/settings-form.tsx`
  **Сделать:** изменение имени, локали, приватности; смена пароля; удаление аккаунта с подтверждением; выход со всех устройств.
  **Проверить:** изменения сохраняются; смена пароля требует текущий; удаление аккаунта просит пароль и ввод слова; после удаления сессия завершается.
  **Коммит:** `feat(web): add settings page`

- [x] **T59 · Тёмная тема и адаптив**
  **Файлы:** `frontend/components/theme-toggle.tsx`, `frontend/app/globals.css`
  **Сделать:** переключатель темы с сохранением выбора; учёт системной темы; брейкпоинты для 360/768/1200.
  **Проверить:** выбор переживает перезагрузку; системная тема применяется при первом входе; на 360 px нет горизонтального скролла.
  **Коммит:** `feat(web): add dark theme and responsive layout`

- [x] **T60 · Ошибки и уведомления**
  **Файлы:** `frontend/components/toasts.tsx`, `frontend/lib/messages.ts`
  **Сделать:** сопоставление кодов ошибок с русскими текстами; стек до трёх уведомлений; автоскрытие; `request_id` в деталях для поддержки.
  **Проверить:** `rate_limited` показывает текст про лимит и время; `validation_error` — конкретное поле; уведомления не перекрывают кнопки; `request_id` копируется.
  **Коммит:** `feat(web): show human-readable errors`

- [x] **T61 · Пустые состояния и загрузка**
  **Файлы:** `frontend/components/empty-state.tsx`, `frontend/components/skeletons.tsx`
  **Сделать:** скелетоны для списка и карточек; пустые состояния с призывом к действию; обработка ошибки загрузки с кнопкой «повторить».
  **Проверить:** при медленной сети виден скелетон, а не пустой экран; пустой список предлагает добавить запись; ошибка сети показывает «повторить» и не ломает страницу.
  **Коммит:** `feat(web): add empty and loading states`

- [x] **T62 · Доступность**
  **Файлы:** `frontend/app/**`, `frontend/components/**`
  **Сделать:** видимый фокус, `aria`-подписи, корректные `label`, навигация с клавиатуры, порядок табуляции, контраст AA.
  **Проверить:** весь сценарий проходится с клавиатуры; `axe` не находит критичных нарушений; фокус не теряется в модальных окнах; контраст текста ≥ 4.5:1.
  **Коммит:** `feat(web): improve accessibility`

---

## M5 · Медиа

- [x] **T63 · Приём загрузок**
  **Файлы:** `crates/api/src/media/upload.rs`, `crates/api/src/http/uploads.rs`, `migrations/0010_uploads.sql`
  **Сделать:** `POST /api/v1/uploads`, `multipart/form-data`; лимит 10 МБ; проверка MIME по сигнатуре, а не по расширению; запись в `uploads`.
  **Проверить:** JPEG/PNG/WebP принимаются; `.txt` с расширением `.jpg` отклоняется `415`; файл 11 МБ → `413`; без сессии → `401`.
  **Коммит:** `feat(media): accept image uploads`

- [x] **T64 · Ресайз и превью**
  **Файлы:** `crates/api/src/media/transform.rs`
  **Сделать:** декодирование, поворот по EXIF, ресайз до 400 и 1200 px по длинной стороне, перекодирование в WebP; отказ на битых файлах.
  **Проверить:** изображение 4000×3000 даёт превью и большое WebP; битый файл → `415`; EXIF-поворот учтён; размер большого файла < 300 КБ.
  **Коммит:** `feat(media): resize and convert uploaded images`

- [x] **T65 · Хранилище медиа**
  **Файлы:** `crates/api/src/media/storage.rs`
  **Сделать:** структура `LocalStorage` (`put`, `get`, `delete`, `url`) без трейта — вторая реализация не планируется; корень `var/media/`; ключи `u/{user_id}/{uuid}/{variant}`; оригинал хранится со своим расширением, производные — `.webp`.
  **Проверить:** файлы ложатся по ключам; повторная запись того же ключа перезаписывает; удаление убирает файл; `url` возвращает корректный путь; ключ с `..` отклоняется.
  **Коммит:** `feat(media): add local media storage`

- [x] **T66 · Обложки записей**
  **Файлы:** `crates/api/src/items/cover.rs`, `crates/api/src/http/items.rs`, `frontend/components/items/cover-picker.tsx`
  **Сделать:** загрузка обложки из формы записи; привязка `cover_key`; замена; удаление.
  **Проверить:** обложка видна в списке и карточке; замена удаляет старый файл; удаление записи не оставляет файл (после T70).
  **Коммит:** `feat(media): attach covers to items`

- [x] **T67 · Отдача медиа**
  **Файлы:** `crates/api/src/http/media.rs`
  **Сделать:** `GET /media/{key}`; `ETag`, `Cache-Control: public, max-age=31536000, immutable`; защита от path traversal; приватные файлы — только владельцу.
  **Проверить:** повторный запрос возвращает `304`; чужой приватный файл → `403`; ключ с `..` отвергается; заголовки кэша присутствуют.
  **Коммит:** `feat(media): serve images with caching`

- [x] **T68 · Квоты**
  **Файлы:** `crates/api/src/media/quota.rs`
  **Сделать:** лимит на пользователя (по умолчанию 200 МБ); подсчёт по `uploads`; отказ `413` с текущим использованием.
  **Проверить:** при превышении загрузка отклоняется с понятным сообщением; удаление файлов освобождает квоту; лимит настраивается конфигом.
  **Коммит:** `feat(media): enforce per-user storage quota`

- [x] **T69 · Аватары**
  **Файлы:** `crates/api/src/users/avatar.rs`, `frontend/components/profile/avatar.tsx`
  **Сделать:** загрузка аватара, кроп по центру, ресайз 128 px; отображение в шапке и профиле; удаление.
  **Проверить:** квадратный аватар не искажается; после замены старый файл удалён; в списках используется превью.
  **Коммит:** `feat(media): add profile avatars`

- [x] **T70 · Сборка мусора**
  **Файлы:** `crates/api/src/media/gc.rs`, `crates/api/src/bin/gc.rs`
  **Сделать:** поиск файлов без ссылок из `items.cover_key` и `users.avatar_key` старше суток; удаление; отчёт.
  **Проверить:** осиротевший файл удаляется, используемый — нет; свежий файл не трогается; запуск идемпотентен; отчёт показывает количество.
  **Коммит:** `feat(media): collect orphaned files`

---

## M6 · Деплой

- [x] **T71 · Провижининг VPS**
  **Файлы:** `docs/deploy.md`, `scripts/provision.sh`
  **Сделать:** пользователь `jey` без root-входа, SSH-ключи, `ufw` (22/80/443), swap 2 ГБ, `unattended-upgrades`, часовой пояс, лимиты файловых дескрипторов.
  **Проверить:** вход по паролю запрещён; `sudo -l` для сервисного пользователя ограничен; swap активен; после перезагрузки всё поднимается.
  **Коммит:** `chore(deploy): provision vps with ssh, firewall and swap`

- [x] **T72 · PostgreSQL на сервере**
  **Файлы:** `docs/deploy.md`
  **Сделать:** установка Postgres; настройки под 2 ГБ (`shared_buffers=256MB`, `work_mem=4MB`, `max_connections=30`); отдельный пользователь БД; доступ только с localhost; лимит логов.
  **Проверить:** сервис запускается после перезагрузки; подключение снаружи закрыто; миграции применяются; память процесса в пределах ожиданий.
  **Коммит:** `chore(deploy): configure postgresql for small vps`

- [x] **T73 · API как systemd-сервис**
  **Файлы:** `deploy/jey-api.service`, `docs/deploy.md`
  **Сделать:** unit с `Restart=always`, отдельным пользователем, `EnvironmentFile`, лимитом памяти; деплой артефакта из CI по `rsync`.
  **Проверить:** сервис стартует после перезагрузки; падение процесса приводит к перезапуску; логи идут в journald; `/health` отвечает.
  **Коммит:** `chore(deploy): run api as systemd service`

- [ ] **T74 · Caddy и домен**
  **Файлы:** `deploy/Caddyfile`, `docs/deploy.md`
  **Сделать:** Caddy с автоматическим TLS; прокси `/api/*` в API; статика фронтенда; заголовки безопасности; сжатие; лимит тела запроса.
  **Проверить:** `https://домен` открывается с валидным сертификатом; `http` редиректит на `https`; заголовки присутствуют; `/api/v1/health` доступен.
  **Коммит:** `chore(deploy): configure caddy with tls and security headers`

- [ ] **T75 · Деплой фронтенда**
  **Файлы:** `deploy/frontend.md`, `.github/workflows/deploy.yml`
  **Сделать:** сборка Next.js в CI; выкладка статики и SSR-сервера (или экспорт в статику) на сервер; переменные окружения с адресом API.
  **Проверить:** после деплоя все страницы открываются; ассеты отдаются с CDN/сервера; смена API-URL не требует пересборки кода.
  **Коммит:** `chore(deploy): deploy frontend from ci`

- [ ] **T76 · Секреты**
  **Файлы:** `docs/deploy.md`
  **Сделать:** `.env` с правами `600`; ротация `SESSION_SECRET`; чек-лист при компрометации; запрет вывода секретов в логи.
  **Проверить:** права файла `600`; секреты не попадают в `git log`; в логах нет значений токенов и паролей; процедура ротации описана.
  **Коммит:** `docs(deploy): describe secret management`

- [ ] **T77 · Бэкапы БД (отложено)**
  **Файлы:** `deploy/backup.sh`, `docs/deploy.md`
  **Сделать:** сознательно отложено до роста проекта. Тогда: `pg_dump` по cron, сжатие, копия на отдельный носитель вне сервера, ротация 7 дней, проверка восстановления раз в месяц.
  **Проверить:** при реализации — дамп создаётся по расписанию; восстановление в чистую БД проходит; старые копии удаляются.
  **Коммит:** `chore(deploy): add scheduled database backups`

- [ ] **T78 · Мониторинг**
  **Файлы:** `docs/monitoring.md`, `deploy/healthcheck.sh`
  **Сделать:** внешний uptime-чек на `/health`; проверка диска и памяти; алерт при недоступности; ротация логов.
  **Проверить:** остановка сервиса приводит к алерту; диск заполнен на 80% — предупреждение; логи не растут бесконечно.
  **Коммит:** `chore(deploy): add uptime and resource monitoring`

- [ ] **T79 · Миграции в проде**
  **Файлы:** `docs/deploy.md`, `scripts/deploy.sh`
  **Сделать:** порядок деплоя: бэкап → миграции → новый бинарник → проверка `/health/ready`; откат по инструкции; запрет разрушающих миграций без согласования.
  **Проверить:** деплой на стейдже проходит по шагам; падение миграции останавливает деплой; откат возвращает предыдущую версию.
  **Коммит:** `docs(deploy): describe migration and rollback procedure`

- [ ] **T80 · Нагрузочная проверка**
  **Файлы:** `docs/perf.md`
  **Сделать:** прогон `hey` или `wrk` на ключевых эндпоинтах (список, карточка, поиск) при 50 и 100 RPS; замеры p50/p95; выводы.
  **Проверить:** p95 < 300 мс на 50 RPS; ошибок 5xx нет; узкие места зафиксированы с рекомендациями.
  **Коммит:** `docs(perf): record load test results`

- [ ] **T81 · Runbook**
  **Файлы:** `docs/runbook.md`
  **Сделать:** что делать при падении API, БД, диска, TLS, утечке секретов; где логи; как восстановить; контакты.
  **Проверить:** сценарии проверены на стейдже или мысленно пройдены; каждый шаг команды выполним; время реакции указано.
  **Коммит:** `docs: add incident runbook`

---

## M7 · Полировка

- [ ] **T82 · Экспорт в интерфейсе**
  **Файлы:** `frontend/app/(app)/settings/page.tsx`, `frontend/components/export-panel.tsx`
  **Сделать:** кнопки «Экспорт JSON» и «CSV», показ размера, уведомление о готовности.
  **Проверить:** файл скачивается и открывается; данные полные; на мобильном тоже работает.
  **Коммит:** `feat(web): export data from ui`

- [ ] **T83 · Публичный профиль и приватность**
  **Файлы:** `crates/api/src/users/public.rs`, `frontend/app/(public)/u/[handle]/page.tsx`
  **Сделать:** публичный профиль по настройке; что показывать (только записи `done`); отключение по умолчанию; ссылка «поделиться».
  **Проверить:** при выключенной настройке профиль отдаёт `404`; при включённой видны только разрешённые записи; приватные заметки не утекают.
  **Коммит:** `feat(users): add public profiles with privacy settings`

- [ ] **T84 · SEO и метаданные**
  **Файлы:** `frontend/app/layout.tsx`, `frontend/app/(public)/**`
  **Сделать:** `title`, `description`, OG-теги, `sitemap.xml`, `robots.txt`; корректные заголовки для публичных страниц.
  **Проверить:** OG-превью корректно; sitemap содержит публичные страницы; приватные закрыты в `robots.txt`.
  **Коммит:** `feat(web): add seo metadata and sitemap`

- [ ] **T85 · Правовые страницы**
  **Файлы:** `frontend/app/(public)/privacy/page.tsx`, `frontend/app/(public)/terms/page.tsx`
  **Сделать:** политика конфиденциальности (какие данные, зачем, сроки), условия использования, инструкция по удалению аккаунта, контакт.
  **Проверить:** страницы доступны без авторизации; текст соответствует фактическому поведению приложения.
  **Коммит:** `docs(legal): add privacy policy and terms`

- [ ] **T86 · Аудит безопасности**
  **Файлы:** `docs/security.md`
  **Сделать:** проверка заголовков (CSP, HSTS, X-Content-Type-Options), `cargo audit`, `npm audit`, тесты на CSRF и IDOR, проверка лимитов; устранение найденного.
  **Проверить:** `cargo audit` без критичных; чужой объект недоступен (IDOR); запрос без `Origin` отклонён; CSP не ломает интерфейс.
  **Коммит:** `fix(security): resolve audit findings`

- [ ] **T87 · Производительность**
  **Файлы:** `docs/perf.md`, правки в коде
  **Сделать:** профилирование горячих запросов, кэширование неизменяемых ответов, оптимизация бандла, ленивые изображения.
  **Проверить:** LCP < 2,5 с на 4G; список из 100 записей рендерится < 500 мс; бандл первой страницы < 200 КБ gzip.
  **Коммит:** `perf: optimize queries and frontend bundle`

- [ ] **T88 · Документация API**
  **Файлы:** `docs/openapi.yaml`, `docs/api.md`
  **Сделать:** OpenAPI 3.1 по фактическому контракту; примеры запросов; генерация клиентских типов (опционально).
  **Проверить:** валидатор OpenAPI без ошибок; примеры соответствуют реальным ответам; покрыты все эндпоинты v1.
  **Коммит:** `docs(api): publish openapi specification`

- [ ] **T89 · Лендинг**
  **Файлы:** `frontend/app/(public)/page.tsx`
  **Сделать:** главная: что это, скриншоты, преимущества, кнопка регистрации; без маркетингового шума.
  **Проверить:** страница грузится быстро; CTA ведёт на регистрацию; на мобильном читается; нет битых ссылок.
  **Коммит:** `feat(web): add landing page`

- [ ] **T90 · Релиз 0.1.0**
  **Файлы:** `CHANGELOG.md`, `README.md`
  **Сделать:** changelog, версия 0.1.0, тег, скриншоты, инструкция запуска, проверка всех критериев приёмки из `docs/spec.md`.
  **Проверить:** `git tag --list` содержит `v0.1.0`; `/health` отдаёт `0.1.0`; критерии приёмки MVP выполнены; README актуален.
  **Коммит:** `chore(release): prepare 0.1.0`

- [ ] **T91 · Бэклог и ретроспектива**
  **Файлы:** `docs/backlog.md`, `docs/retrospective.md`
  **Сделать:** следующие шаги (внешние API, друзья, лента, мобильное приложение, i18n, рекомендации) с приоритетами; ретроспектива: что заняло больше времени, что переделал бы.
  **Проверить:** бэклог содержит не менее 15 задач с оценкой; ретроспектива отвечает на три вопроса; приоритеты согласованы с владельцем.
  **Коммит:** `docs: add post-mvp backlog and retrospective`

---

## M8 · Десктоп и синхронизация

- [ ] **T92 · Каркас десктопного приложения (Tauri)**
  **Файлы:** `crates/desktop/Cargo.toml`, `crates/desktop/tauri.conf.json`, `crates/desktop/src/main.rs`
  **Сделать:** Tauri-оболочка, окно приложения, загрузка статической сборки фронтенда, команда `app_version`; сборка под Linux.
  **Проверить:** `cargo tauri build` собирает AppImage; окно открывается без запущенного сервера; версия видна в интерфейсе.
  **Коммит:** `feat(desktop): bootstrap tauri application`

- [ ] **T93 · Локальная база SQLite и миграции клиента**
  **Файлы:** `crates/desktop/src/store/mod.rs`, `crates/desktop/migrations/0001_init.sql`
  **Сделать:** БД в каталоге данных пользователя; схема-зеркало плюс служебные таблицы `sync_state`, `outbox`, `conflicts`; `journal_mode=WAL`, `busy_timeout`.
  **Проверить:** БД создаётся при первом запуске; повторный запуск не дублирует миграции; данные переживают перезапуск; путь к БД виден в настройках.
  **Коммит:** `feat(desktop): add local sqlite store`

- [ ] **T94 · Репозитории core поверх SQLite**
  **Файлы:** `crates/desktop/src/store/repo.rs`, `crates/desktop/tests/repo.rs`
  **Сделать:** реализовать трейты репозиториев из `jey-core` для SQLite; один и тот же набор контрактных тестов гонять против Postgres и SQLite.
  **Проверить:** контрактные тесты зелёные на обоих хранилищах; поведение CRUD идентично; расхождений в ошибках нет.
  **Коммит:** `feat(desktop): implement core repositories for sqlite`

- [ ] **T95 · Офлайн-режим: управление записями без сервера**
  **Файлы:** `crates/desktop/src/commands/items.rs`, `crates/desktop/src/ui/items/*`
  **Сделать:** создание, правка, удаление, теги и поиск по локальной базе без сети; UUID генерируются на клиенте; признак «ожидает синхронизации».
  **Проверить:** всё работает при выключенной сети; после перезапуска данные на месте; неснхронизированные записи помечены в списке.
  **Коммит:** `feat(desktop): support offline item management`

- [ ] **T96 · Регистрация устройства**
  **Файлы:** `crates/api/src/http/devices.rs`, `crates/desktop/src/sync/device.rs`
  **Сделать:** `POST /api/v1/devices` при первом входе; `X-Device-Id` в sync-запросах; привязка сессии к устройству; идемпотентность по идентификатору установки.
  **Проверить:** устройство появляется в БД; повторная регистрация не создаёт дубль; sync-запрос без `X-Device-Id` отклоняется `400`.
  **Коммит:** `feat(sync): register devices`

- [ ] **T97 · Присвоение sync_seq на сервере**
  **Файлы:** `migrations/0012_sync_seq.sql`, `crates/api/src/sync/seq.rs`
  **Сделать:** последовательность на пользователя, присвоение `sync_seq` при каждом изменении (включая удаление), индексы `(user_id, sync_seq)`.
  **Проверить:** каждое изменение получает уникальный возрастающий номер; надгробия тоже; `EXPLAIN` показывает использование индекса.
  **Коммит:** `feat(sync): assign server sequence numbers`

- [ ] **T98 · POST /sync/push**
  **Файлы:** `crates/api/src/sync/push.rs`, `docs/protocol.md`
  **Сделать:** приём пачки изменений с `revision`; проверка владельца; применение в транзакции; идемпотентность по `(device_id, client_batch_id)`; ответ со списком принятых и конфликтов.
  **Проверить:** повторная отправка той же пачки не дублирует данные; устаревшая `revision` даёт конфликт; чужие записи отклоняются `403`.
  **Коммит:** `feat(sync): accept pushed changes`

- [ ] **T99 · GET /sync/pull**
  **Файлы:** `crates/api/src/sync/pull.rs`
  **Сделать:** выдача записей с `sync_seq > since`, включая надгробия; лимит и курсор; строгий порядок по `sync_seq`.
  **Проверить:** клиент с `since=0` получает всё; повторный pull с новым `since` — только изменения; удалённые приходят с `deleted_at`.
  **Коммит:** `feat(sync): stream changes to clients`

- [ ] **T100 · GET /sync/status**
  **Файлы:** `crates/api/src/sync/status.rs`
  **Сделать:** текущий `last_seq` пользователя и количество изменений после `since`; дешёвый запрос без чтения записей.
  **Проверить:** ответ < 5 мс на 10 000 записей; цифры совпадают с результатом pull.
  **Коммит:** `feat(sync): expose sync status`

- [ ] **T101 · Конфликты и конфликтные копии**
  **Файлы:** `crates/core/src/sync/merge.rs`, `crates/api/src/sync/conflicts.rs`, `crates/desktop/src/sync/conflicts.rs`
  **Сделать:** проигравшую версию сохранять в `conflicts`; показывать раздел «Расхождения» с выбором версии; правило разрешения — по `docs/sync.md`.
  **Проверить:** конфликт не теряет текст; выбор версии применяется и уезжает на другие устройства; тесты покрывают все случаи из документа.
  **Коммит:** `feat(sync): keep conflict copies`

- [ ] **T102 · Кнопка Sync и уведомление об изменениях**
  **Файлы:** `crates/desktop/src/ui/sync.rs`, `crates/desktop/src/sync/worker.rs`
  **Сделать:** кнопка «Синхронизировать» с прогрессом и результатом; фоновый опрос `/sync/status`; баннер «есть изменения в вебе».
  **Проверить:** правка в вебе даёт баннер в течение 30 с; Sync убирает баннер; ошибки сети показываются понятным текстом; повторный Sync безопасен.
  **Коммит:** `feat(desktop): sync button and change notifications`

- [ ] **T103 · Автосинхронизация веба**
  **Файлы:** `frontend/lib/sync.ts`, `frontend/components/sync-indicator.tsx`
  **Сделать:** веб после каждого изменения сразу отправляет его на сервер; при открытии и возврате фокуса забирает чужие изменения; конфликты показывает тем же способом.
  **Проверить:** правка в вебе видна на десктопе после Sync; правка на десктопе после push видна в вебе без перезагрузки; конфликт отображается.
  **Коммит:** `feat(web): keep the web client in sync`

- [ ] **T104 · Тесты синхронизации**
  **Файлы:** `crates/api/tests/sync.rs`, `crates/desktop/tests/sync.rs`
  **Сделать:** сценарии: два устройства без сети; удаление против правки; повторная отправка; третий клиент догоняет; обрыв связи посреди push; полный pull нового устройства.
  **Проверить:** все сценарии зелёные; после каждого состояние на устройствах совпадает; ни одна запись не потеряна.
  **Коммит:** `test(sync): cover offline and conflict scenarios`

- [ ] **T105 · Упаковка и релиз 0.2.0**
  **Файлы:** `CHANGELOG.md`, `crates/desktop/tauri.conf.json`, `docs/release-desktop.md`
  **Сделать:** AppImage и `.deb`, иконки, версия 0.2.0, инструкция установки и обновления, тег.
  **Проверить:** AppImage запускается на чистой системе; данные лежат в стандартном каталоге; обновление с 0.1 сохраняет базу и сессию.
  **Коммит:** `chore(release): prepare 0.2.0`
