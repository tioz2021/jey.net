//! Unified error type shared by every API handler.
//!
//! The JSON shape produced here is the contract described in `docs/protocol.md`:
//! a stable `code`, a human-readable `message`, optional `details` and the
//! `request_id` of the request being answered.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use serde_json::{Value, json};
use thiserror::Error;

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

/// Everything a handler can fail with.
///
/// The contract is defined in full here so handlers written later (M1 and on)
/// do not have to invent their own error shapes; until then most variants are
/// only exercised by tests.
#[allow(dead_code)]
#[derive(Debug, Error)]
pub enum AppError {
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

    #[error("rate limited: {message}")]
    RateLimited {
        message: String,
        retry_after_secs: u64,
    },

    #[error("internal error: {0}")]
    Internal(Box<dyn std::error::Error + Send + Sync>),
}

#[allow(dead_code)]
impl AppError {
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

    pub fn rate_limited(message: impl Into<String>, retry_after_secs: u64) -> Self {
        Self::RateLimited {
            message: message.into(),
            retry_after_secs,
        }
    }

    pub fn internal(error: impl Into<Box<dyn std::error::Error + Send + Sync>>) -> Self {
        Self::Internal(error.into())
    }

    /// Status, stable code, public message and optional details.
    fn parts(&self) -> (StatusCode, &'static str, String, Option<Value>) {
        match self {
            Self::Validation { message, field } => (
                StatusCode::BAD_REQUEST,
                "validation_error",
                message.clone(),
                field.as_ref().map(|field| json!({ "field": field })),
            ),
            Self::Unauthorized(message) => (
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                message.clone(),
                None,
            ),
            Self::Forbidden(message) => (StatusCode::FORBIDDEN, "forbidden", message.clone(), None),
            Self::NotFound(message) => (StatusCode::NOT_FOUND, "not_found", message.clone(), None),
            Self::MethodNotAllowed(message) => (
                StatusCode::METHOD_NOT_ALLOWED,
                "method_not_allowed",
                message.clone(),
                None,
            ),
            Self::Conflict(message) => (StatusCode::CONFLICT, "conflict", message.clone(), None),
            Self::RateLimited {
                message,
                retry_after_secs,
            } => (
                StatusCode::TOO_MANY_REQUESTS,
                "rate_limited",
                message.clone(),
                Some(json!({ "retry_after_secs": retry_after_secs })),
            ),
            Self::Internal(error) => {
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

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message, details) = self.parts();

        let body = ErrorBody {
            error: ErrorPayload {
                code,
                message,
                details,
                request_id: current_request_id().unwrap_or_default(),
            },
        };

        (status, Json(body)).into_response()
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
}
