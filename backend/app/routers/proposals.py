from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response

from app.dependencies import require_current_user
from app.schemas.proposals import ProposalPayload
from app.services.pdf import html_to_pdf
from app.services.renderer import render_proposal_html


router = APIRouter(prefix="/api/proposals", tags=["proposals"])


@router.post("/render", response_class=Response)
def render_proposal(
    payload: ProposalPayload,
    current_user: dict[str, Any] = Depends(require_current_user),
) -> Response:
    html = render_proposal_html(
        payload.proposal,
        payload.template_id,
        current_user["tenant_slug"],
        current_user["tenant_id"],
    )
    return Response(content=html, media_type="text/html")


@router.post("/pdf")
async def generate_pdf(
    payload: ProposalPayload,
    current_user: dict[str, Any] = Depends(require_current_user),
) -> Response:
    try:
        html = render_proposal_html(
            payload.proposal,
            payload.template_id,
            current_user["tenant_slug"],
            current_user["tenant_id"],
        )
        pdf_bytes = await html_to_pdf(html)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    filename = payload.proposal.get("slug", "travel-proposal")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
    )
