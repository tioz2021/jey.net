//! T134: the chat migration is applicable and its invariants hold.

mod common;

use sqlx::PgPool;
use uuid::Uuid;

async fn user(pool: &PgPool, name: &str) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query(
        "insert into users (id, email, handle, password_hash, display_name)
         values ($1, $2, $3, 'test-hash', $4)",
    )
    .bind(id)
    .bind(format!("{id}@chat.test"))
    .bind(format!("chat-{}", &id.to_string()[..8]))
    .bind(name)
    .execute(pool)
    .await
    .expect("insert user");
    id
}

#[tokio::test]
async fn chat_tables_enforce_direct_key_membership_and_idempotency() {
    let pool = common::pool().await;
    let alice = user(&pool, "Chat Alice").await;
    let bob = user(&pool, "Chat Bob").await;
    let key = format!("{alice}:{bob}");

    let thread_id: Uuid =
        sqlx::query_scalar("insert into chat_threads (direct_key) values ($1) returning id")
            .bind(&key)
            .fetch_one(&pool)
            .await
            .expect("insert thread");

    // A direct pair cannot produce a second thread.
    let duplicate = sqlx::query("insert into chat_threads (direct_key) values ($1)")
        .bind(&key)
        .execute(&pool)
        .await;
    assert!(duplicate.is_err(), "direct_key must be unique");

    for user_id in [alice, bob] {
        sqlx::query("insert into chat_members (thread_id, user_id) values ($1, $2)")
            .bind(thread_id)
            .bind(user_id)
            .execute(&pool)
            .await
            .expect("insert member");
    }

    let client_id = Uuid::new_v4();
    sqlx::query(
        "insert into chat_messages (thread_id, sender_id, body, client_id)
         values ($1, $2, $3, $4)",
    )
    .bind(thread_id)
    .bind(alice)
    .bind("hello")
    .bind(client_id)
    .execute(&pool)
    .await
    .expect("insert message");

    let duplicate_message = sqlx::query(
        "insert into chat_messages (thread_id, sender_id, body, client_id)
         values ($1, $2, $3, $4)",
    )
    .bind(thread_id)
    .bind(alice)
    .bind("hello again")
    .bind(client_id)
    .execute(&pool)
    .await;
    assert!(
        duplicate_message.is_err(),
        "client_id must be idempotent per thread"
    );

    let non_member = user(&pool, "Chat Stranger").await;
    let non_member_message = sqlx::query(
        "insert into chat_messages (thread_id, sender_id, body, client_id)
         values ($1, $2, $3, $4)",
    )
    .bind(thread_id)
    .bind(non_member)
    .bind("not allowed")
    .bind(Uuid::new_v4())
    .execute(&pool)
    .await;
    assert!(
        non_member_message.is_err(),
        "sender must be a thread member"
    );

    let empty = sqlx::query(
        "insert into chat_messages (thread_id, sender_id, body, client_id)
         values ($1, $2, $3, $4)",
    )
    .bind(thread_id)
    .bind(alice)
    .bind("   ")
    .bind(Uuid::new_v4())
    .execute(&pool)
    .await;
    assert!(empty.is_err(), "empty message must be rejected");

    for id in [alice, bob, non_member] {
        sqlx::query("delete from users where id = $1")
            .bind(id)
            .execute(&pool)
            .await
            .expect("cleanup user");
    }
}
