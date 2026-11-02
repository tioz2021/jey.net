//! Authentication building blocks.

pub mod login;
pub mod middleware;
pub mod password;
pub mod register;
pub mod session;
pub mod user;

/// Trims and lower-cases an email address before any lookup or storage.
pub fn normalise_email(raw: &str) -> String {
    raw.trim().to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn email_is_trimmed_and_lowercased() {
        assert_eq!(normalise_email("  Me@Example.COM  "), "me@example.com");
    }
}
