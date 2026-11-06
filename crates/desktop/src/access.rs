//! Local access grant.
//!
//! The grant answers one question only: may this installation open its local
//! library without asking the server? It is deliberately independent of the
//! server session and has no expiry. A server session can be revoked while the
//! local archive stays available; sync simply stops until the next login.
//!
//! The grant is written after a successful online login (T93 wires it to auth).
//! It is not a password and not encryption; local protection is the OS account.

use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

const FILE_NAME: &str = "access.json";
const VERSION: u8 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocalAccess {
    pub version: u8,
    pub user_id: Uuid,
    pub server_url: String,
    pub granted_at: i64,
    pub last_verified_at: i64,
}

#[derive(Debug)]
pub enum AccessError {
    Io(io::Error),
    Invalid(String),
}

impl fmt::Display for AccessError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "local access I/O error: {error}"),
            Self::Invalid(message) => write!(formatter, "invalid local access: {message}"),
        }
    }
}

impl std::error::Error for AccessError {}

impl From<io::Error> for AccessError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

/// File-backed grant stored in the application data directory.
#[derive(Debug, Clone)]
pub struct AccessStore {
    path: PathBuf,
}

impl AccessStore {
    pub fn new(data_dir: impl AsRef<Path>) -> Self {
        Self {
            path: data_dir.as_ref().join(FILE_NAME),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Reads the grant. A missing file means "not signed in yet".
    pub fn load(&self) -> Result<Option<LocalAccess>, AccessError> {
        let raw = match fs::read_to_string(&self.path) {
            Ok(raw) => raw,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(AccessError::Io(error)),
        };
        let grant: LocalAccess =
            serde_json::from_str(&raw).map_err(|error| AccessError::Invalid(error.to_string()))?;
        if grant.version != VERSION {
            return Err(AccessError::Invalid(format!(
                "unsupported version {}",
                grant.version
            )));
        }
        if grant.user_id.is_nil() || grant.server_url.trim().is_empty() {
            return Err(AccessError::Invalid("missing user or server".to_owned()));
        }
        Ok(Some(grant))
    }

    /// Returns true without touching the network or the server session.
    pub fn can_open(&self) -> bool {
        matches!(self.load(), Ok(Some(_)))
    }

    /// Called exactly once after a successful online login.
    pub fn grant(&self, user_id: Uuid, server_url: &str) -> Result<LocalAccess, AccessError> {
        let server_url = server_url.trim().trim_end_matches('/');
        if user_id.is_nil() || server_url.is_empty() {
            return Err(AccessError::Invalid("missing user or server".to_owned()));
        }
        let now = now_millis();
        let grant = LocalAccess {
            version: VERSION,
            user_id,
            server_url: server_url.to_owned(),
            granted_at: now,
            last_verified_at: now,
        };
        self.write(&grant)?;
        Ok(grant)
    }

    /// Records a successful online check. An expired server session does not
    /// remove the grant; explicit revocation does.
    pub fn mark_verified(&self) -> Result<Option<LocalAccess>, AccessError> {
        let Some(mut grant) = self.load()? else {
            return Ok(None);
        };
        grant.last_verified_at = now_millis();
        self.write(&grant)?;
        Ok(Some(grant))
    }

    /// Explicit "forget this device"; not called on session expiry.
    pub fn revoke(&self) -> Result<(), AccessError> {
        match fs::remove_file(&self.path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(AccessError::Io(error)),
        }
    }

    fn write(&self, grant: &LocalAccess) -> Result<(), AccessError> {
        let parent = self
            .path
            .parent()
            .ok_or_else(|| AccessError::Invalid("access path has no parent".to_owned()))?;
        fs::create_dir_all(parent)?;
        let temp = self.path.with_extension("json.tmp");
        let raw = serde_json::to_string_pretty(grant)
            .map_err(|error| AccessError::Invalid(error.to_string()))?;

        #[cfg(unix)]
        {
            use std::io::Write;
            use std::os::unix::fs::OpenOptionsExt;
            let mut file = fs::OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .mode(0o600)
                .open(&temp)?;
            file.write_all(raw.as_bytes())?;
            file.sync_all()?;
        }
        #[cfg(not(unix))]
        {
            fs::write(&temp, raw.as_bytes())?;
        }

        if self.path.exists() {
            fs::remove_file(&self.path)?;
        }
        fs::rename(&temp, &self.path)?;
        Ok(())
    }
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        std::env::temp_dir().join(format!("jey-access-{}", Uuid::new_v4()))
    }

    #[test]
    fn grant_survives_restart_and_needs_no_server() {
        let dir = temp_dir();
        let store = AccessStore::new(&dir);
        assert!(!store.can_open());

        let user = Uuid::new_v4();
        let grant = store.grant(user, "https://j3ynet.site/").unwrap();
        assert_eq!(grant.server_url, "https://j3ynet.site");
        assert!(store.can_open());

        // A fresh instance sees the same grant, as if the server were gone.
        let restarted = AccessStore::new(&dir);
        let loaded = restarted.load().unwrap().expect("grant persisted");
        assert_eq!(loaded.user_id, user);
        assert!(restarted.can_open());

        restarted.revoke().unwrap();
        assert!(!AccessStore::new(&dir).can_open());
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn verification_does_not_extend_access_or_require_network() {
        let dir = temp_dir();
        let store = AccessStore::new(&dir);
        let user = Uuid::new_v4();
        let first = store.grant(user, "http://localhost:8080").unwrap();
        let updated = store.mark_verified().unwrap().expect("grant exists");
        assert_eq!(updated.user_id, user);
        assert_eq!(updated.granted_at, first.granted_at);
        assert!(updated.last_verified_at >= first.last_verified_at);
        assert!(store.can_open());
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rejects_invalid_grants() {
        let dir = temp_dir();
        let store = AccessStore::new(&dir);
        assert!(store.grant(Uuid::nil(), "https://j3ynet.site").is_err());
        assert!(store.grant(Uuid::new_v4(), " ").is_err());
        fs::remove_dir_all(dir).ok();
    }
}
