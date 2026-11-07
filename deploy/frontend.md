# Деплой SPA

Веб-клиент — Vite SPA в `apps/web`. Next.js больше не используется.
Caddy направляет все не-API маршруты в Rust API, который отдаёт статику SPA
из `/opt/jey/spa`.

## Переменные

| Переменная | Где задана | Смысл |
|---|---|---|
| `SPA_DIR` | `jey-api.service` | каталог собранной SPA (`/opt/jey/spa`) |
| `BACKEND_URL` | `jey-api.service` | внутренний адрес API (`http://127.0.0.1:8080`) |
| `DATABASE_URL` | `/etc/jey/api.env` | PostgreSQL |

## Сборка

```bash
cd apps/web
npm ci
npm run build
tar -C dist -czf ../jey-spa.tar.gz .
```

## Выкладка

```bash
scp jey-spa.tar.gz root@<IP>:/tmp/
ssh root@<IP> '
  set -e
  rm -rf /opt/jey/spa.prev
  mv /opt/jey/spa /opt/jey/spa.prev
  install -d -o jey -g jey -m 755 /opt/jey/spa
  tar -xzf /tmp/jey-spa.tar.gz -C /opt/jey/spa
  rm -f /tmp/jey-spa.tar.gz
  systemctl restart jey-api
'
```

Caddy проксирует `/` в `jey-api`; API отдаёт `index.html` для SPA-маршрутов
и файлы из `/opt/jey/spa`.

## Проверка

```bash
systemctl is-active jey-api
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/
curl -fsS https://<host>/api/v1/health
```

CI: `.github/workflows/ci.yml` собирает `apps/web`, а не `frontend`.
