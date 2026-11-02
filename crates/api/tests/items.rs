//! Repository tests: items are visible only to their owner and behave
//! consistently through create, update, bin and restore.

mod common;

use common::{TestClient, create_test_user, pool, purge_test_user, unique_email};
use jey_api::items::repo;
use jey_core::items::{ItemKind, ItemPatch, ItemStatus, NewItem};
use serde_json::json;

fn new_movie(title: &str) -> NewItem {
    NewItem {
        kind: ItemKind::Movie,
        title: title.to_owned(),
        subtitle: Some("Christopher Nolan".to_owned()),
        year: Some(2014),
        status: ItemStatus::Done,
        rating: Some(9),
        review: None,
        source_url: None,
        tags: vec!["Sci-Fi".to_owned(), "nolan".to_owned()],
    }
}

#[tokio::test]
async fn create_read_and_list() {
    let pool = pool().await;
    let user = create_test_user(&pool).await;

    let created = repo::create(&pool, user, None, &new_movie("Interstellar"))
        .await
        .expect("item is created");

    assert_eq!(created.title, "Interstellar");
    assert_eq!(created.kind, ItemKind::Movie);
    assert_eq!(created.rating, Some(9));
    assert_eq!(created.revision.get(), 1);
    assert_eq!(created.tags, vec!["nolan".to_owned(), "Sci-Fi".to_owned()]);

    let fetched = repo::get(&pool, user, created.id)
        .await
        .expect("read succeeds")
        .expect("item exists");
    assert_eq!(fetched.id, created.id);

    let listed = repo::list(&pool, user, None, None, 10)
        .await
        .expect("list succeeds");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, created.id);

    purge_test_user(&pool, user).await;
}

#[tokio::test]
async fn items_are_invisible_to_other_users() {
    let pool = pool().await;
    let owner = create_test_user(&pool).await;
    let stranger = create_test_user(&pool).await;

    let created = repo::create(&pool, owner, None, &new_movie("Interstellar"))
        .await
        .expect("item is created");

    assert!(
        repo::get(&pool, stranger, created.id)
            .await
            .expect("read succeeds")
            .is_none()
    );
    assert!(
        repo::list(&pool, stranger, None, None, 10)
            .await
            .expect("list succeeds")
            .is_empty()
    );
    assert!(
        !repo::soft_delete(&pool, stranger, created.id)
            .await
            .expect("delete succeeds")
    );

    purge_test_user(&pool, owner).await;
    purge_test_user(&pool, stranger).await;
}

#[tokio::test]
async fn update_changes_fields_and_bumps_revision() {
    let pool = pool().await;
    let user = create_test_user(&pool).await;

    let created = repo::create(&pool, user, None, &new_movie("Interstellar"))
        .await
        .expect("item is created");

    let patch = ItemPatch {
        title: Some("Interstellar (2014)".to_owned()),
        rating: Some(10),
        tags: Some(vec!["space".to_owned()]),
        ..ItemPatch::default()
    };

    let updated = repo::update(&pool, user, created.id, &patch)
        .await
        .expect("update succeeds")
        .expect("item exists");

    assert_eq!(updated.title, "Interstellar (2014)");
    assert_eq!(updated.rating, Some(10));
    assert_eq!(updated.revision.get(), 2);
    assert_eq!(updated.tags, vec!["space".to_owned()]);

    purge_test_user(&pool, user).await;
}

#[tokio::test]
async fn bin_hides_and_restore_brings_back() {
    let pool = pool().await;
    let user = create_test_user(&pool).await;

    let created = repo::create(&pool, user, None, &new_movie("Interstellar"))
        .await
        .expect("item is created");

    assert!(
        repo::soft_delete(&pool, user, created.id)
            .await
            .expect("delete")
    );
    assert!(
        repo::get(&pool, user, created.id)
            .await
            .expect("read")
            .is_none()
    );
    assert!(
        repo::list(&pool, user, None, None, 10)
            .await
            .expect("list")
            .is_empty()
    );

    assert!(
        repo::restore(&pool, user, created.id)
            .await
            .expect("restore")
    );
    let restored = repo::get(&pool, user, created.id)
        .await
        .expect("read")
        .expect("item is back");
    assert_eq!(restored.revision.get(), 3);

    purge_test_user(&pool, user).await;
}

#[tokio::test]
async fn list_filters_by_kind_and_status() {
    let pool = pool().await;
    let user = create_test_user(&pool).await;

    repo::create(&pool, user, None, &new_movie("Interstellar"))
        .await
        .expect("movie");
    repo::create(
        &pool,
        user,
        None,
        &NewItem {
            kind: ItemKind::Book,
            title: "Dune".to_owned(),
            status: ItemStatus::Planned,
            tags: vec![],
            ..new_movie("Dune")
        },
    )
    .await
    .expect("book");

    let movies = repo::list(&pool, user, Some(ItemKind::Movie), None, 10)
        .await
        .expect("list");
    assert_eq!(movies.len(), 1);
    assert_eq!(movies[0].title, "Interstellar");

    let planned = repo::list(&pool, user, None, Some(ItemStatus::Planned), 10)
        .await
        .expect("list");
    assert_eq!(planned.len(), 1);
    assert_eq!(planned[0].title, "Dune");

    let all = repo::list(&pool, user, None, None, 10).await.expect("list");
    assert_eq!(all.len(), 2);

    purge_test_user(&pool, user).await;
}

