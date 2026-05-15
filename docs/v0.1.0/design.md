# Travel Ideate Design Document

Version: `v0.1.0`

## Purpose

Travel Ideate `v0.1.0` is a Kashmir-focused travel proposal builder. The product goal is to let a travel operator edit structured trip data in a form-based UI and generate a polished PDF proposal from a controlled HTML/CSS template.

The important product decision in this version is that users edit proposal data, not the PDF design directly. The template remains controlled by code so the PDF layout stays professional and predictable.

## Current Stack

- Frontend: Next.js `16.2.6`, React `19`, JavaScript
- Backend: FastAPI `0.115.6`
- Template engine: Jinja2
- PDF engine: Playwright Chromium
- Data storage in this version: local JSON files
- Images in this version: local static files served by FastAPI

## Runtime Architecture

```text
Browser
  |
  | GET inventory/sample proposal
  v
Next.js frontend on localhost:3000
  |
  | REST calls
  v
FastAPI backend on localhost:8000
  |
  | reads local JSON data
  v
backend/data/*.json

FastAPI render/PDF flow:

proposal JSON
  |
  v
Jinja2 template
  |
  v
HTML proposal
  |
  v
Playwright Chromium
  |
  v
PDF download
```

## Source Layout

```text
travelIdeate/
  backend/
    app/
      main.py                  FastAPI app and API routes
      services/
        inventory.py           Loads dummy JSON inventory/proposal data
        renderer.py            Renders Jinja2 proposal templates
        pdf.py                 Converts rendered HTML to PDF
    data/
      kashmir_inventory.json   Kashmir destinations, hotels, vehicles, activities
      sample_proposal.json     Default editable proposal loaded by frontend
    static/
      css/
        proposals/             Per-template proposal PDF stylesheets
      images/
        backgrounds/           Cover/background images
        destinations/          Destination and itinerary images
        hotels/                Hotel inventory images
    templates/
      proposals/
        kashmir-signature/
          template.html        Jinja2 proposal template

  frontend/
    app/
      page.js                  Proposal builder UI and API calls
      globals.css              App shell/editor/preview styling
      layout.js                Next.js root layout
    next.config.js             Next.js runtime config
    package.json               Frontend dependencies and scripts

  docs/
    v0.1.0/
      design.md                This document
      user-manual.md           Run and usage guide
      template-creation-guide.md
                               How to create additional proposal templates
      low-level-implementation-guide.md
                               Code-level guide for improving the MVP
```

## Main Data Concepts

This version does not use a database yet. It uses JSON to establish the shape of the future database-backed model.

Inventory data:

- `destinations`: Kashmir places like Srinagar, Gulmarg, Pahalgam, Sonamarg, with destination image choices
- `hotels`: hotel options mapped to destinations, with hotel image choices
- `vehicles`: vehicle options
- `activities`: reusable activity names
- `templates`: available proposal templates

Proposal data:

- `company`: travel operator details
- `customer`: customer details
- `trip`: title, dates, duration, travelers, cover image
- `vehicle`: selected transport details
- `days`: day-wise itinerary
- `pricing`: base, taxes, discount, total
- `inclusions`, `exclusions`, `terms`: proposal text blocks

## API Endpoints

`GET /api/health`

Returns backend health status.

`GET /api/inventory`

Returns Kashmir inventory data from `backend/data/kashmir_inventory.json`.

`GET /api/proposals/sample`

Returns the sample proposal from `backend/data/sample_proposal.json`.

`POST /api/proposals/render`

Accepts proposal JSON and returns rendered HTML using the selected Jinja2 template.

Request shape:

```json
{
  "proposal": {},
  "template_id": "kashmir-signature"
}
```

`POST /api/proposals/pdf`

Accepts the same payload as render, generates HTML, opens it in Playwright Chromium, and returns a PDF download.

## Frontend Behavior

The frontend loads inventory and sample proposal data on page load.

The user can edit:

- trip title
- customer name
- duration
- start date
- adults and children
- trip subtitle
- day destination
- day hotel
- day title
- meals
- day summary
- activities
- destination and hotel image selections
- vehicle
- price fields

Every time the proposal state changes, the frontend waits briefly and calls `/api/proposals/render`. The returned HTML is injected into an iframe as the live proposal preview.

When the user clicks `Export PDF`, the frontend sends the current proposal state to `/api/proposals/pdf`, receives a PDF blob, and triggers a browser download.

## Template Behavior

The `kashmir-signature` template is a Jinja2 HTML file. It reads the proposal object and outputs:

- cover page
- overview page
- day-wise itinerary cards
- transport and price summary
- inclusions and exclusions
- terms page

Each template has its own CSS file under `backend/static/css/proposals/`. For example, `kashmir-signature` uses `backend/static/css/proposals/kashmir-signature.css`. These files control both the browser preview and the PDF layout, including A4 print sizing through `@page`.

The renderer injects `assetBaseUrl`, defaulting to `http://localhost:8000`, into the proposal view model. This allows relative image and CSS paths like `/static/images/destinations/srinagar/dal-lake.jpg` to resolve correctly inside Playwright.

## Current Limitations

- No authentication yet.
- No database yet.
- Proposals are generated in memory and are not saved.
- Three proposal templates are active: `kashmir-signature`, `kashmir-luxury`, and `kashmir-executive`.
- Inventory editing is not implemented yet.
- The frontend stores edits only in browser state for the current session.
- Pricing total is recalculated only when the total button is clicked.
- Destination and hotel images are selected from inventory-backed dropdowns; custom media upload is not implemented yet.

## Planned Iteration Path

1. Add persistent storage with PostgreSQL for tenant inventory.
2. Add inventory CRUD screens for destinations, hotels, vehicles, and activities.
3. Add user/company authentication.
4. Add more proposal templates and template-specific settings.
7. Add template options: logo, colors, section visibility, cover image.
8. Add proposal sharing links and approval status.
