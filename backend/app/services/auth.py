import base64
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


SESSION_COOKIE_NAME = "travel_ideate_session"
SESSION_DAYS = 14
SETUP_TOKEN_HOURS = 72
PASSWORD_ITERATIONS = 390_000
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ROLES = {"admin", "editor", "viewer"}


def normalize_email(email: str) -> str:
    value = (email or "").strip().lower()
    if not EMAIL_PATTERN.match(value):
        raise ValueError("Enter a valid email address")
    return value


def validate_password(password: str) -> None:
    value = password or ""
    if len(value) < 12:
        raise ValueError("Password must be at least 12 characters")
    if value.lower() == value or value.upper() == value:
        raise ValueError("Password must mix upper and lower case")
    if not any(char.isdigit() for char in value):
        raise ValueError("Password must include at least one number")


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _unb64(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def hash_password(password: str) -> str:
    validate_password(password)
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        algorithm, iterations, salt, expected = password_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), _unb64(salt), int(iterations))
        return hmac.compare_digest(_b64(digest), expected)
    except Exception:
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_setup_token(session: Session, user_id: str, created_by_user_id: str | None = None) -> str:
    raw_token = new_token()
    session.execute(
        text(
            """
            insert into password_setup_tokens (user_id, token_hash, expires_at, created_by_user_id)
            values (:user_id, :token_hash, now() + (:hours * interval '1 hour'), :created_by_user_id)
            """
        ),
        {
            "user_id": user_id,
            "token_hash": token_hash(raw_token),
            "hours": SETUP_TOKEN_HOURS,
            "created_by_user_id": created_by_user_id,
        },
    )
    return raw_token


def create_or_update_user(session: Session, *, email: str, name: str, is_platform_owner: bool | None = None) -> str:
    owner_value = "coalesce(:is_platform_owner, false)"
    owner_update = "users.is_platform_owner"
    if is_platform_owner is not None:
        owner_update = "users.is_platform_owner or excluded.is_platform_owner"
    user = session.execute(
        text(
            f"""
            insert into users (email, name, is_platform_owner, is_active)
            values (:email, :name, {owner_value}, true)
            on conflict (email) do update
              set name = excluded.name,
                  is_active = true,
                  is_platform_owner = {owner_update},
                  updated_at = now()
            returning id
            """
        ),
        {
            "email": normalize_email(email),
            "name": (name or "").strip() or normalize_email(email),
            "is_platform_owner": bool(is_platform_owner),
        },
    ).mappings().first()
    return str(user["id"])


def create_platform_owner(session: Session, *, email: str, name: str, password: str) -> dict[str, Any]:
    user_id = create_or_update_user(session, email=email, name=name, is_platform_owner=True)
    session.execute(
        text(
            """
            update users
            set password_hash = :password_hash,
                is_platform_owner = true,
                is_active = true,
                updated_at = now()
            where id = :user_id
            """
        ),
        {"user_id": user_id, "password_hash": hash_password(password)},
    )
    return {"user_id": user_id}


def create_tenant(session: Session, *, slug: str, name: str, email: str = "", phone: str = "") -> dict[str, Any]:
    tenant_slug = (slug or "").strip().lower()
    if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", tenant_slug):
        raise ValueError("Tenant slug must use lowercase letters, numbers, and hyphens")

    row = session.execute(
        text(
            """
            insert into tenants (slug, name, email, phone)
            values (:slug, :name, :email, :phone)
            on conflict (slug) do update
              set name = excluded.name,
                  email = excluded.email,
                  phone = excluded.phone,
                  updated_at = now()
            returning id
            """
        ),
        {"slug": tenant_slug, "name": name.strip(), "email": email or None, "phone": phone or None},
    ).mappings().first()
    return {"id": str(row["id"]), "slug": tenant_slug, "name": name.strip(), "email": email, "phone": phone}


