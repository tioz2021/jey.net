# API: практическое руководство

Машиночитаемая спецификация — [`openapi.yaml`](openapi.yaml) (OpenAPI 3.1).
Подробный текстовый контракт — [`protocol.md`](protocol.md).

- **Прод:** `https://129-121-149-16.sslip.io/api/v1`
- **Локально:** `http://localhost:8080/api/v1`

Вне префикса `/api/v1` живут служебные маршруты и медиа:

| Путь | Назначение |
|---|---|
| `GET /health/ready` | готовность (проверяет БД) |
| `GET /media/{key}` | файлы с `ETag` и `immutable`-кэшем |

Они описаны здесь и в `protocol.md`; в OpenAPI-файл не входят, потому что
относятся к корню, а не к версионированному API.

## Быстрый старт

```bash
BASE=https://129-121-149-16.sslip.io/api/v1
ORIGIN=https://129-121-149-16.sslip.io

# 1. Регистрация: cookie сохраняется в jar
curl -sS -c jar.txt -X POST "$BASE/auth/register" \
  -H 'Content-Type: application/json' -H "Origin: $ORIGIN" \
  -d '{"email":"me@example.com","password":"correct horse battery","display_name":"Jey"}'

# 2. Создание записи
curl -sS -b jar.txt -X POST "$BASE/items" \
  -H 'Content-Type: application/json' -H "Origin: $ORIGIN" \
  -d '{"kind":"movie","title":"Interstellar","status":"done","rating":9,"tags":["sci-fi"]}'

# 3. Список
curl -sS -b jar.txt "$BASE/items?limit=20"
```

## Обязательные правила

| Правило | Последствие |
|---|---|
| `Origin` обязателен для `POST/PATCH/PUT/DELETE` | без него `403` |
| `Content-Type: application/json` (кроме загрузки файлов) | `415` |
| сессия — cookie `jey_session` | без неё `401` |
| даты — RFC 3339 UTC, id — UUID v4 | — |
| поля в `snake_case` | — |

`Origin` проверяется по списку `ALLOWED_ORIGINS` на сервере. curl и другие
не-браузерные клиенты обязаны отправлять его так же, как браузер.

## Ошибки

Все ответы с ошибкой имеют один формат:

```json
{
  "error": {
    "code": "validation_error",
    "message": "year must be between 1800 and 2100",
    "details": { "field": "year" },
    "request_id": "df069390-8209-4c38-8f3a-6e84f7c245f2"
  }
}
```

| Код | HTTP |
|---|---|
| `validation_error` | 400 |
| `unauthorized` | 401 |
| `forbidden` | 403 |
| `not_found` | 404 |
| `method_not_allowed` | 405 |
| `conflict` | 409 |
| `payload_too_large` | 413 |
| `unsupported_media_type` | 415 |
| `rate_limited` | 429 + `Retry-After` |
| `internal` | 500 |

`message` — для логов; интерфейс показывает свои строки, ориентируясь на
`code` и `details.field`.

## Пагинация

Курсорная, без `offset`:

```json
{ "items": [ ... ], "next_cursor": "eyJjIjoiLi4uIn0" }
```

Передавайте `next_cursor` в `?cursor=...`, пока он не станет `null`.
`limit` — 1..100, по умолчанию 20.

## Эндпоинты

### Служебные

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/health` | живость процесса |
| GET | `/health/ready` | готовность (проверяет БД) |
| GET | `/api/v1/health` | то же под версионированным префиксом |

### Аккаунты

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/auth/register` | регистрация + сессия |
| POST | `/auth/login` | вход + сессия |
| POST | `/auth/logout` | выход |
| POST | `/auth/verify-email` | подтверждение почты по токену |
| POST | `/auth/verify-email/resend` | переотправка письма |
| POST | `/auth/password-reset/request` | запрос сброса |
| POST | `/auth/password-reset/confirm` | новый пароль по токену |
| GET | `/me` | текущий аккаунт |
| PATCH | `/me` | имя, язык, публичность |
| DELETE | `/me` | удаление аккаунта (с паролем) |
| POST | `/me/password` | смена пароля |
| POST | `/me/sessions/revoke-all` | выйти на всех устройствах |
| POST | `/me/avatar` | аватар из загрузки |
| DELETE | `/me/avatar` | убрать аватар |

