//! Large local outbox: 1 200 items must leave in 100-item batches without loss.

use std::path::PathBuf;
use std::time::Instant;

use jey_desktop::access::AccessStore;
use jey_desktop::session_store::SessionStore;
use jey_desktop::store::DesktopStore;
use jey_desktop::sync::SyncService;
use uuid::Uuid;

fn temp_dir() -> PathBuf {
    std::env::temp_dir().join(format!("jey-sync-large-{}", Uuid::new_v4()))
}

#[tokio::test]
async fn pushes_twelve_batches_and_clears_the_outbox() {
    let dir = temp_dir();
    let store = DesktopStore::open(&dir).expect("store");
    let user = Uuid::new_v4();
    {
        let mut connection = store.connection().unwrap();
        let tx = connection.transaction().unwrap();
        let now = 1_700_000_000_000_i64;
        for i in 0..1200_i64 {
            let id = if i == 0 {
                "00000000-0000-4000-8000-000000000001".to_owned()
            } else {
                Uuid::new_v4().to_string()
            };
            tx.execute(
                "insert into items (id, user_id, kind, title, status, created_at, updated_at)
                 values (?1, ?2, 'movie', ?3, 'done', ?4, ?5)",
                rusqlite::params![id, user.to_string(), format!("Large {i}"), now, now],
            )
            .unwrap();
            tx.execute(
                "insert into outbox (entity, entity_id, revision, updated_at, deleted_at, payload, created_at)
                 values ('item', ?1, 1, ?2, null, ?3, ?2)",
                rusqlite::params![
                    id,
                    now,
                    format!(r#"{{"kind":"movie","title":"Large {i}","status":"done"}}"#)
                ],
            )
            .unwrap();
        }
        tx.commit().unwrap();
    }
    assert_eq!(store.outbox_batch(2000).unwrap().len(), 1200);

    let server = tiny_http::Server::http("127.0.0.1:0").expect("fake server");
    let port = match server.server_addr() {
        tiny_http::ListenAddr::IP(address) => address.port(),
        _ => panic!("no port"),
    };
    let handle = std::thread::spawn(move || {
        let mut pushes = 0;
        for request in server.incoming_requests().take(15) {
            let path = request.url().to_owned();
            let body = if path.starts_with("/api/v1/devices") {
                r#"{"device":{"device_id":"x"}}"#.to_owned()
            } else if path.starts_with("/api/v1/sync/push") {
                pushes += 1;
                r#"{"protocol_version":1,"applied":[{"entity":"item","id":"x","revision":1,"sync_seq":1}],"conflicts":[],"last_seq":1}"#.to_owned()
            } else if path.starts_with("/api/v1/sync/pull") {
                r#"{"protocol_version":1,"changes":[],"next_since":1,"has_more":false}"#.to_owned()
            } else if path.starts_with("/api/v1/sync/social") {
                r#"{"collections":[],"comments":[],"profile":null,"reactions":[]}"#.to_owned()
            } else {
                r#"{}"#.to_owned()
            };
            let _ = request.respond(tiny_http::Response::from_string(body));
        }
        pushes
    });

    let access = AccessStore::new(&dir);
    access
        .grant(user, &format!("http://127.0.0.1:{port}"))
        .expect("grant");
    SessionStore::new(&dir).save("token").expect("session");
    let service =
        SyncService::from_local(store.clone(), &access, &SessionStore::new(&dir)).expect("service");
    let started = Instant::now();
    let report = service.synchronize().await.expect("sync");
    let elapsed = started.elapsed();
    assert_eq!(report.pushed, 12);
    assert_eq!(store.outbox_batch(2000).unwrap().len(), 0);
    assert_eq!(handle.join().unwrap(), 12);
    eprintln!("large sync: 1200 items in 12 batches, {elapsed:?}");
    assert!(elapsed.as_secs() < 30);
    std::fs::remove_dir_all(dir).ok();
}
