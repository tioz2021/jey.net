//! `GET /api/v1/stats`: aggregated numbers for the dashboard.
//!
//! Everything comes from a single SQL statement: five scalar subqueries over
//! one CTE, so the number of queries never grows with the data.

use std::collections::BTreeMap;

use axum::Json;
use axum::extract::State;
use jey_core::items::{ItemKind, ItemStatus};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::http::AppState;

#[derive(Debug, Serialize)]
pub struct Stats {
    pub total: i64,
    pub by_kind: BTreeMap<String, i64>,
    pub by_status: BTreeMap<String, i64>,
    pub average_rating: f64,
    pub by_year: Vec<YearCount>,
    /// The last twelve months, including months without records.
    pub by_month: Vec<MonthCount>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct YearCount {
    pub year: i32,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MonthCount {
    /// `YYYY-MM`.
    pub month: String,
    pub count: i64,
}

#[derive(sqlx::FromRow)]
struct StatsRow {
    total: i64,
    average_rating: Option<f64>,
    by_kind: serde_json::Value,
    by_status: serde_json::Value,
    by_year: serde_json::Value,
    by_month: serde_json::Value,
}

/// `GET /api/v1/stats`
pub async fn stats(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Stats>, AppError> {
    Ok(Json(compute(&state.pool, current.user.id).await?))
}

async fn compute(pool: &PgPool, user_id: Uuid) -> Result<Stats, AppError> {
    let row = sqlx::query_as::<_, StatsRow>(
        "with live as (
             select kind, status, rating, year, created_at
             from items
             where user_id = $1 and deleted_at is null
         )
         select
             (select count(*) from live)::bigint as total,
             (select avg(rating) from live)::double precision as average_rating,
             (select coalesce(jsonb_object_agg(kind, cnt), '{}'::jsonb)
              from (select kind, count(*) as cnt from live group by kind) by_kind) as by_kind,
             (select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
              from (select status, count(*) as cnt from live group by status) by_status) as by_status,
             (select coalesce(jsonb_agg(jsonb_build_object('year', year, 'count', cnt) order by year), '[]'::jsonb)
              from (select year, count(*) as cnt from live where year is not null group by year) by_year) as by_year,
             (select coalesce(
                  jsonb_agg(
                      jsonb_build_object('month', to_char(months.m, 'YYYY-MM'), 'count', coalesce(counts.cnt, 0))
                      order by months.m
                  ),
                  '[]'::jsonb
              )
              from generate_series(
                  date_trunc('month', now()) - interval '11 months',
                  date_trunc('month', now()),
                  interval '1 month'
              ) as months(m)
              left join (
                  select date_trunc('month', created_at) as month, count(*) as cnt
                  from live
                  group by 1
              ) as counts on counts.month = months.m) as by_month",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(AppError::internal)?;

    let by_kind_json: BTreeMap<String, i64> =
        serde_json::from_value(row.by_kind).unwrap_or_default();
    let by_status_json: BTreeMap<String, i64> =
        serde_json::from_value(row.by_status).unwrap_or_default();
    let by_year: Vec<YearCount> = serde_json::from_value(row.by_year).unwrap_or_default();
    let by_month: Vec<MonthCount> = serde_json::from_value(row.by_month).unwrap_or_default();

    // Every kind and status appears, with zero when unused: the UI does not
    // have to special-case missing keys.
    let by_kind = ItemKind::ALL
        .iter()
        .map(|kind| {
            let count = by_kind_json.get(kind.as_str()).copied().unwrap_or(0);
            (kind.as_str().to_owned(), count)
        })
        .collect();

    let by_status = ItemStatus::ALL
        .iter()
        .map(|status| {
            let count = by_status_json.get(status.as_str()).copied().unwrap_or(0);
            (status.as_str().to_owned(), count)
        })
        .collect();

    Ok(Stats {
        total: row.total,
        by_kind,
        by_status,
        average_rating: round_one_decimal(row.average_rating.unwrap_or(0.0)),
        by_year,
        by_month,
    })
}

fn round_one_decimal(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn averages_are_rounded_to_one_decimal() {
        assert_eq!(round_one_decimal(7.8333), 7.8);
        assert_eq!(round_one_decimal(7.85), 7.9);
        assert_eq!(round_one_decimal(0.0), 0.0);
    }
}
