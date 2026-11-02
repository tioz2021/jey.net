//! Request guards: who is calling, and is the route allowed to proceed.

use axum::extract::{FromRequestParts, Request, State};
use axum::http::request::Parts;
use axum::middleware::Next;
use axum::response::Response;

use uuid::Uuid;

use crate::auth::session::{self, AuthenticatedSession};
use crate::error::AppError;
use crate::http::AppState;
use crate::users::user::UserView;

/// The authenticated caller of the current request.
#[derive(Debug, Clone)]
pub struct CurrentUser {
    pub user: UserView,
    /// Used by logout and password change; also by the sync endpoints (M8).
    pub session_id: Uuid,
    /// Used by the sync endpoints (M8); kept here so the request carries it.
    #[allow(dead_code)]
    pub device_id: Option<Uuid>,
}

impl From<AuthenticatedSession> for CurrentUser {
    fn from(session: AuthenticatedSession) -> Self {
        Self {
            user: UserView::from(session.user),
            session_id: session.session_id,
            device_id: session.device_id,
        }
    }
}

impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        // The middleware below already resolved the session for protected
        // routes; reuse it instead of hitting the database twice.
        if let Some(current) = parts.extensions.get::<CurrentUser>() {
            return Ok(current.clone());
        }

        let authenticated = session::authenticate(&state.pool, &parts.headers).await?;
        Ok(Self::from(authenticated))
    }
}

/// Layer for routers where every route needs a signed-in user.
pub async fn require_auth(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let authenticated = session::authenticate(&state.pool, request.headers()).await?;
    request
        .extensions_mut()
        .insert(CurrentUser::from(authenticated));

    Ok(next.run(request).await)
}
