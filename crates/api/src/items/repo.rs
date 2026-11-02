//! PostgreSQL implementation of the item repository.
//!
//! Every query is scoped by `user_id`; a record belonging to someone else is
//! indistinguishable from a missing one.

use chrono::{DateTime, Utc};
use jey_core::items::{Item, ItemKind, ItemPatch, ItemStatus, NewItem};
use jey_core::sync::{DeviceId, Revision, SyncSeq, Timestamp};
use sqlx::{AssertSqlSafe, PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::error::AppError;

const SELECT_BY_ID: &str = r#"
    select
        i.id, i.user_id, i.kind, i.title, i.subtitle, i.year, i.status, i.rating,
        i.review, i.source_url, i.cover_key, i.revision, i.sync_seq, i.device_id,
        i.created_at, i.updated_at, i.deleted_at,
        coalesce(
            array_agg(t.name order by lower(t.name)) filter (where t.id is not null),
            '{}'
        ) as tags
    from items i
    left join item_tags it on it.item_id = i.id
    left join tags t on t.id = it.tag_id
    where i.id = $1 and i.user_id = $2 and i.deleted_at is null
    group by i.id
"#;

const SELECT_ALL: &str = r#"
    select
        i.id, i.user_id, i.kind, i.title, i.subtitle, i.year, i.status, i.rating,
        i.review, i.source_url, i.cover_key, i.revision, i.sync_seq, i.device_id,
        i.created_at, i.updated_at, i.deleted_at,
        coalesce(
            array_agg(t.name order by lower(t.name)) filter (where t.id is not null),
            '{}'
        ) as tags
    from items i
    left join item_tags it on it.item_id = i.id
    left join tags t on t.id = it.tag_id
    where i.user_id = $1
    group by i.id
    order by i.created_at asc, i.id asc
"#;

const SELECT_LIST: &str = r#"
    select
        i.id, i.user_id, i.kind, i.title, i.subtitle, i.year, i.status, i.rating,
        i.review, i.source_url, i.cover_key, i.revision, i.sync_seq, i.device_id,
        i.created_at, i.updated_at, i.deleted_at,
        coalesce(
            array_agg(t.name order by lower(t.name)) filter (where t.id is not null),
            '{}'
        ) as tags
    from items i
    left join item_tags it on it.item_id = i.id
    left join tags t on t.id = it.tag_id
    where i.user_id = $1
      and i.deleted_at is null
      and ($2::text is null or i.kind = $2)
      and ($3::text is null or i.status = $3)
    group by i.id
    order by i.created_at desc, i.id desc
    limit $4
"#;

#[derive(Debug, sqlx::FromRow)]
pub struct ItemRow {
    id: Uuid,
    user_id: Uuid,
    kind: String,
    title: String,
    subtitle: Option<String>,
    year: Option<i32>,
    status: String,
    rating: Option<i16>,
    review: Option<String>,
    source_url: Option<String>,
    cover_key: Option<String>,
    revision: i64,
    sync_seq: i64,
    device_id: Option<Uuid>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    deleted_at: Option<DateTime<Utc>>,
    tags: Vec<String>,
}

impl TryFrom<ItemRow> for Item {
    type Error = AppError;

    fn try_from(row: ItemRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.id,
            user_id: row.user_id,
            kind: ItemKind::parse(&row.kind)?,
            title: row.title,
            subtitle: row.subtitle,
            year: row.year,
            status: ItemStatus::parse(&row.status)?,
            rating: row.rating.map(|value| value as u8),
            review: row.review,
            source_url: row.source_url,
            cover_key: row.cover_key,
            tags: row.tags,
            revision: Revision::from_u64(row.revision as u64),
            sync_seq: SyncSeq::from_u64(row.sync_seq as u64),
            device_id: row.device_id.map(DeviceId::from_uuid),
            created_at: timestamp(row.created_at),
            updated_at: timestamp(row.updated_at),
            deleted_at: row.deleted_at.map(timestamp),
        })
    }
}

fn timestamp(value: DateTime<Utc>) -> Timestamp {
    Timestamp::from_millis(value.timestamp_millis())
}