def create_membership(
    session: Session,
    *,
    tenant_slug: str,
    user_id: str,
    role: str,
    created_by_user_id: str | None = None,
) -> dict[str, Any]:
    if role not in ROLES:
        raise ValueError("Role must be admin, editor, or viewer")

    tenant = session.execute(
        text("select id, slug, name from tenants where slug = :slug"),
        {"slug": tenant_slug},
    ).mappings().first()
    if tenant is None:
        raise ValueError(f"Tenant '{tenant_slug}' was not found")

    session.execute(
        text(
            """
            insert into tenant_memberships (tenant_id, user_id, role, created_by_user_id, is_active)
            values (:tenant_id, :user_id, :role, :created_by_user_id, true)
            on conflict (tenant_id, user_id) do update
              set role = excluded.role,
                  is_active = true,
                  updated_at = now()
            """
        ),
        {
            "tenant_id": tenant["id"],
            "user_id": user_id,
            "role": role,
            "created_by_user_id": created_by_user_id,
        },
    )
    return {"tenant_id": str(tenant["id"]), "tenant_slug": tenant["slug"], "tenant_name": tenant["name"]}


def create_user_setup(
    session: Session,
    *,
    tenant_slug: str,
    email: str,
    name: str,
    role: str,
    created_by_user_id: str | None = None,
) -> dict[str, Any]:
    user_id = create_or_update_user(session, email=email, name=name)
    tenant = create_membership(
        session,
        tenant_slug=tenant_slug,
        user_id=user_id,
        role=role,
        created_by_user_id=created_by_user_id,
    )
    setup_token = create_setup_token(session, user_id, created_by_user_id)
    return {"user_id": user_id, "setup_token": setup_token, **tenant}


def set_password_from_token(session: Session, *, setup_token: str, password: str) -> dict[str, Any]:
    row = session.execute(
        text(
            """
            select pst.id, pst.user_id, u.email, u.name
            from password_setup_tokens pst
            join users u on u.id = pst.user_id
            where pst.token_hash = :token_hash
              and pst.used_at is null
              and pst.expires_at > now()
              and u.is_active = true
            """
        ),
        {"token_hash": token_hash(setup_token)},
    ).mappings().first()
    if row is None:
        raise ValueError("Setup link is invalid or expired")

    session.execute(
        text(
            """
            update users
            set password_hash = :password_hash,
                updated_at = now()
            where id = :user_id
            """
        ),
        {"user_id": row["user_id"], "password_hash": hash_password(password)},
    )
    session.execute(
        text("update password_setup_tokens set used_at = now() where id = :id"),
        {"id": row["id"]},
    )
    return {"id": str(row["user_id"]), "email": row["email"], "name": row["name"]}


def create_session(session: Session, *, user_id: str, tenant_id: str | None = None) -> str:
    raw_token = new_token()
    session.execute(
        text(
            """
            insert into sessions (user_id, tenant_id, session_hash, expires_at)
            values (:user_id, :tenant_id, :session_hash, :expires_at)
            """
        ),
        {
            "user_id": user_id,
            "tenant_id": tenant_id,
            "session_hash": token_hash(raw_token),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
        },
    )
    return raw_token


def authenticate(session: Session, *, email: str, password: str) -> tuple[str, dict[str, Any]]:
    user = session.execute(
        text(
            """
            select id, email, name, password_hash, is_platform_owner
            from users
            where email = :email and is_active = true
            """
        ),
        {"email": normalize_email(email)},
    ).mappings().first()
    if user is None or not verify_password(password, user["password_hash"]):
        raise ValueError("Email or password is incorrect")

    membership = session.execute(
        text(
            """
            select tm.role, t.id as tenant_id, t.slug as tenant_slug, t.name as tenant_name
            from tenant_memberships tm
            join tenants t on t.id = tm.tenant_id
            where tm.user_id = :user_id and tm.is_active = true
            order by case tm.role when 'admin' then 1 when 'editor' then 2 else 3 end, t.name
            limit 1
            """
        ),
        {"user_id": user["id"]},
    ).mappings().first()
    if membership is None and not user["is_platform_owner"]:
        raise ValueError("No active tenant access is configured for this user")

    session_token = create_session(
        session,
        user_id=str(user["id"]),
        tenant_id=str(membership["tenant_id"]) if membership else None,
    )
    session.execute(text("update users set last_login_at = now() where id = :id"), {"id": user["id"]})
    return session_token, {
        "id": str(user["id"]),
        "email": user["email"],
        "name": user["name"],
        "role": membership["role"] if membership else "owner",
        "tenant_id": str(membership["tenant_id"]) if membership else None,
        "tenant_slug": membership["tenant_slug"] if membership else None,
        "tenant_name": membership["tenant_name"] if membership else "Platform Owner",
        "isPlatformOwner": bool(user["is_platform_owner"]),
    }


