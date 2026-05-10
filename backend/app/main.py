from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .services.inventory import load_inventory, load_sample_proposal
from .services.renderer import render_proposal_html
from .services.pdf import html_to_pdf


# BASE_DIR points at backend/. All local assets, templates, and JSON fixtures
# are resolved from this directory so commands can be run from any shell cwd.
BASE_DIR = Path(__file__).resolve().parents[1]

# The API version is intentionally aligned with the docs under docs/v0.1.0.
app = FastAPI(title="Travel Ideate API", version="0.1.0")

# The Next.js dev server talks to this API directly from the browser. CORS is
# restricted to the local frontend origins used in this MVP.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# The proposal template uses /static/... for CSS and images. Mounting this here
# also lets Playwright load the same assets when generating the PDF.
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


class ProposalPayload(BaseModel):
    """Shared request body for HTML preview and PDF export.

    The frontend sends the full proposal snapshot on each render/export call.
    In a database-backed version, this payload can either remain a snapshot or
    become a proposal id that the backend loads from storage.
    """

    proposal: dict[str, Any] = Field(..., description="Structured travel proposal data")
    template_id: str = "kashmir-signature"


@app.get("/api/health")
def health() -> dict[str, str]:
    """Small endpoint used to confirm the backend process is reachable."""

    return {"status": "ok"}


@app.get("/api/inventory")
def inventory() -> dict[str, Any]:
    """Return Kashmir master data used by dropdowns in the builder UI."""

    return load_inventory()


@app.get("/api/proposals/sample")
def sample_proposal() -> dict[str, Any]:
    """Return the editable sample proposal loaded when the frontend opens."""

    return load_sample_proposal()


@app.post("/api/proposals/render", response_class=Response)
def render_proposal(payload: ProposalPayload) -> Response:
    """Render proposal JSON into HTML using the selected Jinja2 template."""

    html = render_proposal_html(payload.proposal, payload.template_id)
    return Response(content=html, media_type="text/html")


@app.post("/api/proposals/pdf")
async def generate_pdf(payload: ProposalPayload) -> Response:
    """Render the current proposal and return it as a downloadable PDF."""

    try:
        html = render_proposal_html(payload.proposal, payload.template_id)
        pdf_bytes = await html_to_pdf(html)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # The slug becomes the browser download name. A fallback keeps exports
    # working even if a custom proposal object does not include a slug.
    filename = payload.proposal.get("slug", "travel-proposal")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
    )
