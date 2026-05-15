from fastapi import HTTPException

from app.db.session import is_database_configured


def require_database() -> None:
    if not is_database_configured():
        raise HTTPException(status_code=503, detail="Admin inventory requires DATABASE_URL")
