# ROADMAP — jey.net

План работ: 89 задач со сквозной нумерацией `T01`–`T89`.
Стек: Rust (edition 2024) + axum + sqlx + PostgreSQL, фронтенд Next.js + TypeScript.
Ветка разработки: `main`. Деплой: VPS + Caddy + systemd.

---

## Как мы работаем

1. Ты называешь задачу: «ЗАДАЧА 5» или «делаем T12».
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
| **M1 · Аккаунты** | T10–T25 | Регистрация, вход, сессии, сброс пароля, подтверждение email, профиль |
| **M2 · Записи** | T26–T42 | CRUD записей, теги, фильтры, поиск, статистика, экспорт и импорт |
| **M3 · Интерфейс** | T43–T60 | Все экраны: список, карточка, формы, поиск, статистика, настройки |
| **M4 · Медиа** | T61–T68 | Загрузка, ресайз, хранение, обложки, квоты, сборка мусора |
| **M5 · Деплой** | T69–T79 | VPS, Postgres, Caddy, TLS, бэкапы, мониторинг, регламент миграций |
| **M6 · Полировка** | T80–T89 | Экспорт в UI, приватность, SEO, безопасность, релиз 0.1.0 |

**Текущий статус:** T01–T03 приняты. Следующая — T04.

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

- [ ] **T04 · Логирование и request id**
  **Файлы:** `backend/src/telemetry.rs`, `backend/src/main.rs`
  **Сделать:** `tracing-subscriber` с двумя форматами: pretty для dev, JSON для prod; `tower-http::TraceLayer`; `X-Request-Id` из запроса или генерация UUID; id попадает в ответ и в каждую запись лога.
  **Проверить:** запрос к `/health` даёт строку лога с `request_id`, `method`, `status`, `latency_ms`; ответ содержит `x-request-id`; переданный клиентом id сохраняется.
  **Коммит:** `feat(api): add structured logging with request ids`

- [ ] **T05 · Единый формат ошибок**
  **Файлы:** `backend/src/error.rs`, `backend/src/main.rs`
  **Сделать:** `AppError` с вариантами `Validation`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `RateLimited`, `Internal`; реализация `IntoResponse` по контракту из `docs/protocol.md`; JSON для 404 и 405 вместо пустого тела.
  **Проверить:** неизвестный путь → `404` с `error.code = "not_found"` и `request_id`; неверный метод → `405`; внутренняя ошибка не раскрывает детали, но пишется в лог.
  **Коммит:** `feat(api): add unified error responses`

- [ ] **T06 · Подключение PostgreSQL**
  **Файлы:** `backend/src/db.rs`, `backend/src/main.rs`, `backend/src/config.rs`
  **Сделать:** `sqlx::PgPool` с настройками (max connections 10, timeout 5 с); проверка соединения на старте; `GET /health/ready` возвращает `503`, если БД недоступна.
  **Проверить:** без `DATABASE_URL` приложение падает на старте с понятным сообщением; с рабочей БД `/health/ready` → `200`; при остановленной БД → `503`; `/health` при этом остаётся `200`.
  **Коммит:** `feat(api): connect to postgres via sqlx pool`

- [ ] **T07 · Миграции и sqlx-cli**
  **Файлы:** `migrations/`, `scripts/db.sh`, `backend/src/main.rs`
  **Сделать:** установка `sqlx-cli`; каталог `migrations/`; скрипт `db.sh` с командами `create`, `migrate`, `drop`, `reset`; применение миграций при старте в dev (флаг `RUN_MIGRATIONS`).
  **Проверить:** `bash scripts/db.sh migrate` применяет миграции и создаёт служебную таблицу; повторный запуск ничего не ломает; `db.sh reset` пересоздаёт чистую БД.
  **Коммит:** `feat(db): introduce migrations workflow`

