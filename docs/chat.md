# Чат

Статус: T133 закрыта, спецификация MVP готова. Реализация начинается с T134.

## Границы MVP

В первую версию входят:

- личные диалоги 1:1;
- текстовые сообщения;
- список диалогов, непрочитанные, отметка прочитанного;
- отправка с идемпотентностью и оптимистичным состоянием;
- блокировки и жалобы;
- веб + desktop.

Не входят в MVP:

- группы и каналы;
- вложения, фото, голосовые;
- звонки;
- сквозное шифрование;
- реакции, редактирование, поиск по истории;
- публичные чаты.

## Решения

- Сообщения хранятся на сервере, клиент получает их по API.
- Диалог может начать любой активный пользователь, который не заблокирован.
- Собеседники видят переписку только друг с другом.
- Сообщения без E2E-шифрования: сервер технически может их прочитать.
  Это нужно явно указать в интерфейсе и документации.
- Веб — основной клиент. Desktop получает кеш и очередь отправки после веб-версии.
- Реальное время — SSE с fallback на polling. Для нескольких API-инстансов
  события идут через PostgreSQL `LISTEN/NOTIFY`, а не только через память процесса.

## Модель данных

```text
chat_threads
  id uuid pk
  kind text default 'direct'
  direct_key text unique       -- отсортированная пара user_id
  created_at timestamptz
  updated_at timestamptz

chat_members
  thread_id uuid
  user_id uuid
  joined_at timestamptz
  last_read_at timestamptz
  muted_at timestamptz null
  hidden_at timestamptz null
  primary key (thread_id, user_id)

chat_messages
  id uuid pk
  thread_id uuid
  sender_id uuid
  body text
  client_id uuid
  created_at timestamptz
  edited_at timestamptz null
  deleted_at timestamptz null
  unique (thread_id, client_id)
```

```text
chat_settings
  user_id uuid pk
  message_policy text default 'all'   -- all / following / nobody
  created_at timestamptz
  updated_at timestamptz
```

Миграция: `migrations/0062_chat.sql`.

Индексы:

- `chat_members(user_id)`;
- `chat_messages(thread_id, created_at desc)`;
- `chat_threads(updated_at desc)`;
- `chat_members(user_id, hidden_at, thread_id)`.

## API

```text
GET    /api/v1/chat/threads
POST   /api/v1/chat/threads              { user_id }
GET    /api/v1/chat/threads/{id}/messages?before=&limit=
POST   /api/v1/chat/threads/{id}/messages { body, client_id }
POST   /api/v1/chat/threads/{id}/read
POST   /api/v1/chat/threads/{id}/mute
DELETE /api/v1/chat/threads/{id}         -- скрыть у себя
GET    /api/v1/chat/unread
GET    /api/v1/chat/stream               -- SSE
```

Правила:

- `POST /threads` для существующей пары возвращает тот же диалог;
- `client_id` защищает от двойной отправки при повторе;
- лимит сообщения — 4000 символов;
- rate limit на отправку и создание диалогов;
- нельзя писать самому себе, заблокированному пользователю и при закрытых
  настройках приватности;
- чтение и отправка проверяют членство в диалоге.

## Реальное время

SSE-события:

```text
message.created
message.read
thread.updated
```

Клиент переподключается с `Last-Event-ID`. Если SSE недоступен — polling
`/threads` и `/messages` каждые 5 секунд.

## Веб

Маршруты:

```text
/messages
/messages/:threadId
```

Экраны:

- инбокс: аватары, имя, последнее сообщение, время, unread;
- диалог: бабблы, дата-разделители, аватары, статус отправки;
- мобильный режим: список → диалог, кнопка «Назад»;
- пустые состояния и ошибки;
- кнопка «Написать» в публичном профиле;
- unread badge в сайдбаре и заголовке вкладки.

## Desktop и offline

- локальный SQLite-кеш диалогов и сообщений;
- исходящие сообщения в outbox;
- при отсутствии сервера можно читать кеш и писать в очередь;
- после reconnect очередь отправляется с теми же `client_id`;
- сервер остаётся источником истины;
- удаление/выход очищают локальный кеш в рамках текущей политики данных.

## Безопасность и модерация

- проверка блокировок в обе стороны;
- настройка «кто может писать»: все / подписки / никто;
- жалоба на сообщение и диалог;
- скрытие диалога у себя;
- лимиты и защита от флуда;
- логи не содержат тела сообщений;
- сообщения удаляются по политике retention (нужно утвердить).

## Задачи

| ID | Задача | Зависит от | Результат |
|---|---|---|---|
| T133 | Спецификация чата и threat model | — | Границы, приватность, retention, API-контракт |
| T134 | Схема БД и миграции чата | T133 | Таблицы, индексы, ограничения |
| T135 | API диалогов | T134 | Создание/список/скрытие, проверка участников |
| T136 | API сообщений | T134, T135 | Отправка, пагинация, read, идемпотентность |
| T137 | Realtime-доставка | T136 | SSE + fallback polling, reconnect |
| T138 | Веб: инбокс | T135 | `/messages`, список и unread |
| T139 | Веб: диалог | T136, T137 | `/messages/:id`, отправка, мобильный вид |
| T140 | Точки входа | T138, T139 | Кнопка в профиле, пункт сайдбара, badge |
| T141 | Прочитано и уведомления | T136, T138 | Отметка read, badge, title, mute |
| T142 | Приватность и модерация | T135, T136 | Блокировки, жалобы, «кто может писать» |
| T143 | Desktop: кеш и outbox | T136 | SQLite-миграция, очередь, reconnect |
| T144 | Desktop: UI и bridge | T139, T143 | Общий SPA + Tauri-команды |
| T145 | Тесты чата | T135–T144 | API, E2E, offline, нагрузка |
| T146 | Релиз чата | T145 | Веб → desktop → тег |

После MVP:

| ID | Задача |
|---|---|
| T147 | Групповые чаты |
| T148 | Вложения и голосовые |
| T149 | Реакции, редактирование, поиск, typing |
| T150 | E2E-шифрование |

## Решения T133

Решено и зафиксировано:

- писать может любой активный пользователь; настройка `all / following / nobody`
  появится в T142;
- сообщения в MVP не редактируются и не удаляются по одному;
- диалог можно скрыть у себя;
- история хранится до удаления аккаунта;
- уведомления только badge/title на сайте;
- E2E-шифрования нет, TLS только в транспорте;
- блокировка переводит существующий диалог в read-only.

Threat model: [chat-threat-model.md](chat-threat-model.md).

## Критерии готовности T133

- [x] границы MVP;
- [x] модель данных;
- [x] API-контракт;
- [x] авторизация и правила блокировок;
- [x] realtime-схема;
- [x] приватность, retention и уведомления;
- [x] threat model;
- [x] тестовые сценарии для T145.
