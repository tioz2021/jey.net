# Runbook: что делать, когда всё сломалось

Документ для одного человека — владельца. Все команды выполняются с рабочей
машины, если не сказано иное. Время реакции указано для рабочего времени:
это личный проект, а не круглосуточный сервис.

## Контакты и доступы

| Что | Где |
|---|---|
| Сервер | `129.121.149.16`, пользователь `jey` (sudo ограничен), `root` — по ключу |
| Домен (временный) | `129-121-149-16.sslip.io` (sslip.io, DNS настраивать не нужно) |
| Панель провайдера | VNC-консоль — единственный способ войти, если SSH отвалился |
| Репозиторий | GitHub `tioz2021/jey.net`, деплой — `scripts/deploy.sh` |
| Алерты | webhook из `/etc/jey/health.env` (Telegram) + `journalctl -t jey-health` |

## Куда смотреть в первую очередь

```bash
# 1. Сайт целиком
curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' https://<host>/login

# 2. Что с сервисами
systemctl status jey-api jey-web caddy postgresql@18-main --no-pager

# 3. Последние ошибки API и веба
journalctl -u jey-api -u jey-web --since "15 min ago" --no-pager | tail -50

# 4. Что говорит мониторинг
journalctl -t jey-health --since "1 hour ago"
cat /var/lib/jey/health.state
```

### Где какие логи

| Источник | Команда |
|---|---|
| API | `journalctl -u jey-api --since "1 hour ago"` |
| Веб | `journalctl -u jey-web --since "1 hour ago"` |
| Caddy (TLS, прокси) | `journalctl -u caddy --since "1 hour ago"` |
| PostgreSQL | `journalctl -u postgresql@18-main` и `/var/log/postgresql/postgresql-18-main.log` |
| Health-check | `journalctl -t jey-health --since "1 day ago"` |
| Ошибки API в JSON | `journalctl -u jey-api -o cat \| grep '"level":"ERROR"'` |

## Сценарии

### 1. API не отвечает (502/503, health-check молчит)

```bash
systemctl status jey-api --no-pager
journalctl -u jey-api --since "10 min ago" --no-pager | tail -30
curl -fsS http://127.0.0.1:8080/api/v1/health/ready
```

- **Сервис упал, база жива** → `systemctl restart jey-api`, проверить health.
- **Перезапуск не помогает** → откатить релиз:
  `DEPLOY_HOST=<host> bash scripts/deploy.sh --rollback`.
- **В логах `database connection established` нет, а есть ошибки подключения** →
  сценарий 3 (Postgres).
- **Порт занят** → `ss -ltnp | grep 8080`, найти процесс, это не должно случаться
  при штатном systemd-запуске.

**Реакция:** 5 минут. **Данные:** не теряются.

### 2. Веб не отвечает, API работает

```bash
systemctl status jey-web --no-pager
journalctl -u jey-web --since "10 min ago" --no-pager | tail -30
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/login
```

- Перезапустить: `systemctl restart jey-web`.
- Если падает сразу — посмотреть, хватает ли памяти:
  `free -h`, `systemctl show -p MemoryCurrent jey-web`.
- Откатить бандл: `/opt/jey/web.prev` (см. `deploy/frontend.md`), затем
  `systemctl restart jey-web`.

**Реакция:** 5 минут. Пользователи видят ошибку, данные целы.

### 3. PostgreSQL недоступен

```bash
systemctl status postgresql@18-main --no-pager
pg_isready -h 127.0.0.1
tail -50 /var/log/postgresql/postgresql-18-main.log
df -h /          # диск мог заполниться
```

- **Не стартует** → `systemctl restart postgresql@18-main`.
- **Не хватает места** → сценарий 5, освободить место, запустить снова.
- **Повреждение данных** → последний зашифрованный дамп лежит в
  `/var/backups/jey`. Восстановление: `jey-restore-db <file.dump.gpg> --yes`.
  Скрипт сам остановит API, пересоздаст БД и проверит `/health/ready`.
