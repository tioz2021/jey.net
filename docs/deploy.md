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

## Что дальше

- T73 — systemd-юнит для API;
- T74–T75 — деплой фронтенда;
- T76 — секреты;
- T78 — мониторинг.