- [ ] **T08 · CI: сборка и тесты**
  **Файлы:** `.github/workflows/ci.yml`
  **Сделать:** на push и PR: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo build`, `cargo test`; кэш cargo; сервис Postgres в job для интеграционных тестов.
  **Проверить:** workflow зелёный на текущем коммите; искусственно сломанный fmt валит job; лог показывает все шаги.
  **Коммит:** `ci: add build and test workflow`

- [ ] **T09 · Локальный скрипт проверки**
  **Файлы:** `scripts/check.sh`
  **Сделать:** последовательно: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `cargo build --release`; остановка на первой ошибке; понятный вывод.
  **Проверить:** `bash scripts/check.sh` проходит на чистом дереве; при неотформатированном файле возвращает код ≠ 0 и указывает файл; время выполнения < 3 минут.
  **Коммит:** `chore: add local verification script`

---

## M1 · Аккаунты

- [ ] **T10 · Схема users**
  **Файлы:** `migrations/0001_users.sql`
  **Сделать:** расширение `citext`; таблица `users`: `id uuid pk`, `email citext unique not null`, `email_verified_at timestamptz`, `password_hash text not null`, `display_name text not null`, `locale text not null default 'ru'`, `is_public boolean not null default false`, `created_at`, `updated_at`, `deleted_at`; CHECK на длину `display_name`; индекс по `deleted_at`.
  **Проверить:** миграция применяется на чистой БД; дубликат email (в другом регистре) отклоняется; `display_name` длиной 61 символ отклоняется; `updated_at` обновляется триггером.
  **Коммит:** `feat(db): add users table`

- [ ] **T11 · Схема sessions**
  **Файлы:** `migrations/0002_sessions.sql`
  **Сделать:** таблица `sessions`: `id uuid pk`, `user_id uuid not null references users(id) on delete cascade`, `token_hash bytea not null unique`, `created_at`, `last_seen_at`, `expires_at not null`, `ip inet`, `user_agent text`; индексы по `user_id` и `expires_at`.
  **Проверить:** удаление пользователя удаляет его сессии; вставка дубликата `token_hash` отклоняется; запрос «активные сессии пользователя» использует индекс.
  **Коммит:** `feat(db): add sessions table`

- [ ] **T12 · Хеширование паролей**
  **Файлы:** `backend/src/auth/mod.rs`, `backend/src/auth/password.rs`
  **Сделать:** `hash_password`, `verify_password` на argon2id; параметры подобраны замером (цель ~250 мс на хеш); проверка минимальной длины; unit-тесты.
  **Проверить:** `cargo test auth::password` зелёный; корректный пароль проходит, неверный — нет; хеш двух одинаковых паролей различается (соль); время хеширования в логе теста 150–400 мс.
  **Коммит:** `feat(auth): hash passwords with argon2id`

- [ ] **T13 · Регистрация**
  **Файлы:** `backend/src/auth/register.rs`, `backend/src/http/mod.rs`, `backend/src/auth/mod.rs`
  **Сделать:** `POST /api/v1/auth/register`; нормализация email; валидация email, пароля (10–128), `display_name` (1–60); `409` на существующий email; создание пользователя и сессии; ответ `201` с объектом `user` и cookie.
  **Проверить:** `curl` с валидными данными → `201` и `Set-Cookie`; повторный email → `409`; пароль из 9 символов → `400` с `details.field = "password"`; email с пробелами по краям нормализуется.
  **Коммит:** `feat(auth): add registration endpoint`

- [ ] **T14 · Вход**
  **Файлы:** `backend/src/auth/login.rs`, `backend/src/http/mod.rs`
  **Сделать:** `POST /api/v1/auth/login`; поиск по email, проверка пароля; при неверных данных — одинаковый ответ `401` без указания, что именно неверно; создание сессии и cookie `jey_session`; обновление `last_seen_at`.
  **Проверить:** верные данные → `200` и cookie с `HttpOnly`, `SameSite=Lax`, `Path=/`; неверный пароль → `401`; несуществующий email → `401` с тем же временем ответа (±20%).
  **Коммит:** `feat(auth): add login with session cookie`

- [ ] **T15 · Сессия в middleware и GET /me**
  **Файлы:** `backend/src/auth/session.rs`, `backend/src/auth/middleware.rs`, `backend/src/http/mod.rs`
  **Сделать:** извлечение `CurrentUser` из cookie: sha256 токена → поиск активной сессии → пользователь; слой `require_auth`; `GET /api/v1/me`.
  **Проверить:** без cookie → `401`; с валидной cookie → `200` и объект пользователя; после истечения `expires_at` → `401`; чужая/битая cookie → `401`, без паники.
  **Коммит:** `feat(auth): resolve sessions in middleware`

- [ ] **T16 · Выход**
  **Файлы:** `backend/src/auth/logout.rs`, `backend/src/http/mod.rs`
  **Сделать:** `POST /api/v1/auth/logout`; удаление текущей сессии; очистка cookie (`Max-Age=0`).
  **Проверить:** после выхода `/me` → `401`; повторный выход не падает и возвращает `204`; в БД не осталось строки сессии.
  **Коммит:** `feat(auth): add logout`

- [ ] **T17 · Проверка Origin для небезопасных методов**
  **Файлы:** `backend/src/http/origin.rs`, `backend/src/http/mod.rs`
  **Сделать:** для `POST`, `PATCH`, `PUT`, `DELETE` требовать `Origin` или `Referer` из списка `ALLOWED_ORIGINS`; иначе `403`; для `GET`/`HEAD` не проверять.
  **Проверить:** запрос с чужим `Origin` → `403`; со своим → проходит; без заголовка → `403`; `curl` с `Origin: http://localhost:3000` работает при соответствующей настройке.
  **Коммит:** `feat(auth): enforce origin checks for state changes`

- [ ] **T18 · Ограничение частоты попыток**
  **Файлы:** `backend/src/http/ratelimit.rs`, `backend/src/http/mod.rs`
  **Сделать:** лимиты из `docs/protocol.md`: вход 5/мин на IP+email, регистрация 3/час на IP, сброс пароля 3/час на email; `429` с `Retry-After`.
  **Проверить:** 6-й вход за минуту → `429` и `Retry-After`; после окна запрос снова проходит; разные IP не мешают друг другу; лимит не влияет на `GET /me`.
  **Коммит:** `feat(auth): rate limit credential endpoints`

- [ ] **T19 · Интеграционные тесты аутентификации**
  **Файлы:** `backend/tests/auth.rs`, `backend/tests/common/mod.rs`
  **Сделать:** тестовая БД из `TEST_DATABASE_URL`; схема создаётся миграциями; каждый тест работает в своей транзакции или на своей схеме; сценарии: регистрация → вход → `/me` → выход; ошибки валидации; дубликат email.
  **Проверить:** `cargo test --test auth` зелёный; тесты не зависят от порядка запуска; после прогона БД не содержит мусора.
  **Коммит:** `test(auth): cover registration, login and logout`

- [ ] **T20 · Смена пароля**
  **Файлы:** `backend/src/auth/password_change.rs`, `backend/src/http/mod.rs`
  **Сделать:** `POST /api/v1/me/password`; проверка текущего пароля; обновление хеша; удаление всех сессий, кроме текущей.
  **Проверить:** со верным текущим паролем → `204`, старый пароль больше не подходит; неверный текущий → `400`; прочие сессии получают `401`; текущая сессия продолжает работать.
  **Коммит:** `feat(auth): add password change`

- [ ] **T21 · Профиль**
  **Файлы:** `backend/src/users/mod.rs`, `backend/src/users/profile.rs`, `backend/src/http/mod.rs`
  **Сделать:** `GET /api/v1/me` и `PATCH /api/v1/me` (`display_name`, `locale`, `is_public`); валидация; `PATCH` с пустым телом — `400`.
  **Проверить:** изменение `display_name` сохраняется и видно в `GET /me`; невалидное значение → `400`; `locale` принимает только поддерживаемые коды; пустой `PATCH` отклоняется.
  **Коммит:** `feat(users): read and update profile`

