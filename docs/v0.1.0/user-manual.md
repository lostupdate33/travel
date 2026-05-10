# Travel Ideate User Manual

Version: `v0.1.0`

## What This Version Does

This version lets you run a local Kashmir travel proposal builder.

You can:

- open a proposal builder UI
- edit a sample Kashmir trip
- choose hotels and vehicles from dummy inventory
- preview the generated proposal live
- export the current proposal as a PDF

This version does not yet save proposals to a database. Refreshing the page reloads the sample proposal.

## Requirements

- Python `3.10+`
- Node.js and npm
- Internet access only for first-time dependency/browser installation

The project already includes the dependencies installed in this workspace, but these commands explain how to set it up again from scratch.

## First-Time Setup

From the project root:

```bash
cd /home/neo/travelIdeate
```

Set up backend:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/playwright install chromium
```

Set up frontend:

```bash
cd ../frontend
npm install
```

## Run The Backend

Open a terminal:

```bash
cd /home/neo/travelIdeate/backend
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Backend URLs:

- API: `http://127.0.0.1:8000`
- API docs: `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/api/health`

## Run The Frontend

Open another terminal:

```bash
cd /home/neo/travelIdeate/frontend
npm run dev
```

Frontend URL:

```text
http://localhost:3000
```

## Using The Proposal Builder

1. Open `http://localhost:3000`.
2. Wait for the Kashmir sample proposal to load.
3. Choose a proposal design from the `Template` dropdown.
4. Edit `Trip Basics`, including adults and children.
5. Use the day tabs to move between itinerary days.
6. Change destination, hotel, meals, day title, summary, activities, or image path.
7. Use the plus button beside `Itinerary` to add a new day.
8. Use `Remove this day` to delete the active day.
9. Select the vehicle in the `Vehicle` section.
10. Update base price, taxes, and discount in the `Pricing` section.
11. Click the total button to recalculate the displayed total.
12. Watch the right-side live preview update.
13. Click `Export PDF` to download the proposal.

## Included Demo Templates

- `Kashmir Signature`: premium editorial proposal.
- `Kashmir Luxury`: high-end visual proposal for premium trips.
- `Kashmir Executive`: compact corporate/table-based proposal.
- `Kashmir Family`: friendly visual proposal for family travel.

## Editing Dummy Data

Inventory data lives here:

```text
/home/neo/travelIdeate/backend/data/kashmir_inventory.json
```

Sample proposal data lives here:

```text
/home/neo/travelIdeate/backend/data/sample_proposal.json
```

After changing either JSON file, refresh the frontend page. If the backend is already running, it reads the JSON files again on each API request.

## Editing The Proposal Template

For a full template creation walkthrough, read:

```text
/home/neo/travelIdeate/docs/v0.1.0/template-creation-guide.md
```

The template HTML lives here:

```text
/home/neo/travelIdeate/backend/templates/proposals/kashmir-signature/template.html
```

The PDF/proposal CSS lives here:

```text
/home/neo/travelIdeate/backend/static/css/proposals/kashmir-signature.css
```

Other proposal template stylesheets live in the same `backend/static/css/proposals/` folder. Change the matching template HTML and CSS files when you want to change a final proposal design.

The frontend form should edit data. The template should control how that data looks.

## Image Assets

Local image files live here:

```text
/home/neo/travelIdeate/backend/static/images
```

The sample proposal uses paths like:

```text
/static/images/srinagar.jpg
```

Using local image paths is recommended because PDF generation can load them reliably through the backend.

## Verification Commands

Backend compile check:

```bash
cd /home/neo/travelIdeate/backend
.venv/bin/python -m compileall app
```

Frontend production build:

```bash
cd /home/neo/travelIdeate/frontend
npm run build
```

Production dependency audit:

```bash
cd /home/neo/travelIdeate/frontend
npm audit --omit=dev
```

## Troubleshooting

If the frontend preview is blank, confirm the backend is running on `http://127.0.0.1:8000`.

If PDF export fails, confirm Playwright Chromium is installed:

```bash
cd /home/neo/travelIdeate/backend
.venv/bin/playwright install chromium
```

If `localhost:3000` is already in use, run the frontend on another port:

```bash
cd /home/neo/travelIdeate/frontend
npm run dev -- -p 3001
```

If `8000` is already in use, run the backend on another port and start the frontend with `NEXT_PUBLIC_API_BASE` pointing to that backend.
