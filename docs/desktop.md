# Desktop (Tauri)

Каркас desktop-клиента живёт в `crates/desktop`.

## Локальный доступ

`crates/desktop/src/access.rs` хранит `access.json` в app data:

- создаётся после успешного онлайн-входа;
- переживает перезапуск;
- не имеет срока действия;
- не отзывается при истечении серверной сессии;
- удаляется только явным «забыть устройство»;
- не требует сети для чтения.

Проверка запуска без сервера:

```bash
timeout 5 ./target/release/jey-desktop
```

Процесс остаётся жив, окно открывается, `local_access_status` отвечает без сети.
Интеграция записи grant в форму входа — T93/T94.

## Приёмка потери сервера

`crates/desktop/tests/server_loss.rs` проверяет:

- локальный grant без сети;
- создание записи офлайн;
- перезапуск приложения;
- редактирование после перезапуска;
- JSON-экспорт;
- бэкап;
- восстановление базы из бэкапа;
- сохранение `outbox` после восстановления.

Тест использует заведомо недоступный адрес `http://127.0.0.1:9` и не делает
сетевых запросов.

## Главный инвариант

> Потеря сервера не должна блокировать доступ к локальной библиотеке.

Первый вход требует сети. После него локальная библиотека открывается без
сервера; истечение или отзыв серверной сессии блокирует sync и публичные
функции, но не доступ к своим данным. Экспорт и локальный бэкап работают
без сервера.

## UI

Desktop UI использует общую SPA из `apps/web` и общие компоненты `frontend/`.
Отдельного `apps/desktop` больше нет; desktop подключает SPA через Tauri.

## Текущее состояние

- окно Tauri;
- общая Vite + React SPA из `apps/web`;
- команда `app_version`;
- общий `jey-desktop` crate без GUI-зависимостей;
- GUI включается только feature `tauri`;
- собранные `AppImage`, `.deb` и `.rpm`;
- AppImage запускается без запущенного сервера;
- локальный grant `access.json` в app data;
- `local_access_status` не делает сетевых запросов;
- локальная SQLite `jey.db` в app data;
- миграции, WAL, `sync_state`, `outbox`, `conflicts`;
- `local_db_status` показывает путь, версию схемы и размеры очередей;
- `local_list_items`, `local_create_item`, `local_update_item`,
  `local_delete_item` — офлайн-библиотека;
- `local_sign_in` — первый онлайн-вход по email/паролю;
- `local_google_sign_in` — Google через системный браузер, loopback и PKCE;
- `local_sign_out` — забыть устройство и сессию;
- обе команды входа сохраняют сессионный токен в `session.json` (0600);
- изменения попадают в `outbox` и помечаются «ожидает синхронизации»;
- `local_export_json` — JSON всей библиотеки в `exports/`;
- `local_backup` — консистентная копия `jey.db` и `media/` в `backups/`;
- экспорт и бэкап не требуют сервера.

T93–T95, T117, T118, T102, T109 и T110 готовы: SQLite-схема, общий
контракт, офлайн-CRUD, `outbox`, JSON-экспорт, бэкап, приёмка потери сервера,
регистрация устройства, push/pull, кнопка Sync, баннер изменений и локальный
кэш медиа.

## Репозиторий

`jey-core::repositories::ItemRepository` — общий CRUD-контракт.

- `PgItems` использует существующий PostgreSQL-репозиторий;
- `SqliteItems` — локальную SQLite;
- `jey-repo-contract` — один и тот же сценарий для обоих;
- проверяются create/get/list/update/delete, очистка рецензии и ревизии.

## Поиск

Поиск в desktop использует общий `jey_core::search`:

- название и локализованные названия;
- автор/режиссёр;
- рецензия;
- метаданные;
- одинаковые приоритеты с вебом.

Контракт: [search.md](search.md).

## Медиа

T109/T110:

- обложки скачиваются при sync в `app-data/media/<key>`;
- карточка получает локальный файл через `local_cover_data` (data URL);
- уже скачанные обложки доступны офлайн;
- путь кэша совпадает с тем, что копирует бэкап;
- если файла нет, остаётся placeholder;
- текущая модель сервера хранит только `cover_key`; тот же кэш готов для
  будущих вложений.

## Sync

Кнопка «Синхронизировать»:

- регистрирует устройство;
- отправляет `outbox` через `/sync/push`;
- забирает изменения через `/sync/pull`;
- обновляет `sync_state`;
- показывает баннер «есть изменения в вебе» при `changes_after > 0`;
- опрашивает `/sync/status` раз в 30 секунд и при возврате фокуса.

Если сервер недоступен или сессия истекла, локальная библиотека остаётся
доступной; sync просто не выполняется.

## Google-вход

Кнопка **«Войти через Google»**:

1. открывает системный браузер;
2. сервер ведёт в Google;
3. Google возвращает на сервер;
4. сервер редиректит на `127.0.0.1:<port>/callback`;
5. desktop меняет одноразовый код + PKCE на сессию.

WebView для Google не используется. Схема и ограничения — в
[desktop-ui.md](desktop-ui.md).

## Запуск

Сборка не запускает окно. После `cargo tauri build` запусти бинарник:

```bash
bash scripts/desktop-run.sh
```

или напрямую:

```bash
./target/release/jey-desktop
```

AppImage:

```bash
./target/release/bundle/appimage/jey.net_0.3.19_amd64.AppImage
```

Для разработки с пересборкой:

```bash
cd crates/desktop
cargo tauri dev --features tauri
```

## Сборка

Проверка кода без GUI (работает на машине без WebKitGTK/GTK dev):

```bash
cargo check -p jey-desktop
cargo test -p jey-desktop
```

Полная GUI-сборка требует системных библиотек. Fedora:

```bash
sudo dnf install webkit2gtk4.1-devel gtk3-devel dbus-devel \
  libappindicator-gtk3-devel librsvg2-devel pkgconf-pkg-config
cargo install tauri-cli --version '^2' --locked
bash scripts/desktop-build.sh
```

Ubuntu/Debian:

```bash
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev \
  librsvg2-dev patchelf pkg-config libdbus-1-dev
```

Windows и Linux собираются из одного кода, но отдельными job'ами:
`.github/workflows/desktop.yml` (ручной запуск).

## Решения 0.3

- Windows и Linux с первого релиза.
- Локальный клиент — основа; сервер — хаб и арбитр.
- Полная синхронизация медиа: сначала метаданные, файлы — фоновой очередью.
- Без шифрования локальной БД в 0.3.
- Офлайн-вход: вариант A, первый вход онлайн, затем сохранённая сессия.
- Один аккаунт — одна библиотека на всех своих устройствах.
