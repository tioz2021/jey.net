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
