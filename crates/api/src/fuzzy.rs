//! Small typo-tolerant helpers for provider searches.
//!
//! Providers do not expose fuzzy search. If a query has no hits, we retry a
//! short prefix and keep candidates within a small edit distance.

/// Short prefixes worth retrying, shortest first.
pub fn prefixes_for(query: &str) -> Vec<String> {
    let chars: Vec<char> = query
        .trim()
        .chars()
        .filter(|character| character.is_alphanumeric())
        .collect();
    if chars.len() <= 2 {
        return Vec::new();
    }
    // Short Russian titles need two letters ("ас" → "Астрал"); longer names
    // get one more letter so provider noise stays manageable.
    let lengths: &[usize] = if chars.len() <= 6 { &[2, 3] } else { &[3, 4] };
    let mut prefixes = Vec::new();
    for &take in lengths {
        if take < chars.len() {
            let prefix: String = chars[..take].iter().collect();
            if !prefixes.contains(&prefix) {
                prefixes.push(prefix);
            }
        }
    }
    prefixes
}

/// Uses a prefix retry when there are no hits or every hit is clearly unrelated.
pub fn needs_fallback<T>(query: &str, items: &[T], title: impl Fn(&T) -> &str) -> bool {
    if items.is_empty() {
        return true;
    }
    let query = normalize(query);
    if query.is_empty() {
        return false;
    }
    let comparable: Vec<_> = items
        .iter()
        .filter(|item| same_script(&query, title(item)))
        .collect();
    // A Cyrillic query against a localised Latin result (or vice versa) is not
    // evidence of a typo; trust the provider rather than firing more requests.
    if comparable.is_empty() {
        return false;
    }
    !comparable.iter().any(|item| is_close(&query, title(item)))
}

fn is_close(query: &str, title: &str) -> bool {
    let title = normalize(title);
    if title.is_empty() {
        return false;
    }
    let max_distance = if query.chars().count() <= 5 { 1 } else { 2 };
    title.contains(query) || query.contains(&title) || title_distance(query, &title) <= max_distance
}

/// Compares against the title's prefix too, so a typo in the main title still
/// matches a longer title with a subtitle ("Гарри Поттер и …").
fn title_distance(query: &str, title: &str) -> usize {
    let full = levenshtein(query, title);
    let prefix_len = query.chars().count();
    let prefix: String = title.chars().take(prefix_len).collect();
    full.min(levenshtein(query, &prefix))
}

fn same_script(left: &str, right: &str) -> bool {
    let left_cyrillic = left
        .chars()
        .any(|ch| ('\u{0400}'..='\u{04FF}').contains(&ch));
    let right_cyrillic = right
        .chars()
        .any(|ch| ('\u{0400}'..='\u{04FF}').contains(&ch));
    if left_cyrillic || right_cyrillic {
        return left_cyrillic == right_cyrillic;
    }
    true
}

/// Keeps candidates close to the original query and sorts by edit distance.
pub fn rank<T>(items: Vec<T>, query: &str, title: impl Fn(&T) -> &str) -> Vec<T> {
    let query = normalize(query);
    if query.is_empty() {
        return items;
    }
    let max_distance = if query.chars().count() <= 5 { 1 } else { 2 };
    let mut seen = std::collections::HashSet::new();
    let mut scored: Vec<(usize, T)> = items
        .into_iter()
        .filter_map(|item| {
            let title = normalize(title(&item));
            if title.is_empty() || !seen.insert(title.clone()) {
                return None;
            }
            let distance = title_distance(&query, &title);
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
    fn short_typo_gets_prefixes() {
        assert_eq!(prefixes_for("асрал"), vec!["ас", "аср"]);
        assert!(prefixes_for("ас").is_empty());
    }

    #[test]
    fn ranks_close_titles() {
        let items = vec!["Ас из асов", "Астрал", "Астрал 6"];
        let ranked = rank(items, "асрал", |title| title);
        assert_eq!(ranked.first(), Some(&"Астрал"));
    }

    #[test]
    fn prefix_match_handles_subtitles() {
        assert!(is_close(
            "гарри поттерр",
            "Гарри Поттер и философский камень"
        ));
    }

    #[test]
    fn weak_results_trigger_fallback() {
        let items = vec!["Ас из асов", "Асса"];
        assert!(needs_fallback("асрал", &items, |title| title));
    }

    #[test]
    fn localized_results_do_not_trigger_fallback() {
        let items = vec!["Начало"];
        assert!(!needs_fallback("inception", &items, |title| title));
    }

    #[test]
    fn levenshtein_counts_insertions() {
        assert_eq!(levenshtein("асрал", "астрал"), 1);
    }
}
