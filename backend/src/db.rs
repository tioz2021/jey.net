//! Database pool creation and health checks.

use std::time::Duration;

use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;

use crate::config::Config;

const MAX_CONNECTIONS: u32 = 10;
const ACQUIRE_TIMEOUT: Duration = Duration::from_secs(5);

/// Builds the connection pool without opening a connection yet.
///
/// An unreachable database must not stop the process from starting: the
/// readiness endpoint reports the problem instead, and the pool reconnects on
/// demand once the database is back.
pub fn create_pool(config: &Config) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(MAX_CONNECTIONS)
        .acquire_timeout(ACQUIRE_TIMEOUT)
        .connect_lazy(&config.database_url)
}

/// Cheap round-trip used both at startup and by the readiness endpoint.
pub async fn ping(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(pool)
        .await?;

    Ok(())
}
