//! Application configuration loaded from the environment.

use std::env;
use std::fmt;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::str::FromStr;

use thiserror::Error;

/// Environment the process runs in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppEnv {
    Dev,
    Test,
    Prod,
}

impl AppEnv {
    fn parse(raw: &str) -> Result<Self, ConfigError> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "dev" => Ok(Self::Dev),
            "test" => Ok(Self::Test),
            "prod" => Ok(Self::Prod),
            other => Err(ConfigError::invalid_value(
                "APP_ENV",
                other,
                "must be one of: dev, test, prod",
            )),
        }
    }
}

impl fmt::Display for AppEnv {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            Self::Dev => "dev",
            Self::Test => "test",
            Self::Prod => "prod",
        };
        f.write_str(name)
    }
}

/// Format of the process log output.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogFormat {
    Pretty,
    Json,
}

impl LogFormat {
    fn parse(raw: &str) -> Result<Self, ConfigError> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "pretty" => Ok(Self::Pretty),
            "json" => Ok(Self::Json),
            other => Err(ConfigError::invalid_value(
                "LOG_FORMAT",
                other,
                "must be one of: pretty, json",
            )),
        }
    }
}

impl fmt::Display for LogFormat {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            Self::Pretty => "pretty",
            Self::Json => "json",
        };
        f.write_str(name)
    }
}

/// Fully resolved process configuration.
#[derive(Debug, Clone)]
pub struct Config {
    pub app_env: AppEnv,
    pub bind_addr: SocketAddr,
    pub database_url: String,
    /// Apply pending migrations when the server starts.
    pub run_migrations: bool,
    pub session_ttl_days: u32,
    pub allowed_origins: Vec<String>,
    pub log_format: LogFormat,
    /// Public address of the web client, used in emails.
    pub public_url: String,
    /// From address for outgoing mail.
    pub mail_from: String,
    /// Where the development transport writes `.eml` files.
    pub mail_dir: PathBuf,
    /// Where uploaded files are stored.
    pub media_dir: PathBuf,
    /// Per-user storage quota in bytes.
    pub media_quota_bytes: u64,
    /// Google OAuth client credentials; sign-in is disabled when absent.
    pub google_client_id: Option<String>,
    pub google_client_secret: Option<String>,
    pub google_redirect_url: Option<String>,
    /// TMDB v4 read token; movie search is disabled when absent.
    pub tmdb_read_token: Option<String>,
    /// Google Books API key; the fallback book search is disabled when absent.
    pub google_books_key: Option<String>,
    /// Days a deleted account is kept for recovery before the purge task.
    pub purge_retention_days: i32,
}

impl Config {
    /// True when the process serves real traffic.
    pub fn is_production(&self) -> bool {
        self.app_env == AppEnv::Prod
    }

    /// Client id, secret and redirect URL when Google sign-in is configured.
    pub fn google_oauth(&self) -> Option<(&str, &str, &str)> {
        Some((
            self.google_client_id.as_deref()?,
            self.google_client_secret.as_deref()?,
            self.google_redirect_url.as_deref()?,
        ))
    }

