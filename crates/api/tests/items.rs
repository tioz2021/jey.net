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

#[tokio::test]
async fn list_paginates_without_gaps_or_duplicates() {
    let (client, email, cookie) = logged_in_client().await;
    let pool = pool().await;
    let user_id = common::user_id_by_email(&pool, &email).await;

    for index in 0..60 {
        repo::create(
            &pool,
            user_id,
            None,
            &NewItem {
                kind: ItemKind::Movie,
                title: format!("Item {index:02}"),
                subtitle: None,
                year: Some(2000 + index),
                status: ItemStatus::Done,
                rating: Some((index % 10 + 1) as u8),
                review: None,
                source_url: None,
                tags: vec![],
            },
        )
        .await
        .expect("item is created");
    }

    let mut ids = Vec::new();
    let mut cursor: Option<String> = None;
    let mut pages = 0;

    loop {
        let mut url = "/api/v1/items?limit=20".to_owned();
        if let Some(cursor) = &cursor {
            url.push_str(&format!("&cursor={cursor}"));
        }

        let page = client.get(&url, Some(&cookie)).await;
        assert_eq!(page.status, 200, "body: {}", page.body);
        pages += 1;

        for item in page.body["items"].as_array().expect("array") {
            ids.push(item["id"].as_str().expect("id").to_owned());
        }

        cursor = page.body["next_cursor"].as_str().map(str::to_owned);
        if cursor.is_none() {
            break;
        }
    }

    assert_eq!(pages, 3, "60 items with limit 20 is three pages");
    assert_eq!(ids.len(), 60, "every item is returned exactly once");

    let unique: std::collections::HashSet<_> = ids.iter().collect();
    assert_eq!(unique.len(), 60, "no duplicates across pages");

    client.cleanup(&email).await;
}

#[tokio::test]
async fn list_rejects_bad_parameters() {
    let (client, email, cookie) = logged_in_client().await;

    for (url, field) in [
        ("/api/v1/items?limit=0", "limit"),
        ("/api/v1/items?limit=101", "limit"),
        ("/api/v1/items?cursor=not-a-cursor", "cursor"),
        ("/api/v1/items?sort=random", "sort"),
        ("/api/v1/items?kind=game", "kind"),
        ("/api/v1/items?status=lost", "status"),
    ] {
        let response = client.get(url, Some(&cookie)).await;
        assert_eq!(response.status, 400, "url: {url}");
        assert_eq!(
            response.body["error"]["details"]["field"], field,
            "url: {url}"
        );
    }

    client.cleanup(&email).await;
}

#[tokio::test]
async fn list_sorts_by_rating_and_filters_by_kind() {
    let (client, email, cookie) = logged_in_client().await;
    let pool = pool().await;
    let user_id = common::user_id_by_email(&pool, &email).await;

    for (title, rating) in [("Low", 3), ("High", 10), ("Middle", 7)] {
        repo::create(
            &pool,
            user_id,
            None,
            &NewItem {
                kind: ItemKind::Movie,
                title: title.to_owned(),
                subtitle: None,
                year: None,
                status: ItemStatus::Done,
                rating: Some(rating),
                review: None,
                source_url: None,
                tags: vec![],
            },
        )
        .await
        .expect("movie");
    }

    repo::create(
        &pool,
        user_id,
        None,
        &NewItem {
            kind: ItemKind::Book,
            title: "Book".to_owned(),
            subtitle: None,
            year: None,
            status: ItemStatus::Done,
            rating: Some(9),
            review: None,
            source_url: None,
            tags: vec![],
        },
    )
    .await
    .expect("book");

    let sorted = client
        .get("/api/v1/items?sort=rating_desc", Some(&cookie))
        .await;
    assert_eq!(sorted.status, 200);
    let titles: Vec<&str> = sorted.body["items"]
        .as_array()
        .expect("array")
        .iter()
        .map(|item| item["title"].as_str().expect("title"))
        .collect();
    assert_eq!(titles, vec!["High", "Book", "Middle", "Low"]);

    let movies_only = client
        .get("/api/v1/items?kind=movie&sort=rating_desc", Some(&cookie))
        .await;
    let movie_titles: Vec<&str> = movies_only.body["items"]
        .as_array()
        .expect("array")
        .iter()
        .map(|item| item["title"].as_str().expect("title"))
        .collect();
    assert_eq!(movie_titles, vec!["High", "Middle", "Low"]);

    client.cleanup(&email).await;
}

#[tokio::test]
async fn update_item_changes_only_the_given_fields() {
    let (client, email, cookie) = logged_in_client().await;

    let created = client
        .post_with_cookie(
            "/api/v1/items",
            json!({
                "kind": "movie",
                "title": "Interstellar",
                "subtitle": "Christopher Nolan",
                "year": 2014,
                "status": "done",
                "rating": 7,
                "tags": ["sci-fi", "space"]
            }),
            &cookie,
        )
        .await;
    assert_eq!(created.status, 201);

    let id = created.body["item"]["id"].as_str().expect("id").to_owned();
    let created_at = created.body["item"]["created_at"]
        .as_str()
        .expect("timestamp")
        .to_owned();

    let patched = client
        .patch(
            &format!("/api/v1/items/{id}"),
            json!({ "rating": 10 }),
            &cookie,
        )
        .await;

    assert_eq!(patched.status, 200, "body: {}", patched.body);
    let item = &patched.body["item"];

    assert_eq!(item["rating"], 10);
    assert_eq!(item["title"], "Interstellar", "title is untouched");
    assert_eq!(item["subtitle"], "Christopher Nolan");
    assert_eq!(item["year"], 2014);
    assert_eq!(item["status"], "done");
    assert_eq!(item["tags"], json!(["sci-fi", "space"]));
    assert_eq!(item["revision"], 2, "the revision is bumped");

    let updated_at = chrono::DateTime::parse_from_rfc3339(item["updated_at"].as_str().expect("ts"))
        .expect("valid timestamp");
    let created_at = chrono::DateTime::parse_from_rfc3339(&created_at).expect("valid timestamp");
    assert!(updated_at >= created_at, "updated_at moves forward");

    client.cleanup(&email).await;
}

