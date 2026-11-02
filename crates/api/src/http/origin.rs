//! Origin check for state-changing requests.
//!
//! `SameSite=Lax` already stops most cross-site POSTs, but browsers, WebViews
//! and the future desktop client do not behave identically. This layer is the
//! second lock: unsafe methods must come from a known origin.

use axum::extract::{Request, State};
use axum::http::header::{ORIGIN, REFERER};
use axum::http::{HeaderMap, Method};
use axum::middleware::Next;
use axum::response::Response;

use crate::AppState;
use crate::error::AppError;

/// Rejects `POST`, `PUT`, `PATCH` and `DELETE` coming from unknown origins.
pub async fn require_allowed_origin(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, AppError> {
    if is_safe_method(request.method()) {
        return Ok(next.run(request).await);
    }

    let Some(origin) = origin_from_headers(request.headers()) else {
        return Err(AppError::forbidden(
            "missing Origin header for a state-changing request",
        ));
    };

    let allowed = state
        .config
        .allowed_origins
        .iter()
        .any(|candidate| candidate.eq_ignore_ascii_case(&origin));

    if !allowed {
        return Err(AppError::forbidden("origin is not allowed"));
    }

    Ok(next.run(request).await)
}

fn is_safe_method(method: &Method) -> bool {
    matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS)
}

/// Reads `Origin`, falling back to the origin part of `Referer`.
fn origin_from_headers(headers: &HeaderMap) -> Option<String> {
    if let Some(origin) = headers.get(ORIGIN).and_then(|value| value.to_str().ok()) {
        let origin = origin.trim();
        // Browsers send the literal string `null` for sandboxed documents.
        if !origin.is_empty() && origin != "null" {
            return Some(origin.to_owned());
        }
    }

    headers
        .get(REFERER)
        .and_then(|value| value.to_str().ok())
        .and_then(origin_from_referer)
}

/// `http://localhost:3000/login?next=/me` → `http://localhost:3000`
fn origin_from_referer(referer: &str) -> Option<String> {
    let (scheme, rest) = referer.trim().split_once("://")?;
    if scheme.is_empty() || rest.is_empty() {
        return None;
    }

    let authority = rest.split(['/', '?', '#']).next()?;
    if authority.is_empty() {
        return None;
    }

    Some(format!("{}://{}", scheme.to_ascii_lowercase(), authority))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn headers(name: axum::http::header::HeaderName, value: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(name, HeaderValue::from_str(value).expect("valid header"));
        headers
    }

    #[test]
    fn safe_methods_are_not_checked() {
        assert!(is_safe_method(&Method::GET));
        assert!(is_safe_method(&Method::HEAD));
        assert!(is_safe_method(&Method::OPTIONS));
        assert!(!is_safe_method(&Method::POST));
        assert!(!is_safe_method(&Method::PATCH));
        assert!(!is_safe_method(&Method::DELETE));
    }

    #[test]
    fn origin_header_wins() {
        let map = headers(ORIGIN, "http://localhost:3000");

        assert_eq!(
            origin_from_headers(&map).as_deref(),
            Some("http://localhost:3000")
        );
    }

    #[test]
    fn referer_is_reduced_to_its_origin() {
        let map = headers(REFERER, "https://jey.net/items/42?tab=notes#top");

        assert_eq!(
            origin_from_headers(&map).as_deref(),
            Some("https://jey.net")
        );
    }

    #[test]
    fn missing_headers_are_rejected() {
        assert_eq!(origin_from_headers(&HeaderMap::new()), None);
    }

    #[test]
    fn literal_null_origin_is_rejected() {
        let map = headers(ORIGIN, "null");

        assert_eq!(origin_from_headers(&map), None);
    }

    #[test]
    fn malformed_referer_is_rejected() {
        let map = headers(REFERER, "not-a-url");

        assert_eq!(origin_from_headers(&map), None);
    }
}