/// Creates a record and links its tags.
pub async fn create(
    pool: &PgPool,
    user_id: Uuid,
    device_id: Option<DeviceId>,
    new: &NewItem,
) -> Result<Item, AppError> {
    let id = Uuid::new_v4();
    let mut transaction = pool.begin().await.map_err(AppError::internal)?;

    sqlx::query(
        "insert into items
             (id, user_id, kind, title, subtitle, year, status, rating, review,
              source_url, device_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
    )
    .bind(id)
    .bind(user_id)
    .bind(new.kind.as_str())
    .bind(&new.title)
    .bind(&new.subtitle)
    .bind(new.year)
    .bind(new.status.as_str())
    .bind(new.rating.map(i16::from))
    .bind(&new.review)
    .bind(&new.source_url)
    .bind(device_id.map(DeviceId::as_uuid))
    .execute(&mut *transaction)
    .await
    .map_err(AppError::internal)?;

    link_tags(&mut transaction, user_id, id, &new.tags).await?;

    transaction.commit().await.map_err(AppError::internal)?;

    get(pool, user_id, id)
        .await?
        .ok_or_else(|| AppError::internal("created item is not readable"))
}

/// Reads one live record.
pub async fn get(pool: &PgPool, user_id: Uuid, id: Uuid) -> Result<Option<Item>, AppError> {
    let row = sqlx::query_as::<_, ItemRow>(SELECT_BY_ID)
        .bind(id)
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .map_err(AppError::internal)?;

    row.map(Item::try_from).transpose()
}

/// Lists live records, newest first, with optional filters.
pub async fn list(
    pool: &PgPool,
    user_id: Uuid,
    kind: Option<ItemKind>,
    status: Option<ItemStatus>,
    limit: i64,
) -> Result<Vec<Item>, AppError> {
    let kind = kind.map(ItemKind::as_str);
    let status = status.map(ItemStatus::as_str);

    let rows = sqlx::query_as::<_, ItemRow>(SELECT_LIST)
        .bind(user_id)
        .bind(kind)
        .bind(status)
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(AppError::internal)?;

    rows.into_iter().map(Item::try_from).collect()
}

/// Everything a page request needs.
pub struct ListPage {
    pub user_id: Uuid,
    pub filters: crate::items::filters::Filters,
    pub sort: crate::items::list::Sort,
    pub limit: i64,
    pub cursor: Option<(String, Uuid)>,
    pub include_deleted: bool,
}

/// Lists one page of records, strictly after the cursor when given.
pub async fn list_page(pool: &PgPool, page: ListPage) -> Result<Vec<Item>, AppError> {
    use crate::items::list::Sort;

    let ListPage {
        user_id,
        filters,
        sort,
        limit,
        cursor,
        include_deleted,
    } = page;

    let (cursor_predicate, order) = match sort {
        Sort::CreatedDesc => (
            "($4::text is null or (i.created_at, i.id) < (to_timestamp(($4)::bigint / 1000.0), $5::uuid))",
            "i.created_at desc, i.id desc",
        ),
        Sort::CreatedAsc => (
            "($4::text is null or (i.created_at, i.id) > (to_timestamp(($4)::bigint / 1000.0), $5::uuid))",
            "i.created_at asc, i.id asc",
        ),
        Sort::UpdatedDesc => (
            "($4::text is null or (i.updated_at, i.id) < (to_timestamp(($4)::bigint / 1000.0), $5::uuid))",
            "i.updated_at desc, i.id desc",
        ),
        Sort::RatingDesc => (
            "($4::text is null or (coalesce(i.rating, 0), i.id) < (($4)::int, $5::uuid))",
            "coalesce(i.rating, 0) desc, i.id desc",
        ),
        Sort::YearDesc => (
            "($4::text is null or (coalesce(i.year, 0), i.id) < (($4)::int, $5::uuid))",
            "coalesce(i.year, 0) desc, i.id desc",
        ),
        Sort::TitleAsc => (
            "($4::text is null or (lower(i.title), i.id) > (lower($4), $5::uuid))",
            "lower(i.title) asc, i.id asc",
        ),
    };

    // Two phases: the inner query picks the page using indexes and stops at
    // `limit`, the outer query joins tags only for those few rows. Doing it in
    // one pass forces PostgreSQL to aggregate tags for every candidate row.
    // Only static fragments are interpolated: the cursor travels as parameters.
    let sql = format!(
        "with page as (
             select i.id
             from items i
             where i.user_id = $1
               and ($7::boolean or i.deleted_at is null)
               and ($2::text is null or i.kind = $2)
               and ($3::text is null or i.status = $3)
               and ($8::text is null or exists (
                   select 1
                   from item_tags it2
                   join tags t2 on t2.id = it2.tag_id
                   where it2.item_id = i.id
                     and t2.user_id = $1
                     and lower(t2.name) = lower($8)
               ))
               and ($9::int is null or i.year >= $9)
               and ($10::int is null or i.year <= $10)
               and ($11::int is null or i.rating >= $11)
               and ($12::int is null or i.rating <= $12)
               and {cursor_predicate}
             order by {order}
             limit $6
         )
         select
             i.id, i.user_id, i.kind, i.title, i.subtitle, i.year, i.status, i.rating,
             i.review, i.source_url, i.cover_key, i.revision, i.sync_seq, i.device_id,
             i.created_at, i.updated_at, i.deleted_at,
             coalesce(
                 array_agg(t.name order by lower(t.name)) filter (where t.id is not null),
                 '{{}}'
             ) as tags
         from items i
         join page p on p.id = i.id
         left join item_tags it on it.item_id = i.id
         left join tags t on t.id = it.tag_id
         group by i.id
         order by {order}"
    );

    let (cursor_value, cursor_id) = match cursor {
        Some((value, id)) => (Some(value), Some(id)),
        None => (None, None),
    };

    let rows = sqlx::query_as::<_, ItemRow>(AssertSqlSafe(sql))
        .bind(user_id)
        .bind(filters.kind.map(ItemKind::as_str))
        .bind(filters.status.map(ItemStatus::as_str))
        .bind(cursor_value)
        .bind(cursor_id)
        .bind(limit)
        .bind(include_deleted)
        .bind(filters.tag)
        .bind(filters.year_from)
        .bind(filters.year_to)
        .bind(filters.rating_min.map(i32::from))
        .bind(filters.rating_max.map(i32::from))
        .fetch_all(pool)
        .await
        .map_err(AppError::internal)?;

    rows.into_iter().map(Item::try_from).collect()
}

