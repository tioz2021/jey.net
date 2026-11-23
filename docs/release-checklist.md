# Release checklist

Дата: 23 ноября 2026. Релиз: **0.7.8**.

## Preflight

- [ ] `git status` чистый, ветка `main`.
- [ ] Версии совпадают:
      `bash scripts/check-version.sh`.
- [ ] `.env` и секреты не попали в diff.
- [ ] `bash scripts/check.sh` проходит.
- [ ] `CHECK_E2E=1 bash scripts/check.sh` проходит.
- [ ] Desktop WebKit smoke зелёный на `main` **до** создания тега
      (workflow `desktop-smoke` запускается на push в `main`).
- [ ] `cargo audit`/`npm audit` без новых незакоммиченных исключений.
- [ ] backup БД свежий; restore drill `ok: true` (`docs/backup-restore.md`).

## Production

- [ ] `DEPLOY_HOST=... bash scripts/deploy.sh`.
- [ ] `/api/v1/health` отдаёт новую версию.
- [ ] `/` отдаёт SPA, `/downloads/desktop/latest.json` — 200.
- [ ] Проверить вход, каталог, лента, «Понравилось», тир-лист.
- [ ] Проверить, что VPS-манифест указывает на новую версию.

## Desktop

- [ ] `bash scripts/desktop-build.sh --bundles appimage,deb`.
- [ ] Проверить запуск AppImage на X11/XWayland.
- [ ] Проверить «О приложении → Проверить обновления».
- [ ] Опубликовать на VPS:
      `VERSION=0.7.8 DEPLOY_HOST=... bash scripts/publish-desktop.sh`.
- [ ] `bash scripts/verify-release.sh vX.Y.Z`.
- [ ] Скачать AppImage из манифеста и проверить SHA256.

## Tag

- [ ] `git tag v0.7.8`.
- [ ] Проверить, что `latest.json` содержит `platforms.*.signature`.
- [ ] `git push origin main --tags`.
- [ ] Дождаться зелёного release workflow.
- [ ] Если VPS-секреты не настроены, VPS job пропускается — опубликовать
      вручную командой выше.
- [ ] Записать итог в `docs/done.md`.

## Rollback

- API/SPA: `DEPLOY_HOST=... bash scripts/deploy.sh --rollback`.
- Desktop VPS: вернуть предыдущий `current` symlink в
  `/opt/jey/downloads/desktop/` и обновить `latest.json`.
