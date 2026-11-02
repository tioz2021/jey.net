//! Text search over titles, subtitles and reviews.
//!
//! Matching uses `ILIKE` with escaped wildcards, so a trigram GIN index can
//! serve it; ordering uses trigram similarity, so the closest title comes
//! first. Search results are not cursor-paginated: relevance order plus a
//! cursor would need a composite rank key, and the personal dataset is small.

use jey_core::items::Item;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;
use crate::items::filters::Filters;
use crate::items::repo::ItemRow;

/// Longest accepted query.
pub const MAX_QUERY_LENGTH: usize = 200;

/// Searches live records of one user.
pub async fn search(
    pool: &PgPool,
    user_id: Uuid,
    filters: &Filters,
    query: &str,
    limit: i64,
) -> Result<Vec<Item>, AppError> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let pattern = format!("%{}%", escape_like(query));

    let rows = sqlx::query_as::<_, ItemRow>(
        "select
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
           and ($4::text is null or exists (
               select 1
               from item_tags it2
               join tags t2 on t2.id = it2.tag_id
               where it2.item_id = i.id
                 and t2.user_id = $1
                 and lower(t2.name) = lower($4)
           ))
           and ($5::int is null or i.year >= $5)
           and ($6::int is null or i.year <= $6)
           and ($7::int is null or i.rating >= $7)
           and ($8::int is null or i.rating <= $8)
           and ($12::text is null or to_char(date_trunc('month', i.created_at), 'YYYY-MM') = $12)
           and (
               i.title ilike $9 escape '\\'
               or i.subtitle ilike $9 escape '\\'
               or i.review ilike $9 escape '\\'
           )
         group by i.id
         order by greatest(
             similarity(i.title, $10),
             similarity(i.subtitle, $10),
             similarity(i.review, $10)
         ) desc, i.created_at desc, i.id desc
         limit $11",
    )
    .bind(user_id)
    .bind(filters.kind.map(jey_core::items::ItemKind::as_str))
    .bind(filters.status.map(jey_core::items::ItemStatus::as_str))
    .bind(filters.tag.as_deref())
    .bind(filters.year_from)
    .bind(filters.year_to)
    .bind(filters.rating_min.map(i32::from))
    .bind(filters.rating_max.map(i32::from))
    .bind(pattern)
    .bind(query)
    .bind(limit)
    .bind(filters.month.as_deref())
    .fetch_all(pool)
    .await
    .map_err(AppError::internal)?;

    rows.into_iter()
        .map(Item::try_from)
        .collect::<Result<Vec<_>, AppError>>()
}

/// Escapes the wildcards so they are matched literally.
pub fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wildcards_are_escaped() {
        assert_eq!(escape_like("100%"), "100\\%");
        assert_eq!(escape_like("a_b"), "a\\_b");
        assert_eq!(escape_like("back\\slash"), "back\\\\slash");
        assert_eq!(escape_like("plain"), "plain");
    }
}