### Записи

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/items` | список с фильтрами и курсором |
| POST | `/items` | создать |
| GET | `/items/{id}` | одна запись |
| PATCH | `/items/{id}` | частично обновить |
| DELETE | `/items/{id}` | в корзину |
| POST | `/items/{id}/restore` | из корзины |
| POST | `/items/{id}/cover` | обложка из загрузки |
| DELETE | `/items/{id}/cover` | убрать обложку |

Параметры списка: `kind`, `status`, `tag`, `q`, `year_from`, `year_to`,
`rating_min`, `rating_max`, `sort`, `include_deleted`, `limit`, `cursor`.

### Теги, статистика, экспорт

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/tags` | теги с количеством записей |
| DELETE | `/tags/{id}` | удалить тег |
| GET | `/stats` | агрегаты для дашборда |
| GET | `/export?format=json\|csv` | экспорт всех записей |
| POST | `/import` | импорт JSON-экспорта |

### Медиа

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/uploads` | загрузка JPEG/PNG/WebP до 10 МБ |
| GET | `/media/{key}` | файл с `ETag` и `immutable`-кэшем |

Загрузка:

```bash
curl -sS -b jar.txt -X POST "$BASE/uploads" -H "Origin: $ORIGIN" \
  -F "file=@cover.png"
```

```json
{ "upload": { "id": "6b552b7e-…", "mime": "image/png", "size_bytes": 84213, "width": 800, "height": 600 } }
```

Затем `POST /items/{id}/cover` или `POST /me/avatar` с `{"upload_id": "..."}`.

### Публичное

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/public/users` | список публичных профилей (для sitemap) |
| GET | `/public/users/{id}` | публичный профиль: только `done`, без заметок |

Приватный профиль отвечает `404` — так же, как несуществующий.

## Примеры реальных ответов

Регистрация (`201`):

```json
{
  "user": {
    "id": "6d2254e4-f536-4b10-a2e0-9914542eee5b",
    "email": "api-doc@example.com",
    "display_name": "Docs",
    "locale": "ru",
    "email_verified": false,
    "is_public": false,
    "avatar_key": null,
    "created_at": "2026-11-02T20:22:24.654060Z"
  }
}
```

Запись (`201`):

```json
{
  "item": {
    "id": "f8a48cc7-cd38-41c6-84e5-b2d8ed88ce2d",
    "kind": "movie",
    "title": "Interstellar",
    "subtitle": null,
    "year": 2014,
    "status": "done",
    "rating": 9,
    "review": null,
    "source_url": null,
    "cover_key": null,
    "tags": ["sci-fi"],
    "revision": 1,
    "sync_seq": 0,
    "created_at": "2026-11-02T20:22:24.734Z",
    "updated_at": "2026-11-02T20:22:24.734Z",
    "deleted_at": null
  }
}
```

Список (`200`):

```json
{
  "items": [ { "id": "f8a48cc7-…", "title": "Interstellar", "status": "done", "tags": ["sci-fi"] } ],
  "next_cursor": null
}
```

Статистика (`200`):

```json
{
  "total": 1,
  "by_kind": { "movie": 1 },
  "by_status": { "done": 1 },
  "average_rating": 9.0,
  "by_year": [ { "year": 2014, "count": 1 } ],
  "by_month": [ { "month": "2026-11", "count": 1 } ]
}
```

Ошибка (`401`, запрос без сессии):

```json
{ "error": { "code": "unauthorized", "message": "authentication required", "request_id": "df069390-8209-4c38-8f3a-6e84f7c245f2" } }
```

## Лимиты

| Эндпоинт | Лимит |
|---|---|
| `POST /auth/login` | 5 в минуту на IP+email, блок 15 минут |
| `POST /auth/register` | 3 в час на IP |
| `POST /auth/password-reset/request` | 3 в час на email |
| остальные | 120 в минуту на пользователя |

## Валидация спецификации

```bash
npx @redocly/cli lint docs/openapi.yaml
```

Спецификация проходит без ошибок (остаются только предупреждения о
`localhost` в списке `servers`).
