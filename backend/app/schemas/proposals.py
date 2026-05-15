from typing import Any

from pydantic import BaseModel, Field


class ProposalPayload(BaseModel):
    """Shared request body for HTML preview and PDF export."""

    proposal: dict[str, Any] = Field(..., description="Structured travel proposal data")
    template_id: str = "kashmir-signature"
