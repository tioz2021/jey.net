//! Shared helpers for integration tests.
//!
//! Tests talk to the router directly and need a real PostgreSQL database:
//! `TEST_DATABASE_URL`, or `DATABASE_URL` from `.env` when the first is unset.
//!
//! Each test gets its own small pool: `#[tokio::test]` creates a fresh runtime
//! per test, and a pool created in another test's runtime dies with it.

#![allow(dead_code)]

use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{Method, Request, StatusCode};
use http_body_util::BodyExt;
use jey_api::config::{AppEnv, Config, LogFormat};
use jey_api::http::{AppState, router};
use serde_json::Value;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;

/// Database for tests: `TEST_DATABASE_URL`, or `.env` as a fallback.
fn database_url() -> String {
    let _ = dotenvy::dotenv();

    std::env::var("TEST_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .expect("TEST_DATABASE_URL or DATABASE_URL must be set for integration tests")
}

/// Small pool of its own with the migrations applied.
pub async fn pool() -> PgPool {
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&database_url())
        .await
        .expect("connect to the test database");

    jey_api::db::migrate(&pool).await.expect("apply migrations");

    pool
}

fn test_config() -> Config {
    Config {
        app_env: AppEnv::Test,
        bind_addr: "127.0.0.1:0".parse().expect("valid address"),
        database_url: database_url(),
        run_migrations: false,
        session_ttl_days: 30,
        allowed_origins: vec!["http://localhost:3000".to_owned()],
        log_format: LogFormat::Pretty,
    }
}

/// A router wired to the test database, with its own fake client address.
pub struct TestClient {
    app: Router,
    pool: PgPool,
    ip: String,
}

pub struct TestResponse {
    pub status: StatusCode,
    pub body: Value,
    set_cookie: Option<String>,
}

impl TestResponse {
    /// Value of the `jey_session` cookie, ready to be sent back.
    pub fn session_cookie(&self) -> Option<String> {
        let header = self.set_cookie.as_deref()?;
        let pair = header.split(';').next()?;

        pair.starts_with("jey_session=").then(|| pair.to_owned())
    }
}

impl TestClient {
    pub async fn new() -> Self {
        let _ = tracing_subscriber::fmt()
            .with_env_filter("jey_api=debug")
            .try_init();

        let pool = pool().await;
        let state = AppState {
            pool: pool.clone(),
            config: Arc::new(test_config()),
        };

        // Every test gets its own client address so rate-limit counters of one
        // test never affect another, even when tests run in parallel.
        let bytes = uuid::Uuid::new_v4().into_bytes();
        let ip = format!("10.{}.{}.{}", bytes[0], bytes[1], bytes[2]);

        Self {
            app: router(state),
            pool,
            ip,
        }
    }

    pub async fn post(&self, path: &str, body: Value) -> TestResponse {
        self.post_with_origin(path, body, Some("http://localhost:3000"))
            .await
    }

    pub async fn post_with_origin(
        &self,
        path: &str,
        body: Value,
        origin: Option<&str>,
    ) -> TestResponse {
        self.send(Method::POST, path, Some(body), None, origin)
            .await
    }

    pub async fn post_with_cookie(&self, path: &str, body: Value, cookie: &str) -> TestResponse {
        self.send(
            Method::POST,
            path,
            Some(body),
            Some(cookie),
            Some("http://localhost:3000"),
        )
        .await
    }

    pub async fn patch(&self, path: &str, body: Value, cookie: &str) -> TestResponse {
        self.send(
            Method::PATCH,
            path,
            Some(body),
            Some(cookie),
            Some("http://localhost:3000"),
        )
        .await
    }

    pub async fn get(&self, path: &str, cookie: Option<&str>) -> TestResponse {
        self.send(
            Method::GET,
            path,
            None,
            cookie,
            Some("http://localhost:3000"),
        )
        .await
    }

    async fn send(
        &self,
        method: Method,
        path: &str,
        body: Option<Value>,
        cookie: Option<&str>,
        origin: Option<&str>,
    ) -> TestResponse {
        let mut builder = Request::builder()
            .method(method)
            .uri(path)
            .header("x-forwarded-for", &self.ip);

        if let Some(origin) = origin {
            builder = builder.header("origin", origin);
        }
        if body.is_some() {
            builder = builder.header("content-type", "application/json");
        }
        if let Some(cookie) = cookie {
            builder = builder.header("cookie", cookie);
        }

        let body = match body {
            Some(value) => Body::from(value.to_string()),
            None => Body::empty(),
        };

        let mut request = builder.body(body).expect("valid request");
        request
            .extensions_mut()
            .insert(ConnectInfo(SocketAddr::from(([127, 0, 0, 1], 4000))));

        let response = self
            .app
            .clone()
            .oneshot(request)
            .await
            .expect("router responds");

        let status = response.status();
        let set_cookie = response
            .headers()
            .get("set-cookie")
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);

        let bytes = response
            .into_body()
            .collect()
            .await
            .expect("read body")
            .to_bytes();

        let body = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap_or(Value::Null)
        };

        TestResponse {
            status,
            body,
            set_cookie,
        }
    }

    /// Removes everything the test created.
    pub async fn cleanup(&self, email: &str) {
        let _ = sqlx::query("delete from users where email = $1")
            .bind(email)
            .execute(&self.pool)
            .await;

        let _ = sqlx::query("delete from rate_limits where key like $1")
            .bind(format!("%{}%", self.ip))
            .execute(&self.pool)
            .await;
    }
}

/// Unique email per test so runs never collide.
pub fn unique_email() -> String {
    format!("test-{}@example.com", uuid::Uuid::new_v4())
}
