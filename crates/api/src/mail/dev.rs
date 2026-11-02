//! Development transport: writes every message to a `.eml` file.

use std::path::{Path, PathBuf};

use async_trait::async_trait;
use chrono::Utc;
use uuid::Uuid;

use crate::mail::{MailError, Mailer, Message};

pub struct DevMailer {
    directory: PathBuf,
    from: String,
}

impl DevMailer {
    pub fn new(directory: impl Into<PathBuf>, from: impl Into<String>) -> Self {
        Self {
            directory: directory.into(),
            from: from.into(),
        }
    }

    pub fn directory(&self) -> &Path {
        &self.directory
    }
}

#[async_trait]
impl Mailer for DevMailer {
    async fn send(&self, message: Message) -> Result<(), MailError> {
        tokio::fs::create_dir_all(&self.directory).await?;

        let now = Utc::now();
        let file_name = format!("{}-{}.eml", now.format("%Y%m%dT%H%M%S"), Uuid::new_v4());
        let content = format!(
            "From: {}\r\nTo: {}\r\nSubject: {}\r\nDate: {}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{}\r\n",
            self.from,
            message.to,
            message.subject,
            now.to_rfc2822(),
            message.text
        );

        tokio::fs::write(self.directory.join(file_name), content).await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn message_is_written_to_a_file() {
        let directory = std::env::temp_dir().join(format!("jey-mail-{}", Uuid::new_v4()));
        let mailer = DevMailer::new(&directory, "jey@localhost");

        mailer
            .send(Message {
                to: "user@example.com".to_owned(),
                subject: "Confirm your email".to_owned(),
                text: "Open http://localhost:3000/verify-email?token=abc".to_owned(),
            })
            .await
            .expect("message is written");

        let mut entries = std::fs::read_dir(&directory).expect("directory exists");
        let file = entries.next().expect("one file").expect("readable entry");
        let content = std::fs::read_to_string(file.path()).expect("readable file");

        assert!(content.contains("To: user@example.com"));
        assert!(content.contains("Subject: Confirm your email"));
        assert!(content.contains("http://localhost:3000/verify-email?token=abc"));

        std::fs::remove_dir_all(&directory).ok();
    }
}
