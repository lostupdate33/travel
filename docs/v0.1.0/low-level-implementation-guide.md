# Low-Level Implementation Guide

Version: `v0.1.0`

This document explains how the current codebase works at a level useful for making your own improvements.

Read this after the design document if you want to understand where data moves, which files own which behavior, and how to change the app without breaking preview or PDF export.

## High-Level Request Flow

When you open the app:

```text
Browser opens http://localhost:3000
  |
  v
frontend/app/page.js runs in the browser
  |
  | fetch GET /api/inventory
  | fetch GET /api/proposals/sample
  v
FastAPI reads backend/data/*.json
  |
  v
Frontend stores inventory + proposal in React state
  |
  v
Frontend POSTs current proposal to /api/proposals/render
  |
  v
Backend renders Jinja template into HTML
  |
  v
Frontend puts returned HTML into iframe preview
```

When you export PDF:

```text
User clicks Export PDF
  |
  v
frontend/app/page.js POSTs current proposal to /api/proposals/pdf
  |
  v
backend/app/main.py receives ProposalPayload
  |
  v
backend/app/services/renderer.py renders HTML
  |
  v
backend/app/services/pdf.py opens Chromium with Playwright
  |
  v
Chromium prints HTML to A4 PDF bytes
  |
  v
FastAPI returns application/pdf
  |
  v
Browser downloads the PDF
```

## Backend Entry Point

File:

```text
backend/app/main.py
```

Responsibilities:

- create the FastAPI app
- enable CORS for the local frontend
- mount static files
- define request models
- expose API endpoints
- connect route handlers to service functions

Important objects:

```python
BASE_DIR = Path(__file__).resolve().parents[1]
app = FastAPI(title="Travel Ideate API", version="0.1.0")
```

`BASE_DIR` resolves to:

```text
backend/
```

This line makes `/static/...` URLs work:

```python
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
```

That is why this image path works in proposal JSON:

```text
/static/images/srinagar.jpg
```

## API Request Model

In `backend/app/main.py`:

```python
class ProposalPayload(BaseModel):
    proposal: dict[str, Any]
    template_id: str = "kashmir-signature"
```

Both render and PDF endpoints accept the same payload:

```json
{
  "proposal": {
    "trip": {},
    "days": []
  },
  "template_id": "kashmir-signature"
}
```

This means the backend does not need to know where the proposal came from. In v0.1.0, it comes from frontend memory. In a future database version, the endpoint could accept an id and load the proposal internally.

## Backend Services

### Inventory Service

File:

```text
backend/app/services/inventory.py
```

This service loads JSON from:

```text
backend/data/kashmir_inventory.json
backend/data/sample_proposal.json
```

Key functions:

```python
load_inventory()
load_sample_proposal()
```

In a database-backed version, this is one of the first modules to replace. The API route can stay mostly the same while the service changes from file reads to database queries.

### Renderer Service

File:

```text
backend/app/services/renderer.py
```

This service owns Jinja2 setup and template rendering.

Important setup:

```python
env = Environment(
    loader=FileSystemLoader(TEMPLATES_DIR),
    autoescape=select_autoescape(["html", "xml"]),
)
```

`TEMPLATES_DIR` points to:

```text
backend/templates/
```

When the template id is `kashmir-signature`, the renderer loads:

```text
backend/templates/proposals/kashmir-signature/template.html
```

This line creates that path:

```python
template_path = f"proposals/{template_id}/template.html"
```

The renderer also injects:

```python
"assetBaseUrl": "http://localhost:8000"
```

The template uses it here:

```html
<base href="{{ proposal.assetBaseUrl }}" />
```

Why this matters:

- the iframe preview needs CSS/images
- Playwright PDF generation needs CSS/images
- relative `/static/...` paths need a server origin

### PDF Service

File:

```text
backend/app/services/pdf.py
```

This service converts rendered HTML into PDF bytes.

Core logic:

