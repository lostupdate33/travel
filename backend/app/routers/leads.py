from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.db.session import db_session
from app.dependencies import require_current_user
from app.schemas.leads import LeadPayload, LeadStatusPayload
from app.services.leads import (
    assign_lead_to_user,
    create_lead,
    lead_stats,
    list_leads,
    update_lead,
    update_lead_status,
)


router = APIRouter(prefix="/api/leads", tags=["leads"])


@router.get("")
def get_leads(
    query: str = "",
    status: str = "",
    assigned: str = "",
    date_field: str = "start",
    start_date_from: str = "",
    start_date_to: str = "",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: dict[str, Any] = Depends(require_current_user),
) -> dict[str, Any]:
    assigned_filter = current_user["id"] if assigned == "me" else assigned
    try:
        with db_session(tenant_id=current_user["tenant_id"]) as session:
            return list_leads(
                session,
                tenant_id=current_user["tenant_id"],
                query=query,
                status=status,
                assigned=assigned_filter,
                date_field=date_field,
                start_date_from=start_date_from,
                start_date_to=start_date_to,
                page=page,
                page_size=page_size,
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/stats")
def get_lead_stats(
    current_user: dict[str, Any] = Depends(require_current_user),
) -> dict[str, Any]:
    with db_session(tenant_id=current_user["tenant_id"]) as session:
        return {"stats": lead_stats(session, tenant_id=current_user["tenant_id"])}


@router.post("")
def add_lead(
    payload: LeadPayload,
    current_user: dict[str, Any] = Depends(require_current_user),
) -> dict[str, Any]:
    try:
        with db_session(tenant_id=current_user["tenant_id"]) as session:
            lead = create_lead(
                session,
                tenant_id=current_user["tenant_id"],
                user_id=current_user["id"],
                payload=payload.model_dump(),
            )
            return {"lead": lead}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/{lead_id}")
def edit_lead(
    lead_id: str,
    payload: LeadPayload,
    current_user: dict[str, Any] = Depends(require_current_user),
) -> dict[str, Any]:
    try:
        with db_session(tenant_id=current_user["tenant_id"]) as session:
            lead = update_lead(
                session,
                tenant_id=current_user["tenant_id"],
                lead_id=lead_id,
                payload=payload.model_dump(),
            )
            return {"lead": lead}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{lead_id}/assign-me")
def assign_me(
    lead_id: str,
    current_user: dict[str, Any] = Depends(require_current_user),
) -> dict[str, Any]:
    try:
        with db_session(tenant_id=current_user["tenant_id"]) as session:
            lead = assign_lead_to_user(
                session,
                tenant_id=current_user["tenant_id"],
                lead_id=lead_id,
                user_id=current_user["id"],
            )
            return {"lead": lead}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{lead_id}/status")
def set_status(
    lead_id: str,
    payload: LeadStatusPayload,
    current_user: dict[str, Any] = Depends(require_current_user),
) -> dict[str, Any]:
    try:
        with db_session(tenant_id=current_user["tenant_id"]) as session:
            lead = update_lead_status(
                session,
                tenant_id=current_user["tenant_id"],
                lead_id=lead_id,
                status=payload.status,
            )
            return {"lead": lead}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
