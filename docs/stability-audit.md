# Аудит стабильности

Дата: 26 ноября 2026. Версия: 0.7.11.

## Что проверено

- production health и сервисы;
- ошибки API за 7 дней;
- размер и состояние БД;
- backup status;
- CI/desktop smoke;
- расхождение версий web/desktop/tag.

## Факты

```text
jey-api:        active, NRestarts=0
caddy:          active
postgresql:     active
API ERROR 7d:   0
system_errors:  1
client_errors:  2
users:          7
items:          64
notifications:  105
backup:         ok, 194 KB, sha256 записан
```

Восстановление из backup на VPS не запускается таймером: приватный GPG-ключ
намеренно хранится вне VPS; drill выполняется на local backup-host.

## Реальные проблемы

1. **Версии разъехались.**
   `main` содержит web-фиксы после тега `v0.7.11`; web на production новее
   desktop и тега. Это делает состояние «что именно задеплоено» неочевидным.

2. **Smoke нестабилен.**
   Последний smoke на `main` упал с `RemoteDisconnected` после создания
   WebDriver-сессии. Это инфраструктурный сбой, не падение продукта, но он
   красит CI и блокирует релиз.

3. **Нет тестов на уведомления/feed badge.**
   Баги «9+» и задержки уведомлений были найдены вручную. E2E проверяет только
   одно уведомление, но не cutoff, не desktop polling и не сброс badge.

4. **Слишком много релизов подряд.**
   0.7.2 → 0.7.11 за несколько дней, несколько перетегирований. Мелкие
   UI-правки выходили как отдельные версии и растягивали проверку.

5. **Нет staging.**
   UX-правки проверяются сразу на production web; desktop — только после
   релизного gate.

6. **Нет автоматических алертов.**
   p95, 5xx, SSE-соединения и backup freshness не будят никого.

## План стабилизации

### Сейчас

- [x] аудит production;
- [x] smoke: один retry только для транспортных ошибок WebDriver;
- [x] не деплоить web отдельно от версии/тега;
- [x] заморозить новые фичи до 0.7.12.

### 0.7.12

- [x] web и desktop из одного тега;
- [x] E2E: feed badge = 1 после одной новой записи;
- [ ] E2E: notification badge обновляется без reload на web;
- [x] unit: `feedSeenCutoff`/`markFeedSeen` с серверным timestamp;
- [x] smoke: стабильный зелёный на main перед тегом.

### Дальше

- [~] local preview `scripts/preview.sh`; внешний URL — позже;
- [ ] алерты: p95 > 200 ms, 5xx > 1%, backup > 26 h;
- [x] desktop SSE через Tauri-мост; polling оставлен fallback;
- [ ] один релиз в неделю, если нет критического бага.

## Правило

Если меняется только UI — сначала preview/web, без тега. Если меняется
desktop-код — только через полный release gate. Не смешивать эти ветки
процесса.