/// Applies a partial update and bumps the revision.
pub async fn update(
    pool: &PgPool,
    user_id: Uuid,
    id: Uuid,
    patch: &ItemPatch,
) -> Result<Option<Item>, AppError> {
    let mut transaction = pool.begin().await.map_err(AppError::internal)?;

    let updated = sqlx::query(
        "update items set
             kind = coalesce($3, kind),
             title = coalesce($4, title),
             subtitle = coalesce($5, subtitle),
             year = coalesce($6, year),
             status = coalesce($7, status),
             rating = coalesce($8, rating),
             review = coalesce($9, review),
             source_url = coalesce($10, source_url),
             revision = revision + 1
         where id = $1 and user_id = $2 and deleted_at is null
         returning id",
    )
    .bind(id)
    .bind(user_id)
    .bind(patch.kind.map(ItemKind::as_str))
    .bind(&patch.title)
    .bind(&patch.subtitle)
    .bind(patch.year)
    .bind(patch.status.map(ItemStatus::as_str))
    .bind(patch.rating.map(i16::from))
    .bind(&patch.review)
    .bind(&patch.source_url)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(AppError::internal)?;

    if updated.is_none() {
        transaction.rollback().await.ok();
        return Ok(None);
    }

    if let Some(tags) = &patch.tags {
        sqlx::query("delete from item_tags where item_id = $1")
            .bind(id)
            .execute(&mut *transaction)
            .await
            .map_err(AppError::internal)?;

        link_tags(&mut transaction, user_id, id, tags).await?;
    }

    transaction.commit().await.map_err(AppError::internal)?;

    get(pool, user_id, id).await
}

/// Moves a record to the bin. Returns `false` when there was nothing to move.
pub async fn soft_delete(pool: &PgPool, user_id: Uuid, id: Uuid) -> Result<bool, AppError> {
    let result = sqlx::query(
        "update items set deleted_at = now(), revision = revision + 1
         where id = $1 and user_id = $2 and deleted_at is null",
    )
    .bind(id)
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(AppError::internal)?;

    Ok(result.rows_affected() > 0)
}

