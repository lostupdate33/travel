from datetime import date

from pydantic import BaseModel


class LeadPayload(BaseModel):
    customerName: str
    phone: str = ""
    whatsapp: str = ""
    email: str = ""
    travelerCount: int = 1
    tripType: str = ""
    destinationInterest: str = ""
    expectedStartDate: date | None = None
    expectedEndDate: date | None = None
    budgetMin: float | None = None
    budgetMax: float | None = None
    source: str = ""
    status: str = "new"
    assignedUserId: str = ""
    notes: str = ""


class LeadStatusPayload(BaseModel):
    status: str
