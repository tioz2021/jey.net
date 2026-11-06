//! Session token storage for the desktop client.
//!
//! This is a file with 0600 permissions, not a secret vault. T120 keeps the
//! raw token only after a successful online login; a future task can move it
//! to the OS keyring without changing the rest of the client.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const FILE_NAME: &str = "session.json";

#[derive(Debug, Clone)]
pub struct SessionStore {
    path: PathBuf,
}

impl SessionStore {
    pub fn new(data_dir: impl AsRef<Path>) -> Self {
        Self {
            path: data_dir.as_ref().join(FILE_NAME),
        }
    }

    pub fn save(&self, token: &str) -> Result<(), io::Error> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let temp = self.path.with_extension("json.tmp");
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
            file.write_all(token.as_bytes())?;
            file.sync_all()?;
        }
        #[cfg(not(unix))]
        fs::write(&temp, token.as_bytes())?;
        if self.path.exists() {
            fs::remove_file(&self.path)?;
        }
        fs::rename(temp, &self.path)
    }

    pub fn load(&self) -> Result<Option<String>, io::Error> {
        match fs::read_to_string(&self.path) {
            Ok(token) if !token.trim().is_empty() => Ok(Some(token)),
            Ok(_) => Ok(None),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error),
        }
    }

    pub fn clear(&self) -> Result<(), io::Error> {
        match fs::remove_file(&self.path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error),
        }
    }
}
