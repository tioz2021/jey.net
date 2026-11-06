//! `ItemRepository` adapter over the existing PostgreSQL item repository.
//!
//! The server's free functions remain the implementation; this adapter exists
//! so the shared contract test can exercise the exact same semantics as SQLite.

use sqlx::PgPool;
use uuid::Uuid;

use jey_core::DomainError;
use jey_core::items::{Item, ItemPatch, NewItem};
use jey_core::repositories::ItemRepository;
use jey_core::sync::DeviceId;

use crate::items::repo;

pub struct PgItems {
    pool: PgPool,
}

impl PgItems {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

fn domain(error: crate::error::AppError) -> DomainError {
    error.into_domain()
}

impl ItemRepository for PgItems {
    async fn create_item(
        &self,
        user_id: Uuid,
        device_id: Option<DeviceId>,
        new: &NewItem,
    ) -> Result<Item, DomainError> {
        repo::create(&self.pool, user_id, device_id, new)
            .await
            .map_err(domain)
    }

    async fn get_item(&self, user_id: Uuid, id: Uuid) -> Result<Option<Item>, DomainError> {
        repo::get(&self.pool, user_id, id).await.map_err(domain)
    }

    async fn update_item(
        &self,
        user_id: Uuid,
        id: Uuid,
        patch: &ItemPatch,
    ) -> Result<Option<Item>, DomainError> {
        repo::update(&self.pool, user_id, id, patch)
            .await
            .map_err(domain)
    }

    async fn delete_item(&self, user_id: Uuid, id: Uuid) -> Result<bool, DomainError> {
        repo::soft_delete(&self.pool, user_id, id)
            .await
            .map_err(domain)
    }

    async fn list_items(&self, user_id: Uuid) -> Result<Vec<Item>, DomainError> {
        repo::list(&self.pool, user_id, None, None, 1000)
            .await
            .map_err(domain)
    }
}
