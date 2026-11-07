//! End-to-end local sync test against a small loopback HTTP server.

use std::fs;
use std::path::PathBuf;

use jey_core::items::{ItemKind, ItemStatus, NewItem};
use jey_core::repositories::ItemRepository;
use jey_desktop::access::AccessStore;
use jey_desktop::session_store::SessionStore;
use jey_desktop::store::{DesktopStore, SqliteItems};
use jey_desktop::sync::SyncService;
use uuid::Uuid;

fn temp_dir() -> PathBuf {
    std::env::temp_dir().join(format!("jey-sync-service-{}", Uuid::new_v4()))
}

#[tokio::test]
async fn pushes_outbox_then_pulls_remote_change() {
    let dir = temp_dir();
    let store = DesktopStore::open(&dir).expect("store");
    let user = Uuid::new_v4();
    let access = AccessStore::new(&dir);
    let session = SessionStore::new(&dir);

    let server = tiny_http::Server::http("127.0.0.1:0").expect("fake server");
    let port = match server.server_addr() {
        tiny_http::ListenAddr::IP(address) => address.port(),
        _ => panic!("no port"),
    };
    let remote_id = Uuid::new_v4().to_string();
    let remote = remote_id.clone();
    let handle = std::thread::spawn(move || {
        for request in server.incoming_requests().take(4) {
            let path = request.url().to_owned();
            let body = if path.starts_with("/api/v1/devices") {
                r#"{"device":{"device_id":"x"}}"#.to_owned()
            } else if path.starts_with("/api/v1/sync/push") {
                r#"{"protocol_version":1,"applied":[{"entity":"item","id":"x","revision":1,"sync_seq":1}],"conflicts":[],"last_seq":1}"#.to_owned()
            } else if path.starts_with("/api/v1/sync/pull") {
                format!(
                    r#"{{"protocol_version":1,"changes":[{{"entity":"item","id":"{remote}","revision":1,"sync_seq":1,"updated_at":"2026-11-07T00:00:00Z","deleted_at":null,"payload":{{"kind":"movie","title":"From server","status":"done","cover_key":"u/remote/large.webp"}}}}],"next_since":1,"has_more":false}}"#
                )
            } else if path.starts_with("/media/u/remote/large.webp") {
                "cover-bytes".to_owned()
            } else {
                r#"{"error":{"code":"not_found","message":"unexpected"}}"#.to_owned()
            };
            let _ = request.respond(tiny_http::Response::from_string(body));
        }
    });

    access
        .grant(user, &format!("http://127.0.0.1:{port}"))
        .expect("grant");
    session.save("test-token").expect("session");
    let repo = SqliteItems::new(store.clone());
    let local = repo
        .create_item(
            user,
            None,
            &NewItem {
                kind: ItemKind::Book,
                title: "Local push".to_owned(),
                subtitle: None,
                year: None,
                status: ItemStatus::Planned,
                rating: None,
                review: None,
                body: None,
                source_url: None,
                external_source: None,
                external_id: None,
                details: None,
                public_hidden: false,
            },
        )
        .await
        .expect("create");
    assert_eq!(store.outbox_batch(10).unwrap().len(), 1);

    let service = SyncService::from_local(store.clone(), &access, &session).expect("service");
    let report = service.synchronize().await.expect("sync");
    handle.join().unwrap();

    assert_eq!(report.pushed, 1);
    assert_eq!(report.pulled, 1);
    assert_eq!(store.outbox_batch(10).unwrap().len(), 0);
    assert!(repo.get_item(user, local.id).await.unwrap().is_some());
    let remote_item = repo
        .get_item(user, Uuid::parse_str(&remote_id).unwrap())
        .await
        .unwrap()
        .expect("remote item");
    assert_eq!(remote_item.title, "From server");
    assert!(store.media_cached("u/remote/large.webp").unwrap());
    assert_eq!(store.last_sync_seq().unwrap(), 1);
    fs::remove_dir_all(dir).ok();
}
