from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.db.session import db_session
from app.dependencies import require_current_user, require_inventory_editor
from app.schemas.invoices import InvoiceFromProposalPayload, InvoicePayload, SavedProposalPayload
from app.services.invoices import (
    blank_invoice,
    invoice_defaults,
    invoice_from_saved_proposal,
    load_invoice,
    render_invoice_html,
    save_invoice,
    search_invoices,
    update_invoice_defaults,
)
from app.services.pdf import html_to_pdf
from app.services.saved_proposals import load_saved_proposal, save_proposal_snapshot, saved_proposal_response, search_saved_proposals


router = APIRouter(prefix="/api", tags=["invoices"])


@router.post("/proposals/saved")
def save_current_proposal(
    payload: SavedProposalPayload,
    current_user: dict[str, Any] = Depends(require_current_user),
) -> dict[str, Any]:
    with db_session(tenant_id=current_user["tenant_id"]) as session:
        saved = save_proposal_snapshot(
            session,
            tenant_id=current_user["tenant_id"],
            user_id=current_user["id"],
            proposal=payload.proposal,
            lead_id=payload.lead_id,
        )
        return {"proposal": saved}


@router.get("/proposals/saved")
def search_proposals(
    query: str = "",
    start_date_from: date | None = Query(default=None),
    start_date_to: date | None = Query(default=None),
    amount_min: float | None = Query(default=None),
    amount_max: float | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: dict[str, Any] = Depends(require_current_user),
) -> dict[str, Any]:
    with db_session(tenant_id=current_user["tenant_id"]) as session:
        return search_saved_proposals(
            session,
            tenant_id=current_user["tenant_id"],
            query=query,
            start_date_from=start_date_from,
            start_date_to=start_date_to,
            amount_min=amount_min,
            amount_max=amount_max,
            page=page,
            page_size=page_size,
        )


@router.get("/proposals/saved/{proposal_id}")
def get_saved_proposal(
    proposal_id: str,
    current_user: dict[str, Any] = Depends(require_current_user),
) -> dict[str, Any]:
    with db_session(tenant_id=current_user["tenant_id"]) as session:
        row = load_saved_proposal(session, tenant_id=current_user["tenant_id"], proposal_id=proposal_id)
        if not row:
            raise HTTPException(status_code=404, detail="Saved proposal was not found")
        return saved_proposal_response(row)


@router.get("/invoices/defaults")
def get_invoice_defaults(current_user: dict[str, Any] = Depends(require_current_user)) -> dict[str, Any]:
    with db_session(tenant_id=current_user["tenant_id"]) as session:
        defaults = invoice_defaults(
            session,
            tenant_id=current_user["tenant_id"],
            tenant_slug=current_user["tenant_slug"],
        )
        invoice = blank_invoice(
            session,
            tenant_id=current_user["tenant_id"],
            tenant_slug=current_user["tenant_slug"],
        )
        return {"defaults": defaults, "invoice": invoice}


@router.get("/invoices")
def list_invoices(
    query: str = "",
    invoice_date_from: date | None = Query(default=None),
    invoice_date_to: date | None = Query(default=None),
    proposal_id: str = "",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    current_user: dict[str, Any] = Depends(require_current_user),
) -> dict[str, Any]:
    with db_session(tenant_id=current_user["tenant_id"]) as session:
        return search_invoices(
            session,
            tenant_id=current_user["tenant_id"],
            query=query,
            invoice_date_from=invoice_date_from,
            invoice_date_to=invoice_date_to,
            proposal_id=proposal_id,
            page=page,
            page_size=page_size,
        )


@router.get("/invoices/{invoice_id}")
def get_invoice(
    invoice_id: str,
    current_user: dict[str, Any] = Depends(require_current_user),
) -> dict[str, Any]:
    with db_session(tenant_id=current_user["tenant_id"]) as session:
        invoice = load_invoice(session, tenant_id=current_user["tenant_id"], invoice_id=invoice_id)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice was not found")
        return invoice


@router.patch("/invoices/defaults")
def update_defaults(
    payload: InvoicePayload,
    current_user: dict[str, Any] = Depends(require_inventory_editor),
) -> dict[str, Any]:
    with db_session(tenant_id=current_user["tenant_id"]) as session:
        update_invoice_defaults(session, tenant_id=current_user["tenant_id"], payload=payload.invoice)
        defaults = invoice_defaults(
            session,
            tenant_id=current_user["tenant_id"],
            tenant_slug=current_user["tenant_slug"],
        )
        return {"defaults": defaults}


@router.post("/invoices/from-proposal")
def create_invoice_from_proposal(
    payload: InvoiceFromProposalPayload,
    current_user: dict[str, Any] = Depends(require_current_user),
) -> dict[str, Any]:
    try:
        with db_session(tenant_id=current_user["tenant_id"]) as session:
            invoice = invoice_from_saved_proposal(
                session,
                tenant_id=current_user["tenant_id"],
                tenant_slug=current_user["tenant_slug"],
                proposal_id=payload.proposal_id,
            )
            return {"invoice": invoice}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/invoices")
def create_invoice(
    payload: InvoicePayload,
    current_user: dict[str, Any] = Depends(require_current_user),
) -> dict[str, Any]:
    with db_session(tenant_id=current_user["tenant_id"]) as session:
        return save_invoice(
            session,
            tenant_id=current_user["tenant_id"],
            user_id=current_user["id"],
            invoice=payload.invoice,
        )


@router.post("/invoices/render", response_class=Response)
def render_invoice(
    payload: InvoicePayload,
    current_user: dict[str, Any] = Depends(require_current_user),
) -> Response:
    html = render_invoice_html(payload.invoice, current_user["tenant_id"])
    return Response(content=html, media_type="text/html")


@router.post("/invoices/pdf")
async def generate_invoice_pdf(
    payload: InvoicePayload,
    current_user: dict[str, Any] = Depends(require_current_user),
) -> Response:
    try:
        html = render_invoice_html(payload.invoice, current_user["tenant_id"])
        pdf_bytes = await html_to_pdf(html)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    filename = payload.invoice.get("invoiceNumber") or "invoice"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
    )
