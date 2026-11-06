//! T118 acceptance: the local library survives a permanently unavailable server.
//!
//! No network is used after the grant is written. The unreachable server URL
//! is deliberate: even a client that wanted to check would find nothing.

use std::fs;
use std::path::PathBuf;

use jey_core::items::{ItemKind, ItemPatch, ItemStatus, NewItem};
use jey_core::repositories::ItemRepository;
use jey_desktop::access::AccessStore;
use jey_desktop::store::{DesktopStore, SqliteItems, backup, export_json};
use uuid::Uuid;

fn temp_dir(tag: &str) -> PathBuf {
    std::env::temp_dir().join(format!("jey-server-loss-{tag}-{}", Uuid::new_v4()))
}

fn new_item(title: &str) -> NewItem {
    NewItem {
        kind: ItemKind::Book,
        title: title.to_owned(),
        subtitle: Some("Offline author".to_owned()),
        year: Some(2026),
        status: ItemStatus::Planned,
        rating: None,
        review: Some("Written without a server".to_owned()),
        body: Some("Private offline note".to_owned()),
        source_url: None,
        external_source: None,
        external_id: None,
        details: None,
        public_hidden: false,
    }
}

#[tokio::test]
async fn works_after_the_server_is_gone_and_can_restore_its_backup() {
    let dir = temp_dir("main");
    let user = Uuid::new_v4();
    let access = AccessStore::new(&dir);

    // Simulates a successful first online login.
    access
        .grant(user, "http://127.0.0.1:9")
        .expect("grant written");
    assert!(access.can_open(), "local access does not need the server");

    let store = DesktopStore::open(&dir).expect("store");
    let repository = SqliteItems::new(store.clone());
    let created = repository
        .create_item(user, None, &new_item("Offline original"))
        .await
        .expect("create offline");
    assert_eq!(created.title, "Offline original");
    assert_eq!(repository.pending_ids(user).unwrap().len(), 1);

    // The process dies and starts again. The grant and database are untouched.
    drop(store);
    assert!(AccessStore::new(&dir).can_open());

    let store = DesktopStore::open(&dir).expect("reopen store");
    let repository = SqliteItems::new(store.clone());
    let items = repository
        .list_items(user)
        .await
        .expect("list after restart");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].title, "Offline original");

    let edited = repository
        .update_item(
            user,
            created.id,
            &ItemPatch {
                title: Some("Offline edited".to_owned()),
                ..ItemPatch::default()
            },
        )
        .await
        .expect("edit offline")
        .expect("edited item");
    assert_eq!(edited.title, "Offline edited");
    assert!(edited.revision > created.revision);

    let export = export_json(&store, user).expect("export");
    assert!(export.items >= 1);
    let raw = fs::read_to_string(&export.path).expect("read export");
    assert!(raw.contains("Offline edited"));
    assert!(raw.contains("Private offline note"));

    let backup = backup(&store, user).expect("backup");
    assert!(backup.db_bytes > 0);
    let manifest = fs::read_to_string(format!("{}/manifest.json", backup.path)).expect("manifest");
    assert!(manifest.contains("\"items\": 1"));

    // Restore the backup into a fresh app-data directory and read it.
    let restored_dir = temp_dir("restored");
    fs::create_dir_all(&restored_dir).expect("restore dir");
    fs::copy(
        format!("{}/jey.db", backup.path),
        restored_dir.join("jey.db"),
    )
    .expect("copy backup db");
    let restored = DesktopStore::open(&restored_dir).expect("open restored");
    let restored_repo = SqliteItems::new(restored);
    let restored_items = restored_repo.list_items(user).await.expect("restored list");
    assert_eq!(restored_items.len(), 1);
    assert_eq!(restored_items[0].title, "Offline edited");

    // Pending work is still in the backup; sync can resume if a server returns.
    assert_eq!(restored_repo.pending_ids(user).unwrap().len(), 1);

    fs::remove_dir_all(dir).ok();
    fs::remove_dir_all(restored_dir).ok();
}
