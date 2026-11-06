//! Behaviour both item repositories must share.
//!
//! API integration tests and desktop tests call the same function, so a change
//! in one store cannot silently diverge from the other.

use jey_core::items::{ItemPatch, ItemStatus, NewItem};
use jey_core::repositories::ItemRepository;
use jey_core::sync::DeviceId;
use uuid::Uuid;

pub async fn exercise<R: ItemRepository>(repository: &R, user_id: Uuid) {
    let device = DeviceId::new();
    let created = repository
        .create_item(
            user_id,
            Some(device),
            &NewItem {
                kind: jey_core::items::ItemKind::Movie,
                title: "Contract film".to_owned(),
                subtitle: Some("Director".to_owned()),
                year: Some(2024),
                status: ItemStatus::Done,
                rating: Some(8),
                review: Some("Public review".to_owned()),
                body: Some("Private note".to_owned()),
                source_url: None,
                external_source: None,
                external_id: None,
                details: None,
                public_hidden: false,
            },
        )
        .await
        .expect("create item");

    assert_eq!(created.title, "Contract film");
    assert_eq!(created.user_id, user_id);
    assert_eq!(created.rating, Some(8));
    assert_eq!(created.device_id, Some(device));

    let loaded = repository
        .get_item(user_id, created.id)
        .await
        .expect("get item")
        .expect("item exists");
    assert_eq!(loaded.id, created.id);

    let listed = repository.list_items(user_id).await.expect("list items");
    assert!(listed.iter().any(|item| item.id == created.id));

    let updated = repository
        .update_item(
            user_id,
            created.id,
            &ItemPatch {
                title: Some("Contract film edited".to_owned()),
                rating: Some(9),
                review: Some(String::new()),
                ..ItemPatch::default()
            },
        )
        .await
        .expect("update item")
        .expect("updated item");
    assert_eq!(updated.title, "Contract film edited");
    assert_eq!(updated.rating, Some(9));
    assert_eq!(updated.review, None);
    assert!(updated.revision > created.revision);

    let deleted = repository
        .delete_item(user_id, created.id)
        .await
        .expect("delete item");
    assert!(deleted);
    assert!(
        repository
            .get_item(user_id, created.id)
            .await
            .expect("get deleted")
            .is_none()
    );
    assert!(
        !repository
            .delete_item(user_id, created.id)
            .await
            .expect("delete twice")
    );
    assert!(
        repository
            .list_items(user_id)
            .await
            .expect("list after delete")
            .is_empty()
    );
}
