//! Text search over titles, subtitles and reviews.
//!
//! Matching uses `ILIKE` with escaped wildcards, so a trigram GIN index can
//! serve it; ordering uses trigram similarity, so the closest title comes
//! first. Search results are not cursor-paginated: relevance order plus a
//! cursor would need a composite rank key, and the personal dataset is small.

use jey_core::items::Item;
use jey_core::search::rank_items;
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
             i.id, i.slug, i.user_id, i.kind, i.title, i.subtitle, i.year, i.status, i.rating,
             i.review, i.body, i.source_url, i.cover_key, i.public_hidden, i.external_source,
             i.external_id, i.details, i.details_fetched_at, i.revision, i.sync_seq, i.device_id,
             i.created_at, i.updated_at, i.deleted_at
         from items i
         where i.user_id = $1
           and i.deleted_at is null
           and ($2::text is null or i.kind = $2)
           and ($3::text is null or i.status = $3)
           and ($4::text is null or true)
           and ($5::int is null or i.year >= $5)
           and ($6::int is null or i.year <= $6)
           and ($7::int is null or i.rating >= $7)
           and ($8::int is null or i.rating <= $8)
           and ($12::text is null or to_char(date_trunc('month', i.created_at), 'YYYY-MM') = $12)
           and (
               i.title ilike $9 escape '\\'
               or i.subtitle ilike $9 escape '\\'
               or i.review ilike $9 escape '\\'
               or coalesce(i.details::text, '') ilike $9 escape '\\'
               or similarity(i.title, $10) >= 0.3
               or similarity(i.subtitle, $10) >= 0.3
               or similarity(i.review, $10) >= 0.45
           )
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

    if rows.is_empty() && !query.trim().is_empty() {
        crate::analytics::record(pool, "search_failed", None, None).await;
    }

    let items: Vec<Item> = rows
        .into_iter()
        .map(Item::try_from)
        .collect::<Result<Vec<_>, AppError>>()?;
    let mut ranked = rank_items(query, &items);
    ranked.truncate(limit.max(1) as usize);
    Ok(ranked)
}

/// Expands theme words and strips natural-language filler.
pub fn semantic_terms(query: &str) -> Vec<String> {
    const STOP: &[&str] = &[
        "фильм",
        "сериал",
        "книга",
        "книгу",
        "игра",
        "игру",
        "аниме",
        "про",
        "историю",
        "история",
        "хочу",
        "посмотреть",
        "посмотреть",
        "найти",
        "мне",
        "что",
        "где",
        "для",
        "это",
        "the",
        "movie",
        "film",
        "about",
        "with",
        "and",
        "for",
        "about",
        "series",
        "book",
        "game",
        "anime",
    ];
    const THEMES: &[(&[&str], &[&str])] = &[
        (
            &[
                "призрак",
                "привид",
                "ужас",
                "мистик",
                "ghost",
                "haunt",
                "supernatural",
            ],
            &["ужас", "мистик", "призр", "ghost"],
        ),
        (
            &["дом", "особняк", "house", "haunted"],
            &["дом", "особняк", "house"],
        ),
        (
            &["космос", "космич", "space", "sci-fi", "sci"],
            &["космос", "фантаст", "space", "sci"],
        ),
        (
            &["любов", "роман", "love", "romance"],
            &["любов", "романт", "мелодрам"],
        ),
        (&["войн", "war"], &["войн", "воен"]),
        (
            &["дракон", "dragon", "фэнтез", "fantasy"],
            &["фэнтез", "дракон", "fantasy"],
        ),
        (&["зомби", "zombie"], &["зомби", "zombie"]),
        (
            &["детектив", "detective", "crime"],
            &["детектив", "криминал", "crime"],
        ),
    ];

    let mut terms: Vec<String> = Vec::new();
    for token in query
        .to_lowercase()
        .split(|ch: char| !ch.is_alphanumeric())
        .filter(|token| token.chars().count() >= 3)
    {
        if STOP.contains(&token) {
            continue;
        }
        let root: String = token.chars().take(5).collect();
        if !terms.contains(&root) {
            terms.push(root.clone());
        }
        for (needles, expansions) in THEMES {
            if needles
                .iter()
                .any(|needle| token.contains(needle) || root.contains(needle))
            {
                for expansion in *expansions {
                    let expansion = (*expansion).to_owned();
                    if !terms.contains(&expansion) {
                        terms.push(expansion);
                    }
                }
            }
        }
    }
    terms.truncate(8);
    terms
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
    fn semantic_query_expands_ghost_theme() {
        let terms = semantic_terms("фильм про дом с призраками");
        assert!(terms.contains(&"ужас".to_string()));
        assert!(terms.contains(&"мистик".to_string()));
        assert!(terms.contains(&"дом".to_string()));
        assert!(!terms.contains(&"фильм".to_string()));
    }

    #[test]
    fn wildcards_are_escaped() {
        assert_eq!(escape_like("100%"), "100\\%");
        assert_eq!(escape_like("a_b"), "a\\_b");
        assert_eq!(escape_like("back\\slash"), "back\\\\slash");
        assert_eq!(escape_like("plain"), "plain");
    }
}
