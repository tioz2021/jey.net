//! Sign in with Google: OAuth 2.0 Authorization Code flow.
//!
//! The browser is sent to Google with a random `state` kept in an HttpOnly
//! cookie, then comes back with a code. The code is exchanged server-side, the
//! ID token is checked against Google's token info endpoint, and only then a
//! normal `jey_session` is issued. Passwords are not involved.

use axum::extract::{Query, State};
use axum::http::header::{LOCATION, SET_COOKIE};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use rand::RngCore;
use reqwest::Url;
use serde::Deserialize;
use serde_json::Value;

use crate::auth::normalise_email;
use crate::auth::session;
use crate::error::AppError;
use crate::http::AppState;
use crate::users::user::{self, UserView};

const STATE_COOKIE: &str = "jey_oauth_state";
const STATE_TTL_SECS: u64 = 600;
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const TOKEN_INFO_URL: &str = "https://oauth2.googleapis.com/tokeninfo";

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    id_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Claims {
    sub: String,
    email: String,
    aud: String,
    iss: String,
    #[serde(default)]
    email_verified: Value,
    name: Option<String>,
}

/// `GET /api/v1/auth/google/start`
pub async fn start(State(state): State<AppState>) -> Result<Response, AppError> {
    let Some((client_id, _, redirect_url)) = state.config.google_oauth() else {
        return Ok(fail(&state, "unavailable"));
    };

    let state_token = random_state();
    let url = auth_url(client_id, redirect_url, &state_token)?;

    let cookie = state_cookie(&state_token, state.config.is_production());
    let mut response = redirect(url);
    append_cookie(&mut response, &cookie)?;

    Ok(response)
}

/// `GET /api/v1/auth/google/callback`
pub async fn callback(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<CallbackQuery>,
) -> Result<Response, AppError> {
    let Some((client_id, client_secret, redirect_url)) = state.config.google_oauth() else {
        return Ok(fail(&state, "unavailable"));
    };

    let cookie_state = session::cookie_value(&headers, STATE_COOKIE);

    if query.error.is_some() {
        return Ok(clear_and_fail(&state, "cancelled"));
    }

    if cookie_state.is_none() || cookie_state != query.state.as_deref() {
        return Ok(clear_and_fail(&state, "state"));
    }

    let Some(code) = query.code else {
        return Ok(clear_and_fail(&state, "code"));
    };

    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(AppError::internal)?;

    let token_response = http
        .post(TOKEN_URL)
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("redirect_uri", redirect_url),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(AppError::internal)?;

    if !token_response.status().is_success() {
        tracing::warn!(status = %token_response.status(), "google token exchange failed");
        return Ok(clear_and_fail(&state, "token"));
    }

    let token: TokenResponse = token_response.json().await.map_err(AppError::internal)?;
    let Some(id_token) = token.id_token else {
        return Ok(clear_and_fail(&state, "token"));
    };

    let mut info_url = Url::parse(TOKEN_INFO_URL).map_err(AppError::internal)?;
    info_url
        .query_pairs_mut()
        .append_pair("id_token", &id_token);

    let claims: Claims = http
        .get(info_url)
        .send()
        .await
        .map_err(AppError::internal)?
        .json()
        .await
        .map_err(AppError::internal)?;

    if !claims_are_valid(&claims, client_id) {
        tracing::warn!("google claims rejected");
        return Ok(clear_and_fail(&state, "claims"));
    }

    let email = normalise_email(&claims.email);
    let (user, created) = match user::find_by_google_sub(&state.pool, &claims.sub).await? {
        Some(row) => (UserView::from(row), false),
        None => match user::find_by_email(&state.pool, &email).await? {
            Some(row) => {
                if row.google_sub.is_some() {
                    return Ok(clear_and_fail(&state, "linked"));
                }

                user::link_google(&state.pool, row.id, &claims.sub).await?;
                (UserView::from(row), false)
            }
            None => {
                if !crate::site::registration_enabled(&state.pool).await? {
                    return Ok(clear_and_fail(&state, "registration_closed"));
                }
                let display_name = display_name_from(&claims, &email);
                let created =
                    user::create_google(&state.pool, &email, &display_name, &claims.sub).await?;
                (created, true)
            }
        },
    };

    if created {
        crate::analytics::record(&state.pool, "registration", None, None).await;
    }

    let user_agent = headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|value| value.to_str().ok());

    let created_session = session::create_session(
        &state.pool,
        user.id,
        None,
        state.config.session_ttl_days,
        user_agent,
    )
    .await
    .map_err(AppError::internal)?;

    let session_cookie = session::session_cookie(
        &created_session.token,
        state.config.session_ttl_days,
        state.config.is_production(),
    );

    let base = state.config.public_url.trim_end_matches('/');
    let target = if created {
        format!("{base}/welcome")
    } else {
        format!("{base}/items")
    };

    let mut response = redirect(target);
    append_cookie(&mut response, &session_cookie)?;
    append_cookie(
        &mut response,
        &cleared_state_cookie(state.config.is_production()),
    )?;

    Ok(response)
}

