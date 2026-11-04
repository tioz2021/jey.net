//! Export and import: a user can take their data out and bring it back.

mod common;

use common::{TestClient, unique_email};
use serde_json::json;

const PASSWORD: &str = "correct horse battery";

async fn account() -> (TestClient, String, String) {
    let client = TestClient::new().await;
    let email = unique_email();
    let registered = client
        .post(
            "/api/v1/auth/register",
            json!({ "email": email, "password": PASSWORD, "display_name": "Collector" }),
        )
        .await;
    let cookie = registered.session_cookie().expect("registration cookie");

    (client, email, cookie)
}

#[tokio::test]
async fn export_then_import_restores_everything() {
    let (source, source_email, source_cookie) = account().await;

    for (title, kind) in [("Interstellar", "movie"), ("Dune", "book")] {
        let created = source
            .post_with_cookie(
                "/api/v1/items",
                json!({
                    "kind": kind,
                    "title": title,
                    "status": "done",
                    "rating": 9
                }),
                &source_cookie,
            )
            .await;
        assert_eq!(created.status, 201);
    }

    let exported = source.get("/api/v1/export", Some(&source_cookie)).await;
    assert_eq!(exported.status, 200, "body: {}", exported.body);
    assert_eq!(exported.body["version"], 1);
    assert_eq!(exported.body["items"].as_array().expect("array").len(), 2);

    // A fresh account imports the file.
    let (target, target_email, target_cookie) = account().await;

    let imported = target
        .post_with_cookie("/api/v1/import", exported.body.clone(), &target_cookie)
        .await;
    assert_eq!(imported.status, 200, "body: {}", imported.body);
    assert_eq!(imported.body["imported"], 2);
    assert_eq!(imported.body["skipped"], 0);

    let restored = target.get("/api/v1/items", Some(&target_cookie)).await;
    let restored_items = restored.body["items"].as_array().expect("array");
    assert_eq!(restored_items.len(), 2);

    let dune = restored_items
        .iter()
        .find(|item| item["title"] == "Dune")
        .expect("dune is restored");
    assert_eq!(dune["rating"], 9);

    // Importing the same file again changes nothing.
    let again = target
        .post_with_cookie("/api/v1/import", exported.body.clone(), &target_cookie)
        .await;
    assert_eq!(again.status, 200);
    assert_eq!(again.body["imported"], 0);
    assert_eq!(again.body["skipped"], 2);

    let still_two = target.get("/api/v1/items", Some(&target_cookie)).await;
    assert_eq!(still_two.body["items"].as_array().expect("array").len(), 2);

    source.cleanup(&source_email).await;
    target.cleanup(&target_email).await;
}

#[tokio::test]
async fn import_is_all_or_nothing() {
    let (client, email, cookie) = account().await;

    let file = json!({
        "items": [
            { "kind": "movie", "title": "Interstellar", "status": "done" },
            { "kind": "movie", "title": "   ", "status": "done" }
        ]
    });

    let response = client
        .post_with_cookie("/api/v1/import", file, &cookie)
        .await;

    assert_eq!(response.status, 400, "body: {}", response.body);
    assert_eq!(response.body["error"]["code"], "validation_error");
    let errors = response.body["error"]["details"]["errors"]
        .as_array()
        .expect("errors array");
    assert_eq!(errors.len(), 1);
    assert_eq!(errors[0]["index"], 1);

    // Nothing was written: the valid record did not sneak in.
    let items = client.get("/api/v1/items", Some(&cookie)).await;
    assert!(items.body["items"].as_array().expect("array").is_empty());

    client.cleanup(&email).await;
}

#[tokio::test]
async fn import_rejects_malformed_json() {
    let (client, email, cookie) = account().await;

    let response = client
        .post_raw_with_cookie("/api/v1/import", "{\"items\": [", &cookie)
        .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["error"]["code"], "validation_error");

    client.cleanup(&email).await;
}

#[tokio::test]
async fn export_csv_quotes_awkward_values() {
    let (client, email, cookie) = account().await;

    let created = client
        .post_with_cookie(
            "/api/v1/items",
            json!({
                "kind": "book",
                "title": "Dune, or \"Arrakis\"",
                "status": "done",
                "review": "Первая строка\nВторая строка"
            }),
            &cookie,
        )
        .await;
    assert_eq!(created.status, 201);

    let (status, content_type, csv) = client
        .get_raw("/api/v1/export?format=csv", Some(&cookie))
        .await;

    assert_eq!(status, 200);
    assert_eq!(content_type.as_deref(), Some("text/csv; charset=utf-8"));
    assert!(csv.starts_with("id,kind,title,subtitle,year,status,rating,"));
    assert!(csv.contains("\"Dune, or \"\"Arrakis\"\"\""));
    assert!(csv.contains("\"Первая строка\nВторая строка\""));
    assert_eq!(csv.lines().count(), 3, "header + record + trailing newline");

    let bad_format = client.get("/api/v1/export?format=xml", Some(&cookie)).await;
    assert_eq!(bad_format.status, 400);
    assert_eq!(bad_format.body["error"]["details"]["field"], "format");

    client.cleanup(&email).await;
}
