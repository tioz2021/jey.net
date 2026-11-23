# Backup и restore drills

## Что уже работает

- ежедневный `jey-backup.timer` в 03:30;
- `pg_dump` + проверка читаемости архива;
- restore в одноразовую БД и сверка counts;
- GPG-шифрование, SHA256, retention 14 дней;
- `jey-<stamp>.counts.json` рядом с архивом.

## Где что лежит

Отдельного backup-сервера нет. Схема из двух машин:

| Где | Что лежит |
|---|---|
| VPS `129.121.149.16` | ежедневные encrypted dumps, retention 14 дней |
| локальная машина | `~/jey-backups/db` — pulled copies, GPG private key |

`scripts/pull-backup.sh` запускается на локальной машине ежедневно в 04:15
(локальный timer), забирает dumps и media, проверяет checksum и пробует
расшифровать архив. Последние локальные копии: 08, 15 и 22 ноября 2026
(хранится latest per week / month).

Это **не offsite**: если потерять локальную машину и VPS одновременно,
восстановление невозможно без отдельной копии GPG-ключа. Ключ нужно хранить
вне этой машины.

## Где запускать drill

**Не на VPS.** На VPS намеренно нет GPG private key: он не должен лежать
рядом с зашифрованными копиями. Drill запускается на этой локальной машине
(backup host), где есть private key и локальный PostgreSQL с ролью,
имеющей `CREATEDB`.

Drill запускается на backup-хосте, где есть:

- GPG private key;
- доступ к PostgreSQL с ролью, у которой есть `CREATEDB`;
- последний `.dump.gpg` и его `.counts.json`.

```bash
ENV_FILE=/etc/jey/api.env \
  /usr/local/bin/jey-restore-drill /var/backups/jey/jey-20261123-033024.dump.gpg
```

Без аргумента скрипт берёт самый свежий backup из `BACKUP_DIR`.

## Что проверяет drill

- checksum архива;
- расшифровку;
- `pg_restore --exit-on-error` в `jey_drill_*`;
- наличие `users`, `items`, `_sqlx_migrations`;
- counts из sidecar;
- RPO (возраст дампа) и RTO (длительность drill);
- пишет `/var/lib/jey/restore-drill-status.json`;
- всегда удаляет временную БД.

## Расписание

Unit-файлы `deploy/jey-restore-drill.service` и `.timer` предназначены для
backup-хоста. На VPS timer установлен, но отключён намеренно.

На этой локальной машине:

```bash
systemctl --user enable --now jey-restore-drill.timer
systemctl --user list-timers jey-restore-drill.timer
```

Сейчас локальный timer drill ещё не установлен; pull-backup timer уже
работает ежедневно.

## RPO / RTO

| Параметр | Значение |
|---|---|
| RPO | до ~24 ч 15 мин (ежедневный backup + random delay) |
| RTO target | 30 минут на восстановление и проверку |
| Retention | 14 дней |

## Release checklist

Перед крупным релизом:

```bash
systemctl start jey-restore-drill.service
cat /var/lib/jey/restore-drill-status.json
```

Если `ok` не `true` — релиз не выпускать.
