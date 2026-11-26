# Карта проекта jey.net

Это **главный индекс документации**. Актуальная версия — **0.7.14**.

Правило: статусы задач ведутся только в [tasks.md](tasks.md), а этот файл
отвечает за навигацию. Исторические документы лежат в [archive](archive/README.md).

## Быстрый вход

| Что нужно | Куда идти |
|---|---|
| Понять продукт | [spec.md](spec.md), [architecture.md](architecture.md) |
| Работать с API | [api.md](api.md), [protocol.md](protocol.md) |
| Делать UI | [design-system.md](design-system.md), [bundle.md](bundle.md), [preview.md](preview.md) |
| Проверять качество | [workflow.md](workflow.md), [coverage.md](coverage.md), [load-test.md](load-test.md) |
| Релизить | [release-checklist.md](release-checklist.md), [release-desktop.md](release-desktop.md) |
| Тушить инцидент | [runbook.md](runbook.md), [monitoring.md](monitoring.md) |
| Смотреть задачи | [tasks.md](tasks.md), [done.md](done.md) |

## Продукт и архитектура

| Документ | Что внутри |
|---|---|
| [spec.md](spec.md) | Продукт: роли, функции, критерии приёмки. |
| [architecture.md](architecture.md) | Компоненты, модель данных, границы, деплой. |
| [api.md](api.md) | Практическое руководство по HTTP API. |
| [protocol.md](protocol.md) | Полный текстовый контракт API. |
| [data.md](data.md) | Где лежат данные, backup, offline. |
| [design-system.md](design-system.md) | Карточки, сетки, токены, визуальные правила. |
| [sync.md](sync.md) | Протокол синхронизации каталога. |
| [social.md](social.md) | Конфликты social-сущностей. |
| [tiers.md](tiers.md) | Тир-листы и оценки. |
| [search.md](search.md) | Поиск по внешним провайдерам. |
| [i18n.md](i18n.md) | RU/UK/EN и форматы. |
| [pwa.md](pwa.md) | PWA и offline shell. |

Дополнительно: [openapi.yaml](openapi.yaml) — машинный OpenAPI-контракт.

## Чат

| Документ | Что внутри |
|---|---|
| [chat.md](chat.md) | Чат: API, realtime, ключи. |
| [chat-e2e.md](chat-e2e.md) | E2E-шифрование и recovery. |
| [chat-threat-model.md](chat-threat-model.md) | Модель угроз чата. |
| [chat-tests.md](chat-tests.md) | Тесты чата и crypto. |

## Desktop

| Документ | Что внутри |
|---|---|
| [desktop.md](desktop.md) | Tauri, SQLite, offline, release. |
| [desktop-smoke.md](desktop-smoke.md) | WebKit smoke и драйверы. |
| [install.md](install.md) | Установка AppImage/deb/NSIS. |
| [release-desktop.md](release-desktop.md) | Сборка, подпись, updater. |
| [known-limitations.md](known-limitations.md) | Известные ограничения. |

## Эксплуатация

| Документ | Что внутри |
|---|---|
| [deploy.md](deploy.md) | VPS, PostgreSQL, systemd, Caddy, секреты. |
| [deploy/frontend.md](../deploy/frontend.md) | SPA deploy замечания (вне docs). |
| [runbook.md](runbook.md) | Что делать при сбоях. |
| [backup-restore.md](backup-restore.md) | Backup, restore и drill. |
| [monitoring.md](monitoring.md) | Healthcheck, p95, SSE, client errors. |
| [security.md](security.md) | Аудит и остаточные риски. |
| [scaling.md](scaling.md) | План роста и решение по инстансам. |
| [load-test.md](load-test.md) | Нагрузочные baseline и VPS-тест. |
| [preview.md](preview.md) | Local/external preview без production. |
| [release-checklist.md](release-checklist.md) | Preflight и release gate. |

## Разработка и качество

| Документ | Что внутри |
|---|---|
| [workflow.md](workflow.md) | Как ведётся работа. |
| [stack.md](stack.md) | Стек и версии. |
| [type-generation.md](type-generation.md) | Rust DTO → TypeScript. |
| [error-handling.md](error-handling.md) | Ошибки, telemetry, client errors. |
| [bundle.md](bundle.md) | Route chunks и бюджет. |
| [coverage.md](coverage.md) | Frontend/Rust coverage ratchet. |
| [project-analytics.md](project-analytics.md) | LOC, сильные/слабые стороны. |
| [stability-audit.md](stability-audit.md) | Аудит стабильности и план. |

