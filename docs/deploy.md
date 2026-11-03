# Деплой

Документ растёт по мере задач M6. Сейчас здесь — провижининг сервера (T71).

## Требования

| Параметр | Значение |
|---|---|
| ОС | Ubuntu 24.04 LTS |
| Железо | 1 vCPU, 2 ГБ RAM, 40–50 ГБ диска |
| Доступ | SSH-ключ, добавленный при заказе |
| Домен | пока нет; до T72 работаем по IP |

## 1. Первый вход

Ключ создаётся на рабочей машине:

```bash
ssh-keygen -t ed25519 -C "jey-vps" -f ~/.ssh/jey_vps
```

Публичная часть вставляется в панели провайдера при заказе (или добавляется
вручную в `/root/.ssh/authorized_keys`).

```bash
ssh -i ~/.ssh/jey_vps root@<IP>
```

## 2. Провижининг

Копируем скрипт на сервер и запускаем от root:

```bash
scp -i ~/.ssh/jey_vps scripts/provision.sh root@<IP>:/root/
ssh -i ~/.ssh/jey_vps root@<IP> 'bash /root/provision.sh'
```

Что делает скрипт:

- ставит часовой пояс (по умолчанию `Europe/Kyiv`; старое имя `Europe/Kiev` тоже принимается);
- создаёт пользователя `jey` без пароля;
- копирует `authorized_keys` root в домашний каталог `jey`;
- выдаёт **ограниченный** sudo: только `systemctl` для нашего сервиса,
  `journalctl` и `systemctl reload caddy`;
- создаёт swap 2 ГБ, прописывает в `/etc/fstab`, ставит `vm.swappiness=10`;
- включает автообновления безопасности;
- поднимает лимит файловых дескрипторов до 65535;
- включает `ufw`: 22, 80, 443 — и только потом активирует его.

Скрипт идемпотентен: повторный запуск ничего не ломает.

## 3. Проверка входа под новым пользователем

**В отдельном терминале** (не закрывая root-сессию):

```bash
ssh -i ~/.ssh/jey_vps jey@<IP>
```

Пароль для `jey` отключён при создании, поэтому вход возможен только по ключу.
Если не пускает — разбираемся, не закрывая root-сессию.

## 4. Отключение паролей

Только после того, как вход под `jey` подтверждён:

```bash
ssh -i ~/.ssh/jey_vps root@<IP> 'bash /root/provision.sh --harden-ssh'
```

Скрипт пишет `/etc/ssh/sshd_config.d/00-jey.conf`, проверяет конфигурацию
через `sshd -t` и перезагружает `ssh`.

**Почему `00-`, а не `99-`:** sshd берёт *первое* встреченное значение
параметра, а облачные образы Ubuntu кладут `PasswordAuthentication yes` в
`50-cloud-init.conf` и `PermitRootLogin yes` в `51_permit_root_login.conf`.
Файл, который сортируется позже, просто не действует — проверено на живом
сервере: с `99-jey.conf` вход по паролю оставался разрешён.

После этого:

- вход по паролю запрещён полностью;
- под `root` можно войти **только по ключу** — это нужно для установки
  пакетов (Caddy, PostgreSQL, Node) в следующих задачах;
- под `jey` — только по ключу и с ограниченным sudo.

## 5. Проверки

```bash
# вход по паролю должен быть отвергнут
ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password root@<IP>

# ограниченный sudo: список короткий, без ALL
ssh -i ~/.ssh/jey_vps jey@<IP> 'sudo -l'

# swap и память
ssh -i ~/.ssh/jey_vps jey@<IP> 'swapon --show && free -h'

# firewall и время (ufw — oneshot-сервис, проверяем правила, а не is-active)
ssh -i ~/.ssh/jey_vps root@<IP> 'ufw status verbose; timedatectl'

# после перезагрузки всё возвращается
ssh -i ~/.ssh/jey_vps jey@<IP> 'sudo reboot' || true
# подождать минуту и зайти снова
```

После перезагрузки должны быть активны `ssh` и `unattended-upgrades`,
`ufw status` — показывать правила, а `swapon --show` — `/swapfile`.

Проверено на сервере `hal-server-879584` (Ubuntu 24.04.5): после `reboot`
swap, firewall, sshd-настройки и вход по ключу восстановились сами.

## Если доступ потерян

У всех провайдеров есть консоль (VNC) в панели. Через неё можно войти под root
и исправить `sshd_config` или вернуть ключ. Поэтому root-сессию не закрываем
до проверки входа под `jey`.

## 6. PostgreSQL

Ставим PostgreSQL 18 из PGDG: в Ubuntu 24.04 штатно идёт 16, а нам нужен 18.

```bash
install -d /usr/share/postgresql-common/pgdg
curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
  https://apt.postgresql.org/pub/repos/apt noble-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list
apt-get update && apt-get install -y postgresql-18 postgresql-contrib-18
```

