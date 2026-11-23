//! T193: public surface limits and private-field regression.

mod common;

use common::{TestClient, pool, purge_test_user, unique_email};
use serde_json::json;
use uuid::Uuid;

const PASSWORD: &str = "correct horse battery";

#[tokio::test]
async fn public_endpoints_are_rate_limited_per_ip() {
    let client = TestClient::new().await;
    let mut limited = None;
    for index in 0..301 {
        let response = client.get("/api/v1/public/users", None).await;
        if response.status == 429 {
            limited = Some((index, response));
            break;
        }
    }

    let (index, response) = limited.expect("public endpoint must be rate limited");
    assert!(index >= 299, "limit fired too early at request {index}");
    assert_eq!(response.body["error"]["code"], "rate_limited");

    sqlx::query("delete from rate_limits where key like 'public:%'")
        .execute(client.pool())
        .await
        .ok();
}

#[tokio::test]
async fn public_payloads_do_not_expose_private_fields() {
    let client = TestClient::new().await;
    let email = unique_email();
    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": email, "password": PASSWORD, "display_name": "Public Fields" }),
        )
        .await;
    assert_eq!(registered.status, 201, "body: {}", registered.body);
    let cookie = registered.session_cookie().expect("cookie");
    let user_id: Uuid = registered.body["user"]["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();

    let created = client
        .post_with_cookie(
            "/api/v1/items",
            json!({
                "kind": "movie",
                "title": "Public field record",
                "status": "done",
                "rating": 8,
                "body": "private body",
                "review": "public review"
            }),
            &cookie,
        )
        .await;
    assert_eq!(created.status, 201, "body: {}", created.body);
    let item_id = created.body["item"]["id"].as_str().unwrap().to_owned();

    let published = client
        .patch("/api/v1/me", json!({ "is_public": true }), &cookie)
        .await;
    assert_eq!(published.status, 200, "body: {}", published.body);

    let profile = client
        .get(&format!("/api/v1/public/users/{user_id}"), None)
        .await;
    assert_eq!(profile.status, 200, "body: {}", profile.body);
    for field in [
        "email",
        "notification_prefs",
        "password_hash",
        "user_id",
        "sync_seq",
    ] {
        assert!(
            !profile.body.to_string().contains(field),
            "public profile leaked {field}"
        );
    }
    assert!(!profile.body.to_string().contains("private body"));

    let item = client
        .get(
            &format!("/api/v1/public/users/{user_id}/items/{item_id}"),
            None,
        )
        .await;
    assert_eq!(item.status, 200, "body: {}", item.body);
    let raw = item.body.to_string();
    assert!(!raw.contains("private body"));
    assert!(!raw.contains("notification_prefs"));
    assert!(!raw.contains("revision"));
    assert_eq!(item.body["item"]["review"], "public review");

    client.cleanup(&email).await;
    purge_test_user(&pool().await, user_id).await;
    sqlx::query("delete from rate_limits where key like 'public:%'")
        .execute(client.pool())
        .await
        .ok();
}