- [ ] **T22 · Удаление аккаунта**
  **Файлы:** `backend/src/users/delete.rs`, `backend/src/http/mod.rs`
  **Сделать:** `DELETE /api/v1/me` с подтверждением паролем; мягкое удаление (`deleted_at`), обезличивание email, удаление сессий; фоновое окончательное удаление — отдельной задачей.
  **Проверить:** после удаления вход невозможен; `/me` с прежней cookie → `401`; запись в БД помечена `deleted_at`, email не совпадает ни с одним новым; повторное удаление → `401`.
  **Коммит:** `feat(users): allow account deletion`

- [ ] **T23 · Абстракция почты**
  **Файлы:** `backend/src/mail/mod.rs`, `backend/src/mail/dev.rs`, `backend/src/mail/templates.rs`
  **Сделать:** трейт `Mailer`; dev-транспорт пишет письма в `var/mail/*.eml`; шаблоны подтверждения email и сброса пароля; отправитель из конфига.
  **Проверить:** при `APP_ENV=dev` письмо появляется в `var/mail/` и содержит ссылку; в тестах используется фейковый `Mailer` с запоминанием писем; отсутствие SMTP-настроек не роняет приложение.
  **Коммит:** `feat(mail): add mailer abstraction with dev transport`

- [ ] **T24 · Подтверждение email**
  **Файлы:** `migrations/0003_auth_tokens.sql`, `backend/src/auth/email_verify.rs`, `backend/src/http/mod.rs`
  **Сделать:** одноразовые токены (хеш в БД, срок 24 ч); отправка письма при регистрации; `POST /api/v1/auth/verify-email`; повторная отправка — не чаще раза в 10 минут.
  **Проверить:** письмо содержит рабочую ссылку; после подтверждения `email_verified_at` заполнен; повторное использование токена → `400`; просроченный токен → `400`; частый повторный запрос → `429`.
  **Коммит:** `feat(auth): verify email addresses`

- [ ] **T25 · Сброс пароля**
  **Файлы:** `backend/src/auth/password_reset.rs`, `backend/src/http/mod.rs`
  **Сделать:** `POST /auth/password-reset/request` (всегда `202`, без раскрытия наличия аккаунта) и `POST /auth/password-reset/confirm`; одноразовый токен на 1 час; после сброса — удаление всех сессий.
  **Проверить:** письмо приходит только для существующего email, но ответ одинаковый; новый пароль работает; старый — нет; повторное использование токена → `400`; после сброса все сессии недействительны.
  **Коммит:** `feat(auth): add password reset via email`

---

## M2 · Записи

- [ ] **T26 · Схема items**
  **Файлы:** `migrations/0004_items.sql`
  **Сделать:** таблица `items` по `docs/architecture.md`; CHECK на `kind`, `status`, `rating` (1–10), `year` (1800–2100); индексы `(user_id, created_at desc)`, `(user_id, kind)`, `(user_id, status)`; `updated_at` триггером.
  **Проверить:** миграция применяется; вставка с `rating = 11` отклоняется; `kind = 'game'` отклоняется; `deleted_at` по умолчанию `NULL`; индекс используется (`EXPLAIN`).
  **Коммит:** `feat(db): add items table`

- [ ] **T27 · Схема тегов**
  **Файлы:** `migrations/0005_tags.sql`
  **Сделать:** `tags(id, user_id, name, created_at)` с уникальностью `(user_id, lower(name))`; `item_tags(item_id, tag_id)` с каскадным удалением; индексы.
  **Проверить:** дубликат тега в другом регистре отклоняется; удаление записи удаляет связи; удаление тега не удаляет записи.
  **Коммит:** `feat(db): add tags and item_tags`

- [ ] **T28 · Домен записей**
  **Файлы:** `backend/src/items/mod.rs`, `backend/src/items/model.rs`, `backend/src/items/repo.rs`
  **Сделать:** типы `Item`, `ItemKind`, `ItemStatus`, `NewItem`, `ItemPatch`; маппинг из строк БД; репозиторий с методами `create`, `get`, `list`, `update`, `soft_delete`, `restore`; все запросы ограничены `user_id`.
  **Проверить:** `cargo test items::repo` зелёный; попытка получить чужую запись возвращает `None`; `ItemKind::from_str` отвергает неизвестные значения.
  **Коммит:** `feat(items): add domain model and repository`

- [ ] **T29 · Создание записи**
  **Файлы:** `backend/src/items/create.rs`, `backend/src/http/items.rs`, `backend/src/http/mod.rs`
  **Сделать:** `POST /api/v1/items`; валидация по правилам `docs/protocol.md`; нормализация тегов; ответ `201` с полным объектом.
  **Проверить:** `curl` создаёт запись и возвращает `201`; пустой `title` → `400`; `rating = 0` → `400`; 21 тег → `400`; теги создаются и привязываются.
  **Коммит:** `feat(items): create items`

- [ ] **T30 · Чтение записи**
  **Файлы:** `backend/src/items/get.rs`, `backend/src/http/items.rs`
  **Сделать:** `GET /api/v1/items/{id}`; проверка владельца; `404` для чужих и несуществующих; корректный `400` на некорректный UUID.
  **Проверить:** своя запись → `200`; чужая → `404`; невалидный UUID → `400`; удалённая (в корзине) → `404` без `include_deleted`.
  **Коммит:** `feat(items): read item by id`

- [ ] **T31 · Список и пагинация**
  **Файлы:** `backend/src/items/list.rs`, `backend/src/http/items.rs`
  **Сделать:** курсорная пагинация (base64 от `(sort_key, id)`), `limit` 1–100, сортировки из контракта; стабильный порядок без дублей.
  **Проверить:** 60 записей читаются тремя страницами по 20 без дублей и пропусков; `limit=0` и `limit=101` → `400`; битый курсор → `400`; сортировка по рейтингу корректна.
  **Коммит:** `feat(items): paginate item list`

