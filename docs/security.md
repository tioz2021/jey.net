# Аудит безопасности

Дата: **22 ноября 2026**, дополнено для 0.7.12. Объект: `https://j3ynet.site`,
API, React SPA, Tauri desktop и сервер. Метод: чтение кода, автоматические проверки,
динамические запросы к проду и зависимости.

## Итог

| Проверка | Результат |
|---|---|
| `cargo audit` | 0 vulnerabilities; 6 принятых warning в Tauri/GTK/chrono |
| `npm audit --omit=dev` | 0 уязвимостей (после override `postcss`) |
| `npm audit` (полный) | 1 moderate в dev-зависимости, не попадает в прод |
| IDOR | чужие записи и файлы недоступны, тесты есть |
| CSRF | запрос без `Origin` → 403, чужой `Origin` → 403 |
| Лимиты | логин 5/мин, регистрация 3/час, тяжёлые чтения 120/мин |
| CSP | включён, интерфейс не сломан (0 нарушений) |

## Заголовки

| Заголовок | Было | Стало |
|---|---|---|
| `Content-Security-Policy` | нет | `default-src 'self'` и т.д. |
| `Permissions-Policy` | нет | камера, микрофон, геолокация, оплата, USB запрещены |
| `Cross-Origin-Opener-Policy` | нет | `same-origin` |
| `X-Powered-By` | `Next.js` (архив) | удалён; сейчас Vite SPA |
| `Server` | скрыт | скрыт |
| HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` | были | без изменений |

Политика CSP:

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
upgrade-insecure-requests
```

`'unsafe-inline'` для скриптов остаётся вынужденным для статического SPA и
тем; это блокирует сторонние источники и `<object>`, но не защищает от
инъекции инлайнового скрипта. Переход на nonce/hash CSP — отдельный шаг.

**Проверка «CSP не ломает интерфейс»:** headless Chrome прошёл `/login`,
`/items`, `/settings`, `/u/{id}` через прод — все страницы отрисовались,
нарушений CSP в консоли **0**.

## T170 — заголовки, лимиты и загрузки