## Задачи и история

| Документ | Что внутри |
|---|---|
| [tasks.md](tasks.md) | Активная доска; источник истины по статусам |
| [done.md](done.md) | Полная история завершённых задач |
| [releases/README.md](releases/README.md) | Индекс всех release notes |
| [archive/README.md](archive/README.md) | Что и почему ушло в архив |

## Release notes

| Версия | Файл |
|---|---|
| 0.7.9 | [0.7.9.md](releases/0.7.9.md) |
| 0.7.8 | [0.7.8.md](releases/0.7.8.md) |
| 0.7.7 | [0.7.7.md](releases/0.7.7.md) |
| 0.7.6 | [0.7.6.md](releases/0.7.6.md) |
| 0.7.5 | [0.7.5.md](releases/0.7.5.md) |
| 0.7.4 | [0.7.4.md](releases/0.7.4.md) |
| 0.7.3 | [0.7.3.md](releases/0.7.3.md) |
| 0.7.2 | [0.7.2.md](releases/0.7.2.md) |
| 0.7.14 | [0.7.14.md](releases/0.7.14.md) |
| 0.7.13 | [0.7.13.md](releases/0.7.13.md) |
| 0.7.12 | [0.7.12.md](releases/0.7.12.md) |
| 0.7.11 | [0.7.11.md](releases/0.7.11.md) |
| 0.7.10 | [0.7.10.md](releases/0.7.10.md) |
| 0.7.1 | [0.7.1.md](releases/0.7.1.md) |

## Архив

| Файл | Почему там |
|---|---|
| [archive/roadmap-0.7.md](archive/roadmap-0.7.md) | Исторический roadmap эпохи 0.7. |
| [archive/roadmap-0.3.md](archive/roadmap-0.3.md) | Исторический roadmap 0.3. |
| [archive/changelog-0.3.md](archive/changelog-0.3.md) | Старый changelog до 0.3.21. |
| [archive/backlog.md](archive/backlog.md) | Исторический бэклог после MVP. |
| [archive/retrospective.md](archive/retrospective.md) | Ретроспектива раннего этапа. |
| [archive/page-parity.md](archive/page-parity.md) | Историческая SPA-миграция. |
| [archive/t127-item-detail-checklist.md](archive/t127-item-detail-checklist.md) | Чек-лист T127.1. |
| [archive/launch-checklist.md](archive/launch-checklist.md) | Чек-лист запуска 0.3. |
| [archive/staging.md](archive/staging.md) | Старый staging; заменён preview. |
| [archive/desktop-ui.md](archive/desktop-ui.md) | Описание desktop UI 0.6. |
| [archive/perf.md](archive/perf.md) | Старые замеры БД; заменены load-test. |

## Что является источником истины

```text
spec.md / architecture.md     продукт и границы
tasks.md                     статусы задач
done.md                      что уже сделано
releases/*.md                что вошло в релиз
load-test.md / scaling.md    capacity и ADR
monitoring.md                алерты и SLO
archive/                     только история, не руководство
```

## Основные команды

```bash
bash scripts/check.sh                 # локальный gate
CHECK_E2E=1 bash scripts/check.sh     # gate + Playwright
bash scripts/e2e.sh                    # E2E
npm --prefix apps/web run test:coverage
bash scripts/preview.sh                # preview :8092
DEPLOY_HOST=... bash scripts/deploy.sh # production
bash scripts/check-bundle-budget.sh
bash scripts/check-coverage.sh
```

## Как поддерживать порядок

1. Новый актуальный документ добавляется в таблицу выше.
2. Исторический документ не удаляется, а переносится в `docs/archive/`.
3. Статус задачи меняется только в [tasks.md](tasks.md).
4. Release notes не переписываются после публикации.
5. Ссылки проверяются локально перед коммитом.

## Корневые документы

- [README.md](../README.md) — обзор и запуск проекта.
- [deploy/frontend.md](../deploy/frontend.md) — заметки по SPA-деплою.
