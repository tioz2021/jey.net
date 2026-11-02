//! Rendered messages: verification and password reset.

use crate::mail::Message;

/// Confirmation link the user has to open.
pub fn verification_link(public_url: &str, token: &str) -> String {
    format!("{public_url}/verify-email?token={token}")
}

/// Reset link the user has to open.
pub fn reset_link(public_url: &str, token: &str) -> String {
    format!("{public_url}/reset-password?token={token}")
}

pub fn email_verification(public_url: &str, to: &str, token: &str) -> Message {
    let link = verification_link(public_url, token);

    Message {
        to: to.to_owned(),
        subject: "Confirm your jey.net email".to_owned(),
        text: format!(
            "Hello!\n\n\
             Please confirm your email address by opening this link:\n\n\
             {link}\n\n\
             The link is valid for 24 hours. If you did not create an account, ignore this message.\n"
        ),
    }
}

pub fn password_reset(public_url: &str, to: &str, token: &str) -> Message {
    let link = reset_link(public_url, token);

    Message {
        to: to.to_owned(),
        subject: "Reset your jey.net password".to_owned(),
        text: format!(
            "Hello!\n\n\
             Somebody asked to reset the password for this address. \
             If it was you, open the link:\n\n\
             {link}\n\n\
             The link is valid for one hour. If it was not you, ignore this message.\n"
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verification_message_contains_the_link() {
        let message = email_verification("https://jey.net", "user@example.com", "tok123");

        assert_eq!(message.to, "user@example.com");
        assert!(
            message
                .text
                .contains("https://jey.net/verify-email?token=tok123")
        );
        assert!(message.subject.contains("Confirm"));
    }

    #[test]
    fn reset_message_contains_the_link() {
        let message = password_reset("https://jey.net", "user@example.com", "tok456");

        assert!(
            message
                .text
                .contains("https://jey.net/reset-password?token=tok456")
        );
        assert!(message.subject.contains("Reset"));
    }
}
