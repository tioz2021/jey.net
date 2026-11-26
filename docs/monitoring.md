# Мониторинг

## Что проверяется и как часто

`deploy/healthcheck.sh` запускается systemd-таймером каждые 5 минут и проверяет:

| Проверка | Порог | Источник |
|---|---|---|
| API readiness | `GET /health/ready` отвечает 200 | публичный адрес |
| Веб | `GET /` отвечает 200 | публичный адрес |
| API p95 | > 200 ms при ≥ 20 запросах за 15 минут | structured journal |
| API 5xx | > 0 за 15 минут | structured journal |
| SSE отключения | > 25 закрытий за интервал | `/health/ready` |
| Client errors | > 20 за 15 минут | `client_errors` |
| Диск | занято ≥ 80 % | `df` |
| Память | свободно < 100 МБ | `free` |
| TLS | осталось < 14 дней | `openssl` |
| Backup | старше 30 часов | `/var/backups/jey` |

Проверки идут по **публичному** адресу, а не по `127.0.0.1`: так ловится не
только падение процесса, но и проблемы Caddy, DNS и сертификата.

## Алерты

Уведомление отправляется только при **смене состояния**: одно сообщение на
начало сбоя и одно на восстановление. Иначе пятиминутный таймер засыпал бы
чат сообщениями всё время, пока сервис лежит.

Проверка использует существующий healthchecks.io dead-man check через
`HC_PING_URL`: успешный прогон отправляет ping, проблема — `/fail`. Отдельный
URL для p95 не нужен.

Канал задаётся в `/etc/jey/health.env` (права `600`):

```ini
BASE_URL=https://j3ynet.site

# Telegram: создать бота у @BotFather, узнать chat_id, вставить токен
ALERT_WEBHOOK=https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>

DISK_WARN=80
MEM_WARN_MB=100
P95_WARN_MS=200
P95_MIN_REQUESTS=20
HC_PING_URL=https://hc-ping.com/<uuid>
SSE_DISCONNECT_WARN=25
SSE_STATE_FILE=/var/lib/jey/sse.state
CLIENT_ERROR_WARN=20
CLIENT_ERROR_WINDOW_MIN=15
```

Client errors старше 30 дней удаляются ежедневно
`jey-client-errors-retention.timer`; retention задаётся
`CLIENT_ERROR_RETENTION_DAYS`.

`/health/ready` отдаёт счётчики `sse.notifications` и `sse.chat`:
`active`, `opened`, `closed`. Healthcheck сравнивает прирост `closed` с
предыдущим запуском и отправляет `/fail`, если отключений больше порога.

Если `ALERT_WEBHOOK` не задан, предупреждения всё равно попадают в journald:

```bash
journalctl -t jey-health --since "1 hour ago"
```

Подойдёт любой сервис, принимающий `POST` с JSON `{"text": "..."}`.

## Установка

```bash
install -m 755 deploy/healthcheck.sh /usr/local/bin/jey-healthcheck
install -m 644 deploy/jey-healthcheck.service /etc/systemd/system/
install -m 644 deploy/jey-healthcheck.timer /etc/systemd/system/
install -d -m 700 /etc/jey
printf 'BASE_URL=https://<host>\n' > /etc/jey/health.env
chmod 600 /etc/jey/health.env

systemctl daemon-reload
systemctl enable --now jey-healthcheck.timer
install -m 755 scripts/client-errors-retention.sh /usr/local/bin/jey-client-errors-retention
install -m 644 deploy/jey-client-errors-retention.service /etc/systemd/system/
install -m 644 deploy/jey-client-errors-retention.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now jey-client-errors-retention.timer
```

Проверить вручную:

```bash
HEALTH_ENV=/etc/jey/health.env /usr/local/bin/jey-healthcheck --verbose
systemctl list-timers jey-healthcheck.timer
```

## Ротация логов

| Источник | Как ограничен |
|---|---|
| API и веб | journald: `SystemMaxUse=200M`, `SystemKeepFree=1G`, хранение 2 недели |
| Caddy | пишет в journald, попадает под те же лимиты |
| PostgreSQL | `logging_collector`, ротация по дню и 50 МБ (`docs/deploy.md`, T72) |
| health check | только переходы состояний, в journald |

Настройки journald: `deploy/journald-jey.conf` →
`/etc/systemd/journald.conf.d/99-jey.conf`, затем `systemctl restart systemd-journald`.

Проверка:

```bash
journalctl --disk-usage
```

## Проверка алертов

```bash
# 1. Алерт при падении API
systemctl stop jey-api
HEALTH_ENV=/tmp/test-health.env /usr/local/bin/jey-healthcheck --verbose
systemctl start jey-api
HEALTH_ENV=/tmp/test-health.env /usr/local/bin/jey-healthcheck --verbose
```

В `/tmp/test-health.env` можно указать `BASE_URL`, `STATE_FILE=/tmp/test.state`
и `ALERT_WEBHOOK=http://127.0.0.1:8099/alert`, направив уведомления на
локальный приёмник.

Порог диска проверяется тем же способом: `DISK_WARN=1` в тестовом env даёт
предупреждение о диске при текущих 2 %.

## Метрики T171

`GET /api/v1/admin/system` для staff-аккаунта теперь отдаёт блок `metrics`:

- `requests.total`, `2xx`, `3xx`, `4xx`, `5xx`;
- `latency_ms.avg`, `latency_ms.max`;
- распределение по корзинам `5/10/25/50/100/250/500/1000/+inf` мс.

Счётчики процессные: они обнуляются при рестарте API и не являются заменой
Prometheus/Grafana. Этого достаточно, чтобы увидеть деградацию между деплоями
и связать пользовательскую жалобу с request id из `system_errors`.

## Восстановление

Ежедневный `jey-backup-db` не только шифрует дамп, но и **восстанавливает его
во временную БД** `jey_restore_*`, сверяет количество строк в `users`, `items`
и `_sqlx_migrations`, и только после этого помечает backup-status успешным.
Отдельный restore-drill:

```bash
# проверить последний архив вручную
ls -lt /var/backups/jey/*.dump.gpg | head -1
sha256sum -c /var/backups/jey/<latest>.sha256

# восстановить на отдельной БД, не трогая production
/usr/local/bin/jey-restore-db /var/backups/jey/<latest>.dump.gpg --yes
```

Последняя команда останавливает API и восстанавливает **production**;
для учебной проверки используй staging. Ежедневный restore-check уже
запускается в `jey-backup-db` и не затрагивает рабочую БД.