def current_user_for_session(session: Session, session_token: str | None) -> dict[str, Any] | None:
    if not session_token:
        return None
    row = session.execute(
        text(
            """
            select s.id as session_id, u.id, u.email, u.name, u.is_platform_owner, tm.role,
                   t.id as tenant_id, t.slug as tenant_slug, t.name as tenant_name
            from sessions s
            join users u on u.id = s.user_id
            left join tenants t on t.id = s.tenant_id
            left join tenant_memberships tm on tm.user_id = u.id and tm.tenant_id = t.id
            where s.session_hash = :session_hash
              and s.expires_at > now()
              and u.is_active = true
              and (u.is_platform_owner = true or tm.is_active = true)
            """
        ),
        {"session_hash": token_hash(session_token)},
    ).mappings().first()
    if row is None:
        return None
    session.execute(text("update sessions set last_seen_at = now() where id = :id"), {"id": row["session_id"]})
    return {
        "id": str(row["id"]),
        "email": row["email"],
        "name": row["name"],
        "role": row["role"] or "owner",
        "tenant_id": str(row["tenant_id"]) if row["tenant_id"] else None,
        "tenant_slug": row["tenant_slug"],
        "tenant_name": row["tenant_name"] or "Platform Owner",
        "isPlatformOwner": bool(row["is_platform_owner"]),
    }


def clear_session(session: Session, session_token: str | None) -> None:
    if not session_token:
        return
    session.execute(text("delete from sessions where session_hash = :session_hash"), {"session_hash": token_hash(session_token)})


def list_tenant_members(session: Session, tenant_id: str) -> list[dict[str, Any]]:
    rows = session.execute(
        text(
            """
            select u.id, u.email, u.name, u.is_active, u.last_login_at, tm.role, tm.is_active as membership_active,
                   exists (
                     select 1 from password_setup_tokens pst
                     where pst.user_id = u.id and pst.used_at is null and pst.expires_at > now()
                   ) as has_pending_setup
            from tenant_memberships tm
            join users u on u.id = tm.user_id
            where tm.tenant_id = :tenant_id
            order by tm.role, u.name
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().all()
    return [
        {
            "id": str(row["id"]),
            "email": row["email"],
            "name": row["name"],
            "role": row["role"],
            "isActive": bool(row["is_active"] and row["membership_active"]),
            "lastLoginAt": row["last_login_at"].isoformat() if row["last_login_at"] else None,
            "hasPendingSetup": bool(row["has_pending_setup"]),
        }
        for row in rows
    ]


def list_tenants(session: Session) -> list[dict[str, Any]]:
    rows = session.execute(
        text(
            """
            select t.id, t.slug, t.name, t.email, t.phone,
                   count(tm.id) filter (where tm.is_active = true) as member_count
            from tenants t
            left join tenant_memberships tm on tm.tenant_id = t.id
            group by t.id
            order by t.name
            """
        )
    ).mappings().all()
    return [
        {
            "id": str(row["id"]),
            "slug": row["slug"],
            "name": row["name"],
            "email": row["email"] or "",
            "phone": row["phone"] or "",
            "memberCount": int(row["member_count"] or 0),
        }
        for row in rows
    ]


def deactivate_member(session: Session, *, tenant_id: str, user_id: str) -> None:
    session.execute(
        text(
            """
            update tenant_memberships
            set is_active = false,
                updated_at = now()
            where tenant_id = :tenant_id and user_id = :user_id
            """
        ),
        {"tenant_id": tenant_id, "user_id": user_id},
    )
