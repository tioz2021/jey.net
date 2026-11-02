# Деплой фронтенда

Next.js собирается в **standalone**-бандл и работает как обычный Node-процесс
за Caddy. Статику отдаёт сам Next, API и медиа проксируются на Rust-сервис.

## Переменные окружения

| Переменная | Где задана | Смысл |
|---|---|---|
| `BACKEND_URL` | `jey-web.service` | адрес API для серверных запросов (`http://127.0.0.1:8080`) |
| `PORT` | `jey-web.service` | порт Next (`3000`, слушает только localhost) |
| `HOSTNAME` | `jey-web.service` | `127.0.0.1` — наружу смотрит Caddy |
| `NODE_ENV` | `jey-web.service` | `production` |
| `PUBLIC_URL` | `jey-web.service` | публичный адрес для `metadataBase`, `robots.txt` и `sitemap.xml` |

**Смена адреса API не требует пересборки.** `BACKEND_URL` читается серверными
компонентами во время запроса, поэтому достаточно поменять строку в юните,
сделать `systemctl daemon-reload` и `systemctl restart jey-web`.

Проверено: тот же собранный бандл, запущенный с `BACKEND_URL=http://127.0.0.1:9999`,
отвечает ошибкой — значит адрес берётся из окружения, а не вшит в сборку.

## Сборка

```bash
cd frontend
npm ci
BACKEND_URL=http://127.0.0.1:8080 npm run build

# standalone не включает статику и public — копируем отдельно
cp -R .next/static .next/standalone/.next/static
cp -R public .next/standalone/public
tar -C .next/standalone -czf ../jey-web.tar.gz .
```

## Выкладка

```bash
scp jey-web.tar.gz root@<IP>:/tmp/
ssh root@<IP> '
  set -e
  rm -rf /opt/jey/web.prev
  mv /opt/jey/web /opt/jey/web.prev
  install -d -o jey -g jey -m 750 /opt/jey/web
  tar -xzf /tmp/jey-web.tar.gz -C /opt/jey/web
  rm -f /tmp/jey-web.tar.gz
  install -d -o jey -g jey -m 750 /opt/jey/web/.next/cache
  chown -R jey:jey /opt/jey/web
  systemctl restart jey-web
'
```

Юнит лежит в репозитории: `deploy/jey-web.service`. Он запускает
`node server.js` от пользователя `jey`, с `Restart=always`, лимитом памяти
512 МБ и файловой системой только для чтения (запись разрешена лишь в
`.next/cache`).

Проверка:

```bash
systemctl is-active jey-web
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/login
curl -fsS https://<host>/api/v1/health
```

## CI

- `.github/workflows/ci.yml` — job `Frontend`: `npm ci`, `npm run lint`,
  `npm run build` на каждый push и pull request;
- `.github/workflows/deploy.yml` — ручной деплой (`workflow_dispatch`):
  собирает API и фронтенд, заливает по rsync, применяет миграции и
  перезапускает сервисы.

Для деплоя в GitHub нужны секреты:

| Секрет | Значение |
|---|---|
| `DEPLOY_HOST` | IP или домен сервера |
| `DEPLOY_USER` | `root` (нужны права на `/opt` и `systemctl`) |
| `DEPLOY_SSH_KEY` | приватный ключ в формате OpenSSH |

## Откат

Предыдущая версия остаётся в `/opt/jey/web.prev`:

```bash
ssh root@<IP> '
  rm -rf /opt/jey/web
  mv /opt/jey/web.prev /opt/jey/web
  systemctl restart jey-web
'
```

У API откат — вернуть предыдущий бинарник и перезапустить `jey-api`
(миграции назад не откатываются, поэтому деплой идёт только вперёд).
