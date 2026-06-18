from pydantic import BaseModel, Field, field_validator

from app.services.auth import normalize_email


class LoginPayload(BaseModel):
    email: str
    password: str = Field(..., min_length=1)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)


class SetupPasswordPayload(BaseModel):
    token: str = Field(..., min_length=16)
    password: str = Field(..., min_length=12)


class CreateMemberPayload(BaseModel):
    name: str = Field(..., min_length=1)
    email: str
    role: str = "editor"

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)


class CreateTenantPayload(BaseModel):
    slug: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    email: str = ""
    phone: str = ""


class CreateTenantAdminPayload(BaseModel):
    name: str = Field(..., min_length=1)
    email: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)


class SetTenantTemplatePayload(BaseModel):
    is_enabled: bool
