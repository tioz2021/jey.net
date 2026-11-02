# Протокол HTTP API

Контракт между фронтендом и бэкендом. Версия: **v1** (`/api/v1`).
Базовый URL в разработке: `http://localhost:8080/api/v1`.

Общие принципы:

- только JSON (`application/json; charset=utf-8`), кроме загрузки файлов;
- имена полей — `snake_case`;
- даты и время — RFC 3339 в UTC (`2026-11-02T12:00:00Z`);
- идентификаторы — UUID v4 в виде строки;
- неизвестные поля в запросе игнорируются, лишние в ответе — допустимы;
- обратная совместимость: поля не удаляются и не меняют смысл внутри v1.

## 1. Заголовки

| Заголовок | Направление | Назначение |
|---|---|---|
| `Content-Type` | запрос | `application/json` или `multipart/form-data` |
| `Cookie: jey_session=...` | оба | сессия пользователя |
| `Origin` | запрос | обязателен для POST/PATCH/DELETE |
| `X-Request-Id` | запрос/ответ | сквозной идентификатор для логов |
| `X-Device-Id` | запрос | устройство, от которого идёт синхронизация |
| `Retry-After` | ответ | при `429` |

## 2. Аутентификация и сессии

- Вход выдаёт cookie `jey_session` со случайным токеном (32 байта).
- Атрибуты: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` в продакшене,
  `Max-Age` = срок сессии (по умолчанию 30 дней).
- В базе хранится только `sha256(token)`.
- Любой запрос без валидной сессии к защищённым маршрутам → `401`.
- Выход удаляет текущую сессию; смена пароля — все остальные сессии.
- Синхронизация требует `X-Device-Id`; устройство регистрируется при первом
  входе (`POST /devices`).

## 3. Формат ошибок

Единый для всех эндпоинтов:

```json
{
  "error": {
    "code": "validation_error",
    "message": "year must be between 1800 and 2100",
    "details": { "field": "year" },
    "request_id": "6f1c2b1e-8f43-4a9e-9f4c-2d7f7c1b0a11"
  }
}
```

| Код | HTTP | Когда |
|---|---|---|
| `validation_error` | 400 | неверные поля, нарушены ограничения |
| `unauthorized` | 401 | нет сессии или она истекла |
| `forbidden` | 403 | нет прав на объект |
| `not_found` | 404 | объект не существует или не принадлежит пользователю, а также неизвестный маршрут |
| `method_not_allowed` | 405 | метод не поддерживается для этого маршрута |
| `conflict` | 409 | дубликат email, тега, гонка версий |
| `payload_too_large` | 413 | тело или файл больше лимита |
| `unsupported_media_type` | 415 | тип файла не поддерживается |
| `rate_limited` | 429 | превышен лимит попыток |
| `internal` | 500 | непредвиденная ошибка |

`message` — английский, пригодный для логов, но не для показа пользователю
напрямую; фронтенд сопоставляет `code` и `details.field` со своими строками.

## 4. Пагинация

Курсорная, без `offset`:

```
GET /api/v1/items?limit=20&cursor=eyJjIjoiMjAyNi0xMS0wMlQxMjowMDowMFoiLCJpIjoiLi4uIn0
```

```json
{
  "items": [ ... ],
  "next_cursor": "eyJjIjoiMjAyNi0xMS0wMVQwOTowMDowMFoiLCJpIjoiLi4uIn0"
}
```

- `limit` — 1..100, по умолчанию 20;
- `next_cursor = null` — данных больше нет;
- курсор непрозрачен для клиента и кодирует ключ сортировки и `id`.

## 5. Эндпоинты

### 5.1 Служебные

| Метод | Путь | Описание |
|---|---|---|
| GET | `/health` | живость процесса |
| GET | `/api/v1/health` | то же самое под версионированным префиксом |
| GET | `/api/v1/public/users/{id}` | публичный профиль: только `done`-записи, без заметок и email; `404`, если профиль закрыт |
| GET | `/api/v1/public/users` | список публичных профилей (для `sitemap.xml`) |
| GET | `/api/v1/public/users/{id}/items/{item_id}` | одна публичная запись: только `done`, без заметки; иначе `404` |
| GET | `/health/ready` | готовность: доступна БД |

`GET /health` → `200 {"status":"ok","version":"0.1.0"}`.

### 5.2 Аккаунты

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| POST | `/auth/register` | `{email, password, display_name}` | `201 {user}` + cookie |
| POST | `/auth/login` | `{email, password}` | `200 {user}` + cookie |
| POST | `/auth/logout` | — | `204` |
| GET | `/me` | — | `200 {user}` |
| PATCH | `/me` | `{display_name?, locale?, is_public?}` | `200 {user}` |
| POST | `/me/password` | `{current_password, new_password}` | `204` |
| DELETE | `/me` | `{password}` | `204` |
| POST | `/me/sessions/revoke-all` | — | `204`, все сессии завершены |
| POST | `/me/avatar` | `{upload_id}` | `200 {user}`, аватар 128×128 WebP |
| DELETE | `/me/avatar` | — | `200 {user}`, файл удалён |
| GET | `/media/{key}` | — | `200` файл, `Cache-Control: immutable`, `ETag`; `304` при совпадении; `403` чужой приватный |
| POST | `/uploads` | `multipart/form-data`, поле `file` | `201 {upload: {id, mime, size_bytes, width, height}}`; `413` больше 10 МБ или превышена квота (200 МБ на аккаунт); `415` не JPEG/PNG/WebP или файл не декодируется |
| POST | `/items/{id}/cover` | `{upload_id}` | `200 {item}`, `cover_key` = ключ большого WebP |
| DELETE | `/items/{id}/cover` | — | `200 {item}`, файлы и запись загрузки удалены |
| POST | `/auth/verify-email` | `{token}` | `204` |
| POST | `/auth/verify-email/resend` | — | `204`, не чаще раза в 10 минут на аккаунт |
| POST | `/auth/password-reset/request` | `{email}` | `202` (всегда) |
| POST | `/auth/password-reset/confirm` | `{token, new_password}` | `204` |

Пример регистрации:

```http
POST /api/v1/auth/register
Content-Type: application/json
Origin: http://localhost:3000

