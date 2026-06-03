from fastapi import APIRouter, Cookie, HTTPException, Response

from app.db.session import db_session
from app.dependencies import require_database
from app.services.auth import SESSION_COOKIE_NAME, current_user_for_session
from app.services.admin_inventory import load_media_asset
from app.services.media_variants import proposal_media_variant
from app.services.media_access import (
    valid_media_access_token,
)


router = APIRouter(prefix="/api/media", tags=["media"])


def _media_tenant_id(
    *,
    session_token: str | None,
    asset_token: str | None,
    asset_tenant_id: str | None,
    asset_expires: int | None,
) -> str:
    if valid_media_access_token(asset_tenant_id, asset_expires, asset_token):
        return asset_tenant_id

    with db_session() as session:
        user = current_user_for_session(session, session_token)
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        return user["tenant_id"]


@router.get("/{media_asset_id}")
def media_asset(
    media_asset_id: str,
    variant: str = "original",
    asset_token: str | None = None,
    asset_tenant_id: str | None = None,
    asset_expires: int | None = None,
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> Response:
    require_database()
    tenant_id = _media_tenant_id(
        session_token=session_token,
        asset_token=asset_token,
        asset_tenant_id=asset_tenant_id,
        asset_expires=asset_expires,
    )
    with db_session(tenant_id=tenant_id) as session:
        media = load_media_asset(session, media_asset_id, tenant_id)
        if media is None:
            raise HTTPException(status_code=404, detail="Media asset was not found")

        content = bytes(media["content"])
        media_type = media["mime_type"]
        if variant == "proposal":
            content, media_type = proposal_media_variant(media_asset_id, content)

        headers = {"Cache-Control": "public, max-age=86400"}
        if media["file_name"]:
            headers["Content-Disposition"] = f'inline; filename="{media["file_name"]}"'
        return Response(content=content, media_type=media_type, headers=headers)
