mod common;

use axum::http::StatusCode;
use serde_json::json;
use uuid::Uuid;

use common::TestClient;

fn email() -> String {
    format!("device-{}@example.com", Uuid::new_v4())
}

#[tokio::test]
async fn registers_once_and_binds_the_current_session() {
    let client = TestClient::new().await;
    let email = email();
    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": &email, "password": "correct horse battery", "display_name": "Devices" }),
        )
        .await;
    assert_eq!(registered.status, StatusCode::CREATED);
    let cookie = registered.session_cookie().expect("session cookie");
    let user_id = common::user_id_by_email(client.pool(), &email).await;

    let device_id = Uuid::new_v4();
    let first = client
        .post_with_cookie(
            "/api/v1/devices",
            json!({ "device_id": device_id, "name": "Jey laptop", "platform": "linux" }),
            &cookie,
        )
        .await;
    assert_eq!(first.status, StatusCode::CREATED);
    assert_eq!(first.body["device"]["device_id"], device_id.to_string());
    assert_eq!(first.body["device"]["name"], "Jey laptop");

    let second = client
        .post_with_cookie(
            "/api/v1/devices",
            json!({ "device_id": device_id, "name": "Jey workstation", "platform": "linux" }),
            &cookie,
        )
        .await;
    assert_eq!(second.status, StatusCode::OK);
    assert_eq!(second.body["device"]["name"], "Jey workstation");

    let count: i64 = sqlx::query_scalar(
        "select count(*) from devices where user_id = $1 and installation_id = $2",
    )
    .bind(user_id)
    .bind(device_id)
    .fetch_one(client.pool())
    .await
    .expect("count devices");
    assert_eq!(count, 1);

    let bound: Option<Uuid> = sqlx::query_scalar(
        "select d.installation_id
         from sessions s join devices d on d.id = s.device_id
         where s.user_id = $1 and d.installation_id = $2",
    )
    .bind(user_id)
    .bind(device_id)
    .fetch_optional(client.pool())
    .await
    .expect("bound device");
    assert_eq!(bound, Some(device_id));
}

#[tokio::test]
async fn rejects_unknown_platform_and_empty_name() {
    let client = TestClient::new().await;
    let email = email();
    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": &email, "password": "correct horse battery", "display_name": "Devices" }),
        )
        .await;
    let cookie = registered.session_cookie().expect("session cookie");
    let device_id = Uuid::new_v4();

    let bad_platform = client
        .post_with_cookie(
            "/api/v1/devices",
            json!({ "device_id": device_id, "name": "Laptop", "platform": "toaster" }),
            &cookie,
        )
        .await;
    assert_eq!(bad_platform.status, StatusCode::BAD_REQUEST);
    assert_eq!(bad_platform.body["error"]["code"], "validation_error");

    let empty_name = client
        .post_with_cookie(
            "/api/v1/devices",
            json!({ "device_id": device_id, "name": "   ", "platform": "linux" }),
            &cookie,
        )
        .await;
    assert_eq!(empty_name.status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn requires_a_session() {
    let client = TestClient::new().await;
    let response = client
        .post(
            "/api/v1/devices",
            json!({ "device_id": Uuid::new_v4(), "name": "Laptop", "platform": "linux" }),
        )
        .await;
    assert_eq!(response.status, StatusCode::UNAUTHORIZED);
}
