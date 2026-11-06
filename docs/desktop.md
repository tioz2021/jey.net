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

## Главный инвариант

> Потеря сервера не должна блокировать доступ к локальной библиотеке.

Первый вход требует сети. После него локальная библиотека открывается без
сервера; истечение или отзыв серверной сессии блокирует sync и публичные
функции, но не доступ к своим данным. Экспорт и локальный бэкап работают
без сервера.

## Текущее состояние

- окно Tauri;
- статическая заглушка `ui/index.html`;
- команда `app_version`;
- общий `jey-desktop` crate без GUI-зависимостей;
- GUI включается только feature `tauri`;
- собранные `AppImage`, `.deb` и `.rpm`;
- AppImage запускается без запущенного сервера;
- локальный grant `access.json` в app data;
- `local_access_status` не делает сетевых запросов;
- локальная SQLite `jey.db` в app data;
- миграции, WAL, `sync_state`, `outbox`, `conflicts`;
- `local_db_status` показывает путь, версию схемы и размеры очередей.

T93 готова: SQLite-схема и миграции есть. Репозитории, офлайн-редактирование
и sync появятся в T94–T95 и T127.

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
./target/release/bundle/appimage/jey.net_0.2.0_amd64.AppImage
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
