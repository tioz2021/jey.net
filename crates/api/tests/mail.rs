//! The development mail transport keeps messages on disk, with working links.

use jey_api::mail::dev::DevMailer;
use jey_api::mail::{Mailer, templates};

#[tokio::test]
async fn dev_transport_writes_a_message_with_a_link() {
    let directory = std::env::temp_dir().join(format!("jey-mail-{}", uuid::Uuid::new_v4()));
    let mailer = DevMailer::new(&directory, "jey@localhost");

    let message =
        templates::email_verification("http://localhost:3000", "user@example.com", "tok-123");
    mailer.send(message).await.expect("message is written");

    let entries: Vec<_> = std::fs::read_dir(&directory)
        .expect("directory exists")
        .map(|entry| entry.expect("readable entry").path())
        .collect();

    assert_eq!(entries.len(), 1, "exactly one .eml file");
    assert_eq!(
        entries[0].extension().and_then(|ext| ext.to_str()),
        Some("eml")
    );

    let content = std::fs::read_to_string(&entries[0]).expect("readable file");
    assert!(content.contains("To: user@example.com"));
    assert!(content.contains("http://localhost:3000/verify-email?token=tok-123"));

    std::fs::remove_dir_all(&directory).ok();
}
