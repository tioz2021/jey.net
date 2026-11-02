//! The single merge rule shared by the server and every client.
//!
//! Both sides must reach the same verdict for the same pair of states, so the
//! rule is pure and lives in the domain crate instead of the API or the desktop
//! store. The behaviour is described in `docs/sync.md`.

use std::cmp::Ordering;

use super::{DeviceId, Revision, Timestamp};

/// Snapshot of one record as seen by the server or by a client.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ChangeState {
    pub revision: Revision,
    pub updated_at: Timestamp,
    pub device_id: DeviceId,
    /// The record is a tombstone when this is `true`.
    pub deleted: bool,
}

impl ChangeState {
    pub const fn new(
        revision: Revision,
        updated_at: Timestamp,
        device_id: DeviceId,
        deleted: bool,
    ) -> Self {
        Self {
            revision,
            updated_at,
            device_id,
            deleted,
        }
    }
}

/// What to do when an incoming change meets the stored copy.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MergeOutcome {
    /// The very same change is already stored; nothing to do.
    Duplicate,
    /// The incoming change wins and replaces the stored one.
    TakeIncoming,
    /// The stored change wins; the incoming one is kept as a conflict copy.
    KeepStored,
}

/// Decides which of two versions of the same record survives.
///
/// Order of precedence:
///
/// 1. Identical states are a duplicate (retry of an already applied change).
/// 2. The later `updated_at` wins.
/// 3. Equal timestamps are broken by the larger `device_id`, so both sides
///    always pick the same winner.
///
/// Deletion is not special: a later tombstone beats an earlier edit, and a
/// later edit beats an earlier tombstone.
pub fn merge(stored: &ChangeState, incoming: &ChangeState) -> MergeOutcome {
    if stored == incoming {
        return MergeOutcome::Duplicate;
    }

    let incoming_wins = match incoming.updated_at.cmp(&stored.updated_at) {
        Ordering::Greater => true,
        Ordering::Less => false,
        Ordering::Equal => incoming.device_id > stored.device_id,
    };

    if incoming_wins {
        MergeOutcome::TakeIncoming
    } else {
        MergeOutcome::KeepStored
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DEVICE_A: DeviceId = DeviceId::from_uuid(uuid::Uuid::from_u128(0xaaaa));
    const DEVICE_B: DeviceId = DeviceId::from_uuid(uuid::Uuid::from_u128(0xbbbb));

    fn state(revision: u64, millis: i64, device: DeviceId, deleted: bool) -> ChangeState {
        ChangeState::new(
            Revision::from_u64(revision),
            Timestamp::from_millis(millis),
            device,
            deleted,
        )
    }

    #[test]
    fn identical_states_are_a_duplicate() {
        let stored = state(3, 1_000, DEVICE_A, false);
        assert_eq!(merge(&stored, &stored), MergeOutcome::Duplicate);
    }

    #[test]
    fn later_edit_wins() {
        let stored = state(3, 1_000, DEVICE_A, false);
        let incoming = state(4, 2_000, DEVICE_B, false);

        assert_eq!(merge(&stored, &incoming), MergeOutcome::TakeIncoming);
    }

    #[test]
    fn earlier_edit_loses() {
        let stored = state(4, 2_000, DEVICE_A, false);
        let incoming = state(3, 1_000, DEVICE_B, false);

        assert_eq!(merge(&stored, &incoming), MergeOutcome::KeepStored);
    }

    #[test]
    fn equal_timestamps_are_broken_by_device_id() {
        let stored = state(5, 1_000, DEVICE_A, false);
        let larger = state(5, 1_000, DEVICE_B, false);
        let smaller = state(5, 1_000, DEVICE_A, false);

        assert_eq!(merge(&stored, &larger), MergeOutcome::TakeIncoming);
        // DEVICE_A is smaller, so the stored copy stays.
        assert_eq!(merge(&larger, &smaller), MergeOutcome::KeepStored);
    }

    #[test]
    fn two_devices_offline_produce_a_resolvable_conflict() {
        // Both started from revision 4 at the same moment and edited offline.
        let from_first = state(5, 1_500, DEVICE_A, false);
        let from_second = state(5, 2_500, DEVICE_B, false);

        // Whatever order they arrive in, the later edit wins on both sides.
        assert_eq!(merge(&from_first, &from_second), MergeOutcome::TakeIncoming);
        assert_eq!(merge(&from_second, &from_first), MergeOutcome::KeepStored);
    }

    #[test]
    fn later_deletion_wins_over_earlier_edit() {
        let edited = state(5, 1_000, DEVICE_A, false);
        let deleted = state(6, 2_000, DEVICE_B, true);

        assert_eq!(merge(&edited, &deleted), MergeOutcome::TakeIncoming);
    }

    #[test]
    fn later_edit_wins_over_earlier_deletion() {
        let deleted = state(5, 1_000, DEVICE_A, true);
        let edited = state(6, 2_000, DEVICE_B, false);

        assert_eq!(merge(&deleted, &edited), MergeOutcome::TakeIncoming);
    }

    #[test]
    fn revision_does_not_override_time() {
        // A higher revision number that is older must still lose.
        let stored = state(7, 5_000, DEVICE_A, false);
        let incoming = state(8, 4_000, DEVICE_B, false);

        assert_eq!(merge(&stored, &incoming), MergeOutcome::KeepStored);
    }

    #[test]
    fn same_revision_and_time_but_different_device_is_ordered() {
        let first = state(5, 1_000, DEVICE_A, false);
        let second = state(5, 1_000, DEVICE_B, false);

        assert_eq!(merge(&first, &second), MergeOutcome::TakeIncoming);
        assert_eq!(merge(&second, &first), MergeOutcome::KeepStored);
    }
}