    /// Loads configuration from `.env` (searched upwards) and the environment.
    ///
    /// Real environment variables always win over values from `.env`.
    pub fn load() -> Result<Self, ConfigError> {
        load_dotenv()?;

        let app_env = match var("APP_ENV") {
            Some(raw) => AppEnv::parse(&raw)?,
            None => AppEnv::Dev,
        };

        let bind_addr = match var("BIND_ADDR") {
            Some(raw) => SocketAddr::from_str(raw.trim()).map_err(|_| {
                ConfigError::invalid_value(
                    "BIND_ADDR",
                    &raw,
                    "must be a valid socket address, for example 127.0.0.1:8080",
                )
            })?,
            None => SocketAddr::from_str(DEFAULT_BIND_ADDR)
                .expect("default bind address is a valid socket address"),
        };

        let session_ttl_days = match var("SESSION_TTL_DAYS") {
            Some(raw) => parse_session_ttl(&raw)?,
            None => DEFAULT_SESSION_TTL_DAYS,
        };

        let database_url = var("DATABASE_URL").ok_or(ConfigError::Missing {
            key: "DATABASE_URL",
        })?;

        let public_url = match var("PUBLIC_URL") {
            Some(raw) => validate_public_url(&raw)?,
            None => DEFAULT_PUBLIC_URL.to_owned(),
        };

        let mail_from = match var("MAIL_FROM") {
            Some(raw) if raw.contains('@') => raw,
            Some(raw) => {
                return Err(ConfigError::invalid_value(
                    "MAIL_FROM",
                    &raw,
                    "must look like an email address",
                ));
            }
            None => DEFAULT_MAIL_FROM.to_owned(),
        };

        let mail_dir = match var("MAIL_DIR") {
            Some(raw) => PathBuf::from(raw),
            None => PathBuf::from("var/mail"),
        };

        let media_dir = match var("MEDIA_DIR") {
            Some(raw) => PathBuf::from(raw),
            None => PathBuf::from("var/media"),
        };

        let media_quota_mb = match var("MEDIA_QUOTA_MB") {
            Some(raw) => parse_quota_mb(&raw)?,
            None => crate::media::DEFAULT_QUOTA_MB,
        };

        let allowed_origins = match var("ALLOWED_ORIGINS") {
            Some(raw) => parse_origins(&raw)?,
            None => vec![DEFAULT_ORIGIN.to_owned()],
        };

        let run_migrations = match var("RUN_MIGRATIONS") {
            Some(raw) => parse_bool("RUN_MIGRATIONS", &raw)?,
            None => app_env != AppEnv::Prod,
        };

        let log_format = match var("LOG_FORMAT") {
            Some(raw) => LogFormat::parse(&raw)?,
            None => match app_env {
                AppEnv::Prod => LogFormat::Json,
                AppEnv::Dev | AppEnv::Test => LogFormat::Pretty,
            },
        };

        let purge_retention_days = match var("PURGE_RETENTION_DAYS") {
            Some(raw) => parse_purge_retention(&raw)?,
            None => 30,
        };

        let google_client_id = var("GOOGLE_CLIENT_ID");
        let google_client_secret = var("GOOGLE_CLIENT_SECRET");
        let google_redirect_url = var("GOOGLE_REDIRECT_URL");
        let tmdb_read_token = var("TMDB_READ_TOKEN");
        let google_books_key = var("GOOGLE_BOOKS_API_KEY");

        Ok(Self {
            app_env,
            bind_addr,
            database_url,
            run_migrations,
            session_ttl_days,
            allowed_origins,
            log_format,
            public_url,
            mail_from,
            mail_dir,
            media_dir,
            media_quota_bytes: media_quota_mb * 1024 * 1024,
            google_client_id,
            google_client_secret,
            google_redirect_url,
            tmdb_read_token,
            google_books_key,
            purge_retention_days,
        })
    }
}

const DEFAULT_BIND_ADDR: &str = "127.0.0.1:8080";
const DEFAULT_SESSION_TTL_DAYS: u32 = 30;
const DEFAULT_ORIGIN: &str = "http://localhost:3000";
const DEFAULT_PUBLIC_URL: &str = "http://localhost:3000";
const DEFAULT_MAIL_FROM: &str = "jey@localhost";

fn var(key: &'static str) -> Option<String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn parse_bool(key: &'static str, raw: &str) -> Result<bool, ConfigError> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => Ok(true),
        "0" | "false" | "no" | "off" => Ok(false),
        _ => Err(ConfigError::invalid_value(
            key,
            raw,
            "must be one of: true, false, 1, 0, yes, no, on, off",
        )),
    }
}

fn validate_public_url(raw: &str) -> Result<String, ConfigError> {
    let url = raw.trim_end_matches('/');

    if url.starts_with("http://") || url.starts_with("https://") {
        Ok(url.to_owned())
    } else {
        Err(ConfigError::invalid_value(
            "PUBLIC_URL",
            raw,
            "must start with http:// or https://",
        ))
    }
}

fn parse_session_ttl(raw: &str) -> Result<u32, ConfigError> {
    let days: u32 = raw.trim().parse().map_err(|_| {
        ConfigError::invalid_value(
            "SESSION_TTL_DAYS",
            raw,
            "must be a number between 1 and 365",
        )
    })?;

    if !(1..=365).contains(&days) {
        return Err(ConfigError::invalid_value(
            "SESSION_TTL_DAYS",
            raw,
            "must be a number between 1 and 365",
        ));
    }

    Ok(days)
}

fn parse_purge_retention(raw: &str) -> Result<i32, ConfigError> {
    let days: i32 = raw.trim().parse().map_err(|_| {
        ConfigError::invalid_value(
            "PURGE_RETENTION_DAYS",
            raw,
            "must be a number between 1 and 3650",
        )
    })?;

    if !(1..=3650).contains(&days) {
        return Err(ConfigError::invalid_value(
            "PURGE_RETENTION_DAYS",
            raw,
            "must be a number between 1 and 3650",
        ));
    }

    Ok(days)
}

