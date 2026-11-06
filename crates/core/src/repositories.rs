//! Storage contracts shared by the server and the desktop client.
//!
//! The trait is deliberately narrow: item CRUD plus listing. It is not an
//! attempt to hide every SQL difference; it is the behaviour both stores must
//! agree on. The contract test lives in `jey-repo-contract`.

use uuid::Uuid;

use crate::DomainError;
use crate::items::{Item, ItemPatch, NewItem};
use crate::sync::DeviceId;

/// Item operations every store must provide.
#[allow(async_fn_in_trait)]
pub trait ItemRepository {
    async fn create_item(
        &self,
        user_id: Uuid,
        device_id: Option<DeviceId>,
        new: &NewItem,
    ) -> Result<Item, DomainError>;

    async fn get_item(&self, user_id: Uuid, id: Uuid) -> Result<Option<Item>, DomainError>;

    async fn update_item(
        &self,
        user_id: Uuid,
        id: Uuid,
        patch: &ItemPatch,
    ) -> Result<Option<Item>, DomainError>;

    async fn delete_item(&self, user_id: Uuid, id: Uuid) -> Result<bool, DomainError>;

    async fn list_items(&self, user_id: Uuid) -> Result<Vec<Item>, DomainError>;
}
