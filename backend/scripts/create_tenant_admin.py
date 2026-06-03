import argparse
import os

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.db.session import DATABASE_URL
from app.services.auth import create_user_setup


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a tenant admin and print a one-time setup link.")
    parser.add_argument("--tenant-slug", required=True)
    parser.add_argument("--tenant-name", required=True)
    parser.add_argument("--admin-name", required=True)
    parser.add_argument("--admin-email", required=True)
    parser.add_argument("--app-url", default=os.getenv("APP_URL", "http://localhost:3000"))
    args = parser.parse_args()

    if not DATABASE_URL:
        raise SystemExit("DATABASE_URL is required")

    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        session.execute(
            text(
                """
                insert into tenants (slug, name)
                values (:slug, :name)
                on conflict (slug) do update
                  set name = excluded.name,
                      updated_at = now()
                """
            ),
            {"slug": args.tenant_slug, "name": args.tenant_name},
        )
        result = create_user_setup(
            session,
            tenant_slug=args.tenant_slug,
            email=args.admin_email,
            name=args.admin_name,
            role="admin",
        )
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

    print("Tenant admin created.")
    print(f"Setup link: {args.app_url.rstrip('/')}/setup-password?token={result['setup_token']}")


if __name__ == "__main__":
    main()
