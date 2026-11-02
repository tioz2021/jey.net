//! Password storage: argon2id hashing and verification.
//!
//! Parameters are tuned by measurement (see the `cost_is_reasonable` test):
//! hashing must be slow enough to make guessing expensive and fast enough to
//! keep logins responsive on a small VPS.

use argon2::password_hash::{PasswordHasher, PasswordVerifier, phc::PasswordHash};
use argon2::{Algorithm, Argon2, Params, Version};

/// Shortest password we accept, in characters.
pub const MIN_PASSWORD_LENGTH: usize = 10;
/// Longest password we accept, in characters.
pub const MAX_PASSWORD_LENGTH: usize = 128;

/// Memory cost in KiB (64 MiB).
const MEMORY_COST: u32 = 64 * 1024;
/// Number of passes over the memory.
const TIME_COST: u32 = 3;
/// Parallelism lanes.
const PARALLELISM: u32 = 1;

#[derive(Debug, thiserror::Error)]
pub enum PasswordError {
    #[error("password must be between {MIN_PASSWORD_LENGTH} and {MAX_PASSWORD_LENGTH} characters")]
    InvalidLength,

    #[error("failed to hash password")]
    Hash,

    #[error("stored password hash is malformed")]
    MalformedHash,
}

fn hasher() -> Argon2<'static> {
    let params = Params::new(MEMORY_COST, TIME_COST, PARALLELISM, None)
        .expect("argon2 parameters are valid constants");
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
}

/// Hashes a password into a PHC string, ready to be stored in the database.
pub fn hash_password(password: &str) -> Result<String, PasswordError> {
    let length = password.chars().count();
    if !(MIN_PASSWORD_LENGTH..=MAX_PASSWORD_LENGTH).contains(&length) {
        return Err(PasswordError::InvalidLength);
    }

    hasher()
        .hash_password(password.as_bytes())
        .map(|hash| hash.to_string())
        .map_err(|_| PasswordError::Hash)
}

/// Checks a password against a stored PHC hash.
///
/// Returns `Ok(false)` for a wrong password and an error only when the stored
/// value cannot be parsed at all.
pub fn verify_password(password: &str, stored_hash: &str) -> Result<bool, PasswordError> {
    let parsed = PasswordHash::new(stored_hash).map_err(|_| PasswordError::MalformedHash)?;

    match hasher().verify_password(password.as_bytes(), &parsed) {
        Ok(()) => Ok(true),
        Err(argon2::password_hash::Error::PasswordInvalid) => Ok(false),
        Err(_) => Err(PasswordError::MalformedHash),
    }
}

#[cfg(test)]
mod tests {
    use std::time::Instant;

    use super::*;

    const PASSWORD: &str = "correct horse battery staple";

    #[test]
    fn roundtrip_succeeds() {
        let hash = hash_password(PASSWORD).expect("hashing works");
        assert!(verify_password(PASSWORD, &hash).expect("verification works"));
    }

    #[test]
    fn wrong_password_does_not_verify() {
        let hash = hash_password(PASSWORD).expect("hashing works");

        assert!(!verify_password("wrong horse battery staple", &hash).expect("verification works"));
    }

    #[test]
    fn hashes_are_salted() {
        let first = hash_password(PASSWORD).expect("hashing works");
        let second = hash_password(PASSWORD).expect("hashing works");

        assert_ne!(first, second, "salt must make hashes unique");
        assert!(verify_password(PASSWORD, &first).expect("verification works"));
        assert!(verify_password(PASSWORD, &second).expect("verification works"));
    }

    #[test]
    fn hash_is_a_phc_string() {
        let hash = hash_password(PASSWORD).expect("hashing works");

        assert!(hash.starts_with("$argon2id$"), "unexpected hash: {hash}");
    }

    #[test]
    fn length_is_enforced() {
        assert!(matches!(
            hash_password("short"),
            Err(PasswordError::InvalidLength)
        ));
        assert!(matches!(
            hash_password(&"a".repeat(MAX_PASSWORD_LENGTH + 1)),
            Err(PasswordError::InvalidLength)
        ));
        assert!(hash_password(&"a".repeat(MAX_PASSWORD_LENGTH)).is_ok());
    }

    #[test]
    fn malformed_hash_is_reported() {
        assert!(matches!(
            verify_password(PASSWORD, "not-a-phc-string"),
            Err(PasswordError::MalformedHash)
        ));
    }

    #[test]
    fn cost_is_reasonable() {
        let started = Instant::now();
        let hash = hash_password(PASSWORD).expect("hashing works");
        let elapsed = started.elapsed();

        println!("argon2id hashing took {elapsed:?}");
        assert!(verify_password(PASSWORD, &hash).expect("verification works"));

        // Debug builds are roughly twenty times slower, so the bounds are only
        // meaningful for the optimised build used in production.
        if !cfg!(debug_assertions) {
            assert!(
                elapsed.as_millis() >= 40,
                "hashing is too cheap: {elapsed:?}"
            );
            assert!(
                elapsed.as_millis() <= 400,
                "hashing is too expensive: {elapsed:?}"
            );
        }
    }
}
