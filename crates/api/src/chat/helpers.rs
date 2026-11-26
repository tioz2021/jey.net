// Authorization and payload helpers shared by chat handlers.

fn direct_key(a: Uuid, b: Uuid) -> String {
    let mut ids = [a.to_string(), b.to_string()];
    ids.sort();
    format!("{}:{}", ids[0], ids[1])
}

async fn blocked_between(pool: &PgPool, a: Uuid, b: Uuid) -> Result<bool, AppError> {
    sqlx::query_scalar(
        "select exists(select 1 from blocks
         where (blocker_id = $1 and blocked_id = $2)
            or (blocker_id = $2 and blocked_id = $1))",
    )
    .bind(a)
    .bind(b)
    .fetch_one(pool)
    .await
    .map_err(AppError::internal)
}

async fn message_policy(pool: &PgPool, user_id: Uuid) -> Result<String, AppError> {
    sqlx::query_scalar(
        "select coalesce(
            (select message_policy from chat_settings where user_id = $1),
            'all'
         )",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(AppError::internal)
}

async fn can_start(state: &AppState, sender: Uuid, target: Uuid) -> Result<(), AppError> {
    if sender == target {
        return Err(AppError::validation_field(
            "user_id",
            "cannot start a conversation with yourself",
        ));
    }

    let target_active: bool = sqlx::query_scalar(
        "select exists(
            select 1 from users
            where id = $1 and deleted_at is null and suspended_at is null
        )",
    )
    .bind(target)
    .fetch_one(&state.pool)
    .await
    .map_err(AppError::internal)?;
    if !target_active {
        return Err(AppError::not_found("profile"));
    }

    if blocked_between(&state.pool, sender, target).await? {
        return Err(AppError::forbidden("profile is blocked"));
    }

    match message_policy(&state.pool, target).await?.as_str() {
        "all" => Ok(()),
        "following" => {
            let follows: bool = sqlx::query_scalar(
                "select exists(select 1 from follows
                 where follower_id = $1 and followee_id = $2)",
            )
            .bind(target)
            .bind(sender)
            .fetch_one(&state.pool)
            .await
            .map_err(AppError::internal)?;
            if follows {
                Ok(())
            } else {
                Err(AppError::forbidden("profile does not accept messages"))
            }
        }
        _ => Err(AppError::forbidden("profile does not accept messages")),
    }
}

fn parse_chat_json<T: serde::de::DeserializeOwned>(value: Value) -> Result<T, AppError> {
    serde_json::from_value(value).map_err(AppError::internal)
}

async fn thread_payload(
    pool: &PgPool,
    viewer: Uuid,
    thread_id: Uuid,
) -> Result<ChatThreadView, AppError> {
    let value = sqlx::query_scalar::<_, Value>(
        "select jsonb_build_object(
            'id', t.id,
            'kind', t.kind,
            'created_at', t.created_at,
            'updated_at', t.updated_at,
            'muted', cm.muted_at is not null,
            'peer', jsonb_build_object(
                'id', peer.id,
                'handle', peer.handle,
                'display_name', peer.display_name,
                'avatar_key', peer.avatar_key
            ),
            'last_message', (
                select jsonb_build_object(
                    'id', lm.id,
                    'sender_id', lm.sender_id,
                    'body', lm.body,
                    'created_at', lm.created_at
                )
                from chat_messages lm
                where lm.thread_id = t.id and lm.deleted_at is null
                order by lm.created_at desc, lm.id desc
                limit 1
            ),
            'unread', (
                select count(*)
                from chat_messages um
                where um.thread_id = t.id
                  and um.sender_id <> $2
                  and um.deleted_at is null
                  and (cm.last_read_at is null or um.created_at > cm.last_read_at)
            )
        )
        from chat_threads t
        join chat_members cm on cm.thread_id = t.id and cm.user_id = $2
        join chat_members peer_member
          on peer_member.thread_id = t.id and peer_member.user_id <> $2
        join users peer on peer.id = peer_member.user_id
        where t.id = $1 and t.kind = 'direct'
        limit 1",
    )
    .bind(thread_id)
    .bind(viewer)
    .fetch_optional(pool)
    .await
    .map_err(AppError::internal)?
    .ok_or_else(|| AppError::not_found("conversation"))?;
    parse_chat_json(value)
}