- Если дамп повреждён, возьмите копию с домашнего компьютера
  (`~/jey-backups/db`) и восстановите её тем же скриптом.
- После восстановления проверьте `systemctl status jey-api` и откройте
  каталог.

**Реакция:** 10 минут. **Данные:** последний ежедневный дамп + внешняя копия.

### 4. Бэкапы

**Очистка удалённых аккаунтов.** API раз в сутки удаляет аккаунты, у которых
`deleted_at` старше `PURGE_RETENTION_DAYS` (по умолчанию 30 дней), вместе с
записями, тегами, загрузками и файлами. Проверить:

```bash
journalctl -u jey-api --since "2 days ago" --no-pager | grep -i purge
```



**Сервер.** Каждый день в 03:30 systemd-таймер `jey-backup.timer` запускает
`jey-backup-db`:

- `pg_dump` в custom-формате, сжатие;
- проверка архива и восстановление в временную БД со сверкой количества
  пользователей, записей, тегов и миграций;
- шифрование GPG-публичным ключом;
- хранение 14 дней в `/var/backups/jey` с правами `600`.

Проверка:

```bash
systemctl list-timers jey-backup.timer --no-pager
journalctl -u jey-backup.service --since "2 days ago" --no-pager
ls -lh /var/backups/jey
```

Ручной запуск: `systemctl start jey-backup.service`.

**Домашний компьютер.** Ежедневно в 04:15 cron запускает
`scripts/pull-backup.sh`:

- rsync забирает новые зашифрованные дампы и медиа;
- проверяет sha256, расшифровывает архив и проверяет его `pg_restore --list`;
- хранит последний дамп за каждую из 8 недель и за каждый из 3 месяцев;
- медиа лежит в `~/jey-backups/media` (зеркало, без удаления старых файлов).

Проверка и ручной запуск:

```bash
crontab -l | grep jey
tail -50 ~/jey-backups/pull.log
bash scripts/pull-backup.sh
ls -lh ~/jey-backups/db
```

**Важно:** приватный GPG-ключ находится только на компьютере в
`~/.gnupg`. Если потерять и компьютер, и ключ, зашифрованные дампы станут
нечитаемыми. Сделайте отдельную резервную копию ключа (например, в
менеджере паролей или на офлайн-носителе). Публичный ключ на сервере
позволяет только шифровать.

**Ограничение:** дамп на VPS защищает от ошибок, миграций и порчи данных,
но не от потери самого сервера. Внешняя копия на компьютере закрывает этот
сценарий; если компьютер и VPS погибнут одновременно, восстановление
невозможно.

#### Мониторинг

`jey-healthcheck.timer` запускает `/usr/local/bin/jey-healthcheck` каждые
5 минут. Проверяются API, веб, PostgreSQL, `jey-api`/`jey-web`, ошибки 5xx
за 15 минут, диск, память, свежесть бэкапа и срок TLS-сертификата.

Состояние хранится в `/var/lib/jey/health.state`; алерт отправляется только
при смене состояния. Без настроенного webhook сообщения остаются в journald:

```bash
journalctl -u jey-healthcheck.service --since "1 hour ago" --no-pager
```

Внешние уведомления включаются в `/etc/jey/health.env` (600 root):

```bash
BASE_URL=https://129-121-149-16.sslip.io
ALERT_WEBHOOK=https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>
CERT_WARN_DAYS=14
BACKUP_MAX_HOURS=30
```

Для Telegram: создать бота через `@BotFather`, написать ему, получить
`chat_id` через `getUpdates`, подставить токен и id. Без webhook мониторинг
работает, но никто не получает внешнего сообщения.

### 5. Диск заполнен

```bash
df -h /
du -xh --max-depth=1 /var 2>/dev/null | sort -h | tail
du -xh --max-depth=1 /opt 2>/dev/null | sort -h | tail
```

Безопасно освобождает место:

```bash
journalctl --vacuum-size=100M          # логи
rm -rf /opt/jey/web.prev /opt/jey/jey-api.prev /opt/jey/*.bad   # старые релизы
find /var/lib/jey/media -type f -mtime +90   # посмотреть старые медиа
/opt/jey/jey-api gc                    # сборка осиротевших файлов
```