```python
async with async_playwright() as playwright:
    browser = await playwright.chromium.launch()
    page = await browser.new_page(viewport={"width": 1440, "height": 1200})
    await page.set_content(html, wait_until="networkidle")
    pdf = await page.pdf(format="A4", print_background=True, margin={...})
```

Important details:

- `print_background=True` is required for cover images, colors, and backgrounds.
- `format="A4"` matches the proposal CSS `@page` rule.
- `wait_until="networkidle"` gives CSS and images time to load.
- v0.1.0 launches a browser per request. This is simple but not optimized for high traffic.

Future improvement:

- create one browser instance at startup
- reuse pages per PDF request
- close the browser on app shutdown

## Frontend Entry Point

File:

```text
frontend/app/page.js
```

This is a client component:

```js
"use client";
```

It must be a client component because it uses:

- `useState`
- `useEffect`
- browser downloads
- iframe preview updates
- form input handlers

## Frontend State

Important state variables:

```js
const [inventory, setInventory] = useState(null);
const [proposal, setProposal] = useState(null);
const [previewHtml, setPreviewHtml] = useState("");
const [activeDay, setActiveDay] = useState(0);
const [isExporting, setIsExporting] = useState(false);
```

Meaning:

- `inventory`: dropdown/master data from backend
- `proposal`: the editable working proposal
- `previewHtml`: backend-rendered template HTML
- `activeDay`: which itinerary day is selected in the editor
- `isExporting`: disables the export button and changes button text

## Initial Data Load

In `frontend/app/page.js`:

```js
useEffect(() => {
  async function load() {
    const [inventoryRes, proposalRes] = await Promise.all([
      fetch(`${API_BASE}/api/inventory`),
      fetch(`${API_BASE}/api/proposals/sample`)
    ]);
    setInventory(await inventoryRes.json());
    setProposal(await proposalRes.json());
  }

  load();
}, []);
```

This runs once when the page opens.

The frontend does not import JSON directly. It always asks the backend. That keeps the architecture close to what we will need when data moves to a database.

## Live Preview Rendering

In `frontend/app/page.js`:

