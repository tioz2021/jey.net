# Desktop WebKit smoke

Автоматический smoke desktop-слоя через `tauri-driver` + `WebKitWebDriver`.
Это не Chromium Playwright: тест открывает настоящее окно Tauri/WebKit.

## Зависимости

```bash
cargo install tauri-driver --version '^2' --locked
sudo apt install webkit2gtk-driver xvfb
```

Нужен графический display или Xvfb.

## Запуск

```bash
bash scripts/desktop-smoke.sh
```

Скрипт:

1. создаёт временный `XDG_DATA_HOME`;
2. запускает `tauri-driver` и `WebKitWebDriver`;
3. открывает `jey-desktop` через WebDriver;
4. выполняет шесть сценариев;
5. закрывает сессию и удаляет временные данные.

## Сценарии

1. приложение запускается;
2. локальный доступ открывает блокнот;
3. форма показывает статус и кнопку «Назад»;
4. черновик формы и рецензия переживают reload;
5. «Очистить» очищает форму;
6. локальная запись сохраняется, корзина открывается.

## CI

Ручной workflow:

```text
.github/workflows/desktop-smoke.yml
```

Запускается через **Run workflow** на Ubuntu с `xvfb-run`.

## Ограничения

- тест использует локальную библиотеку, без внешнего сервера;
- это smoke, а не полный набор desktop-сценариев;
- для проверки автообновления нужны две версии приложения.
