# Desktop release pipeline

## Триггеры

```text
push tag v*        → сборка + GitHub Release
workflow_dispatch  → сборка артефактов без обязательного релиза
```

## Pipeline

1. `scripts/check-version.sh` сверяет:
   - `Cargo.toml`;
   - `apps/web/package.json`;
   - `crates/desktop/tauri.conf.json`;
   - тег `vX.Y.Z`.
2. Linux собирает `.AppImage` и `.deb`.
3. Windows собирает `.exe` (NSIS).
4. Каждый job пишет `SHA256SUMS.txt`.
5. Release job скачивает артефакты, пересчитывает SHA256, создаёт
   `release.json` с версией, коммитом и списком файлов, затем публикует.

## Артефакты

```text
jey.net_<version>_amd64.AppImage
jey.net_<version>_amd64.deb
jey.net_<version>_x64-setup.exe
SHA256SUMS.txt
release.json
```

Проверка вручную:

```bash
sha256sum -c SHA256SUMS.txt
```

## Ограничения

- Windows-инсталлятор **не подписан**: для Authenticode нужен сертификат
  и секреты CI; без него SmartScreen покажет предупреждение.
- Auto-update **не включён**: для него нужны `tauri-plugin-updater`,
  публичный ключ, приватный ключ в секретах и подписанный `latest.json`.
  Это отдельный шаг, иначе можно выпустить обновление без проверки подписи.
- Linux-пакеты не подписаны пакетным ключом; целостность проверяется
  SHA256 из GitHub Release.

## VPS update channel (T182)

Публичный GitHub не нужен: релизы отдаёт VPS.

```text
/opt/jey/downloads/desktop/
├── latest.json
├── current -> releases/<version>
└── releases/
    ├── <version>/
    │   ├── jey.net_<version>_amd64.AppImage
    │   ├── jey.net_<version>_amd64.deb
    │   ├── jey.net_<version>_x64-setup.exe
    │   └── SHA256SUMS.txt
    └── <previous>/          ← для отката
```

Caddy:

```text
/downloads/desktop/latest.json  → no-cache
/downloads/*                    → /opt/jey/downloads
```

Публикация:

```bash
VERSION=0.7.1 \
DEPLOY_HOST=... DEPLOY_USER=root SSH_KEY=~/.ssh/jey_vps \
bash scripts/publish-desktop.sh
```

Скрипт:

1. собирает манифест и SHA256;
2. загружает версию в staging;
3. проверяет checksums на VPS;
4. атомарно переключает `current`;
5. обновляет `latest.json`;
6. оставляет текущую и предыдущую версии.

GitHub Actions secrets:

```text
VPS_HOST
VPS_USER
VPS_SSH_KEY
```

Если `VPS_HOST` не задан, локальный запуск только готовит staging. В GitHub
Actions `REQUIRE_VPS=1`, поэтому job падает с явной ошибкой, если секреты
`VPS_HOST/VPS_USER/VPS_SSH_KEY` не настроены.

Клиент в «О приложении» вызывает `local_latest_release`, сравнивает версии и
открывает ссылку на скачивание через `local_open_external`. Автоустановки нет:
пользователь скачивает файл вручную. Это осознанно: подпись Windows и updater
пока не настроены.
