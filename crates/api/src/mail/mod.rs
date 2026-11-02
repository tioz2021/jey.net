//! Outgoing mail: a small abstraction with a file transport for development.
//!
//! Real delivery goes through an external provider (Brevo, Resend) from the
//! server; locally every message lands in `var/mail/*.eml` so nothing leaves
//! the machine and no SMTP settings are needed.

pub mod dev;
pub mod memory;
pub mod templates;

use std::sync::Arc;

use async_trait::async_trait;
use thiserror::Error;

use crate::config::Config;

/// One outgoing message, already rendered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Message {
    pub to: String,
    pub subject: String,
    pub text: String,
}

#[derive(Debug, Error)]
pub enum MailError {
    #[error("failed to write the message: {0}")]
    Io(#[from] std::io::Error),
}

/// Picks a transport for the current configuration.
///
/// Until a real provider is wired up (after the MVP), every environment writes
/// messages to files; production logs a warning about it.
pub fn from_config(config: &Config) -> Arc<dyn Mailer> {
    if config.is_production() {
        tracing::warn!(
            directory = %config.mail_dir.display(),
            "no production mail transport configured; messages go to files"
        );
    }

    Arc::new(dev::DevMailer::new(
        config.mail_dir.clone(),
        config.mail_from.clone(),
    ))
}

/// Anything that can deliver a rendered message.
#[async_trait]
pub trait Mailer: Send + Sync {
    async fn send(&self, message: Message) -> Result<(), MailError>;
}