fn auth_url(client_id: &str, redirect_url: &str, state: &str) -> Result<String, AppError> {
    let mut url = Url::parse(AUTH_URL).map_err(AppError::internal)?;
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_url)
        .append_pair("response_type", "code")
        .append_pair("scope", "openid email profile")
        .append_pair("state", state)
        .append_pair("prompt", "select_account");

    Ok(url.to_string())
}

fn claims_are_valid(claims: &Claims, client_id: &str) -> bool {
    claims.aud == client_id
        && (claims.iss == "accounts.google.com" || claims.iss == "https://accounts.google.com")
        && value_is_true(&claims.email_verified)
        && !claims.sub.is_empty()
        && claims.email.contains('@')
}

fn value_is_true(value: &Value) -> bool {
    value.as_bool().unwrap_or(false) || value.as_str() == Some("true")
}

fn display_name_from(claims: &Claims, email: &str) -> String {
    let candidate = claims
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| email.split('@').next().unwrap_or("Пользователь"));

    let clipped: String = candidate.chars().take(60).collect();
    user::validate_display_name(&clipped).unwrap_or_else(|_| "Пользователь".to_owned())
}

fn random_state() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn state_cookie(value: &str, secure: bool) -> String {
    let secure = if secure { "; Secure" } else { "" };

    format!(
        "{STATE_COOKIE}={value}; Path=/api/v1/auth/google; HttpOnly; SameSite=Lax; Max-Age={STATE_TTL_SECS}{secure}"
    )
}

fn cleared_state_cookie(secure: bool) -> String {
    let secure = if secure { "; Secure" } else { "" };

    format!("{STATE_COOKIE}=; Path=/api/v1/auth/google; HttpOnly; SameSite=Lax; Max-Age=0{secure}")
}

fn redirect(location: String) -> Response {
    let mut response = StatusCode::FOUND.into_response();
    if let Ok(value) = HeaderValue::from_str(&location) {
        response.headers_mut().insert(LOCATION, value);
    }
    response
}

fn append_cookie(response: &mut Response, cookie: &str) -> Result<(), AppError> {
    response.headers_mut().append(
        SET_COOKIE,
        HeaderValue::from_str(cookie).map_err(AppError::internal)?,
    );
    Ok(())
}

fn fail(state: &AppState, reason: &str) -> Response {
    redirect(login_error_url(state, reason))
}

fn clear_and_fail(state: &AppState, reason: &str) -> Response {
    let mut response = fail(state, reason);
    let _ = append_cookie(
        &mut response,
        &cleared_state_cookie(state.config.is_production()),
    );
    response
}

fn login_error_url(state: &AppState, reason: &str) -> String {
    let base = state.config.public_url.trim_end_matches('/');
    format!("{base}/login?google={reason}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn claims() -> Claims {
        Claims {
            sub: "123".to_owned(),
            email: "user@example.com".to_owned(),
            aud: "client".to_owned(),
            iss: "https://accounts.google.com".to_owned(),
            email_verified: json!(true),
            name: Some("User".to_owned()),
        }
    }

    #[test]
    fn auth_url_contains_required_parameters() {
        let url = auth_url("client", "https://example.com/cb", "state").expect("url");

        assert!(url.contains("client_id=client"));
        assert!(url.contains("response_type=code"));
        assert!(url.contains("scope=openid+email+profile"));
        assert!(url.contains("state=state"));
        assert!(url.contains("redirect_uri=https%3A%2F%2Fexample.com%2Fcb"));
    }

    #[test]
    fn claims_must_match_audience_and_verified_email() {
        assert!(claims_are_valid(&claims(), "client"));

        let mut wrong_audience = claims();
        wrong_audience.aud = "other".to_owned();
        assert!(!claims_are_valid(&wrong_audience, "client"));

        let mut unverified = claims();
        unverified.email_verified = json!(false);
        assert!(!claims_are_valid(&unverified, "client"));

        let mut string_true = claims();
        string_true.email_verified = json!("true");
        assert!(claims_are_valid(&string_true, "client"));
    }

    #[test]
    fn state_cookie_is_http_only_and_path_limited() {
        let cookie = state_cookie("abc", true);

        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.contains("Path=/api/v1/auth/google"));
        assert!(cookie.contains("SameSite=Lax"));
        assert!(cookie.contains("Secure"));
    }
}
