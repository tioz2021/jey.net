# Release checklist

Дата: 22 ноября 2026. Релиз: **0.7.3**.

## Preflight

- [ ] `git status` чистый, ветка `main`.
- [ ] Версии совпадают:
      `bash scripts/check-version.sh`.
- [ ] `.env` и секреты не попали в diff.
- [ ] `bash scripts/check.sh` проходит.
- [ ] `CHECK_E2E=1 bash scripts/check.sh` проходит.
- [ ] `cargo audit`/`npm audit` без новых незакоммиченных исключений.
- [ ] backup БД свежий; restore-check описан в `monitoring.md`.

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
      `VERSION=0.7.3 DEPLOY_HOST=... bash scripts/publish-desktop.sh`.
- [ ] `curl -fsS https://j3ynet.site/downloads/desktop/latest.json`.
- [ ] Скачать AppImage из манифеста и проверить SHA256.

## Tag

- [ ] `git tag v0.7.3`.
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