- [ ] **T32 · Обновление записи**
  **Файлы:** `backend/src/items/update.rs`, `backend/src/http/items.rs`
  **Сделать:** `PATCH /api/v1/items/{id}` с частичным обновлением; обновление `updated_at`; замена набора тегов; `404` для чужих.
  **Проверить:** изменение только `rating` не трогает остальные поля; пустой `PATCH` → `400`; невалидное значение → `400`; `updated_at` изменился.
  **Коммит:** `feat(items): update items`

- [ ] **T33 · Мягкое удаление и восстановление**
  **Файлы:** `backend/src/items/delete.rs`, `backend/src/http/items.rs`
  **Сделать:** `DELETE /items/{id}` → `deleted_at`; `POST /items/{id}/restore`; параметр `include_deleted=true` для списка.
  **Проверить:** после удаления запись не видна; `include_deleted=true` показывает её; восстановление возвращает в список; повторное удаление → `404`.
  **Коммит:** `feat(items): soft delete and restore`

- [ ] **T34 · Управление тегами**
  **Файлы:** `backend/src/items/tags.rs`, `backend/src/http/tags.rs`, `backend/src/http/mod.rs`
  **Сделать:** `GET /api/v1/tags` с количеством записей; привязка тегов при создании и обновлении; `DELETE /api/v1/tags/{id}`.
  **Проверить:** тег создаётся один раз при повторном использовании; счётчик совпадает с числом записей; удаление тега отвязывает его, но не удаляет записи; чужой тег → `404`.
  **Коммит:** `feat(items): manage tags`

- [ ] **T35 · Фильтры**
  **Файлы:** `backend/src/items/filters.rs`, `backend/src/items/list.rs`
  **Сделать:** фильтры `kind`, `status`, `tag`, `year_from`, `year_to`, `rating_min`, `rating_max`; комбинирование через `AND`; параметризованные запросы.
  **Проверить:** комбинация «kind=movie & rating_min=8» даёт только подходящие; несуществующий тег → пустой список без ошибки; `rating_min=11` → `400`.
  **Коммит:** `feat(items): filter item list`

- [ ] **T36 · Поиск**
  **Файлы:** `migrations/0006_search.sql`, `backend/src/items/search.rs`
  **Сделать:** расширение `pg_trgm`; GIN-индексы; поиск по `title`, `subtitle`, `review` с ранжированием; учёт регистра и раскладки не требуется, но `ILIKE` и триграммы должны работать.
  **Проверить:** поиск «интер» находит «Interstellar»; поиск по слову из заметки находит запись; пустой `q` игнорируется; поиск не возвращает чужие записи; время на 10 000 записей < 100 мс.
  **Коммит:** `feat(items): search by title and review`

- [ ] **T37 · Правила статусов**
  **Файлы:** `backend/src/items/status.rs`
  **Сделать:** допустимые переходы по типу записи (например, `movie` не может быть `in_progress`); проверка при создании и обновлении; ошибка с понятным кодом.
  **Проверить:** `movie` + `in_progress` → `400` с `details.field = "status"`; `book` + `in_progress` разрешён; изменение статуса на допустимый проходит.
  **Коммит:** `feat(items): validate status transitions`

- [ ] **T38 · Оценки и рецензии**
  **Файлы:** `backend/src/items/validation.rs`
  **Сделать:** границы оценки 1–10; лимит рецензии 20 000 символов; обрезка пробелов; запрет управляющих символов.
  **Проверить:** `rating = 0` и `11` → `400`; рецензия из 20 001 символа → `400`; переводы строк сохраняются; управляющие символы вычищаются.
  **Коммит:** `feat(items): validate rating and review`

- [ ] **T39 · Статистика**
  **Файлы:** `backend/src/stats/mod.rs`, `backend/src/http/stats.rs`
  **Сделать:** `GET /api/v1/stats`: всего, по типам, по статусам, средняя оценка, по годам; один запрос с агрегатами, без N+1.
  **Проверить:** цифры совпадают с ручным подсчётом на сидах; пустой аккаунт → нули, а не `null`; удалённые записи не учитываются; время < 50 мс на 10 000 записей.
  **Коммит:** `feat(stats): aggregate user statistics`

- [ ] **T40 · Индексы и планы запросов**
  **Файлы:** `migrations/0007_indexes.sql`, `docs/perf.md`
  **Сделать:** прогнать `EXPLAIN ANALYZE` на списке, фильтрах и поиске с 10 000 записей; добавить недостающие индексы; записать планы и замеры в `docs/perf.md`.
  **Проверить:** ни один ключевой запрос не делает `Seq Scan`; время списка < 50 мс; документ содержит дату, конфигурацию и цифры до/после.
  **Коммит:** `perf(db): add indexes for item queries`

- [ ] **T41 · Экспорт и импорт JSON**
  **Файлы:** `backend/src/export/mod.rs`, `backend/src/import/mod.rs`, `backend/src/http/mod.rs`
  **Сделать:** `GET /api/v1/export?format=json` — все записи и теги; `GET ...?format=csv`; `POST /api/v1/import` — идемпотентно по `id`, с валидацией и отчётом.
  **Проверить:** экспорт содержит все записи и восстанавливается импортом в пустой аккаунт; повторный импорт ничего не дублирует; битый JSON → `400` без частичного импорта; CSV открывается в таблице.
  **Коммит:** `feat(export): export and import user data`

- [ ] **T42 · Сиды для разработки**
  **Файлы:** `scripts/seed.sh`, `backend/src/bin/seed.rs`
  **Сделать:** генерация пользователя и 200 записей разных типов с тегами и оценками; запуск против `DATABASE_URL`; защита от запуска в проде.
  **Проверить:** `bash scripts/seed.sh` создаёт данные; повторный запуск не дублирует (или создаёт нового пользователя); попытка запуска с `APP_ENV=prod` отклоняется.
  **Коммит:** `chore(dev): add seed data generator`

