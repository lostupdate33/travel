from fastapi import APIRouter, HTTPException, Response

from app.db.session import db_session
from app.dependencies import require_database
from app.services.admin_inventory import load_media_asset
from app.services.media_variants import proposal_media_variant


router = APIRouter(prefix="/api/media", tags=["media"])


@router.get("/{media_asset_id}")
def media_asset(media_asset_id: str, variant: str = "original") -> Response:
    require_database()
    with db_session() as session:
        media = load_media_asset(session, media_asset_id)
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
