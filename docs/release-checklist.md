# Release checklist

Дата: 27 ноября 2026. Релиз: **0.7.14**.

## Preflight

- [x] `git status` чистый, ветка `main`.
- [x] Версии совпадают:
      `bash scripts/check-version.sh`.
- [x] `.env` и секреты не попали в diff.
- [x] `bash scripts/check.sh` проходит.
- [x] `check.sh` и отдельный `e2e.sh` (19 functional + 5 visual) проходят.
- Примечание: GUI-проверка AppImage в sandbox ограничена; desktop smoke
  выполнен на собранном бинарнике, AppImage/deb собраны CI.
- [x] Desktop WebKit smoke зелёный на `main` **до** создания тега
      (workflow `desktop-smoke` запускается на push в `main`).
- [x] `cargo audit`/`npm audit` без новых незакоммиченных исключений.
- [x] backup БД свежий; restore drill `ok: true` (`docs/backup-restore.md`).

## Production

- [x] `DEPLOY_HOST=... bash scripts/deploy.sh`.
- [x] `/api/v1/health` отдаёт новую версию.
- [x] `/` отдаёт SPA, `/downloads/desktop/latest.json` — 200.
- [x] Проверить вход, каталог, лента, «Понравилось», тир-лист.
- [x] Проверить, что VPS-манифест указывает на новую версию.

## Desktop

- [x] `bash scripts/desktop-build.sh --bundles appimage,deb`.
- [x] Проверить запуск AppImage на X11/XWayland.
- [x] Проверить «О приложении → Проверить обновления».
- [x] Опубликовать на VPS:
      `VERSION=0.7.14 DEPLOY_HOST=... bash scripts/publish-desktop.sh`.
- [x] `bash scripts/verify-release.sh vX.Y.Z`.
- [x] Скачать AppImage из манифеста и проверить SHA256.

## Tag

- [x] `git tag v0.7.14`.
- [x] Проверить, что `latest.json` содержит `platforms.*.signature`.
- [x] `git push origin main --tags`.
- [x] Дождаться зелёного release workflow.
- [x] Если VPS-секреты не настроены, VPS job пропускается — опубликовать
      вручную командой выше.
- [x] Записать итог в `docs/done.md`.

## Rollback

- API/SPA: `DEPLOY_HOST=... bash scripts/deploy.sh --rollback`.
- Desktop VPS: вернуть предыдущий `current` symlink в
  `/opt/jey/downloads/desktop/` и обновить `latest.json`.