---

## M3 · Интерфейс

- [ ] **T43 · Каркас Next.js**
  **Файлы:** `frontend/package.json`, `frontend/tsconfig.json`, `frontend/app/globals.css`, `frontend/app/layout.tsx`, `frontend/app/page.tsx`
  **Сделать:** Next.js (App Router), TypeScript strict, нативный CSS + CSS Modules (без Tailwind); структура `app/`, `components/`, `lib/`; глобальные переменные темы; страница-заглушка; проксирование `/api` на бэкенд в dev.
  **Проверить:** `npm run dev` открывает страницу; `npm run build` проходит; `npm run lint` без ошибок; запрос к `/api/v1/health` из браузера доходит до бэкенда.
  **Коммит:** `feat(web): bootstrap next.js application`

- [ ] **T44 · Базовые компоненты**
  **Файлы:** `frontend/components/ui/*`, `frontend/app/globals.css`
  **Сделать:** токены (цвета, отступы, радиусы, типографика) в CSS-переменных; компоненты `Button`, `Input`, `Textarea`, `Select`, `Card`, `Dialog`, `Badge`, `Skeleton` на CSS Modules; тёмная тема через переменные.
  **Проверить:** компоненты отображаются на демо-странице; фокус видим; тёмная тема переключается; нет хардкода цветов вне токенов.
  **Коммит:** `feat(web): add design tokens and base components`

- [ ] **T45 · API-клиент**
  **Файлы:** `frontend/lib/api.ts`, `frontend/lib/types.ts`, `frontend/lib/errors.ts`
  **Сделать:** типы запросов и ответов по `docs/protocol.md`; `fetch` с `credentials: "include"`; разбор ошибок в `{code, message, details}`; единая функция `request`.
  **Проверить:** ошибка `401` приводит к редиректу на вход; `400` возвращает типизированную ошибку; типы совпадают с ответами бэкенда (ручная сверка на 3 эндпоинтах).
  **Коммит:** `feat(web): add typed api client`

- [ ] **T46 · Страница регистрации**
  **Файлы:** `frontend/app/(auth)/register/page.tsx`, `frontend/components/forms/register-form.tsx`
  **Сделать:** форма (email, пароль, имя); клиентская валидация zod; показ ошибок по полям; после успеха — переход в каталог.
  **Проверить:** невалидный email подсвечивается; серверная ошибка `409` показывается у поля email; успешная регистрация ведёт в каталог; форма работает с клавиатуры.
  **Коммит:** `feat(web): add registration page`

- [ ] **T47 · Вход и выход**
  **Файлы:** `frontend/app/(auth)/login/page.tsx`, `frontend/components/forms/login-form.tsx`, `frontend/components/logout-button.tsx`
  **Сделать:** форма входа; состояние пользователя в контексте; выход с очисткой состояния; редирект после входа.
  **Проверить:** неверный пароль показывает общее сообщение; после входа имя видно в шапке; выход возвращает на страницу входа; обновление страницы сохраняет сессию.
  **Коммит:** `feat(web): add login and logout`

- [ ] **T48 · Защита приватных маршрутов**
  **Файлы:** `frontend/middleware.ts`, `frontend/app/(app)/layout.tsx`
  **Сделать:** проверка сессии на сервере; редирект неавторизованных на `/login` с `next`-параметром; возврат после входа.
  **Проверить:** прямой заход на `/items` без сессии → редирект; после входа возвращает на исходный адрес; авторизованный не попадает на `/login`.
  **Коммит:** `feat(web): protect private routes`

- [ ] **T49 · Список записей**
  **Файлы:** `frontend/app/(app)/items/page.tsx`, `frontend/components/items/item-list.tsx`, `frontend/components/items/filters.tsx`
  **Сделать:** список карточек; фильтры (тип, статус, тег); сортировка; подгрузка по курсору; состояние в URL.
  **Проверить:** фильтры меняют список и попадают в URL; «показать ещё» добавляет страницу; пустой результат показывает заглушку; на 360 px карточки не ломаются.
  **Коммит:** `feat(web): show item list with filters`

- [ ] **T50 · Карточка записи**
  **Файлы:** `frontend/app/(app)/items/[id]/page.tsx`
  **Сделать:** детальный экран: обложка, метаданные, оценка, рецензия, теги, даты; кнопки редактирования и удаления.
  **Проверить:** открывается по ссылке; чужая запись → страница 404; длинная рецензия не ломает вёрстку; кнопки ведут на нужные действия.
  **Коммит:** `feat(web): add item details page`

- [ ] **T51 · Форма создания**
  **Файлы:** `frontend/app/(app)/items/new/page.tsx`, `frontend/components/forms/item-form.tsx`
  **Сделать:** выбор типа; поля, зависящие от типа; теги; оценка; после сохранения — переход на карточку.
  **Проверить:** при `movie` показываются режиссёр и год, при `book` — автор; обязательное название; ошибка сервера показывается по полю; создание занимает < 20 секунд по таймеру.
  **Коммит:** `feat(web): create items from ui`

- [ ] **T52 · Редактирование и удаление**
  **Файлы:** `frontend/app/(app)/items/[id]/edit/page.tsx`, `frontend/components/items/delete-dialog.tsx`
  **Сделать:** предзаполненная форма; сохранение; подтверждение удаления; восстановление из корзины.
  **Проверить:** изменения сохраняются и видны сразу; удаление требует подтверждения; после удаления карточка исчезает из списка; восстановление возвращает её.
  **Коммит:** `feat(web): edit and delete items`

- [ ] **T53 · Поиск**
  **Файлы:** `frontend/components/items/search-box.tsx`, `frontend/app/(app)/items/page.tsx`
  **Сделать:** поле поиска с debounce 300 мс; синхронизация с URL; сброс; подсветка совпадений в названии.
  **Проверить:** ввод обновляет список без перезагрузки; `q` сохраняется в URL и переживает обновление страницы; очистка возвращает полный список; запросы не уходят на каждый символ.
  **Коммит:** `feat(web): search items`

