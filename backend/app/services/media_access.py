import hashlib
import hmac
import os
import time
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


MEDIA_ACCESS_TTL_SECONDS = 15 * 60


def configured_media_secret() -> str | None:
    return os.getenv("PDF_RENDER_SECRET")


def sign_media_access(tenant_id: str, expires_at: int) -> str | None:
    secret = configured_media_secret()
    if not secret:
        return None
    message = f"{tenant_id}:{expires_at}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def valid_media_access_token(tenant_id: str | None, expires_at: int | None, token: str | None) -> bool:
    if not tenant_id or not expires_at or not token:
        return False
    if expires_at < int(time.time()):
        return False

    expected = sign_media_access(tenant_id, expires_at)
    return bool(expected and hmac.compare_digest(expected, token))


def signed_media_url(url: str, tenant_id: str | None, expires_at: int) -> str:
    if not tenant_id or not isinstance(url, str) or not url.startswith("/api/media/"):
        return url

    token = sign_media_access(tenant_id, expires_at)
    if not token:
        return url

    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.update(
        {
            "asset_tenant_id": tenant_id,
            "asset_expires": str(expires_at),
            "asset_token": token,
        }
    )
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def sign_image_record(record: dict[str, Any], tenant_id: str | None, expires_at: int) -> None:
    if record.get("url"):
        record["url"] = signed_media_url(record["url"], tenant_id, expires_at)
