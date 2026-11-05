//! `POST /api/v1/items`: create a record.

use axum::Json;
use axum::extract::State;
use axum::extract::rejection::JsonRejection;
use axum::http::StatusCode;
use jey_core::items::{NewItem, validate};
use jey_core::sync::DeviceId;
use serde_json::{Value, json};

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;
use crate::items::repo;
use crate::items::view::ItemView;

pub async fn create_item(
    State(state): State<AppState>,
    current: CurrentUser,
    payload: Result<Json<NewItem>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let Json(payload) = payload.map_err(|rejection| AppError::validation(rejection.body_text()))?;

    let new_item = validate::validate_new(&payload)?;

    if !validate::status_allowed(new_item.kind, new_item.status) {
        return Err(AppError::validation_field(
            "status",
            format!(
                "status {:?} is not allowed for a {:?}",
                new_item.status, new_item.kind
            ),
        ));
    }

    let item = repo::create(
        &state.pool,
        current.user.id,
        current.device_id.map(DeviceId::from_uuid),
        &new_item,
    )
    .await?;

    crate::users::notifications::notify_new_item(
        &state,
        current.user.id,
        &current.user.display_name,
        item.id,
        &item.title,
        item.status.as_str(),
        item.public_hidden,
    )
    .await;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "item": ItemView::from(item) })),
    ))
}