- [ ] **T54 · Теги в интерфейсе**
  **Файлы:** `frontend/components/items/tag-input.tsx`, `frontend/app/(app)/tags/page.tsx`
  **Сделать:** ввод тегов с автодополнением; создание на лету; страница тегов с количеством; удаление.
  **Проверить:** тег создаётся по Enter; повторный ввод не дублирует; удаление тега не удаляет записи; автодополнение работает с клавиатуры.
  **Коммит:** `feat(web): manage tags in ui`

- [ ] **T55 · Дашборд статистики**
  **Файлы:** `frontend/app/(app)/dashboard/page.tsx`, `frontend/components/stats/*`
  **Сделать:** карточки с итогами; график по месяцам; распределение по типам и статусам; адаптивная сетка.
  **Проверить:** цифры совпадают с API; пустой аккаунт показывает нули и приглашение добавить запись; график читается на телефоне.
  **Коммит:** `feat(web): show statistics dashboard`

- [ ] **T56 · Профиль и настройки**
  **Файлы:** `frontend/app/(app)/settings/page.tsx`, `frontend/components/forms/settings-form.tsx`
  **Сделать:** изменение имени, локали, приватности; смена пароля; удаление аккаунта с подтверждением; выход со всех устройств.
  **Проверить:** изменения сохраняются; смена пароля требует текущий; удаление аккаунта просит пароль и ввод слова; после удаления сессия завершается.
  **Коммит:** `feat(web): add settings page`

- [ ] **T57 · Тёмная тема и адаптив**
  **Файлы:** `frontend/components/theme-toggle.tsx`, `frontend/app/globals.css`
  **Сделать:** переключатель темы с сохранением выбора; учёт системной темы; брейкпоинты для 360/768/1200.
  **Проверить:** выбор переживает перезагрузку; системная тема применяется при первом входе; на 360 px нет горизонтального скролла.
  **Коммит:** `feat(web): add dark theme and responsive layout`

- [ ] **T58 · Ошибки и уведомления**
  **Файлы:** `frontend/components/toasts.tsx`, `frontend/lib/messages.ts`
  **Сделать:** сопоставление кодов ошибок с русскими текстами; стек до трёх уведомлений; автоскрытие; `request_id` в деталях для поддержки.
  **Проверить:** `rate_limited` показывает текст про лимит и время; `validation_error` — конкретное поле; уведомления не перекрывают кнопки; `request_id` копируется.
  **Коммит:** `feat(web): show human-readable errors`

- [ ] **T59 · Пустые состояния и загрузка**
  **Файлы:** `frontend/components/empty-state.tsx`, `frontend/components/skeletons.tsx`
  **Сделать:** скелетоны для списка и карточек; пустые состояния с призывом к действию; обработка ошибки загрузки с кнопкой «повторить».
  **Проверить:** при медленной сети виден скелетон, а не пустой экран; пустой список предлагает добавить запись; ошибка сети показывает «повторить» и не ломает страницу.
  **Коммит:** `feat(web): add empty and loading states`

- [ ] **T60 · Доступность**
  **Файлы:** `frontend/app/**`, `frontend/components/**`
  **Сделать:** видимый фокус, `aria`-подписи, корректные `label`, навигация с клавиатуры, порядок табуляции, контраст AA.
  **Проверить:** весь сценарий проходится с клавиатуры; `axe` не находит критичных нарушений; фокус не теряется в модальных окнах; контраст текста ≥ 4.5:1.
  **Коммит:** `feat(web): improve accessibility`

---

## M4 · Медиа

- [ ] **T61 · Приём загрузок**
  **Файлы:** `backend/src/media/upload.rs`, `backend/src/http/uploads.rs`, `migrations/0008_uploads.sql`
  **Сделать:** `POST /api/v1/uploads`, `multipart/form-data`; лимит 10 МБ; проверка MIME по сигнатуре, а не по расширению; запись в `uploads`.
  **Проверить:** JPEG/PNG/WebP принимаются; `.txt` с расширением `.jpg` отклоняется `415`; файл 11 МБ → `413`; без сессии → `401`.
  **Коммит:** `feat(media): accept image uploads`

- [ ] **T62 · Ресайз и превью**
  **Файлы:** `backend/src/media/transform.rs`
  **Сделать:** декодирование, поворот по EXIF, ресайз до 400 и 1200 px по длинной стороне, перекодирование в WebP; отказ на битых файлах.
  **Проверить:** изображение 4000×3000 даёт превью и большое WebP; битый файл → `415`; EXIF-поворот учтён; размер большого файла < 300 КБ.
  **Коммит:** `feat(media): resize and convert uploaded images`

- [ ] **T63 · Абстракция хранилища**
  **Файлы:** `backend/src/media/storage.rs`, `backend/src/media/local.rs`
  **Сделать:** трейт `Storage` (`put`, `get`, `delete`, `url`); локальная реализация в `var/media/`; ключи вида `u/{user_id}/{uuid}/{variant}.webp`; задел под R2.
  **Проверить:** файлы ложатся по ключам; повторная запись того же ключа перезаписывает; удаление убирает файл; `url` возвращает корректный путь.
  **Коммит:** `feat(media): add storage abstraction`

- [ ] **T64 · Обложки записей**
  **Файлы:** `backend/src/items/cover.rs`, `backend/src/http/items.rs`, `frontend/components/items/cover-picker.tsx`
  **Сделать:** загрузка обложки из формы записи; привязка `cover_key`; замена; удаление.
  **Проверить:** обложка видна в списке и карточке; замена удаляет старый файл; удаление записи не оставляет файл (после T68).
  **Коммит:** `feat(media): attach covers to items`

