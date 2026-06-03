from typing import Any

from pydantic import BaseModel, Field


class SavedProposalPayload(BaseModel):
    proposal: dict[str, Any] = Field(..., description="Structured proposal snapshot to save")
    lead_id: str = ""


class InvoicePayload(BaseModel):
    invoice: dict[str, Any] = Field(..., description="Structured invoice data")


class InvoiceFromProposalPayload(BaseModel):
    proposal_id: str
