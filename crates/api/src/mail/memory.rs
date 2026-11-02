//! In-memory transport used by tests.

use std::sync::Mutex;

use async_trait::async_trait;

use crate::mail::{MailError, Mailer, Message};

#[derive(Default)]
pub struct MemoryMailer {
    sent: Mutex<Vec<Message>>,
}

impl MemoryMailer {
    pub fn new() -> Self {
        Self::default()
    }

    /// Everything sent so far, oldest first.
    pub fn sent(&self) -> Vec<Message> {
        self.sent.lock().expect("mailbox is not poisoned").clone()
    }

    /// The most recent message, if any.
    pub fn last(&self) -> Option<Message> {
        self.sent
            .lock()
            .expect("mailbox is not poisoned")
            .last()
            .cloned()
    }

    pub fn clear(&self) {
        self.sent.lock().expect("mailbox is not poisoned").clear();
    }
}

#[async_trait]
impl Mailer for MemoryMailer {
    async fn send(&self, message: Message) -> Result<(), MailError> {
        self.sent
            .lock()
            .expect("mailbox is not poisoned")
            .push(message);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn keeps_sent_messages() {
        let mailer = MemoryMailer::new();

        mailer
            .send(Message {
                to: "user@example.com".to_owned(),
                subject: "Hello".to_owned(),
                text: "Body".to_owned(),
            })
            .await
            .expect("message is stored");

        assert_eq!(mailer.sent().len(), 1);
        assert_eq!(mailer.last().expect("one message").subject, "Hello");
    }
}
