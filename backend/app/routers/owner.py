from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.db.session import db_session
from app.dependencies import require_platform_owner
from app.schemas.auth import CreateTenantAdminPayload, CreateTenantPayload
from sqlalchemy import text

from app.services.auth import create_tenant, create_user_setup, list_tenant_members, list_tenants
from app.services.setup_links import setup_url


router = APIRouter(prefix="/api/owner", tags=["owner"])


@router.get("/tenants")
def owner_tenants(current_user: dict[str, Any] = Depends(require_platform_owner)) -> dict[str, Any]:
    with db_session() as session:
        return {"tenants": list_tenants(session)}


@router.post("/tenants")
def owner_create_tenant(
    payload: CreateTenantPayload,
    current_user: dict[str, Any] = Depends(require_platform_owner),
) -> dict[str, Any]:
    try:
        with db_session() as session:
            tenant = create_tenant(
                session,
                slug=payload.slug,
                name=payload.name,
                email=payload.email,
                phone=payload.phone,
            )
            return {"tenant": tenant, "tenants": list_tenants(session)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/tenants/{tenant_slug}/users")
def owner_tenant_users(
    tenant_slug: str,
    current_user: dict[str, Any] = Depends(require_platform_owner),
) -> dict[str, Any]:
    with db_session() as session:
        tenant = session.execute(text("select id from tenants where slug = :slug"), {"slug": tenant_slug}).mappings().first()
        if tenant is None:
            raise HTTPException(status_code=404, detail="Tenant was not found")
        return {"users": list_tenant_members(session, str(tenant["id"]))}


@router.post("/tenants/{tenant_slug}/admins")
def owner_create_tenant_admin(
    tenant_slug: str,
    payload: CreateTenantAdminPayload,
    current_user: dict[str, Any] = Depends(require_platform_owner),
) -> dict[str, Any]:
    try:
        with db_session() as session:
            result = create_user_setup(
                session,
                tenant_slug=tenant_slug,
                email=payload.email,
                name=payload.name,
                role="admin",
                created_by_user_id=current_user["id"],
            )
            return {
                "setupUrl": setup_url(result["setup_token"]),
                "tenants": list_tenants(session),
            }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
