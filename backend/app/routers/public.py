from typing import Any

from fastapi import APIRouter, Depends

from app.dependencies import require_current_user
from app.services.inventory import load_inventory, load_sample_proposal


router = APIRouter(prefix="/api", tags=["public"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/inventory")
def inventory(current_user: dict[str, Any] = Depends(require_current_user)) -> dict[str, Any]:
    return load_inventory(current_user["tenant_slug"])


@router.get("/proposals/sample")
def sample_proposal(current_user: dict[str, Any] = Depends(require_current_user)) -> dict[str, Any]:
    return load_sample_proposal()