fn parse_origins(raw: &str) -> Result<Vec<String>, ConfigError> {
    let mut origins = Vec::new();

    for part in raw.split(',') {
        let origin = part.trim();
        if origin.is_empty() {
            continue;
        }

        let has_scheme = origin.starts_with("http://") || origin.starts_with("https://");
        if !has_scheme {
            return Err(ConfigError::invalid_value(
                "ALLOWED_ORIGINS",
                origin,
                "every origin must start with http:// or https://",
            ));
        }

        if origin.ends_with('/') {
            return Err(ConfigError::invalid_value(
                "ALLOWED_ORIGINS",
                origin,
                "origins must not end with a slash",
            ));
        }

        origins.push(origin.to_owned());
    }

    if origins.is_empty() {
        return Err(ConfigError::invalid_value(
            "ALLOWED_ORIGINS",
            raw,
            "must contain at least one origin",
        ));
    }

    Ok(origins)
}

/// Searches the current directory and its ancestors for a `.env` file.
fn load_dotenv() -> Result<(), ConfigError> {
    let Some(path) = find_dotenv()? else {
        return Ok(());
    };

    dotenvy::from_path(&path).map_err(|err| ConfigError::Dotenv { path, source: err })?;

    Ok(())
}

fn find_dotenv() -> Result<Option<PathBuf>, ConfigError> {
    let mut dir = env::current_dir().map_err(ConfigError::Io)?;

    loop {
        let candidate = dir.join(".env");
        if candidate.is_file() {
            return Ok(Some(candidate));
        }
        if !dir.pop() {
            return Ok(None);
        }
    }
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("{key} is not set; copy .env.example to .env and fill it in")]
    Missing { key: &'static str },

    #[error("{key}: {message} (got {value:?})")]
    InvalidValue {
        key: &'static str,
        value: String,
        message: &'static str,
    },

    #[error("failed to read {path}: {source}")]
    Dotenv {
        path: PathBuf,
        #[source]
        source: dotenvy::Error,
    },

    #[error("cannot determine working directory: {0}")]
    Io(#[source] std::io::Error),
}

impl ConfigError {
    fn invalid_value(key: &'static str, value: &str, message: &'static str) -> Self {
        Self::InvalidValue {
            key,
            value: value.to_owned(),
            message,
        }
    }
}

/// Parses the per-user quota from megabytes.
fn parse_quota_mb(raw: &str) -> Result<u64, ConfigError> {
    let megabytes = raw.parse::<u64>().map_err(|_| {
        ConfigError::invalid_value("MEDIA_QUOTA_MB", raw, "must be a positive integer")
    })?;

    if megabytes == 0 {
        return Err(ConfigError::invalid_value(
            "MEDIA_QUOTA_MB",
            raw,
            "must be greater than zero",
        ));
    }

    Ok(megabytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_env_accepts_known_values() {
        assert_eq!(AppEnv::parse("dev").unwrap(), AppEnv::Dev);
        assert_eq!(AppEnv::parse("TEST").unwrap(), AppEnv::Test);
        assert_eq!(AppEnv::parse(" prod ").unwrap(), AppEnv::Prod);
    }

    #[test]
    fn app_env_rejects_unknown_value() {
        let err = AppEnv::parse("staging").unwrap_err();
        assert!(err.to_string().contains("APP_ENV"));
        assert!(err.to_string().contains("staging"));
    }

    #[test]
    fn log_format_rejects_unknown_value() {
        assert_eq!(LogFormat::parse("json").unwrap(), LogFormat::Json);
        assert!(LogFormat::parse("xml").is_err());
    }

    #[test]
    fn session_ttl_is_bounded() {
        assert_eq!(parse_session_ttl("30").unwrap(), 30);
        assert!(parse_session_ttl("0").is_err());
        assert!(parse_session_ttl("366").is_err());
        assert!(parse_session_ttl("-1").is_err());
        assert!(parse_session_ttl("thirty").is_err());
    }

    #[test]
    fn origins_are_split_and_validated() {
        let origins = parse_origins("http://localhost:3000, https://jey.net").unwrap();
        assert_eq!(
            origins,
            vec![
                "http://localhost:3000".to_owned(),
                "https://jey.net".to_owned()
            ]
        );

        assert!(parse_origins("localhost:3000").is_err());
        assert!(parse_origins("https://jey.net/").is_err());
        assert!(parse_origins(" , ").is_err());
    }

    #[test]
    fn quota_is_parsed_and_validated() {
        assert_eq!(parse_quota_mb("300").expect("valid"), 300);
        assert!(parse_quota_mb("0").is_err());
        assert!(parse_quota_mb("-5").is_err());
        assert!(parse_quota_mb("many").is_err());
    }
}
