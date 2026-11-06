//! HTTP representation of domain errors.
//!
//! The domain (`jey-core`) knows nothing about status codes; this module maps
//! its variants onto the wire format described in `docs/protocol.md`.

use axum::Json;
use axum::http::HeaderValue;
use axum::http::StatusCode;
use axum::http::header::RETRY_AFTER;
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use serde_json::{Value, json};

use jey_core::DomainError;

use crate::telemetry::current_request_id;

#[derive(Debug, Serialize)]
struct ErrorBody {
    error: ErrorPayload,
}

#[derive(Debug, Serialize)]
struct ErrorPayload {
    code: &'static str,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<Value>,
    request_id: String,
}

/// Thin wrapper that turns a domain failure into an HTTP response.
#[derive(Debug)]
pub struct AppError {
    source: DomainError,
    /// Replaces the default `details` object when a handler has more to say.
    details: Option<Value>,
}

// Handlers start using these constructors in M2; until then only a few are hit.
#[allow(dead_code)]
impl AppError {
    fn new(source: DomainError) -> Self {
        Self {
            source,
            details: None,
        }
    }

    /// A validation failure that reports several problems at once.
    pub fn validation_with_details(message: impl Into<String>, details: Value) -> Self {
        Self {
            source: DomainError::validation(message),
            details: Some(details),
        }
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::new(DomainError::validation(message))
    }

    pub fn validation_field(field: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(DomainError::validation_field(field, message))
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::new(DomainError::unauthorized(message))
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::new(DomainError::forbidden(message))
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(DomainError::not_found(message))
    }

    pub fn method_not_allowed(message: impl Into<String>) -> Self {
        Self::new(DomainError::method_not_allowed(message))
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(DomainError::conflict(message))
    }

    pub fn unsupported_media_type(message: impl Into<String>) -> Self {
        Self::new(DomainError::unsupported_media_type(message))
    }

    pub fn payload_too_large(message: impl Into<String>) -> Self {
        Self::new(DomainError::payload_too_large(message))
    }

    pub fn rate_limited(message: impl Into<String>, retry_after_secs: u64) -> Self {
        Self::new(DomainError::rate_limited(message, retry_after_secs))
    }

    pub fn unavailable(message: impl Into<String>) -> Self {
        Self::new(DomainError::Unavailable(message.into()))
    }

    pub fn internal(error: impl Into<Box<dyn std::error::Error + Send + Sync>>) -> Self {
        Self::new(DomainError::internal(error))
    }

    /// Status, stable code, public message and optional details.
    fn parts(&self) -> (StatusCode, &'static str, String, Option<Value>) {
        match &self.source {
            DomainError::Validation { message, field } => (
                StatusCode::BAD_REQUEST,
                "validation_error",
                message.clone(),
                self.details
                    .clone()
                    .or_else(|| field.as_ref().map(|field| json!({ "field": field }))),
            ),
            DomainError::Unauthorized(message) => (
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                message.clone(),
                None,
            ),
            DomainError::Forbidden(message) => {
                (StatusCode::FORBIDDEN, "forbidden", message.clone(), None)
            }
            DomainError::NotFound(message) => {
                (StatusCode::NOT_FOUND, "not_found", message.clone(), None)
            }
            DomainError::MethodNotAllowed(message) => (
                StatusCode::METHOD_NOT_ALLOWED,
                "method_not_allowed",
                message.clone(),
                None,
            ),
            DomainError::Conflict(message) => {
                (StatusCode::CONFLICT, "conflict", message.clone(), None)
            }
            DomainError::UnsupportedMediaType(message) => (
                StatusCode::UNSUPPORTED_MEDIA_TYPE,
                "unsupported_media_type",
                message.clone(),
                None,
            ),
            DomainError::PayloadTooLarge(message) => (
                StatusCode::PAYLOAD_TOO_LARGE,
                "payload_too_large",
                message.clone(),
                None,
            ),
            DomainError::Unavailable(message) => (
                StatusCode::SERVICE_UNAVAILABLE,
                "unavailable",
                message.clone(),
                None,
            ),
            DomainError::RateLimited {
                message,
                retry_after_secs,
            } => (
                StatusCode::TOO_MANY_REQUESTS,
                "rate_limited",
                message.clone(),
                Some(json!({ "retry_after_secs": retry_after_secs })),
            ),
            DomainError::Internal(error) => {
                // Details stay in the log; the client gets a generic message.
                tracing::error!(error = %error, "unhandled internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal",
                    "internal server error".to_owned(),
                    None,
                )
            }
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.source.fmt(f)
    }
}

impl std::error::Error for AppError {}

impl AppError {
    /// Unwraps the domain error for storage adapters and contract tests.
    pub fn into_domain(self) -> DomainError {
        self.source
    }
}

impl From<DomainError> for AppError {
    fn from(error: DomainError) -> Self {
        Self::new(error)
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let retry_after = match &self.source {
            DomainError::Unavailable(_) => None,
            DomainError::RateLimited {
                retry_after_secs, ..
            } => Some(*retry_after_secs),
            _ => None,
        };

        let (status, code, message, details) = self.parts();

        let body = ErrorBody {
            error: ErrorPayload {
                code,
                message,
                details,
                request_id: current_request_id().unwrap_or_default(),
            },
        };

        let mut response = (status, Json(body)).into_response();

        if let Some(seconds) = retry_after
            && let Ok(value) = HeaderValue::from_str(&seconds.to_string())
        {
            response.headers_mut().insert(RETRY_AFTER, value);
        }

        response
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validation_maps_to_400_with_field() {
        let (status, code, _, details) =
            AppError::validation_field("year", "year must be between 1800 and 2100").parts();

        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(code, "validation_error");
        assert_eq!(details, Some(json!({ "field": "year" })));
    }

    #[test]
    fn common_errors_map_to_expected_statuses_and_codes() {
        let cases = [
            (
                AppError::unauthorized("no session"),
                StatusCode::UNAUTHORIZED,
                "unauthorized",
            ),
            (
                AppError::forbidden("not yours"),
                StatusCode::FORBIDDEN,
                "forbidden",
            ),
            (
                AppError::not_found("missing"),
                StatusCode::NOT_FOUND,
                "not_found",
            ),
            (
                AppError::method_not_allowed("use GET"),
                StatusCode::METHOD_NOT_ALLOWED,
                "method_not_allowed",
            ),
            (
                AppError::conflict("already exists"),
                StatusCode::CONFLICT,
                "conflict",
            ),
        ];

        for (error, expected_status, expected_code) in cases {
            let (status, code, _, details) = error.parts();
            assert_eq!(status, expected_status);
            assert_eq!(code, expected_code);
            assert_eq!(details, None);
        }
    }

    #[test]
    fn rate_limit_exposes_retry_after() {
        let (status, code, _, details) = AppError::rate_limited("too many attempts", 60).parts();

        assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(code, "rate_limited");
        assert_eq!(details, Some(json!({ "retry_after_secs": 60 })));
    }

    #[test]
    fn internal_error_does_not_leak_details() {
        let error = AppError::internal("connection refused: password=hunter2");
        let (status, code, message, details) = error.parts();

        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(code, "internal");
        assert_eq!(message, "internal server error");
        assert_eq!(details, None);
    }

    #[test]
    fn domain_errors_convert_into_app_errors() {
        let error: AppError = DomainError::not_found("item").into();
        let (status, code, _, _) = error.parts();

        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(code, "not_found");
    }
}
