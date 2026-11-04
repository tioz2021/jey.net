//! Small typo-tolerant helpers for provider searches.
//!
//! Providers do not expose fuzzy search. If a query has no hits, we retry a
//! short prefix and keep candidates within a small edit distance.

/// Returns a short prefix worth retrying, or `None` for tiny queries.
pub fn prefix_for(query: &str) -> Option<String> {
    let chars: Vec<char> = query
        .trim()
        .chars()
        .filter(|character| character.is_alphanumeric())
        .collect();
    if chars.len() <= 2 {
        return None;
    }
    // Two letters are broad enough for short Russian titles ("ас" → "Астрал");
    // longer titles need one more character to keep provider noise down.
    let take = if chars.len() <= 6 { 2 } else { 3 };
    Some(chars[..take].iter().collect())
}

/// Keeps candidates close to the original query and sorts by edit distance.
pub fn rank<T>(items: Vec<T>, query: &str, title: impl Fn(&T) -> &str) -> Vec<T> {
    let query = normalize(query);
    if query.is_empty() {
        return items;
    }
    let max_distance = if query.chars().count() <= 5 { 1 } else { 2 };
    let mut scored: Vec<(usize, T)> = items
        .into_iter()
        .filter_map(|item| {
            let title = normalize(title(&item));
            let distance = levenshtein(&query, &title);
            (title.contains(&query) || query.contains(&title) || distance <= max_distance)
                .then_some((distance, item))
        })
        .collect();
    scored.sort_by_key(|(distance, _)| *distance);
    scored.into_iter().map(|(_, item)| item).collect()
}

fn normalize(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .filter(|character| character.is_alphanumeric() || character.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn levenshtein(left: &str, right: &str) -> usize {
    let a: Vec<char> = left.chars().collect();
    let b: Vec<char> = right.chars().collect();
    let mut previous: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.iter().enumerate() {
        let mut current = vec![i + 1];
        for (j, cb) in b.iter().enumerate() {
            let cost = usize::from(ca != cb);
            current.push(
                (previous[j + 1] + 1)
                    .min(current[j] + 1)
                    .min(previous[j] + cost),
            );
        }
        previous = current;
    }
    previous[b.len()]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_typo_gets_a_prefix() {
        assert_eq!(prefix_for("асрал").as_deref(), Some("ас"));
        assert!(prefix_for("ас").is_none());
    }

    #[test]
    fn ranks_close_titles() {
        let items = vec!["Ас из асов", "Астрал", "Астрал 6"];
        let ranked = rank(items, "асрал", |title| title);
        assert_eq!(ranked.first(), Some(&"Астрал"));
    }

    #[test]
    fn levenshtein_counts_insertions() {
        assert_eq!(levenshtein("асрал", "астрал"), 1);
    }
}
