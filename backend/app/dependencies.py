from typing import Any

from fastapi import Cookie, Depends, HTTPException

from app.db.session import db_session, is_database_configured
from app.services.auth import SESSION_COOKIE_NAME, current_user_for_session


def require_database() -> None:
    if not is_database_configured():
        raise HTTPException(status_code=503, detail="Admin inventory requires DATABASE_URL")


def require_current_user(
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> dict[str, Any]:
    require_database()
    with db_session() as session:
        user = current_user_for_session(session, session_token)
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        return user


def require_admin_user(
    current_user: dict[str, Any] = Depends(require_current_user),
) -> dict[str, Any]:
    if current_user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access is required")
    return current_user


def require_platform_owner(
    current_user: dict[str, Any] = Depends(require_current_user),
) -> dict[str, Any]:
    if not current_user.get("isPlatformOwner"):
        raise HTTPException(status_code=403, detail="Platform owner access is required")
    return current_user


def require_inventory_editor(current_user: dict[str, Any] = Depends(require_current_user)) -> dict[str, Any]:
    if current_user["role"] not in {"admin", "editor"}:
        raise HTTPException(status_code=403, detail="Editor access is required")
    return current_user
