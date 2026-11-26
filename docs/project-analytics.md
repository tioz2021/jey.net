# Аналитика проекта jey.net

Дата: 26 ноября 2026. Версия production: **0.7.13**.

## Как считались строки

Учитывались файлы из `git ls-files`. Бинарники, изображения и сгенерированные
TS-реэкспорты не входят в «source LOC».

```text
source LOC (Rust + TS/TSX + CSS, без generated)   ≈ 82 600
  Rust                                             39 252
  TypeScript / TSX                                 30 951
  CSS                                              12 741
docs Markdown                                      11 875
migrations SQL                                      1 355
shell + Python                                      2 744
generated TS (реэкспорты DTO)                          348
```

Всего в репозитории:

```text
881 файл
1 312 коммитов
40 тегов
79 API-маршрутов
```

## Тесты

```text
Rust test functions       284
Vitest tests               32
Playwright E2E             24
```

Покрытие в процентах не заявляю: coverage-гейта в проекте нет.

## Frontend

```text
entry JS bundle         561 KB raw / 164 KB gzip
largest route chunk     561 KB
CSS bundle               42 KB
npm dependencies         21
```

Bundle разбит на route-level chunks; entry и бюджеты проверяются в CI.
Остался резерв по vendor/manualChunks.

## Production

```text
health:          ok, 0.7.13
API errors 7d:   0
backup:          ok, sha256 записан
users:           7
items:           64
VPS:             1 vCPU / 1.9 GB RAM
```

## Сильные стороны

1. **Продуктовая полнота.** Каталог, коллекции, тир-листы, соцлента,
   рекомендации, комментарии, лайки, чат, профили, админка, desktop и
   auto-update — в одном продукте.
2. **Local-first desktop.** SQLite, offline outbox, синхронизация и
   восстановление после reconnect — это не «сайт в webview».
3. **Эксплуатационная зрелость.** Signed updater, backup/restore drill,
   healthchecks, CSP без inline, audit, rate limits, release gate.
4. **Типизация.** Rust DTO генерируют TypeScript; ручной `types.ts`
   сокращён, drift проверяется в CI.
5. **Документация.** Почти 12 тысяч строк docs: архитектура, протокол,
   runbook, backup, release, monitoring.
6. **Мониторинг.** p95/5xx/backup/TLS/SSE и dead-man switch через
   healthchecks.io.
7. **Низкий уровень production-ошибок.** За последние 7 дней 0 ERROR в API
   и единичные system/client errors.

## Слабые стороны

1. **QA не успевает за скоростью изменений.** Недавние регрессии — masonry,
   публичный профиль, badge 9+, desktop PATCH — были найдены глазами.
   Тесты покрывают счастливые сценарии, но не визуальные и не все
   cross-layer случаи.
2. **Концентрация кода снижена, но не исчезла.** `shell.rs` разбит
   до 134 строк, `chat.rs` — до 172; крупнейшая секция теперь
   `chat/handlers.rs` 830 строк, `thread-screen.tsx` 916,
   `globals.css` 1 136. Это всё ещё места для следующего рефакторинга.
3. **Дублирование i18n.** Три файла по ~1 275 строк; словари легко
   расходятся.
4. **Нет coverage-гейта и visual regression.** 32 frontend-теста на ~31k
   TypeScript — мало для такого UI.
5. **Один VPS.** 1 vCPU, API и PostgreSQL на одной машине; нет HA и
   горизонтального масштабирования.
6. **Нет полноценного staging.** Есть только локальный preview; внешний
   preview URL отсутствует.
7. **Bundle 928 KB.** Нет code splitting; первый экран платит за весь SPA.
8. **Release-процесс был шумным.** 40 тегов, несколько перетегирований,
   flaky WebKit smoke; сейчас gate стабилизирован, но история это показала.
9. **Зависимость от внешних провайдеров.** Open Library медленный,
   TMDb/IGDB/Google Books требуют ключей и имеют свои лимиты.

## Оценка (субъективная)

```text
Функциональность      9/10
Надёжность/ops        8/10
Архитектура/код       7.5/10
Тесты/QA              7/10
Производительность    7.5/10
Масштабируемость      5/10
```

## Что делать дальше

1. **T206 external staging/preview** — не деплоить UX сразу в production.
2. **Visual regression + coverage-гейт** для критических экранов.
3. **Разбить `shell.rs` и `chat.rs`** по доменам.
4. **Route-level code splitting** и бюджет bundle.
5. **Алерты не только на health, но и на пользовательские ошибки**
   (client_errors rate).
6. **Решение по HA**: один VPS остаётся осознанным выбором, а не
   случайностью; пересматривать по T202-триггерам.

## Вывод

Это сильный **personal-first продукт** с необычно взрослой для своего
размера эксплуатацией: backup drill, signed auto-update, healthchecks,
типизация и local-first desktop. Главный риск сейчас не «код не работает»,
а **QA и инфраструктурная дисциплина вокруг быстро меняющегося UI**.