#[test]
fn json_shape_uses_snake_case() {
    let item = NewItem {
        kind: ItemKind::Movie,
        title: "Interstellar".to_owned(),
        subtitle: None,
        year: None,
        status: ItemStatus::InProgress,
        rating: None,
        review: None,
        source_url: None,
        tags: vec![],
    };

    let value = json!(item);
    assert_eq!(value["kind"], "movie");
    assert_eq!(value["status"], "in_progress");
}

const PASSWORD: &str = "correct horse battery";

async fn logged_in_client() -> (TestClient, String, String) {
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
async fn create_item_endpoint_stores_and_normalises() {
    let (client, email, cookie) = logged_in_client().await;

    let anonymous = client
        .post(
            "/api/v1/items",
            json!({ "kind": "movie", "title": "Interstellar", "status": "done" }),
        )
        .await;
    assert_eq!(anonymous.status, 401, "creation requires a session");

    let created = client
        .post_with_cookie(
            "/api/v1/items",
            json!({
                "kind": "movie",
                "title": "  Interstellar  ",
                "subtitle": " Christopher Nolan ",
                "year": 2014,
                "status": "done",
                "rating": 9,
                "tags": ["Sci-Fi", "sci-fi", " nolan ", ""]
            }),
            &cookie,
        )
        .await;

    assert_eq!(created.status, 201, "body: {}", created.body);
    assert_eq!(created.body["item"]["title"], "Interstellar");
    assert_eq!(created.body["item"]["subtitle"], "Christopher Nolan");
    assert_eq!(created.body["item"]["rating"], 9);
    assert_eq!(created.body["item"]["revision"], 1);
    assert_eq!(created.body["item"]["sync_seq"], 0);
    assert_eq!(created.body["item"]["tags"], json!(["nolan", "Sci-Fi"]));
    assert!(
        created.body["item"]["created_at"]
            .as_str()
            .expect("timestamp string")
            .contains('T'),
        "timestamps are RFC 3339"
    );

    client.cleanup(&email).await;
}

#[tokio::test]
async fn create_item_reports_validation_errors() {
    let (client, email, cookie) = logged_in_client().await;

    let cases = [
        (
            json!({ "kind": "movie", "title": "   ", "status": "done" }),
            "title",
        ),
        (
            json!({ "kind": "movie", "title": "X", "status": "done", "rating": 0 }),
            "rating",
        ),
        (
            json!({ "kind": "movie", "title": "X", "status": "done", "year": 1500 }),
            "year",
        ),
        (
            json!({
                "kind": "movie",
                "title": "X",
                "status": "done",
                "tags": (0..21).map(|index| format!("tag-{index}")).collect::<Vec<_>>()
            }),
            "tags",
        ),
    ];

    for (body, field) in cases {
        let response = client
            .post_with_cookie("/api/v1/items", body.clone(), &cookie)
            .await;

        assert_eq!(response.status, 400, "body: {body}");
        assert_eq!(
            response.body["error"]["details"]["field"], field,
            "body: {body}"
        );
    }

    // Movies cannot be "in progress".
    let wrong_status = client
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "movie", "title": "X", "status": "in_progress" }),
            &cookie,
        )
        .await;
    assert_eq!(wrong_status.status, 400);
    assert_eq!(wrong_status.body["error"]["details"]["field"], "status");

    client.cleanup(&email).await;
}

#[tokio::test]
async fn read_item_endpoint_respects_ownership() {
    let (client, email, cookie) = logged_in_client().await;

    let created = client
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "book", "title": "Dune", "status": "done", "rating": 10 }),
            &cookie,
        )
        .await;
    assert_eq!(created.status, 201);
    let item_id = created.body["item"]["id"].as_str().expect("id").to_owned();

    let own = client
        .get(&format!("/api/v1/items/{item_id}"), Some(&cookie))
        .await;
    assert_eq!(own.status, 200, "body: {}", own.body);
    assert_eq!(own.body["item"]["title"], "Dune");

    // Another account sees nothing.
    let (stranger, stranger_email, stranger_cookie) = logged_in_client().await;
    let foreign = stranger
        .get(&format!("/api/v1/items/{item_id}"), Some(&stranger_cookie))
        .await;
    assert_eq!(foreign.status, 404, "body: {}", foreign.body);
    assert_eq!(foreign.body["error"]["code"], "not_found");

    // A malformed identifier is a client error.
    let malformed = client.get("/api/v1/items/not-a-uuid", Some(&cookie)).await;
    assert_eq!(malformed.status, 400);
    assert_eq!(malformed.body["error"]["details"]["field"], "id");

    // Deleted records are invisible.
    client
        .soft_delete_item(uuid::Uuid::parse_str(&item_id).expect("uuid"))
        .await;

    let hidden = client
        .get(&format!("/api/v1/items/{item_id}"), Some(&cookie))
        .await;
    assert_eq!(hidden.status, 404);

    // Unauthenticated reads are rejected before the lookup.
    let anonymous = client.get(&format!("/api/v1/items/{item_id}"), None).await;
    assert_eq!(anonymous.status, 401);

    client.cleanup(&email).await;
    stranger.cleanup(&stranger_email).await;
}
