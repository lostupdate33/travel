from typing import Any

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response

from app.db.session import db_session
from app.dependencies import require_admin_user, require_current_user
from app.schemas.auth import CreateMemberPayload, LoginPayload, SetupPasswordPayload
from app.services.auth import (
    SESSION_COOKIE_NAME,
    SESSION_DAYS,
    authenticate,
    clear_session,
    create_setup_token,
    create_user_setup,
    deactivate_member,
    list_tenant_members,
    set_password_from_token,
)
from app.services.setup_links import setup_url


router = APIRouter(prefix="/api", tags=["auth"])


def _set_session_cookie(response: Response, session_token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE_NAME,
        session_token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
    )


@router.post("/auth/login")
def login(payload: LoginPayload, response: Response) -> dict[str, Any]:
    try:
        with db_session() as session:
            session_token, user = authenticate(session, email=payload.email, password=payload.password)
            _set_session_cookie(response, session_token)
            return {"user": user}
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.post("/auth/logout")
def logout(
    response: Response,
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> dict[str, str]:
    with db_session() as session:
        clear_session(session, session_token)
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return {"status": "ok"}


@router.get("/auth/me")
def me(current_user: dict[str, Any] = Depends(require_current_user)) -> dict[str, Any]:
    return {"user": current_user}


@router.post("/auth/setup-password")
def setup_password(payload: SetupPasswordPayload) -> dict[str, Any]:
    try:
        with db_session() as session:
            user = set_password_from_token(session, setup_token=payload.token, password=payload.password)
            return {"user": user}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/admin/users")
def admin_users(current_user: dict[str, Any] = Depends(require_admin_user)) -> dict[str, Any]:
    with db_session(tenant_id=current_user["tenant_id"]) as session:
        return {"users": list_tenant_members(session, current_user["tenant_id"])}


@router.post("/admin/users")
def admin_create_user(
    payload: CreateMemberPayload,
    current_user: dict[str, Any] = Depends(require_admin_user),
) -> dict[str, Any]:
    try:
        with db_session(tenant_id=current_user["tenant_id"]) as session:
            result = create_user_setup(
                session,
                tenant_slug=current_user["tenant_slug"],
                email=payload.email,
                name=payload.name,
                role=payload.role,
                created_by_user_id=current_user["id"],
            )
            users = list_tenant_members(session, current_user["tenant_id"])
            return {"users": users, "setupUrl": setup_url(result["setup_token"])}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/admin/users/{user_id}/setup-link")
def admin_resend_setup_link(
    user_id: str,
    current_user: dict[str, Any] = Depends(require_admin_user),
) -> dict[str, str]:
    with db_session(tenant_id=current_user["tenant_id"]) as session:
        member_ids = {member["id"] for member in list_tenant_members(session, current_user["tenant_id"])}
        if user_id not in member_ids:
            raise HTTPException(status_code=404, detail="User was not found")
        token = create_setup_token(session, user_id, current_user["id"])
        return {"setupUrl": setup_url(token)}


@router.delete("/admin/users/{user_id}")
def admin_deactivate_user(
    user_id: str,
    current_user: dict[str, Any] = Depends(require_admin_user),
) -> dict[str, Any]:
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
    with db_session(tenant_id=current_user["tenant_id"]) as session:
        deactivate_member(session, tenant_id=current_user["tenant_id"], user_id=user_id)
        return {"users": list_tenant_members(session, current_user["tenant_id"])}
