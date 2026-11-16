# T150 — E2E-шифрование чата (план)

Статус: архитектура зафиксирована, реализация не начата. Текущий чат
0.5.0 использует TLS и plaintext на сервере.

## Выбранный MVP

- **X25519 + HKDF-SHA256 + AES-256-GCM**.
- У каждого устройства своя пара ключей.
- Публичные ключи устройств хранятся на сервере; приватные не покидают
  устройство.
- Новые сообщения шифруются в отдельные конверты для каждого устройства
  участника диалога.
- Сервер хранит только opaque-конверты и метаданные.
- Старые plaintext-сообщения остаются читаемыми.
- Recovery: 24-словная фраза, из которой детерминированно выводится
  X25519 private key. Фраза не отправляется на сервер.
- Forward secrecy в MVP **нет**: компрометация долгоживущего ключа раскрывает
  историю. Double Ratchet — отдельный этап после MVP.

## Конверт

```json
{
  "version": 1,
  "sender_device_id": "uuid",
  "ephemeral_public": "base64",
  "salt": "base64",
  "nonce": "base64",
  "ciphertext": "base64"
}
```

Один `chat_messages.ciphertext` содержит массив конвертов:

```json
{
  "version": 1,
  "envelopes": [
    { "device_id": "...", "ephemeral_public": "...", "salt": "...", "nonce": "...", "ciphertext": "..." }
  ]
}
```

AAD:

```text
thread_id | client_id | version
```

`device_id` остаётся в конверте для маршрутизации, но не входит в AAD: это
позволяет расшифровать старые конверты после восстановления ключа на новом
устройстве.

Сервер проверяет только форму/размеры конверта. Он не знает ключей и не
может прочитать `body`.

## Ключи

- Web: private key в IndexedDB, public key регистрируется через
  `POST /chat/devices`.
- Desktop: тот же SPA; private key хранится в IndexedDB WebView (позже —
  нативный keychain T150.5).
- Recovery phrase: BIP39, 24 слова; импорт создаёт тот же X25519 key.
- Устройство можно отозвать; новые сообщения на него больше не шифруются.
- Multi-device: отправитель получает все активные устройства получателя и
  своё текущее устройство (для собственной истории).

## Что меняется в API

```text
POST   /chat/devices                     { device_id, public_key }
GET    /chat/users/{id}/devices          публичные ключи активных устройств
DELETE /chat/devices/{device_id}         отозвать своё устройство
```

`POST /messages` принимает либо `body`, либо `encrypted`-конверт.
`GET /messages` возвращает `encrypted`, если сообщение зашифровано.

## Ограничения

- сервер видит метаданные: участники, время, размер, реакции;
- поиск по шифрованным сообщениям только локальный, серверный `q` для них
  не работает;
- редактирование пересобирает конверты;
- реакции остаются метаданными и работают;
- XSS/компрометация устройства раскрывает ключ;
- потеря всех устройств и recovery-фразы означает потерю истории;
- старые plaintext-сообщения не становятся E2E.

## Этапы

| ID | Этап | Результат |
|---|---|---|
| T150.1 | Архитектура и threat model | этот документ, конверт, recovery |
| T150.2 | Реестр устройств | ✅ миграция `0065_chat_devices`, API, тесты |
| T150.3 | Web crypto | ✅ X25519/HKDF/AES-GCM, IndexedDB, recovery UI |
| T150.4 | Отправка и история | ✅ encrypted envelope, edit, client search, live E2E test |
| T150.5 | Desktop | ✅ bridge, offline-кеш конвертов, device cache |
| T150.6 | Тесты и релиз | crypto vectors, multi-device, recovery, tag |

## T150.5 — desktop

Сделано:

- desktop-миграция `0006_chat_e2e.sql`;
- `chat_messages.encrypted` и `encryption_version` в SQLite;
- `chat_outbox.encrypted` — офлайн-очередь хранит только конверт, не plaintext;
- кеш публичных device keys собеседника (`chat_devices`);
- Tauri-команда `local_chat_user_devices`;
- bridge передаёт `encrypted` в `local_chat_send`;
- flush outbox отправляет конверты после reconnect;
- тесты: encrypted outbox сохраняется после перезапуска, plaintext не пишется.

## T150.4 — encrypted messages

Сделано:

- `chat_messages.encrypted` (jsonb) и `encryption_version`;
- сервер принимает только opaque-конверты и не требует plaintext;
- `POST /messages` и `PATCH /messages/{id}` принимают `encrypted`;
- история и SSE возвращают конверты;
- web расшифровывает историю, SSE, polling и ответы edit;
- реакции/edit пересобирают конверты;
- поиск по зашифрованным сообщениям — локальный, по уже загруженным;
- если у собеседника нет device key, чат показывает `E2E не настроено` и работает
  в legacy-режиме.

Проверено на production двумя браузерными сессиями: S05 и Chat Test создали
ключи, S05 отправил сообщение, Chat Test прочитал его; в БД лежит
`body: "[encrypted]"` и opaque `encrypted.envelopes`.

Ограничение: desktop T150.5 ещё не умеет хранить encrypted-конверты в
локальном кеше.

## T150.3 — web crypto

Сделано:

- X25519 + HKDF-SHA256 + AES-256-GCM;
- 24-словная BIP39 recovery-фраза;
- приватный ключ в IndexedDB, не в localStorage и не на сервере;
- конверт на каждое устройство;
- настройки: создать ключ, показать фразу один раз, восстановить, отозвать;
- self-test шифрования при создании/восстановлении;
- отпечаток публичного ключа.

Проверено изолированно: 24 слова, одинаковый public key после recovery,
encrypt/decrypt конверта.

## T150.2 — реестр устройств

Сделано:

- миграция `migrations/0065_chat_devices.sql`;
- `POST /api/v1/chat/devices` — регистрация/ротация X25519 public key;
- `GET /api/v1/chat/devices` — свои устройства;
- `GET /api/v1/chat/users/{id}/devices` — публичные ключи собеседника;
- `DELETE /api/v1/chat/devices/{device_id}` — отзыв;
- проверка base64 и длины 32 байта;
- тест `chat_devices`.

Приватные ключи на сервер не попадают. Шифрование сообщений ещё не включено —
это T150.3–T150.4.

## Критерии готовности

- [x] выбрать примитивы и способ recovery;
- [ ] сервер не получает plaintext новых сообщений;
- [ ] два устройства расшифровывают переписку;
- [ ] recovery phrase восстанавливает ключ;
- [ ] потеря устройства не ломает остальные;
- [ ] plaintext-история читается;
- [ ] offline-очередь хранит только конверты;
- [ ] тесты на подмену AAD/конверта и отзыв устройства.
