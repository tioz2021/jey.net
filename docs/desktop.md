# Desktop (Tauri)

Каркас desktop-клиента живёт в `crates/desktop`.

## Текущее состояние

- окно Tauri;
- статическая заглушка `ui/index.html`;
- команда `app_version`;
- общий `jey-desktop` crate без GUI-зависимостей;
- GUI включается только feature `tauri`;
- собранные `AppImage`, `.deb` и `.rpm`;
- AppImage запускается без запущенного сервера.

Библиотека, SQLite и sync появятся в T93–T95 и T127.

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
