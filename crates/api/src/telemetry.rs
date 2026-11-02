//! Logging setup, request identifiers and HTTP tracing layers.

use std::time::Duration;

use axum::Router;
use axum::body::Body;
use axum::extract::Request;
use axum::http::{HeaderName, HeaderValue};
use axum::middleware::Next;
use axum::response::Response;
use tower_http::trace::TraceLayer;
use tracing::Span;
use tracing_subscriber::EnvFilter;

use crate::config::{Config, LogFormat};

/// Header used to correlate a request between the client, the API and the logs.
pub const REQUEST_ID_HEADER: &str = "x-request-id";

/// Identifier attached to the current request.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RequestId(pub String);

tokio::task_local! {
    static CURRENT_REQUEST_ID: String;
}

/// Request id of the request currently being handled, if any.
///
/// Used by error responses so the body carries the same id as the header.
pub fn current_request_id() -> Option<String> {
    CURRENT_REQUEST_ID.try_with(Clone::clone).ok()
}

/// Initialises the global tracing subscriber according to the configuration.
pub fn init(config: &Config) {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("jey_api=info,tower_http=info"));

    let builder = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false);

    match config.log_format {
        LogFormat::Json => builder.json().init(),
        LogFormat::Pretty => builder.init(),
    }
}

/// Attaches request ids and a tracing span to every request.
///
/// The request id middleware runs outermost so the tracing layer can put the
/// identifier into the span of the request it observes.
pub fn instrument(router: Router) -> Router {
    router
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(make_span)
                .on_response(on_response),
        )
        .layer(axum::middleware::from_fn(attach_request_id))
}

async fn attach_request_id(mut request: Request, next: Next) -> Response {
    let request_id = request
        .headers()
        .get(header_name())
        .and_then(|value| value.to_str().ok())
        .and_then(normalise_request_id)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    request
        .extensions_mut()
        .insert(RequestId(request_id.clone()));

    let mut response = CURRENT_REQUEST_ID
        .scope(request_id.clone(), next.run(request))
        .await;

    if let Ok(value) = HeaderValue::from_str(&request_id) {
        response.headers_mut().insert(header_name(), value);
    }

    response
}

fn make_span(request: &Request<Body>) -> Span {
    let request_id = request
        .extensions()
        .get::<RequestId>()
        .map(|id| id.0.as_str())
        .unwrap_or_default();

    tracing::info_span!(
        "http_request",
        request_id = %request_id,
        method = %request.method(),
        path = %request.uri().path(),
    )
}

fn on_response(response: &Response<Body>, latency: Duration, span: &Span) {
    let status = response.status().as_u16();
    let latency_ms = latency.as_micros() as f64 / 1000.0;

    span.in_scope(|| {
        tracing::info!(status, latency_ms, "request completed");
    });
}

fn header_name() -> HeaderName {
    HeaderName::from_static(REQUEST_ID_HEADER)
}

/// Accepts only short, header-safe identifiers; anything else is replaced.
fn normalise_request_id(raw: &str) -> Option<String> {
    let value = raw.trim();

    if !(8..=64).contains(&value.len()) {
        return None;
    }

    let allowed = value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | ':'));

    allowed.then(|| value.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_reasonable_ids() {
        assert_eq!(
            normalise_request_id("req-1234-abcd"),
            Some("req-1234-abcd".to_owned())
        );
        assert_eq!(
            normalise_request_id("  550e8400-e29b-41d4-a716-446655440000  "),
            Some("550e8400-e29b-41d4-a716-446655440000".to_owned())
        );
    }

    #[test]
    fn rejects_too_short_and_too_long_ids() {
        assert_eq!(normalise_request_id("abc"), None);
        assert_eq!(normalise_request_id(&"a".repeat(65)), None);
    }

    #[test]
    fn rejects_unsafe_characters() {
        assert_eq!(normalise_request_id("bad id here"), None);
        assert_eq!(normalise_request_id("id<script>alert(1)</script>"), None);
        assert_eq!(normalise_request_id("id\r\nx-injected: 1"), None);
    }
}
