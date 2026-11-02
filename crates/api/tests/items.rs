//! Repository tests: items are visible only to their owner and behave
//! consistently through create, update, bin and restore.

mod common;

use common::{create_test_user, pool, purge_test_user};
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