/// Brings a record back from the bin.
pub async fn restore(pool: &PgPool, user_id: Uuid, id: Uuid) -> Result<bool, AppError> {
    let result = sqlx::query(
        "update items set deleted_at = null, revision = revision + 1
         where id = $1 and user_id = $2 and deleted_at is not null",
    )
    .bind(id)
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(AppError::internal)?;

    Ok(result.rows_affected() > 0)
}

/// All records of a user, including the bin, for export.
pub async fn export_all(pool: &PgPool, user_id: Uuid) -> Result<Vec<Item>, AppError> {
    let rows = sqlx::query_as::<_, ItemRow>(SELECT_ALL)
        .bind(user_id)
        .fetch_all(pool)
        .await
        .map_err(AppError::internal)?;

    rows.into_iter().map(Item::try_from).collect()
}

/// Inserts imported records, skipping ones this account already has.
///
/// An id that belongs to another account cannot be kept (ids are global), so a
/// fresh one is generated; repeated imports are then caught by comparing the
/// record's content. Runs in one transaction: all of the file or none of it.
pub async fn import_items(
    pool: &PgPool,
    user_id: Uuid,
    records: &[(Uuid, DateTime<Utc>, NewItem)],
) -> Result<usize, AppError> {
    let mut transaction = pool.begin().await.map_err(AppError::internal)?;
    let mut created = 0;

    for (id, created_at, item) in records {
        // Already imported into this account under the same id.
        let already_ours = sqlx::query_scalar::<_, bool>(
            "select exists(select 1 from items where id = $1 and user_id = $2)",
        )
        .bind(id)
        .bind(user_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(AppError::internal)?;

        if already_ours {
            continue;
        }

        // Same content, imported before under a different id.
        let duplicate = sqlx::query_scalar::<_, bool>(
            "select exists(
                 select 1 from items
                 where user_id = $1 and kind = $2 and title = $3 and created_at = $4
             )",
        )
        .bind(user_id)
        .bind(item.kind.as_str())
        .bind(&item.title)
        .bind(created_at)
        .fetch_one(&mut *transaction)
        .await
        .map_err(AppError::internal)?;

        if duplicate {
            continue;
        }

        let id_taken =
            sqlx::query_scalar::<_, bool>("select exists(select 1 from items where id = $1)")
                .bind(id)
                .fetch_one(&mut *transaction)
                .await
                .map_err(AppError::internal)?;

        let new_id = if id_taken { Uuid::new_v4() } else { *id };

        sqlx::query(
            "insert into items
                 (id, user_id, kind, title, subtitle, year, status, rating, review,
                  source_url, created_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        )
        .bind(new_id)
        .bind(user_id)
        .bind(item.kind.as_str())
        .bind(&item.title)
        .bind(&item.subtitle)
        .bind(item.year)
        .bind(item.status.as_str())
        .bind(item.rating.map(i16::from))
        .bind(&item.review)
        .bind(&item.source_url)
        .bind(created_at)
        .execute(&mut *transaction)
        .await
        .map_err(AppError::internal)?;

        link_tags(&mut transaction, user_id, new_id, &item.tags).await?;
        created += 1;
    }

    transaction.commit().await.map_err(AppError::internal)?;

    Ok(created)
}

/// Upserts tags for a user and links them to an item.
pub(crate) async fn link_tags(
    transaction: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    item_id: Uuid,
    tags: &[String],
) -> Result<(), AppError> {
    for tag in tags {
        let name = tag.trim();
        if name.is_empty() {
            continue;
        }

        sqlx::query(
            "insert into tags (id, user_id, name) values ($1, $2, $3)
             on conflict (user_id, lower(name)) do nothing",
        )
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(name)
        .execute(&mut **transaction)
        .await
        .map_err(AppError::internal)?;

        let tag_id = sqlx::query_scalar::<_, Uuid>(
            "select id from tags where user_id = $1 and lower(name) = lower($2)",
        )
        .bind(user_id)
        .bind(name)
        .fetch_one(&mut **transaction)
        .await
        .map_err(AppError::internal)?;

        sqlx::query(
            "insert into item_tags (item_id, tag_id) values ($1, $2) on conflict do nothing",
        )
        .bind(item_id)
        .bind(tag_id)
        .execute(&mut **transaction)
        .await
        .map_err(AppError::internal)?;
    }

    Ok(())
}
