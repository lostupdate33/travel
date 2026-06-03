import os
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker


DATABASE_URL = os.getenv("DATABASE_URL")
DEFAULT_TENANT_SLUG = os.getenv("DEFAULT_TENANT_SLUG", "valleycraft")

engine = create_engine(DATABASE_URL, pool_pre_ping=True) if DATABASE_URL else None
SessionLocal = sessionmaker(bind=engine) if engine else None


def is_database_configured() -> bool:
    return engine is not None


@contextmanager
def db_session(tenant_id: str | None = None):
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured")

    session = SessionLocal()
    try:
        effective_tenant_id = tenant_id or os.getenv("DEFAULT_TENANT_ID")
        if effective_tenant_id:
            session.execute(
                text("select set_config('app.tenant_id', :tenant_id, true)"),
                {"tenant_id": effective_tenant_id},
            )
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
