// Authenticated chat SSE stream.

/// `GET /api/v1/chat/stream` — SSE stream of events for the current account.
pub async fn stream(
    State(state): State<AppState>,
    current: CurrentUser,
) -> axum::response::sse::Sse<
    impl futures_util::Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>>,
> {
    use std::convert::Infallible;
    use tokio::sync::broadcast::error::RecvError;

    let mut rx = state.chat.subscribe();
    let user_id = current.user.id;
    let guard = crate::telemetry::open_chat_sse();
    let stream = async_stream::stream! {
        let _guard = guard;
        loop {
            match rx.recv().await {
                Ok(event) if event.recipients.contains(&user_id) => {
                    yield Ok::<_, Infallible>(event.sse());
                }
                Ok(_) => {}
                Err(RecvError::Lagged(_)) => {
                    yield Ok(axum::response::sse::Event::default()
                        .event("resync")
                        .data("{}"));
                }
                Err(RecvError::Closed) => break,
            }
        }
    };
    axum::response::sse::Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text("keep-alive"),
    )
}
