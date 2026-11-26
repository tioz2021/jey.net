# Local preview (T206)

Отдельный контур для UX-правок без production и без релиза.

```text
port:      8092
schema:    jey_preview
media:     .staging/preview-media
mail:      .staging/preview-mail
```

Запуск:

```bash
bash scripts/preview.sh
# http://127.0.0.1:8092
```

Сборка перед запуском:

```bash
bash scripts/preview.sh --build
```

Начать с чистой БД:

```bash
bash scripts/preview.sh --fresh
```

## Правила

- preview использует ту же PostgreSQL, но **отдельную схему**;
- production `jey` и E2E `jey_e2e` не затрагиваются;
- данные preview можно удалить через `--fresh`;
- сюда не попадают production-сессии и медиа;
- UX проверяется здесь, а не прямым деплоем web в production;
- desktop-код по-прежнему проверяется через release smoke, не через preview.

## Проверка

```bash
curl -fsS http://127.0.0.1:8092/api/v1/health
```

Ожидаемо:

```json
{"status":"ok","version":"0.7.12"}
```