- [ ] **T65 · Отдача медиа**
  **Файлы:** `backend/src/http/media.rs`
  **Сделать:** `GET /media/{key}`; `ETag`, `Cache-Control: public, max-age=31536000, immutable`; защита от path traversal; приватные файлы — только владельцу.
  **Проверить:** повторный запрос возвращает `304`; чужой приватный файл → `403`; ключ с `..` отвергается; заголовки кэша присутствуют.
  **Коммит:** `feat(media): serve images with caching`

- [ ] **T66 · Квоты**
  **Файлы:** `backend/src/media/quota.rs`
  **Сделать:** лимит на пользователя (по умолчанию 200 МБ); подсчёт по `uploads`; отказ `413` с текущим использованием.
  **Проверить:** при превышении загрузка отклоняется с понятным сообщением; удаление файлов освобождает квоту; лимит настраивается конфигом.
  **Коммит:** `feat(media): enforce per-user storage quota`

- [ ] **T67 · Аватары**
  **Файлы:** `backend/src/users/avatar.rs`, `frontend/components/profile/avatar.tsx`
  **Сделать:** загрузка аватара, кроп по центру, ресайз 128 px; отображение в шапке и профиле; удаление.
  **Проверить:** квадратный аватар не искажается; после замены старый файл удалён; в списках используется превью.
  **Коммит:** `feat(media): add profile avatars`

- [ ] **T68 · Сборка мусора**
  **Файлы:** `backend/src/media/gc.rs`, `backend/src/bin/gc.rs`
  **Сделать:** поиск файлов без ссылок из `items.cover_key` и `users.avatar_key` старше суток; удаление; отчёт.
  **Проверить:** осиротевший файл удаляется, используемый — нет; свежий файл не трогается; запуск идемпотентен; отчёт показывает количество.
  **Коммит:** `feat(media): collect orphaned files`

---

## M5 · Деплой

- [ ] **T69 · Провижининг VPS**
  **Файлы:** `docs/deploy.md`, `scripts/provision.sh`
  **Сделать:** пользователь `jey` без root-входа, SSH-ключи, `ufw` (22/80/443), swap 2 ГБ, `unattended-upgrades`, часовой пояс, лимиты файловых дескрипторов.
  **Проверить:** вход по паролю запрещён; `sudo -l` для сервисного пользователя ограничен; swap активен; после перезагрузки всё поднимается.
  **Коммит:** `chore(deploy): provision vps with ssh, firewall and swap`

- [ ] **T70 · PostgreSQL на сервере**
  **Файлы:** `docs/deploy.md`
  **Сделать:** установка Postgres; настройки под 2 ГБ (`shared_buffers=256MB`, `work_mem=4MB`, `max_connections=30`); отдельный пользователь БД; доступ только с localhost; лимит логов.
  **Проверить:** сервис запускается после перезагрузки; подключение снаружи закрыто; миграции применяются; память процесса в пределах ожиданий.
  **Коммит:** `chore(deploy): configure postgresql for small vps`

- [ ] **T71 · API как systemd-сервис**
  **Файлы:** `deploy/jey-api.service`, `docs/deploy.md`
  **Сделать:** unit с `Restart=always`, отдельным пользователем, `EnvironmentFile`, лимитом памяти; деплой артефакта из CI по `rsync`.
  **Проверить:** сервис стартует после перезагрузки; падение процесса приводит к перезапуску; логи идут в journald; `/health` отвечает.
  **Коммит:** `chore(deploy): run api as systemd service`

- [ ] **T72 · Caddy и домен**
  **Файлы:** `deploy/Caddyfile`, `docs/deploy.md`
  **Сделать:** Caddy с автоматическим TLS; прокси `/api/*` в API; статика фронтенда; заголовки безопасности; сжатие; лимит тела запроса.
  **Проверить:** `https://домен` открывается с валидным сертификатом; `http` редиректит на `https`; заголовки присутствуют; `/api/v1/health` доступен.
  **Коммит:** `chore(deploy): configure caddy with tls and security headers`

- [ ] **T73 · Деплой фронтенда**
  **Файлы:** `deploy/frontend.md`, `.github/workflows/deploy.yml`
  **Сделать:** сборка Next.js в CI; выкладка статики и SSR-сервера (или экспорт в статику) на сервер; переменные окружения с адресом API.
  **Проверить:** после деплоя все страницы открываются; ассеты отдаются с CDN/сервера; смена API-URL не требует пересборки кода.
  **Коммит:** `chore(deploy): deploy frontend from ci`

- [ ] **T74 · Секреты**
  **Файлы:** `docs/deploy.md`
  **Сделать:** `.env` с правами `600`; ротация `SESSION_SECRET` и ключей R2; чек-лист при компрометации; запрет вывода секретов в логи.
  **Проверить:** права файла `600`; секреты не попадают в `git log`; в логах нет значений токенов и паролей; процедура ротации описана.
  **Коммит:** `docs(deploy): describe secret management`

- [ ] **T75 · Бэкапы БД**
  **Файлы:** `deploy/backup.sh`, `docs/deploy.md`
  **Сделать:** `pg_dump` по cron, сжатие, загрузка в R2, ротация 7 дней; проверка восстановления раз в месяц.
  **Проверить:** дамп создаётся по расписанию; восстановление в чистую БД проходит; старые копии удаляются; отчёт о размере есть в логе.
  **Коммит:** `chore(deploy): add scheduled database backups`

- [ ] **T76 · Мониторинг**
  **Файлы:** `docs/monitoring.md`, `deploy/healthcheck.sh`
  **Сделать:** внешний uptime-чек на `/health`; проверка диска и памяти; алерт при недоступности; ротация логов.
  **Проверить:** остановка сервиса приводит к алерту; диск заполнен на 80% — предупреждение; логи не растут бесконечно.
  **Коммит:** `chore(deploy): add uptime and resource monitoring`

