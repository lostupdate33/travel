from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles


# BASE_DIR points at backend/. All local assets, templates, and JSON fixtures
# are resolved from this directory so commands can be run from any shell cwd.
BASE_DIR = Path(__file__).resolve().parents[1]


def _load_local_env() -> None:
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        clean_line = line.strip()
        if not clean_line or clean_line.startswith("#") or "=" not in clean_line:
            continue
        key, value = clean_line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            import os

            os.environ.setdefault(key, value)


_load_local_env()

from .routers import admin_inventory, auth, invoices, leads, media, owner, proposals, public

# The API version is intentionally aligned with the docs under docs/v0.1.0.
app = FastAPI(title="Travel Ideate API", version="0.1.0")

# The Next.js dev server talks to this API directly from the browser. CORS is
# restricted to the local frontend origins used in this MVP.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Proposal templates still use /static/... for app-owned CSS. Tenant images are
# served from /api/media/{id} after being uploaded into PostgreSQL.
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

app.include_router(auth.router)
app.include_router(owner.router)
app.include_router(public.router)
app.include_router(media.router)
app.include_router(admin_inventory.router)
app.include_router(leads.router)
app.include_router(proposals.router)
app.include_router(invoices.router)
