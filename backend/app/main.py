from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .routers import admin_inventory, media, proposals, public


# BASE_DIR points at backend/. All local assets, templates, and JSON fixtures
# are resolved from this directory so commands can be run from any shell cwd.
BASE_DIR = Path(__file__).resolve().parents[1]

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

app.include_router(public.router)
app.include_router(media.router)
app.include_router(admin_inventory.router)
app.include_router(proposals.router)