```js
useEffect(() => {
  if (!proposal) return;

  const timeout = setTimeout(async () => {
    const response = await fetch(`${API_BASE}/api/proposals/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposal, template_id: proposal.templateId })
    });
    setPreviewHtml(await response.text());
  }, 180);

  return () => clearTimeout(timeout);
}, [proposal]);
```

This is one of the most important pieces in the app.

It means:

- React owns the form state.
- FastAPI/Jinja owns document rendering.
- The frontend does not duplicate PDF layout logic.
- The preview and PDF use the same template path.

The `180ms` timeout is a basic debounce. Without it, every keystroke would immediately call the backend.

## Iframe Preview

In `frontend/app/page.js`:

```jsx
<iframe title="Proposal preview" srcDoc={previewHtml} />
```

`srcDoc` lets us inject an entire HTML document returned by the backend.

Why iframe instead of rendering template HTML directly in React:

- isolates template CSS from app CSS
- behaves closer to the final PDF document
- allows the proposal to be a complete standalone HTML page

## Updating Proposal State

The proposal object is nested. Example:

```json
{
  "trip": {
    "title": "Kashmir Signature Escape"
  }
}
```

Generic updater:

```js
function updateProposal(path, value) {
  setProposal((current) => {
    const next = clone(current);
    let pointer = next;
    path.slice(0, -1).forEach((key) => {
      pointer = pointer[key];
    });
    pointer[path[path.length - 1]] = value;
    return next;
  });
}
```

Usage:

```jsx
onChange={(event) => updateProposal(["trip", "title"], event.target.value)}
```

Day-specific updater:

```js
function updateDay(index, key, value) {
  setProposal((current) => {
    const next = clone(current);
    next.days[index][key] = value;
    return next;
  });
}
```

Usage:

```jsx
onChange={(event) => updateDay(activeDay, "title", event.target.value)}
```

## Why `clone()` Exists

React state should be treated as immutable. If you mutate the old proposal object directly, React may not re-render reliably.

Current helper:

```js
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
```

This works for v0.1.0 because the proposal contains only JSON-safe values:

- strings
- numbers
- arrays
- plain objects

If future proposal state includes dates as `Date` objects, files, maps, or functions, replace this helper with a more robust approach.

## Hotel Filtering Logic

Hotels are grouped by destination id:

```js
const hotelByDestination = useMemo(() => {
  if (!inventory) return {};
  return inventory.hotels.reduce((groups, hotel) => {
    groups[hotel.destinationId] = groups[hotel.destinationId] || [];
    groups[hotel.destinationId].push(hotel);
    return groups;
  }, {});
}, [inventory]);
```

Then the active day's destination name is matched to an inventory destination:

```js
const selectedDestination = inventory.destinations.find((item) => item.name === day.destination);
const availableHotels = hotelByDestination[selectedDestination?.id] || inventory.hotels;
```

Current limitation:

- proposal days store destination by name
- hotels store destination by id

Future improvement:

- store `destinationId` in each proposal day
- display destination name through inventory lookup
- this will avoid issues if a destination is renamed

## Export PDF Flow In The Frontend

In `frontend/app/page.js`:

```js
async function exportPdf() {
  if (!proposal) return;
  setIsExporting(true);

  const response = await fetch(`${API_BASE}/api/proposals/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposal, template_id: proposal.templateId })
  });

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${proposal.slug || "travel-proposal"}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
  setIsExporting(false);
}
```

This creates a temporary browser URL for the PDF bytes and clicks a temporary link to start download.

Current limitation:

- if PDF export fails, the UI does not show a detailed error
- `setIsExporting(false)` does not run if an exception is thrown

Future improvement:

```js
try {
  // export
} catch (error) {
  // show message
} finally {
  setIsExporting(false);
}
```

## Template HTML

File:

```text
backend/templates/proposals/kashmir-signature/template.html
```

This is a complete HTML document. It is not a React component.

It uses Jinja2 syntax:

```jinja2
{{ proposal.trip.title }}
```

Loops:

```jinja2
{% for day in proposal.days %}
  ...
{% endfor %}
```

Conditionals:

```jinja2
{% if proposal.trip.travelers.children %}
  ...
{% endif %}
```

Number formatting:

```jinja2
{{ "{:,.0f}".format(proposal.pricing.total) }}
```

## Template CSS

File:

```text
backend/static/css/proposals/kashmir-signature.css
```

This CSS controls the `kashmir-signature` proposal document, not the app UI. Other templates have matching CSS files in the same `backend/static/css/proposals/` folder.

Important classes:

- `.cover`: first proposal page
- `.page`: generic full proposal section
- `.intro-grid`: overview layout
- `.day-card`: itinerary item
- `.split`: transport/pricing layout
- `.terms-grid`: inclusions/exclusions layout
- `.closing`: final terms/contact page

Important print rules:

```css
@page {
  size: A4;
  margin: 0;
}
```

```css
.page {
  page-break-after: always;
}
```

```css
.day-card {
  page-break-inside: avoid;
}
```

These rules are what make the HTML behave like a PDF document instead of a normal scrolling page.

## Frontend CSS

File:

```text
frontend/app/globals.css
```

This CSS controls the app shell, editor, and preview frame.

It does not control the proposal PDF.

Important classes:

- `.app-shell`: full app layout
- `.sidebar`: left nav
- `.builder`: main builder area
- `.topbar`: sticky page header
- `.workspace`: editor/preview two-column grid
- `.panel`: form groups
- `.preview-panel`: iframe frame

The separation is intentional:

```text
frontend/app/globals.css
  controls the builder UI

backend/static/css/proposals/*.css
  controls proposal documents/PDFs
```

## Configuration

Frontend API base:

```js
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
```

To use another backend:

```bash
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8001 npm run dev
```

Backend asset base:

```python
os.getenv("ASSET_BASE_URL", "http://localhost:8000")
```

To use another asset host:

```bash
ASSET_BASE_URL=http://127.0.0.1:8001 .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001
```

## How To Add A New Editable Field

Example goal: add `proposal.trip.theme`.

1. Add field to sample proposal:

```json
"trip": {
  "theme": "Luxury honeymoon"
}
```

2. Add input in `frontend/app/page.js`:

```jsx
<label>
  Theme
  <input
    value={proposal.trip.theme}
    onChange={(event) => updateProposal(["trip", "theme"], event.target.value)}
  />
</label>
```

3. Use it in template:

```jinja2
<p>{{ proposal.trip.theme }}</p>
```

4. Verify:

```bash
cd /home/neo/travelIdeate/frontend
npm run build
```

## How To Add A New API Endpoint

Example: add `GET /api/templates`.

1. Add service function or use `load_inventory()`.
2. Add route in `backend/app/main.py`:

```python
@app.get("/api/templates")
def templates() -> list[dict[str, Any]]:
    return load_inventory()["templates"]
```

3. Call it from the frontend:

```js
const response = await fetch(`${API_BASE}/api/templates`);
const templates = await response.json();
```

4. Run backend compile check:

```bash
cd /home/neo/travelIdeate/backend
.venv/bin/python -m compileall app
```

## How To Add A Template Selector

The UI already includes a template selector in `frontend/app/page.js`.

The selector uses `inventory.templates` and writes the selected id into `proposal.templateId`:

```jsx
<label>
  Template
  <select
    value={proposal.templateId}
    onChange={(event) => updateProposal(["templateId"], event.target.value)}
  >
    {inventory.templates.map((template) => (
      <option key={template.id} value={template.id}>
        {template.name}
      </option>
    ))}
  </select>
</label>
```

Preview rendering sends:

```js
template_id: proposal.templateId
```

So the preview switches templates automatically when the user changes the dropdown.

## How To Move From JSON To Database

The simplest migration path:

1. Keep API endpoint shapes stable.
2. Replace file reads in `inventory.py` with database queries.
3. Add new services for proposals, customers, and users.
4. Change `/api/proposals/sample` into real proposal create/load endpoints.
5. Keep the render endpoint accepting a full proposal snapshot until persistence is stable.

Suggested future tables:

- companies
- users
- customers
- destinations
- hotels
- vehicles
- activities
- proposal_templates
- proposals
- proposal_days
- proposal_terms

Important design rule:

Once a proposal is sent to a customer, store a snapshot of selected hotel, vehicle, and activity details. Do not rely only on live inventory references, because inventory can change later.

## Risk Areas

PDF layout:

- long text can overflow
- images can crop poorly
- page breaks can split content
- fixed heights can fail for long itineraries

State updates:

- missing nested fields can break controlled inputs
- direct mutation can prevent re-rendering
- active day index can become invalid after deletion

Assets:

- remote image URLs may fail during PDF export
- local `/static/...` paths need the backend running
- `assetBaseUrl` must match the backend origin

Security:

- current render endpoint accepts arbitrary proposal data
- no authentication exists
- future rich text must be sanitized carefully before rendering

## Verification Checklist For Code Changes

Backend:

```bash
cd /home/neo/travelIdeate/backend
.venv/bin/python -m compileall app
```

Frontend:

```bash
cd /home/neo/travelIdeate/frontend
npm run build
```

Production dependency audit:

```bash
cd /home/neo/travelIdeate/frontend
npm audit --omit=dev
```

Manual checks:

- Open `http://localhost:3000`.
- Edit a trip title.
- Edit an itinerary day.
- Add a day.
- Remove a day.
- Change vehicle.
- Recalculate total.
- Confirm live preview updates.
- Export PDF.
- Open the downloaded PDF.

## Best Places To Start Improving

Small improvements:

- add export error handling
- recalculate total automatically
- add template selector
- add inclusions/exclusions editor
- add terms editor

Medium improvements:

- create inventory management screens
- add proposal save/load using a database
- add image picker instead of raw URL/path field
- split `frontend/app/page.js` into smaller components

Larger improvements:

- authentication and company accounts
- proposal list and duplicate flow
- customer CRM pipeline
- multi-template system with template settings
- online share link with customer approval
