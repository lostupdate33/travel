# Travel Ideate

A Kashmir-focused travel proposal builder.

Current version: `v0.1.0`

Versioned docs:

- Design document: `docs/v0.1.0/design.md`
- User manual: `docs/v0.1.0/user-manual.md`
- Template creation guide: `docs/v0.1.0/template-creation-guide.md`
- Low-level implementation guide: `docs/v0.1.0/low-level-implementation-guide.md`
- v0.2 architecture proposal: `docs/v0.2.0/architecture.md`
- v0.2 admin panel proposal: `docs/v0.2.0/admin-panel.md`

## Stack

- Frontend: Next.js, React, plain JavaScript
- Backend: FastAPI, Jinja2
- PDF generation: Playwright rendering HTML templates to PDF

## Run Locally

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
uvicorn app.main:app --reload --port 8000
```

Backend with PostgreSQL inventory:

```bash
cd backend
DATABASE_URL='postgresql+psycopg://USER:PASSWORD@127.0.0.1:5432/travel_ideate' \
DEFAULT_TENANT_SLUG='valleycraft' \
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.
