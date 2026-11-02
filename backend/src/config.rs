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
    /// Required once the database layer lands; `None` keeps the server bootable.
    pub database_url: Option<String>,
    pub session_ttl_days: u32,
    pub allowed_origins: Vec<String>,
    pub log_format: LogFormat,
}

impl Config {
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

        let allowed_origins = match var("ALLOWED_ORIGINS") {
            Some(raw) => parse_origins(&raw)?,
            None => vec![DEFAULT_ORIGIN.to_owned()],
        };

        let log_format = match var("LOG_FORMAT") {
            Some(raw) => LogFormat::parse(&raw)?,
            None => match app_env {
                AppEnv::Prod => LogFormat::Json,
                AppEnv::Dev | AppEnv::Test => LogFormat::Pretty,
            },
        };

        Ok(Self {
            app_env,
            bind_addr,
            database_url: var("DATABASE_URL"),
            session_ttl_days,
            allowed_origins,
            log_format,
        })
    }
}

const DEFAULT_BIND_ADDR: &str = "127.0.0.1:8080";
const DEFAULT_SESSION_TTL_DAYS: u32 = 30;
const DEFAULT_ORIGIN: &str = "http://localhost:3000";

fn var(key: &'static str) -> Option<String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
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
}
