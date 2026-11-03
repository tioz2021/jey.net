//! Errors the domain can produce, independent of HTTP and storage.

use thiserror::Error;

/// Everything the domain can fail with.
///
/// The HTTP representation lives in `jey-api`; the desktop client maps the same
/// variants onto its own user-facing messages.
#[derive(Debug, Error)]
pub enum DomainError {
    #[error("validation failed: {message}")]
    Validation {
        message: String,
        field: Option<String>,
    },

    #[error("unauthorized: {0}")]
    Unauthorized(String),

    #[error("forbidden: {0}")]
    Forbidden(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("method not allowed: {0}")]
    MethodNotAllowed(String),

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("unsupported media type: {0}")]
    UnsupportedMediaType(String),

    #[error("payload too large: {0}")]
    PayloadTooLarge(String),

    #[error("rate limited: {message}")]
    RateLimited {
        message: String,
        retry_after_secs: u64,
    },

    #[error("unavailable: {0}")]
    Unavailable(String),

    #[error("internal error: {0}")]
    Internal(Box<dyn std::error::Error + Send + Sync>),
}

impl DomainError {
    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation {
            message: message.into(),
            field: None,
        }
    }

    pub fn validation_field(field: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Validation {
            message: message.into(),
            field: Some(field.into()),
        }
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::Unauthorized(message.into())
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::Forbidden(message.into())
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::NotFound(message.into())
    }

    pub fn method_not_allowed(message: impl Into<String>) -> Self {
        Self::MethodNotAllowed(message.into())
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::Conflict(message.into())
    }

    pub fn unsupported_media_type(message: impl Into<String>) -> Self {
        Self::UnsupportedMediaType(message.into())
    }

    pub fn payload_too_large(message: impl Into<String>) -> Self {
        Self::PayloadTooLarge(message.into())
    }

    pub fn rate_limited(message: impl Into<String>, retry_after_secs: u64) -> Self {
        Self::RateLimited {
            message: message.into(),
            retry_after_secs,
        }
    }

    pub fn internal(error: impl Into<Box<dyn std::error::Error + Send + Sync>>) -> Self {
        Self::Internal(error.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validation_keeps_the_field() {
        match DomainError::validation_field("year", "out of range") {
            DomainError::Validation { message, field } => {
                assert_eq!(message, "out of range");
                assert_eq!(field.as_deref(), Some("year"));
            }
            other => panic!("unexpected variant: {other:?}"),
        }
    }

    #[test]
    fn messages_are_readable() {
        assert_eq!(
            DomainError::not_found("item").to_string(),
            "not found: item"
        );
        assert_eq!(
            DomainError::rate_limited("slow down", 60).to_string(),
            "rate limited: slow down"
        );
    }
}