#[tokio::test]
async fn update_item_replaces_tags_and_validates_input() {
    let (client, email, cookie) = logged_in_client().await;

    let created = client
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "book", "title": "Dune", "status": "done", "tags": ["old"] }),
            &cookie,
        )
        .await;
    let id = created.body["item"]["id"].as_str().expect("id").to_owned();

    let retagged = client
        .patch(
            &format!("/api/v1/items/{id}"),
            json!({ "tags": ["  New  ", "another"] }),
            &cookie,
        )
        .await;
    assert_eq!(retagged.status, 200);
    assert_eq!(retagged.body["item"]["tags"], json!(["another", "New"]));

    let empty = client
        .patch(&format!("/api/v1/items/{id}"), json!({}), &cookie)
        .await;
    assert_eq!(empty.status, 400);

    let bad_rating = client
        .patch(
            &format!("/api/v1/items/{id}"),
            json!({ "rating": 0 }),
            &cookie,
        )
        .await;
    assert_eq!(bad_rating.status, 400);
    assert_eq!(bad_rating.body["error"]["details"]["field"], "rating");

    let malformed = client
        .patch("/api/v1/items/not-a-uuid", json!({ "rating": 5 }), &cookie)
        .await;
    assert_eq!(malformed.status, 400);
    assert_eq!(malformed.body["error"]["details"]["field"], "id");

    // Another account cannot touch the record.
    let (stranger, stranger_email, stranger_cookie) = logged_in_client().await;
    let foreign = stranger
        .patch(
            &format!("/api/v1/items/{id}"),
            json!({ "title": "Hijacked" }),
            &stranger_cookie,
        )
        .await;
    assert_eq!(foreign.status, 404);

    client.cleanup(&email).await;
    stranger.cleanup(&stranger_email).await;
}

#[tokio::test]
async fn delete_moves_to_bin_and_restore_brings_back() {
    let (client, email, cookie) = logged_in_client().await;

    let created = client
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "movie", "title": "Interstellar", "status": "done" }),
            &cookie,
        )
        .await;
    let id = created.body["item"]["id"].as_str().expect("id").to_owned();

    let deleted = client
        .delete(&format!("/api/v1/items/{id}"), json!({}), &cookie)
        .await;
    assert_eq!(deleted.status, 204, "body: {}", deleted.body);

    // Hidden from reads and from the normal list.
    assert_eq!(
        client
            .get(&format!("/api/v1/items/{id}"), Some(&cookie))
            .await
            .status,
        404
    );
    let visible = client.get("/api/v1/items", Some(&cookie)).await;
    assert!(visible.body["items"].as_array().expect("array").is_empty());

    // The bin shows it, with the tombstone timestamp.
    let bin = client
        .get("/api/v1/items?include_deleted=true", Some(&cookie))
        .await;
    let items = bin.body["items"].as_array().expect("array");
    assert_eq!(items.len(), 1);
    assert!(items[0]["deleted_at"].is_string(), "deleted_at is set");

    // A second delete is a 404: for the API the record is gone.
    let again = client
        .delete(&format!("/api/v1/items/{id}"), json!({}), &cookie)
        .await;
    assert_eq!(again.status, 404);

    // Restore puts it back.
    let restored = client
        .post_with_cookie(&format!("/api/v1/items/{id}/restore"), json!({}), &cookie)
        .await;
    assert_eq!(restored.status, 200, "body: {}", restored.body);
    assert_eq!(restored.body["item"]["title"], "Interstellar");

    let back = client.get("/api/v1/items", Some(&cookie)).await;
    assert_eq!(back.body["items"].as_array().expect("array").len(), 1);

    // Restoring a live record is a 404 as well.
    let restore_again = client
        .post_with_cookie(&format!("/api/v1/items/{id}/restore"), json!({}), &cookie)
        .await;
    assert_eq!(restore_again.status, 404);

    client.cleanup(&email).await;
}

#[tokio::test]
async fn delete_and_restore_respect_ownership() {
    let (client, email, cookie) = logged_in_client().await;
    let (stranger, stranger_email, stranger_cookie) = logged_in_client().await;

    let created = client
        .post_with_cookie(
            "/api/v1/items",
            json!({ "kind": "book", "title": "Dune", "status": "done" }),
            &cookie,
        )
        .await;
    let id = created.body["item"]["id"].as_str().expect("id").to_owned();

    let foreign_delete = stranger
        .delete(&format!("/api/v1/items/{id}"), json!({}), &stranger_cookie)
        .await;
    assert_eq!(foreign_delete.status, 404);

    client
        .delete(&format!("/api/v1/items/{id}"), json!({}), &cookie)
        .await;

    let foreign_restore = stranger
        .post_with_cookie(
            &format!("/api/v1/items/{id}/restore"),
            json!({}),
            &stranger_cookie,
        )
        .await;
    assert_eq!(foreign_restore.status, 404);

    // The owner still has the record in the bin.
    let bin = client
        .get("/api/v1/items?include_deleted=true", Some(&cookie))
        .await;
    assert_eq!(bin.body["items"].as_array().expect("array").len(), 1);

    client.cleanup(&email).await;
    stranger.cleanup(&stranger_email).await;
}
