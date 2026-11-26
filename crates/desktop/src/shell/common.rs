// Shared helpers used by desktop command groups.

fn current_user(state: &DesktopState) -> Result<uuid::Uuid, String> {
    state
        .access
        .load()
        .map_err(|error| error.to_string())?
        .map(|grant| grant.user_id)
        .ok_or_else(|| "Сначала войдите онлайн, чтобы открыть локальную библиотеку".to_owned())
}

fn item_json(item: &Item, pending: bool) -> Value {
    let mut value = serde_json::to_value(item).unwrap_or(Value::Null);
    if let Some(object) = value.as_object_mut() {
        object.insert("pending".to_owned(), Value::Bool(pending));
    }
    value
}

