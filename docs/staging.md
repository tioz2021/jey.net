# Локальный staging

Staging для одного разработчика: отдельная база, API и web, без Docker и
отдельного сервера. Production не затрагивается.

## Ресурсы

В простое:

```text
RAM:  ~300–500 MB
диск: ~0.5–1.5 GB
CPU:  почти 0%
```

## Запуск

```bash
cp .env.staging.example .env.staging
bash scripts/staging.sh setup
bash scripts/staging.sh up
```

Открыть: http://localhost:3001

Остановить:

```bash
bash scripts/staging.sh down
```

Полностью пересоздать базу:

```bash
bash scripts/staging.sh reset
```

## Что происходит

- база: `jey_staging`, отдельно от `jey`;
- API: `127.0.0.1:8081`;
- web: `127.0.0.1:3001`;
- медиа: `var/staging-media`;
- письма: `var/staging-mail`;
- логи: `.staging/logs/`.

## Ограничения

- Google OAuth и production-секреты не настроены;
- push лучше не включать;
- реальные данные не копировать — только синтетические или санитизированные;
- TLS и Caddy локально не проверяются.

## Перед production

```bash
bash scripts/check.sh
bash scripts/staging.sh up
# smoke: /login, /items, /u/{handle}, /admin, /health
```
