//! Browser Web Push: subscriptions and delivery.

use axum::Json;
use axum::extract::State;
use base64ct::{Base64UrlUnpadded, Encoding};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;
use web_push_native::jwt_simple::algorithms::ES256KeyPair;
use web_push_native::p256::PublicKey;
use web_push_native::{Auth, WebPushBuilder};

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

#[derive(Debug, Deserialize)]
pub struct BrowserSubscription {
    pub endpoint: String,
    pub keys: BrowserKeys,
}

#[derive(Debug, Deserialize)]
pub struct BrowserKeys {
    pub p256dh: String,
    pub auth: String,
}

#[derive(Debug, Deserialize)]
pub struct EndpointBody {
    pub endpoint: String,
}

/// `GET /api/v1/push/key` — the VAPID public key, or 503 when disabled.
pub async fn public_key(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let key = state
        .config
        .vapid_public_key
        .as_deref()
        .filter(|key| !key.trim().is_empty())
        .ok_or_else(|| AppError::unavailable("push is not configured"))?;
    Ok(Json(json!({ "key": key })))
}

/// `POST /api/v1/push/subscribe`
pub async fn subscribe(
    State(state): State<AppState>,
    current: CurrentUser,
    Json(body): Json<BrowserSubscription>,
) -> Result<Json<Value>, AppError> {
    if !body.endpoint.starts_with("https://")
        || body.endpoint.len() > 2048
        || body.keys.p256dh.is_empty()
        || body.keys.auth.is_empty()
    {
        return Err(AppError::validation_field(
            "subscription",
            "subscription is invalid",
        ));
    }
    sqlx::query(
        "insert into push_subscriptions (user_id, endpoint, p256dh, auth)
         values ($1, $2, $3, $4)
         on conflict (endpoint) do update
         set user_id = excluded.user_id, p256dh = excluded.p256dh,
             auth = excluded.auth, updated_at = now()",
    )
    .bind(current.user.id)
    .bind(&body.endpoint)
    .bind(&body.keys.p256dh)
    .bind(&body.keys.auth)
    .execute(&state.pool)
    .await
    .map_err(AppError::internal)?;
    Ok(Json(json!({ "ok": true })))
}

/// `DELETE /api/v1/push/subscribe`
pub async fn unsubscribe(
    State(state): State<AppState>,
    current: CurrentUser,
    Json(body): Json<EndpointBody>,
) -> Result<Json<Value>, AppError> {
    sqlx::query("delete from push_subscriptions where endpoint = $1 and user_id = $2")
        .bind(&body.endpoint)
        .bind(current.user.id)
        .execute(&state.pool)
        .await
        .map_err(AppError::internal)?;
    Ok(Json(json!({ "ok": true })))
}

/// Sends one notification to every browser subscribed by a user.
///
/// Failures are logged and never fail the action that created the event.
pub async fn send_to_user(state: &AppState, user_id: Uuid, title: &str, body: &str, url: &str) {
    let Some(private_key) = state.config.vapid_private_key.as_deref() else {
        return;
    };
    let Ok(private_bytes) = Base64UrlUnpadded::decode_vec(private_key) else {
        return;
    };
    let Ok(key_pair) = ES256KeyPair::from_bytes(&private_bytes) else {
        return;
    };
    let subscriptions: Vec<(String, String, String)> =
        sqlx::query_as("select endpoint, p256dh, auth from push_subscriptions where user_id = $1")
            .bind(user_id)
            .fetch_all(&state.pool)
            .await
            .unwrap_or_default();
    if subscriptions.is_empty() {
        return;
    }
    let payload = json!({ "title": title, "body": body, "url": url }).to_string();
    let client = reqwest::Client::new();
    for (endpoint, p256dh, auth) in subscriptions {
        let Ok(endpoint_uri) = endpoint.parse() else {
            continue;
        };
        let Ok(public_bytes) = Base64UrlUnpadded::decode_vec(&p256dh) else {
            continue;
        };
        let Ok(public_key) = PublicKey::from_sec1_bytes(&public_bytes) else {
            continue;
        };
        let Ok(auth_bytes) = Base64UrlUnpadded::decode_vec(&auth) else {
            continue;
        };
        if auth_bytes.len() != 16 {
            continue;
        }
        let auth = Auth::clone_from_slice(&auth_bytes);
        let builder = WebPushBuilder::new(endpoint_uri, public_key, auth)
            .with_vapid(&key_pair, "mailto:push@jey.net");
        let Ok(request) = builder.build(payload.as_bytes()) else {
            continue;
        };
        let uri = request.uri().to_string();
        let headers = request.headers().clone();
        let body = request.into_body();
        if let Err(error) = client.post(uri).headers(headers).body(body).send().await {
            tracing::warn!(%error, "web push send failed");
        }
    }
}
