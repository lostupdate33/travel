from pathlib import Path
from typing import Any
import os

from jinja2 import Environment, FileSystemLoader, select_autoescape


BASE_DIR = Path(__file__).resolve().parents[2]
TEMPLATES_DIR = BASE_DIR / "templates"

# One Jinja environment is shared across requests. The loader starts at
# backend/templates, so template ids map to proposals/<template_id>/template.html.
env = Environment(
    loader=FileSystemLoader(TEMPLATES_DIR),
    autoescape=select_autoescape(["html", "xml"]),
)


def render_proposal_html(proposal: dict[str, Any], template_id: str) -> str:
    """Render one proposal snapshot into final HTML.

    The template is responsible only for presentation. The proposal object is
    already structured by the frontend/API contract before it reaches this
    function.
    """

    template_path = f"proposals/{template_id}/template.html"
    template = env.get_template(template_path)

    # Playwright renders the HTML in a browser context, so relative assets need
    # an absolute base URL. The default points at the local FastAPI server.
    view_model = {
        **proposal,
        "assetBaseUrl": proposal.get("assetBaseUrl", os.getenv("ASSET_BASE_URL", "http://localhost:8000")),
    }
    return template.render(proposal=view_model)
