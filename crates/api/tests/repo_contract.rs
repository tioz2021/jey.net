mod common;

use axum::http::StatusCode;
use serde_json::json;
use uuid::Uuid;

use common::TestClient;
use jey_api::items::pg_repo::PgItems;

#[tokio::test]
async fn postgres_passes_the_shared_repository_contract() {
    let client = TestClient::new().await;
    let email = format!("repo-contract-{}@example.com", Uuid::new_v4());
    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": &email, "password": "correct horse battery", "display_name": "Contract" }),
        )
        .await;
    assert_eq!(registered.status, StatusCode::CREATED);
    let user_id = common::user_id_by_email(client.pool(), &email).await;

    let repository = PgItems::new(client.pool().clone());
    jey_repo_contract::exercise(&repository, user_id).await;
}
