//! Logging setup, request identifiers and HTTP tracing layers.

use std::sync::atomic::{AtomicU64, Ordering};
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

static REQUESTS: AtomicU64 = AtomicU64::new(0);
static STATUS_2XX: AtomicU64 = AtomicU64::new(0);
static STATUS_3XX: AtomicU64 = AtomicU64::new(0);
static STATUS_4XX: AtomicU64 = AtomicU64::new(0);
static STATUS_5XX: AtomicU64 = AtomicU64::new(0);
static LATENCY_SUM_US: AtomicU64 = AtomicU64::new(0);
static LATENCY_MAX_US: AtomicU64 = AtomicU64::new(0);
static LATENCY_BUCKETS: [AtomicU64; 9] = [
    AtomicU64::new(0),
    AtomicU64::new(0),
    AtomicU64::new(0),
    AtomicU64::new(0),
    AtomicU64::new(0),
    AtomicU64::new(0),
    AtomicU64::new(0),
    AtomicU64::new(0),
    AtomicU64::new(0),
];
const LATENCY_BOUNDS_MS: [u64; 8] = [5, 10, 25, 50, 100, 250, 500, 1000];

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
    record_metrics(status, latency);

    span.in_scope(|| {
        tracing::info!(status, latency_ms, "request completed");
    });
}

fn record_metrics(status: u16, latency: Duration) {
    REQUESTS.fetch_add(1, Ordering::Relaxed);
    match status {
        200..=299 => STATUS_2XX.fetch_add(1, Ordering::Relaxed),
        300..=399 => STATUS_3XX.fetch_add(1, Ordering::Relaxed),
        400..=499 => STATUS_4XX.fetch_add(1, Ordering::Relaxed),
        500..=599 => STATUS_5XX.fetch_add(1, Ordering::Relaxed),
        _ => 0,
    };
    let micros = latency.as_micros().min(u64::MAX as u128) as u64;
    LATENCY_SUM_US.fetch_add(micros, Ordering::Relaxed);
    LATENCY_MAX_US.fetch_max(micros, Ordering::Relaxed);
    let ms = micros / 1000;
    let bucket = LATENCY_BOUNDS_MS
        .iter()
        .position(|bound| ms <= *bound)
        .unwrap_or(LATENCY_BOUNDS_MS.len());
    LATENCY_BUCKETS[bucket].fetch_add(1, Ordering::Relaxed);
}

/// Process-local request counters since startup. Good enough for the admin
/// dashboard and cheap enough to update on every request.
pub fn metrics() -> serde_json::Value {
    let total = REQUESTS.load(Ordering::Relaxed);
    let avg_ms = if total == 0 {
        0.0
    } else {
        LATENCY_SUM_US.load(Ordering::Relaxed) as f64 / total as f64 / 1000.0
    };
    let buckets = LATENCY_BOUNDS_MS
        .iter()
        .enumerate()
        .map(|(index, bound)| {
            (
                format!("{bound}ms"),
                serde_json::json!(LATENCY_BUCKETS[index].load(Ordering::Relaxed)),
            )
        })
        .chain(std::iter::once((
            "+inf".to_owned(),
            serde_json::json!(LATENCY_BUCKETS[LATENCY_BOUNDS_MS.len()].load(Ordering::Relaxed)),
        )))
        .collect::<serde_json::Map<_, _>>();
    serde_json::json!({
        "requests": {
            "total": total,
            "2xx": STATUS_2XX.load(Ordering::Relaxed),
            "3xx": STATUS_3XX.load(Ordering::Relaxed),
            "4xx": STATUS_4XX.load(Ordering::Relaxed),
            "5xx": STATUS_5XX.load(Ordering::Relaxed),
        },
        "latency_ms": {
            "avg": (avg_ms * 10.0).round() / 10.0,
            "max": LATENCY_MAX_US.load(Ordering::Relaxed) as f64 / 1000.0,
            "buckets": buckets,
        },
    })
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
