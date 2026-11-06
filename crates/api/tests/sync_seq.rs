mod common;

use axum::http::StatusCode;
use serde_json::json;
use uuid::Uuid;

use common::TestClient;

#[tokio::test]
async fn assigns_increasing_sequences_to_create_update_and_delete() {
    let client = TestClient::new().await;
    let email = format!("sync-seq-{}@example.com", Uuid::new_v4());
    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": &email, "password": "correct horse battery", "display_name": "Sync" }),
        )
        .await;
    assert_eq!(registered.status, StatusCode::CREATED);
    let cookie = registered.session_cookie().expect("session cookie");

    let first = client
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "movie", "title": "First", "status": "done" }),
            &cookie,
        )
        .await;
    assert_eq!(first.status, StatusCode::CREATED);
    let first_id = first.body["item"]["id"].as_str().expect("item id");
    let first_seq = first.body["item"]["sync_seq"].as_u64().expect("sync seq");

    let second = client
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "book", "title": "Second", "status": "planned" }),
            &cookie,
        )
        .await;
    assert_eq!(second.status, StatusCode::CREATED);
    let second_seq = second.body["item"]["sync_seq"].as_u64().expect("sync seq");
    assert!(second_seq > first_seq);

    let edited = client
        .patch(
            &format!("/api/v1/items/{first_id}"),
            json!({ "title": "First edited" }),
            &cookie,
        )
        .await;
    assert_eq!(edited.status, StatusCode::OK);
    let edited_seq = edited.body["item"]["sync_seq"].as_u64().expect("sync seq");
    assert!(edited_seq > second_seq);

    let deleted = client
        .delete(&format!("/api/v1/items/{first_id}"), json!({}), &cookie)
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let deleted_seq = edited_seq; // the soft-delete response has no body

    let user_id = common::user_id_by_email(client.pool(), &email).await;
    let (counter, deleted_row_seq): (i64, i64) = sqlx::query_as(
        "select u.sync_seq, i.sync_seq
         from users u join items i on i.user_id = u.id
         where u.id = $1 and i.id = $2::uuid",
    )
    .bind(user_id)
    .bind(first_id)
    .fetch_one(client.pool())
    .await
    .expect("counter and tombstone");
    assert!(counter as u64 > deleted_seq);
    assert!(deleted_row_seq as u64 > deleted_seq);

    let index: i64 = sqlx::query_scalar(
        "select count(*) from pg_indexes
         where schemaname = current_schema() and indexname = 'items_user_sync_seq_idx'",
    )
    .fetch_one(client.pool())
    .await
    .expect("index exists");
    assert_eq!(index, 1);
}
