import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import DATABASE_URL
from app.services.auth import create_platform_owner


def main() -> None:
    if not DATABASE_URL:
        raise SystemExit("DATABASE_URL is required")

    owner_email = os.getenv("PLATFORM_OWNER_EMAIL")
    owner_name = os.getenv("PLATFORM_OWNER_NAME", "Platform Owner")
    owner_password = os.getenv("PLATFORM_OWNER_PASSWORD")
    if not owner_email or not owner_password:
        raise SystemExit("PLATFORM_OWNER_EMAIL and PLATFORM_OWNER_PASSWORD are required")

    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        create_platform_owner(session, email=owner_email, name=owner_name, password=owner_password)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

    print(f"Platform owner '{owner_email}' is ready.")


if __name__ == "__main__":
    main()
