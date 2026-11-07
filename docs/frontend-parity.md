# T125 — общий SPA-фронтенд

Статус: архитектурное решение, 7 ноября 2026.

## Цель

Один React-интерфейс для веба и desktop. Различается не UI, а источник данных:

```text
web      → HTTP API
desktop  → Tauri → SQLite
```

## Почему это отдельная задача

Сейчас веб — Next.js с Server Components и серверными страницами.
Desktop — Vite SPA. Общие только карточки, кнопки и токены. Этого мало.

## Целевая структура

```text
apps/client/
  src/
    app/                 общий роутер и экраны
    screens/             каталог, запись, коллекции, настройки
    data/
      http-source.ts
      tauri-source.ts
    main-web.tsx
    main-desktop.tsx

frontend/
  components/ui/         дизайн-система
  components/items/      карточки и формы
  lib/types.ts
  lib/i18n/

crates/desktop/          Tauri + SQLite + sync
```

`apps/client` собирается дважды:

- web-бандл для Next-хоста;
- desktop-бандл для Tauri `frontendDist`.

## Правила

1. В экранах нет `next/link`, `next/navigation`, `useRouter`, `backendFetch`.
2. Навигация — через общий роутер.
3. Данные — только через `ItemSource` / `CollectionSource`.
4. Next отвечает за публичные SEO-страницы и хостинг web-бандла.
5. Desktop не импортирует Next-компоненты.

## Этапы

### T125.1 · Каркас общего клиента `[x]`

- `apps/client` — бывший `apps/desktop`;
- общие `AppRoutes`;
- `SourceProvider` и `ItemSource`;
- `main.tsx` — Tauri/HashRouter;
- `main-web.tsx` — HTTP/BrowserRouter, ждёт подключения к Next;
- Tauri `frontendDist` указывает на `apps/client/dist`.

### T125.2 · Перенос списка и фильтров `[~]`

- T125.2a: `CatalogPage` вынесен из `App` и принимает данные/колбэки;
- desktop использует `CatalogPage`;
- следующий шаг: вынести `CatalogPage` в `frontend` и подключить
  `/items` через HTTP source.

### T125.3 · Коллекции и настройки

- коллекции;
- настройки профиля;
- публичные страницы остаются в Next.

### T125.4 · Удаление старых экранов

- удалить `apps/desktop/src/App.tsx`;
- удалить Next-страницы каталога, оставив редиректы/хост;
- один UI-код.

## Что не входит

- перенос публичного SEO-лендинга в SPA;
- админка;
- социальные страницы;
- смена API.

## Критерий завершения

- `/items` в вебе и desktop выглядит одинаково;
- используется один набор экранов;
- desktop работает офлайн;
- web работает онлайн;
- нет Next-зависимостей в общих экранах.