### Настройки под 2 ГБ

`/etc/postgresql/18/main/conf.d/99-jey.conf`:

```ini
listen_addresses = 'localhost'
shared_buffers = 256MB
work_mem = 4MB
effective_cache_size = 768MB
maintenance_work_mem = 64MB
max_connections = 30

logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%a.log'
log_rotation_age = 1d
log_rotation_size = 50MB
log_truncate_on_rotation = on
log_min_duration_statement = 500
```

Почему так: `shared_buffers` — четверть памяти; `work_mem` маленький, чтобы
сортировки не съели RAM; `max_connections = 30` — у нас один API с пулом
в 10 соединений; ротация логов не даёт диску закончиться.

### Пользователь и база

Пароль генерируется один раз и живёт только в `/etc/jey/api.env`:

```bash
install -d -m 700 /etc/jey
PW=$(openssl rand -hex 24)
printf "DATABASE_URL=postgres://jey:%s@localhost:5432/jey\n" "$PW" > /etc/jey/api.env
chmod 600 /etc/jey/api.env

sudo -u postgres psql -c "create role jey login password '$PW'"
sudo -u postgres psql -c "create database jey owner jey"
sudo -u postgres psql -d jey -c "create extension if not exists citext; create extension if not exists pg_trgm;"
```

`citext` нужен для регистронезависимых email, `pg_trgm` — для поиска.

### Проверки

```bash
# настройки применились (значения в страницах/КБ)
sudo -u postgres psql -tAc "show shared_buffers; show work_mem; show max_connections"

# сервис реально слушает только localhost
ss -ltn | grep 5432

# снаружи порт закрыт (должно быть «закрыт»)
timeout 5 bash -c 'cat < /dev/null > /dev/tcp/<IP>/5432'

# миграции применяются бинарником API
set -a; . /etc/jey/api.env; set +a
/opt/jey/jey-api migrate
psql "$DATABASE_URL" -tAc "select count(*) from _sqlx_migrations"
```

Замечание: `systemctl is-active postgresql` показывает `inactive` — это
**мета-юнит**, он запускает кластер и завершается. Проверять надо
`systemctl is-active postgresql@18-main` или `pg_isready`.

## 7. API как systemd-сервис

Юнит лежит в репозитории: `deploy/jey-api.service`. Устанавливается копированием
в `/etc/systemd/system/` и `systemctl daemon-reload`.

Ключевое в юните:

| Параметр | Зачем |
|---|---|
| `User=jey`, `Group=jey` | процесс не работает под root |
| `EnvironmentFile=/etc/jey/api.env` | все секреты и настройки в одном файле с правами `600` |
| `Restart=always`, `RestartSec=2` | падение процесса лечится само |
| `MemoryMax=512M` | на 2 ГБ сервере утечка не съест память у Postgres |
| `ProtectSystem=strict`, `ReadWritePaths=/var/lib/jey` | файловая система только для чтения, кроме каталога данных |
| `NoNewPrivileges`, `PrivateTmp`, `ProtectHome` | базовое ужесточение |

Перед первым запуском создаются каталоги данных:

```bash
install -d -o jey -g jey -m 750 /var/lib/jey/media /var/lib/jey/mail
```

В `/etc/jey/api.env` кроме `DATABASE_URL` добавляются:

```ini
APP_ENV=prod
BIND_ADDR=127.0.0.1:8080
LOG_FORMAT=json
RUN_MIGRATIONS=false
SESSION_TTL_DAYS=30
PUBLIC_URL=https://129-121-149-16.sslip.io
ALLOWED_ORIGINS=https://129-121-149-16.sslip.io
MEDIA_DIR=/var/lib/jey/media
MAIL_DIR=/var/lib/jey/mail
MAIL_FROM=jey@129-121-149-16.sslip.io
```

`RUN_MIGRATIONS=false`: миграции применяются отдельным шагом при деплое, а не
при каждом старте сервиса.

### Деплой новой версии

```bash
cargo build --release -p jey-api --bin jey-api
rsync -av --chmod=755 target/release/jey-api root@<IP>:/opt/jey/jey-api.new

ssh root@<IP> '
  set -a; . /etc/jey/api.env; set +a
  /opt/jey/jey-api.new migrate
  mv /opt/jey/jey-api.new /opt/jey/jey-api
  systemctl restart jey-api
'
```

Порядок важен: миграции применяются **до** подмены бинарника, чтобы старый
процесс не работал с новой схемой дольше пары секунд.

### Проверки

```bash
systemctl is-active jey-api
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:8080/health/ready
journalctl -u jey-api --since "5 min ago" --no-pager | tail
systemctl show -p MemoryMax --value jey-api
```

После `kill -9` главного процесса systemd перезапускает его через 2 секунды.