{"email":"me@example.com","password":"correct horse battery staple","display_name":"Jey"}
```

```json
{
  "user": {
    "id": "0b7f9a2e-6c1d-4c1a-9a3e-2f1c6a5d8e44",
    "email": "me@example.com",
    "display_name": "Jey",
    "locale": "ru",
    "email_verified": false,
    "is_public": false,
    "created_at": "2026-11-02T12:00:00Z"
  }
}
```

Ограничения полей: `email` — валидный адрес, до 254 символов; `password` —
от 10 до 128 символов; `display_name` — 1..60 после trim.

### 5.3 Записи

| Метод | Путь | Описание |
|---|---|---|
| GET | `/items` | список с фильтрами и курсором |
| POST | `/items` | создание |
| GET | `/items/{id}` | одна запись |
| PATCH | `/items/{id}` | частичное обновление |
| DELETE | `/items/{id}` | в корзину (мягкое удаление) |
| POST | `/items/{id}/restore` | восстановление |

Параметры списка:

| Параметр | Значения |
|---|---|
| `kind` | `movie`, `book`, `image`, `other` |
| `status` | `planned`, `in_progress`, `done`, `dropped` |
| `tag` | имя тега |
| `q` | поиск по `title`, `subtitle`, `review` |
| `year_from`, `year_to` | целые |
| `rating_min`, `rating_max` | 1..10 |
| `sort` | `created_desc` (по умолчанию), `created_asc`, `updated_desc`, `rating_desc`, `title_asc`, `year_desc` |
| `include_deleted` | `true` — показать корзину |

Объект записи:

```json
{
  "id": "8a1f0c62-3b9d-4a44-8f80-1c2f5d9b7a10",
  "kind": "movie",
  "title": "Interstellar",
  "subtitle": "Christopher Nolan",
  "year": 2014,
  "status": "done",
  "rating": 9,
  "review": "Смотрел второй раз, всё ещё цепляет.",
  "source_url": null,
  "cover_key": "u/8a1f0c62-…/0b7f…/large.webp",
  "tags": ["sci-fi", "nolan"],
  "revision": 3,
  "sync_seq": 1042,
  "created_at": "2026-11-02T11:00:00Z",
  "updated_at": "2026-11-02T11:30:00Z"
}
```

Создание:

```json
{
  "kind": "movie",
  "title": "Interstellar",
  "year": 2014,
  "status": "done",
  "rating": 9,
  "tags": ["sci-fi"]
}
```

Правила валидации:

- `title` — 1..300 после trim, обязателен;
- `kind` и `status` — из перечислений, обязательны при создании;
- `year` — 1800..2100, необязателен;
- `rating` — 1..10, необязателен;
- `review` — до 20 000 символов;
- `tags` — до 20 штук, каждый 1..40 символов, нормализуются в нижний регистр;
- `source_url` — только `http`/`https`, до 2048 символов.

### 5.4 Теги

| Метод | Путь | Описание |
|---|---|---|
| GET | `/tags` | список тегов пользователя с количеством записей |
| DELETE | `/tags/{id}` | удалить тег (отвязать от записей) |

### 5.5 Загрузка файлов

| Метод | Путь | Описание |
|---|---|---|
| POST | `/uploads` | `multipart/form-data`, поле `file`; тип: `image/jpeg`, `image/png`, `image/webp`; до 10 МБ |

Ответ `201`:

```json
{
  "upload": {
    "id": "5c2b1f0e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
    "mime": "image/png",
    "size_bytes": 84213,
    "width": 800,
    "height": 600
  }
}
```

### 5.6 Статистика

`GET /stats` — агрегаты по текущему пользователю:

```json
{
  "total": 123,
  "by_kind": { "movie": 80, "book": 30, "image": 10, "other": 3 },
  "by_status": { "planned": 20, "in_progress": 3, "done": 95, "dropped": 5 },
  "average_rating": 7.8,
  "by_year": [ { "year": 2026, "count": 41 }, { "year": 2025, "count": 33 } ],
  "by_month": [ { "month": "2026-11", "count": 12 }, { "month": "2026-10", "count": 8 } ]
}
```

### 5.7 Экспорт и импорт

| Метод | Путь | Описание |
|---|---|---|
| GET | `/export?format=json` | полный экспорт данных пользователя |
| GET | `/export?format=csv` | записи в CSV |
| POST | `/import` | импорт JSON-экспорта, идемпотентно по `id` |

Ответ импорта: `200 {"created": 40, "skipped": 2, "failed": 0}`.

### 5.8 Устройства (планируется, M8)

Эндпоинты ещё не реализованы; появятся вместе с десктоп-клиентом.

| Метод | Путь | Описание |
|---|---|---|
| POST | `/devices` | регистрация устройства, идемпотентно по `installation_id` |
| GET | `/devices` | список устройств пользователя |
| DELETE | `/devices/{id}` | забыть устройство (сессии устройства завершаются) |

```json
{ "installation_id": "d3a2…", "name": "Ноутбук", "platform": "linux" }
```

### 5.9 Синхронизация (планируется, M8)

Ниже — проектный контракт; в текущей версии эндпоинтов `/sync/*` нет.

Полный протокол — в [sync.md](sync.md). Эндпоинты:

| Метод | Путь | Описание |
|---|---|---|
| POST | `/sync/push` | принять пачку локальных изменений |
| GET | `/sync/pull?since=N&limit=500` | отдать изменения после `N`, включая надгробия |
| GET | `/sync/status?since=N` | сколько изменений появилось после `N` |

Все три требуют `X-Device-Id` и действуют в пределах текущего пользователя.

`POST /sync/push`:

```json
{
  "batch_id": "b7f1…",
  "changes": [
    { "entity": "item", "id": "8a1f…", "revision": 4,
      "updated_at": "2026-11-02T12:00:00Z", "deleted_at": null,
      "payload": { "title": "Interstellar", "rating": 9 } }
  ]
}
```

```json
{ "applied": ["8a1f…"], "conflicts": [], "last_seq": 1042 }
```

`GET /sync/pull`:

```json
{
  "changes": [
    { "entity": "item", "id": "8a1f…", "revision": 5, "sync_seq": 1043,
      "deleted_at": null, "payload": { "title": "Interstellar", "rating": 9 } }
  ],
  "next_since": 1043,
  "has_more": false
}
```

`GET /sync/status`:

```json
{ "last_seq": 1045, "changes_after": 3 }
```

## 6. Лимиты запросов

| Эндпоинт | Лимит |
|---|---|
| `POST /auth/login` | 5 попыток в минуту на IP+email, затем 15 минут блокировки |
| `POST /auth/register` | 3 в час на IP |
| `POST /auth/password-reset/request` | 3 в час на email |
| Остальные | 120 запросов в минуту на пользователя |

Ответ при превышении — `429` с `Retry-After` в секундах.

## 7. Коды ответов

| Код | Когда |
|---|---|
| 200 | успешное чтение или обновление |
| 201 | создан объект |
| 202 | принято в обработку (письмо) |
| 204 | успех без тела (удаление, выход) |
| 400 / 401 / 403 / 404 / 405 / 409 / 413 / 415 / 429 / 500 | см. таблицу ошибок |

Машиночитаемая версия контракта: [`openapi.yaml`](openapi.yaml).
Практическое руководство с примерами: [`api.md`](api.md).

## 8. Что не входит в v1

- GraphQL и батчинг запросов;
- вебхуки и публичный API для третьих сторон;
- совместный доступ к чужим коллекциям;
- загрузка файлов напрямую в объектное хранилище по presigned URL (сейчас
  файлы лежат на диске VPS и идут через API);

Появление любого из пунктов — новая версия контракта или отдельное расширение.
