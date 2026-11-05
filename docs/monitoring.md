# Мониторинг

## Что проверяется и как часто

`deploy/healthcheck.sh` запускается systemd-таймером каждые 5 минут и проверяет:

| Проверка | Порог | Источник |
|---|---|---|
| API | `GET /api/v1/health` отвечает 200 | публичный адрес |
| Веб | `GET /login` отвечает 200 | публичный адрес |
| Диск | занято ≥ 80 % | `df` |
| Память | свободно < 100 МБ | `free` |

Проверки идут по **публичному** адресу, а не по `127.0.0.1`: так ловится не
только падение процесса, но и проблемы Caddy, DNS и сертификата.

## Алерты

Уведомление отправляется только при **смене состояния**: одно сообщение на
начало сбоя и одно на восстановление. Иначе пятиминутный таймер засыпал бы
чат сообщениями всё время, пока сервис лежит.

Канал задаётся в `/etc/jey/health.env` (права `600`):

```ini
BASE_URL=https://j3ynet.site

# Telegram: создать бота у @BotFather, узнать chat_id, вставить токен
ALERT_WEBHOOK=https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>

DISK_WARN=80
MEM_WARN_MB=100
```

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