- [ ] **T77 · Миграции в проде**
  **Файлы:** `docs/deploy.md`, `scripts/deploy.sh`
  **Сделать:** порядок деплоя: бэкап → миграции → новый бинарник → проверка `/health/ready`; откат по инструкции; запрет разрушающих миграций без согласования.
  **Проверить:** деплой на стейдже проходит по шагам; падение миграции останавливает деплой; откат возвращает предыдущую версию.
  **Коммит:** `docs(deploy): describe migration and rollback procedure`

- [ ] **T78 · Нагрузочная проверка**
  **Файлы:** `docs/perf.md`
  **Сделать:** прогон `hey` или `wrk` на ключевых эндпоинтах (список, карточка, поиск) при 50 и 100 RPS; замеры p50/p95; выводы.
  **Проверить:** p95 < 300 мс на 50 RPS; ошибок 5xx нет; узкие места зафиксированы с рекомендациями.
  **Коммит:** `docs(perf): record load test results`

- [ ] **T79 · Runbook**
  **Файлы:** `docs/runbook.md`
  **Сделать:** что делать при падении API, БД, диска, TLS, утечке секретов; где логи; как восстановить; контакты.
  **Проверить:** сценарии проверены на стейдже или мысленно пройдены; каждый шаг команды выполним; время реакции указано.
  **Коммит:** `docs: add incident runbook`

---

## M6 · Полировка

- [ ] **T80 · Экспорт в интерфейсе**
  **Файлы:** `frontend/app/(app)/settings/page.tsx`, `frontend/components/export-panel.tsx`
  **Сделать:** кнопки «Экспорт JSON» и «CSV», показ размера, уведомление о готовности.
  **Проверить:** файл скачивается и открывается; данные полные; на мобильном тоже работает.
  **Коммит:** `feat(web): export data from ui`

- [ ] **T81 · Публичный профиль и приватность**
  **Файлы:** `backend/src/users/public.rs`, `frontend/app/(public)/u/[handle]/page.tsx`
  **Сделать:** публичный профиль по настройке; что показывать (только записи `done`); отключение по умолчанию; ссылка «поделиться».
  **Проверить:** при выключенной настройке профиль отдаёт `404`; при включённой видны только разрешённые записи; приватные заметки не утекают.
  **Коммит:** `feat(users): add public profiles with privacy settings`

- [ ] **T82 · SEO и метаданные**
  **Файлы:** `frontend/app/layout.tsx`, `frontend/app/(public)/**`
  **Сделать:** `title`, `description`, OG-теги, `sitemap.xml`, `robots.txt`; корректные заголовки для публичных страниц.
  **Проверить:** OG-превью корректно; sitemap содержит публичные страницы; приватные закрыты в `robots.txt`.
  **Коммит:** `feat(web): add seo metadata and sitemap`

- [ ] **T83 · Правовые страницы**
  **Файлы:** `frontend/app/(public)/privacy/page.tsx`, `frontend/app/(public)/terms/page.tsx`
  **Сделать:** политика конфиденциальности (какие данные, зачем, сроки), условия использования, инструкция по удалению аккаунта, контакт.
  **Проверить:** страницы доступны без авторизации; текст соответствует фактическому поведению приложения.
  **Коммит:** `docs(legal): add privacy policy and terms`

- [ ] **T84 · Аудит безопасности**
  **Файлы:** `docs/security.md`
  **Сделать:** проверка заголовков (CSP, HSTS, X-Content-Type-Options), `cargo audit`, `npm audit`, тесты на CSRF и IDOR, проверка лимитов; устранение найденного.
  **Проверить:** `cargo audit` без критичных; чужой объект недоступен (IDOR); запрос без `Origin` отклонён; CSP не ломает интерфейс.
  **Коммит:** `fix(security): resolve audit findings`

- [ ] **T85 · Производительность**
  **Файлы:** `docs/perf.md`, правки в коде
  **Сделать:** профилирование горячих запросов, кэширование неизменяемых ответов, оптимизация бандла, ленивые изображения.
  **Проверить:** LCP < 2,5 с на 4G; список из 100 записей рендерится < 500 мс; бандл первой страницы < 200 КБ gzip.
  **Коммит:** `perf: optimize queries and frontend bundle`

- [ ] **T86 · Документация API**
  **Файлы:** `docs/openapi.yaml`, `docs/api.md`
  **Сделать:** OpenAPI 3.1 по фактическому контракту; примеры запросов; генерация клиентских типов (опционально).
  **Проверить:** валидатор OpenAPI без ошибок; примеры соответствуют реальным ответам; покрыты все эндпоинты v1.
  **Коммит:** `docs(api): publish openapi specification`

- [ ] **T87 · Лендинг**
  **Файлы:** `frontend/app/(public)/page.tsx`
  **Сделать:** главная: что это, скриншоты, преимущества, кнопка регистрации; без маркетингового шума.
  **Проверить:** страница грузится быстро; CTA ведёт на регистрацию; на мобильном читается; нет битых ссылок.
  **Коммит:** `feat(web): add landing page`

- [ ] **T88 · Релиз 0.1.0**
  **Файлы:** `CHANGELOG.md`, `README.md`
  **Сделать:** changelog, версия 0.1.0, тег, скриншоты, инструкция запуска, проверка всех критериев приёмки из `docs/spec.md`.
  **Проверить:** `git tag --list` содержит `v0.1.0`; `/health` отдаёт `0.1.0`; критерии приёмки MVP выполнены; README актуален.
  **Коммит:** `chore(release): prepare 0.1.0`

- [ ] **T89 · Бэклог и ретроспектива**
  **Файлы:** `docs/backlog.md`, `docs/retrospective.md`
  **Сделать:** следующие шаги (внешние API, друзья, лента, мобильное приложение, i18n, рекомендации) с приоритетами; ретроспектива: что заняло больше времени, что переделал бы.
  **Проверить:** бэклог содержит не менее 15 задач с оценкой; ретроспектива отвечает на три вопроса; приоритеты согласованы с владельцем.
  **Коммит:** `docs: add post-mvp backlog and retrospective`