После перезагрузки сервис стартует сам, но **не мгновенно**: `jey-api`
дождится кластера Postgres. Проверять стоит через 5–10 секунд после появления
SSH, а не сразу.

**Почему `Wants`, а не `Requires`:** с `Requires` остановка API тянула за собой
веб-клиент, а перезапуск Postgres — API, и обратно они сами не поднимались.
`Wants` + `After` даёт нужный порядок, но не превращает зависимости в жёсткую
связку; `Restart=always` сам дожидается базы.

## 8. Caddy: HTTPS и проксирование

Файл `deploy/Caddyfile` копируется в `/etc/caddy/Caddyfile`.

Пока своего домена нет, используется `129-121-149-16.sslip.io`: это имя
автоматически резолвится в IP сервера, поэтому Let's Encrypt выдаёт обычный
сертификат. Когда появится настоящий домен — меняем hostname в Caddyfile и
`PUBLIC_URL`/`ALLOWED_ORIGINS` в `/etc/jey/api.env`, перезапускаем оба сервиса.

Что делает конфигурация:

| Директива | Зачем |
|---|---|
| `encode zstd gzip` | сжатие ответов (Caddy сжимает от 512 байт) |
| `header` | HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, скрытие `Server` |
| `request_body max_size 40MB` | верхняя граница; реальные лимиты — в API |
| `reverse_proxy /api/*`, `/media/*`, `/health*` | в API на `127.0.0.1:8080` |
| `handle {}` | заглушка до деплоя фронтенда (T75) |

### Установка

```bash
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
  > /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

cp deploy/Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl restart caddy
```

Сертификат выпускается автоматически при первом запросе; прогресс виден в
`journalctl -u caddy`.

### Проверки

```bash
curl -sSI https://<host>/api/v1/health        # 200 + заголовки
curl -sSI http://<host>/                      # 308 на https
curl -sS  https://<host>/api/v1/health        # {"status":"ok",...}
echo | openssl s_client -connect <host>:443 -servername <host> 2>/dev/null \
  | openssl x509 -noout -issuer -dates        # Let's Encrypt
```

Сжатие удобно проверять на ответе побольше (список записей):

```bash
curl -H 'Accept-Encoding: gzip' -D - -o /dev/null https://<host>/api/v1/items
# content-encoding: gzip
```

## 9. Секреты

### Что вообще является секретом

| Секрет | Где живёт | Кто читает |
|---|---|---|
| Пароль PostgreSQL | `/etc/jey/api.env` (`DATABASE_URL`) | systemd → процесс `jey-api` |
| Приватный SSH-ключ | машина разработчика (`~/.ssh/jey_vps`) | ssh-клиент |
| Ключи TLS | `/var/lib/caddy/...` | Caddy (автоматически) |
| Токены сессий | только хеши в таблице `sessions` | API |
| Токены писем | только хеши в `auth_tokens`; сам токен — в письме | API |

Права проверены на сервере:

```
700 root:root  /etc/jey
600 root:root  /etc/jey/api.env
600 caddy:caddy /var/lib/caddy/.../*.key
750 jey:jey    /var/lib/jey/mail
```

`.env` в репозиторий не попадает (`.gitignore`), в git лежат только
локальные заглушки вроде `postgres://jey:jey@localhost` из CI.

### Почему нет `SESSION_SECRET`

Обычные фреймворки подписывают cookie секретом, и его утечка позволяет
подделать сессию. У нас другой подход:

1. при входе генерируются **32 случайных байта** и отправляются в cookie;
2. в базе хранится только `SHA-256` от токена;
3. запрос ищет сессию по хешу.

Подделать cookie, не имея базы, нельзя: секрета, который можно было бы
украсть и переиспользовать, просто нет. Поэтому «ротация `SESSION_SECRET`»
не нужна — вместо неё есть отзыв сессий:

```sql
-- завершить все сессии всех пользователей
delete from sessions;
```

Один пользователь может сделать это сам: `POST /api/v1/me/sessions/revoke-all`.

### Ротация пароля базы

```bash
NEW=$(openssl rand -hex 24)
sudo -u postgres psql -c "alter role jey password '$NEW'"
# обновить DATABASE_URL в /etc/jey/api.env
systemctl restart jey-api
curl -fsS http://127.0.0.1:8080/health/ready
```

Смена пароля БД **не завершает сессии пользователей**: они живут в таблице
`sessions`, а не в пароле.

### Ротация SSH-ключей

```bash
# на машине разработчика
ssh-keygen -t ed25519 -C "jey-vps-2027" -f ~/.ssh/jey_vps_new

# добавить новый ключ, не удаляя старый
ssh -i ~/.ssh/jey_vps root@<IP>   "echo '$(cat ~/.ssh/jey_vps_new.pub)' >> /root/.ssh/authorized_keys"
ssh -i ~/.ssh/jey_vps root@<IP>   "echo '$(cat ~/.ssh/jey_vps_new.pub)' >> /home/jey/.ssh/authorized_keys"

# проверить вход новым ключом, затем удалить старую строку из обоих файлов
```

