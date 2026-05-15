from typing import Any

from fastapi import APIRouter

from app.services.inventory import load_inventory, load_sample_proposal


router = APIRouter(prefix="/api", tags=["public"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/inventory")
def inventory() -> dict[str, Any]:
    return load_inventory()


@router.get("/proposals/sample")
def sample_proposal() -> dict[str, Any]:
    return load_sample_proposal()
