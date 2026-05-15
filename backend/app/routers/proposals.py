from fastapi import APIRouter, HTTPException, Response

from app.schemas.proposals import ProposalPayload
from app.services.pdf import html_to_pdf
from app.services.renderer import render_proposal_html


router = APIRouter(prefix="/api/proposals", tags=["proposals"])


@router.post("/render", response_class=Response)
def render_proposal(payload: ProposalPayload) -> Response:
    html = render_proposal_html(payload.proposal, payload.template_id)
    return Response(content=html, media_type="text/html")


@router.post("/pdf")
async def generate_pdf(payload: ProposalPayload) -> Response:
    try:
        html = render_proposal_html(payload.proposal, payload.template_id)
        pdf_bytes = await html_to_pdf(html)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    filename = payload.proposal.get("slug", "travel-proposal")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
    )
