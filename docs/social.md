# Social conflicts

Social sync uses the same local-first rules as items, but with a smaller
conflict surface.

## Collections and comments

Both are created with a client-generated `id`. If two devices create the same
`id` with different content, the server keeps the stored version and writes the
incoming version to `social_conflicts`. Nothing is overwritten.

List open conflicts:

```http
GET /api/v1/social/conflicts
Cookie: jey_session=...
```

Resolve one:

```http
POST /api/v1/social/conflicts/{conflict_id}/resolve
Content-Type: application/json

{"keep":"incoming"}
```

`stored` keeps the current row; `incoming` applies the saved losing version.

Desktop sync shows the number of social conflicts in its toast. Открыть
разрешение можно в **Настройки → Конфликты синхронизации**: видны обе версии
и кнопки «Оставить серверную» / «Оставить входящую». API остаётся доступным
для автоматизации.

## Profile and likes

These remain **last-write-wins**:

- profile fields are replaced by the latest `PATCH /api/v1/me`;
- a comment like is replaced by the latest `PUT /comments/{id}/reaction`.

They are explicit state, not versioned documents. The latest write wins and
there is no conflict copy.