Медиа пользователей **не удалять** без предупреждения. Если места всё равно
нет — расширить диск у провайдера, затем `growpart` / `resize2fs`.

**Реакция:** 15 минут. **Данные:** удаление старых релизов безопасно.

### 6. Сертификат не выпускается / TLS-ошибка

```bash
journalctl -u caddy --since "30 min ago" --no-pager | grep -i -E "acme|error|certificate"
ss -ltn | grep -E ':80|:443'
curl -sSI http://<host>/.well-known/acme-challenge/test
```

- **Порты закрыты** → `ufw status`, открыть 80/443.
- **DNS не туда** → `getent hosts <host>` должен вернуть IP сервера.
- **Лимит Let's Encrypt** → подождать, Caddy повторит сам; смотреть `renewal`.
- **Принудительный перевыпуск**:
  ```bash
  rm -rf /var/lib/caddy/.local/share/caddy/certificates/<host>
  systemctl restart caddy
  ```
  Не делать без причины: каждый выпуск расходует лимит.

**Реакция:** 15 минут. Пользователи видят предупреждение браузера.

### 7. Утечка секретов

Полный чек-лист — в `docs/deploy.md`, раздел «Секреты». Кратко:

1. `delete from sessions;` — разлогинить всех;
2. `delete from auth_tokens;` — аннулировать ссылки из писем;
3. сменить пароль PostgreSQL и перезапустить API;
4. сменить SSH-ключи на `root` и `jey`;
5. проверить журналы на чужие входы;
6. перевыпустить TLS.

**Реакция:** немедленно, в тот же день.

### 8. Деплой сломал прод

```bash
DEPLOY_HOST=<host> bash scripts/deploy.sh --rollback
curl -fsS https://<host>/api/v1/health
```

Схема БД назад не откатывается — поэтому миграции только совместимые
(`docs/deploy.md`, «Правила миграций»).

**Реакция:** 5 минут.

### 9. Нет доступа по SSH

1. Панель провайдера → VNC-консоль.
2. Войти под `root` (пароль root отключён, но консоль пускает локально).
3. Проверить `ssh -t`, `systemctl status ssh`, `/etc/ssh/sshd_config.d/`.
4. Вернуть ключ в `/root/.ssh/authorized_keys` и `/home/jey/.ssh/authorized_keys`.
5. `systemctl restart ssh`.

**Реакция:** 20 минут.

### 10. Всплеск нагрузки / сайт тормозит

```bash
uptime; top -b -n1 | head -15
journalctl -u jey-api --since "10 min ago" | grep '"status":5'
```

- Проверить, не идёт ли массовая загрузка фото (CPU-пик на кодировании WebP).
- Временно ограничить: `ufw limit 443/tcp` (осторожно, влияет на всех).
- Если это регулярно — увеличить vCPU (см. `docs/perf.md`).

**Реакция:** 10 минут.

## Что проверено на живом сервере

| Сценарий | Проверка |
|---|---|
| Падение API | остановка сервиса → алерт в течение 5 минут (T78) |
| Восстановление API | алерт «снова в порядке» |
| Порог диска | тест с `DISK_WARN=1` → предупреждение |
| Откат релиза | `deploy.sh --rollback` вернул предыдущий бинарник (T79) |
| Провал миграции | деплой остановился, старый бинарник продолжил работу |
| Остановка веба вместе с API | исправлено: юниты используют `Wants`, а не `Requires` |

Остальные сценарии пройдены мысленно по фактическим путям и командам.

## Время реакции

| Сценарий | Ожидание |
|---|---|
| API/веб упал | 5 минут (автоперезапуск) + 5 минут на разбор |
| БД недоступна | 10 минут |
| Диск/сертификат | 15 минут |
| Утечка секретов | в тот же день |
| Потеря SSH | 20 минут через консоль |

Мониторинг проверяет сервис каждые 5 минут, поэтому о падении станет известно
в течение пяти минут — при условии, что webhook настроен.