### Чек-лист при компрометации

1. **Завершить все сессии**: `delete from sessions;` (или отозвать у
   конкретного пользователя все сессии через его аккаунт).
2. **Аннулировать токены писем**: `delete from auth_tokens;` — ссылки
   подтверждения и сброса перестанут работать.
3. **Сменить пароль PostgreSQL** и перезапустить API.
4. **Сменить SSH-ключи** (см. выше), проверить `authorized_keys` на обоих
   аккаунтах и `journalctl -u ssh` на странные входы.
5. **Проверить, что утекло**: `grep` по журналам на пароли/токены, сверить
   список пользователей и устройств (`select * from devices;`).
6. **Перевыпустить TLS**: удалить каталог сертификата и перезапустить Caddy —
   он выпустит новый.
7. Записать инцидент: что, когда, какие действия предприняты.

### Что не должно попадать в логи

Правила, которых придерживается код:

- конфигурация целиком не логируется (в стартовой строке только env, адрес,
  версия, TTL сессии, число origin'ов);
- `DATABASE_URL` и пароли не пишутся ни в одном сообщении;
- токены и пароли не попадают в сообщения об ошибках: наружу и в лог идут
  общие тексты, а `request_id` позволяет найти запрос;
- тела запросов не логируются вообще.

Проверка на сервере:

```bash
journalctl -u jey-api -u jey-web --since "24 hours ago"   | grep -iE "postgres://|password|jey_session=|DATABASE_URL"
# пусто — значит утечек нет
```

## 10. Порядок деплоя и миграции

Один скрипт делает всё: `scripts/deploy.sh`.

```bash
DEPLOY_HOST=129.121.149.16 bash scripts/deploy.sh
DEPLOY_HOST=129.121.149.16 bash scripts/deploy.sh --rollback
```

### Шаги

1. **Сборка** API (`cargo build --release`) и веба (`npm run build`, standalone).
2. **Загрузка** артефактов как `jey-api.new` и `/tmp/jey-web.tar.gz`,
   а также скриптов бэкапа и systemd-таймера.
3. **Бэкап** — ежедневный `jey-backup.timer` (03:30) с проверкой
   восстановления и GPG-шифрованием; отдельный `BACKUP_DIR` в деплое больше
   не нужен.
4. **Миграции** — запускаются новым бинарником, пока старый ещё обслуживает
   запросы. Падение миграции останавливает деплой: бинарник не подменяется,
   сервис продолжает работать на прежней версии.
5. **Подмена бинарника** и `systemctl restart jey-api`.
6. **Проверка** `/health/ready` — до 30 секунд. Если сервис не поднялся,
   скрипт сам возвращает предыдущий бинарник и перезапускает его.
7. **Веб** — предыдущий бандл остаётся в `/opt/jey/web.prev`, затем
   распаковывается новый.
8. **Бэкапы** — устанавливаются `/usr/local/bin/jey-backup-db`,
   `jey-restore-db` и `jey-backup.timer`; таймер включается, если на сервере
   уже установлен GPG-получатель `/etc/jey/backup-recipient`.
9. **Мониторинг** — устанавливаются `jey-healthcheck` и
   `jey-healthcheck.timer`; алерты настраиваются в `/etc/jey/health.env`.

### Правила миграций

- Миграции **только добавляются**, уже применённые файлы не редактируются:
  `sqlx` сверяет контрольные суммы и откажется работать с изменённым файлом.
- **Разрушающие изменения — в два деплоя.** Новый столбец добавляется, код
  начинает его писать, и только следующим релизом удаляется старый. Так
  откат бинарника всегда остаётся безопасным.
- `DROP`, `ALTER TYPE`, `RENAME` без согласования запрещены: откат вернёт
  старый код, который не знает о новой схеме.
- CI применяет все миграции на чистой базе — синтаксическая ошибка видна
  до деплоя.
- `sqlx::migrate!` встраивает миграции при компиляции и не замечает новый
  файл, поэтому `scripts/deploy.sh` перед сборкой делает `touch
  crates/api/src/db.rs`. Без этого кэшированная сборка молча пропустит новую
  миграцию — проверено на живом сервере.

### Откат

```bash
bash scripts/deploy.sh --rollback
```

Скрипт меняет местами текущий и предыдущий артефакты (`jey-api.prev`,
`web.prev`), перезапускает сервисы и проверяет health. Схема БД при этом
**не откатывается** — именно поэтому миграции должны быть совместимы со
старым кодом.

## Что дальше

- T74–T75 — деплой фронтенда;
- T76 — секреты;
- T78 — мониторинг.
