//! Filters for the item list.
//!
//! Every filter is optional and they combine with `AND`. A filter that matches
//! nothing (an unknown tag, an empty year range) yields an empty list rather
//! than an error — only malformed values are rejected.

use jey_core::items::{ItemKind, ItemStatus};

use crate::error::AppError;
use crate::items::list::ListQuery;

pub const MIN_YEAR: i32 = 1800;
pub const MAX_YEAR: i32 = 2100;
pub const MIN_RATING: u8 = 1;
pub const MAX_RATING: u8 = 10;

/// Validated filters, ready to be bound to the query.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Filters {
    pub kind: Option<ItemKind>,
    pub status: Option<ItemStatus>,
    pub tag: Option<String>,
    pub year_from: Option<i32>,
    pub year_to: Option<i32>,
    pub rating_min: Option<u8>,
    pub rating_max: Option<u8>,
    /// Calendar month the record was added, `YYYY-MM`.
    pub month: Option<String>,
}

impl Filters {
    pub fn parse(query: &ListQuery) -> Result<Self, AppError> {
        let kind = query.kind.as_deref().map(ItemKind::parse).transpose()?;
        let status = query.status.as_deref().map(ItemStatus::parse).transpose()?;

        let tag = match query.tag.as_deref() {
            Some(raw) if !raw.trim().is_empty() => Some(raw.trim().to_owned()),
            _ => None,
        };

        let (year_from, year_to) = parse_year_range(query.year_from, query.year_to)?;
        let (rating_min, rating_max) = parse_rating_range(query.rating_min, query.rating_max)?;
        let month = parse_month(query.month.as_deref())?;

        Ok(Self {
            kind,
            status,
            tag,
            year_from,
            year_to,
            rating_min,
            rating_max,
            month,
        })
    }
}

fn parse_month(raw: Option<&str>) -> Result<Option<String>, AppError> {
    let Some(raw) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };

    let mut parts = raw.split('-');
    let year = parts.next().and_then(|value| value.parse::<i32>().ok());
    let month = parts.next().and_then(|value| value.parse::<u32>().ok());
    let extra = parts.next();

    if extra.is_some() || year.is_none() || month.is_none() || !(1..=12).contains(&month.unwrap()) {
        return Err(AppError::validation_field(
            "month",
            "month must look like YYYY-MM",
        ));
    }

    Ok(Some(raw.to_owned()))
}

fn parse_year_range(
    from: Option<i32>,
    to: Option<i32>,
) -> Result<(Option<i32>, Option<i32>), AppError> {
    for (field, value) in [("year_from", from), ("year_to", to)] {
        if let Some(year) = value
            && !(MIN_YEAR..=MAX_YEAR).contains(&year)
        {
            return Err(AppError::validation_field(
                field,
                format!("year must be between {MIN_YEAR} and {MAX_YEAR}"),
            ));
        }
    }

    if let (Some(from), Some(to)) = (from, to)
        && from > to
    {
        return Err(AppError::validation_field(
            "year_from",
            "year_from must not exceed year_to",
        ));
    }

    Ok((from, to))
}

fn parse_rating_range(
    min: Option<u8>,
    max: Option<u8>,
) -> Result<(Option<u8>, Option<u8>), AppError> {
    for (field, value) in [("rating_min", min), ("rating_max", max)] {
        if let Some(rating) = value
            && !(MIN_RATING..=MAX_RATING).contains(&rating)
        {
            return Err(AppError::validation_field(
                field,
                format!("rating must be between {MIN_RATING} and {MAX_RATING}"),
            ));
        }
    }

    if let (Some(min), Some(max)) = (min, max)
        && min > max
    {
        return Err(AppError::validation_field(
            "rating_min",
            "rating_min must not exceed rating_max",
        ));
    }

    Ok((min, max))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query() -> ListQuery {
        ListQuery::default()
    }

    #[test]
    fn empty_query_has_no_filters() {
        assert_eq!(Filters::parse(&query()).expect("valid"), Filters::default());
    }

    #[test]
    fn values_are_parsed() {
        let query = ListQuery {
            kind: Some("movie".to_owned()),
            status: Some("done".to_owned()),
            tag: Some("  sci-fi ".to_owned()),
            year_from: Some(2000),
            year_to: Some(2020),
            rating_min: Some(8),
            rating_max: Some(10),
            ..ListQuery::default()
        };

        let filters = Filters::parse(&query).expect("valid");

        assert_eq!(filters.kind, Some(ItemKind::Movie));
        assert_eq!(filters.status, Some(ItemStatus::Done));
        assert_eq!(filters.tag.as_deref(), Some("sci-fi"));
        assert_eq!(filters.year_from, Some(2000));
        assert_eq!(filters.rating_min, Some(8));
    }

    #[test]
    fn new_kinds_are_accepted() {
        for kind in ["game", "anime"] {
            let query = ListQuery {
                kind: Some(kind.to_owned()),
                ..ListQuery::default()
            };
            assert_eq!(
                Filters::parse(&query).expect("valid kind").kind,
                Some(ItemKind::parse(kind).expect("known kind"))
            );
        }
    }

    #[test]
    fn unknown_kind_and_status_are_rejected() {
        let bad_kind = ListQuery {
            kind: Some("podcast".to_owned()),
            ..ListQuery::default()
        };
        assert!(Filters::parse(&bad_kind).is_err());

        let bad_status = ListQuery {
            status: Some("lost".to_owned()),
            ..ListQuery::default()
        };
        assert!(Filters::parse(&bad_status).is_err());
    }

    #[test]
    fn ranges_are_validated() {
        let too_high = ListQuery {
            rating_min: Some(11),
            ..ListQuery::default()
        };
        assert!(Filters::parse(&too_high).is_err());

        let inverted_years = ListQuery {
            year_from: Some(2020),
            year_to: Some(2000),
            ..ListQuery::default()
        };
        assert!(Filters::parse(&inverted_years).is_err());

        let inverted_ratings = ListQuery {
            rating_min: Some(9),
            rating_max: Some(5),
            ..ListQuery::default()
        };
        assert!(Filters::parse(&inverted_ratings).is_err());

        let year_out_of_range = ListQuery {
            year_from: Some(1500),
            ..ListQuery::default()
        };
        assert!(Filters::parse(&year_out_of_range).is_err());
    }
}