- API отдаёт `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `COOP` и строгий API-CSP; Caddy добавляет HSTS;
- тяжёлые чтения (`/feed`, `/liked`, рекомендации) ограничены 120 запросами
  в минуту на аккаунт;
- поиск уже имеет отдельный лимит, регистрация и логин — свои;
- загрузки: 10 МБ, проверка сигнатуры, повторное декодирование и лимит
  **40 мегапикселей** до выделения памяти;
- `scripts/security-audit.sh` запускает `cargo audit` и
  `npm audit --omit=dev`.

Часть advisory остаётся в транзитивных desktop/push-зависимостях; они
зафиксированы в `.cargo/audit.toml` с причиной. Это не скрытие: обновление
заблокировано semver-зависимостями Tauri/rusqlite/web-push и отслеживается
в security-документе.

## CSRF

- cookie сессии: `HttpOnly`, `SameSite=Lax`, в проде `Secure`;
- `Origin` (или `Referer`) обязателен для `POST/PUT/PATCH/DELETE`:
  без него — `403`, с чужим origin — `403`;
- тест `state_changing_requests_require_a_known_origin` в `tests/auth.rs`.

## IDOR

| Объект | Проверка | Результат |
|---|---|---|
| Записи | чужой `GET/PATCH/DELETE` | 404, тесты в `tests/items.rs` |
| Обложки | чужой `upload_id` | отклоняется, `tests/covers.rs` |
| Аватары | чужой `upload_id` | отклоняется, `tests/avatar.rs` |
| Медиа | чужой файл при закрытом профиле | 403, `tests/media.rs` |
| Публичный профиль | заметки, email, черновики | не отдаются, `tests/public_profile.rs` |

## Аутентификация и сессии

- пароли — argon2id, хеш с солью;
- сессии — 32 случайных байта, в базе только SHA-256;
- истёкшие и неизвестные токены дают одинаковый `401`;
- логин выполняет фиктивную проверку пароля, чтобы время ответа не выдавало
  существование аккаунта;
- лимиты попыток хранятся в PostgreSQL и переживают перезапуск.

## Зависимости

`cargo audit` нашёл **RUSTSEC-2026-0385**: `ctutils 0.4.2` — неконстантное
сравнение масок. Пакет приходит транзитивно через `argon2`/`digest`, то есть
касается проверки паролей. Обновлён до `0.4.4` (`cargo update -p ctutils`),
повторный аудит чист.

`npm audit` нашёл уязвимости `postcss 8.4.31` (XSS при сборке CSS,
произвольное чтение `.map`). Зависимость пришла из старого фронтенда; добавлен
`overrides` на `postcss ^8.5.32`; `npm audit --omit=dev` теперь **0**.

Остаётся **1 moderate** в `minimatch` внутри eslint (dev-зависимость).
Она не попадает в бандл и не обрабатывает пользовательские данные; исправление
требует откатить eslint до 4.0.0 (`npm audit fix --force`), что сломает
линтер. Принято как риск и записано здесь.

## Сервер

| Проверка | Результат |
|---|---|
| Открытые порты | 22, 80, 443; API, PostgreSQL, admin Caddy — только localhost |
| SSH | вход по ключу, пароли запрещены, root — только по ключу |
| Firewall | `ufw` активен |
| Автообновления | `unattended-upgrades` включён |
| fail2ban | **не установлен** |
| `/dev` (полигон компонентов) | закрыт на проде: `404` |

## Найденное и исправленное

| # | Находка | Серьёзность | Статус |
|---|---|---|---|
| 1 | Нет CSP | средняя | исправлено |
| 2 | `X-Powered-By: Next.js` (исторический фронтенд) | низкая | исправлено |
| 3 | Нет `Permissions-Policy` и COOP | низкая | исправлено |
| 4 | Полигон `/dev` доступен на проде | низкая | исправлено (404) |
| 5 | `ctutils 0.4.2` (RUSTSEC-2026-0385) | высокая | исправлено (0.4.4) |
| 6 | `postcss 8.4.31` (npm audit) | высокая | исправлено (override 8.5.32) |
| 7 | chrono unmaintained | низкая | принято, timestamps |
| 8 | proc-macro-error unmaintained | низкая | build-time Tauri |
| 9–11 | zbus_names/zvariant* unmaintained | низкая | Tauri/GTK, нет безопасного апгрейда |
| 12 | glib iterator unsound | низкая | локальный GTK, не сетевой ввод |
| 7 | `minimatch` в eslint | низкая (dev) | принято |

## E2E чат (0.6.0)

- X25519 + HKDF-SHA256 + AES-256-GCM на клиенте;
- сервер получает только public device keys и opaque envelopes;
- forward secrecy отсутствует;
- recovery-фраза BIP39 хранится только у пользователя;
- сервер видит метаданные чата;
- старые plaintext-сообщения не перешифровываются.

## Что осталось (известные ограничения)

1. **Нет fail2ban/sshguard** — защита SSH только ключами и `ufw`. Для одного
   сервера приемлемо, но при публичном запуске стоит добавить.
2. **CSP с `'unsafe-inline'`** — следующий шаг: nonce в middleware и
   `strict-dynamic`.
3. **Нет защиты от DDoS** — только Caddy и лимиты приложения; при атаке
   поможет Cloudflare или аналогичный прокси.
4. **Один сервер** — единая точка отказа; backup/restore уже реализованы.
5. **Нет `security.txt`** — можно добавить контакт для сообщений об
   уязвимостях.
6. Зависимости обновляются вручную; аудит запускается в CI, автоматический
   Dependabot/Renovate стоит включить перед публичным запуском.


## CSP (T191)

Web CSP больше не разрешает `script-src 'unsafe-inline'`: hash inline
theme-скрипта проверяется `scripts/check-csp.sh` и встроен в quality gate.

`style-src` тоже без `unsafe-inline`: динамические размеры применяются через
CSSOM (`useCssStyle`), статические стили вынесены в CSS. CSP проверен в
production: 0 violations и 0 inline style attributes.


## Публичный API (T193)

Публичные маршруты ограничены **300 запросами в минуту на IP** (окно 60 с,
блокировка 60 с). `/api/v1/health` исключён, чтобы health checks не упирались
в лимит. Ошибка — `429 rate_limited` с `Retry-After`.


## RUSTSEC-2026-0594 (fixed)

`cookie 0.18.2` (transitive through Tauri) had a private-cookie nonce issue.
Updated to `0.18.3`; `cargo audit` is clean.
