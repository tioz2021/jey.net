//! T200: client error reports are accepted and stored without request bodies.

mod common;

use common::TestClient;
use serde_json::json;

#[tokio::test]
async fn client_error_is_stored_and_truncated() {
    let client = TestClient::new().await;
    let message = format!("boom {}", "x".repeat(2000));
    let response = client
        .post(
            "/api/v1/client-errors",
            json!({
                "route": "/items/1",
                "scope": "draft.save",
                "message": message,
                "stack": "at save (app.js:1)",
                "app_version": "0.7.5",
                "request_id": "req-1",
                "password": "must-not-be-stored"
            }),
        )
        .await;
    assert_eq!(response.status, 202, "body: {}", response.body);
    assert_eq!(response.body["accepted"], true);

    let row: (String, String, String, Option<String>, String) = sqlx::query_as(
        "select route, scope, message, request_id, app_version
         from client_errors order by id desc limit 1",
    )
    .fetch_one(client.pool())
    .await
    .expect("client error row");
    assert_eq!(row.0, "/items/1");
    assert_eq!(row.1, "draft.save");
    assert!(row.2.chars().count() <= 1000);
    assert!(!row.2.contains("must-not-be-stored"));
    assert_eq!(row.3.as_deref(), Some("req-1"));
    assert_eq!(row.4, "0.7.5");

    sqlx::query("delete from client_errors where request_id = 'req-1'")
        .execute(client.pool())
        .await
        .ok();
}
