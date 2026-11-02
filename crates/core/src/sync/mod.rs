//! Synchronisation primitives shared by the server and every client.
//!
//! The protocol itself is described in `docs/sync.md`; this module provides the
//! value types it talks about and the pure merge rule both sides must agree on.

pub mod merge;

use std::fmt;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub use merge::{ChangeState, MergeOutcome, merge};

/// How many times a record has been edited. Only grows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Revision(u64);

impl Revision {
    /// Revision of a freshly created record.
    pub const INITIAL: Self = Self(1);

    pub const fn from_u64(value: u64) -> Self {
        Self(value)
    }

    pub const fn get(self) -> u64 {
        self.0
    }

    /// The next edit of this record.
    pub const fn next(self) -> Self {
        Self(self.0 + 1)
    }
}

impl Default for Revision {
    fn default() -> Self {
        Self::INITIAL
    }
}

impl From<u64> for Revision {
    fn from(value: u64) -> Self {
        Self(value)
    }
}

impl fmt::Display for Revision {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Position of a change in the per-user sequence assigned by the server.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct SyncSeq(u64);

impl SyncSeq {
    /// Nothing has been synchronised yet.
    pub const ZERO: Self = Self(0);

    pub const fn from_u64(value: u64) -> Self {
        Self(value)
    }

    pub const fn get(self) -> u64 {
        self.0
    }

    pub const fn next(self) -> Self {
        Self(self.0 + 1)
    }
}

impl Default for SyncSeq {
    fn default() -> Self {
        Self::ZERO
    }
}

impl From<u64> for SyncSeq {
    fn from(value: u64) -> Self {
        Self(value)
    }
}

impl fmt::Display for SyncSeq {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Identifies the installation that produced a change.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct DeviceId(Uuid);

impl DeviceId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub const fn from_uuid(value: Uuid) -> Self {
        Self(value)
    }

    pub const fn as_uuid(self) -> Uuid {
        self.0
    }
}

impl Default for DeviceId {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Display for DeviceId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Point in time as milliseconds since the Unix epoch, UTC.
///
/// Integers keep the value identical in PostgreSQL (`timestamptz`), SQLite
/// (`INTEGER`) and on the wire, without timezone surprises.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Timestamp(i64);

impl Timestamp {
    pub const EPOCH: Self = Self(0);

    pub const fn from_millis(millis: i64) -> Self {
        Self(millis)
    }

    pub const fn as_millis(self) -> i64 {
        self.0
    }

    /// Current time; falls back to the epoch if the clock is before 1970.
    pub fn now() -> Self {
        match SystemTime::now().duration_since(UNIX_EPOCH) {
            Ok(elapsed) => Self(elapsed.as_millis() as i64),
            Err(_) => Self::EPOCH,
        }
    }
}

impl From<SystemTime> for Timestamp {
    fn from(value: SystemTime) -> Self {
        match value.duration_since(UNIX_EPOCH) {
            Ok(elapsed) => Self(elapsed.as_millis() as i64),
            Err(_) => Self::EPOCH,
        }
    }
}

impl fmt::Display for Timestamp {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn revision_only_grows() {
        let revision = Revision::INITIAL;
        assert_eq!(revision.get(), 1);
        assert_eq!(revision.next().get(), 2);
        assert!(revision.next() > revision);
    }

    #[test]
    fn sync_seq_starts_at_zero() {
        assert_eq!(SyncSeq::default(), SyncSeq::ZERO);
        assert_eq!(SyncSeq::ZERO.next(), SyncSeq::from_u64(1));
    }

    #[test]
    fn device_ids_are_unique_and_ordered() {
        let first = DeviceId::new();
        let second = DeviceId::new();

        assert_ne!(first, second);
        assert_eq!(first.to_string(), first.as_uuid().to_string());
    }

    #[test]
    fn timestamps_compare_chronologically() {
        let earlier = Timestamp::from_millis(1_000);
        let later = Timestamp::from_millis(2_000);

        assert!(earlier < later);
        assert_eq!(later.as_millis(), 2_000);
    }

    #[test]
    fn now_is_after_the_epoch() {
        assert!(Timestamp::now() > Timestamp::EPOCH);
    }
}
