# Creating A New Proposal Template

Version: `v0.1.0`

This guide explains how to add a new PDF proposal template to Travel Ideate.

In this system, a template is not edited by the end user. A developer creates a controlled HTML/CSS template, and the user edits structured proposal data through the frontend.

## Mental Model

```text
proposal JSON
  |
  v
Jinja2 HTML template
  |
  v
rendered HTML
  |
  v
Playwright PDF
```

The template decides presentation. The proposal JSON supplies content.

## Ready-To-Use Templates

This version includes four ready-to-use templates:

- `kashmir-signature`: premium editorial layout with visual day cards.
- `kashmir-luxury`: high-end editorial layout with gold accents and large typography.
- `kashmir-executive`: compact corporate layout with tables and dense trip details.
- `kashmir-family`: warm family-friendly layout with visual cards.

The `kashmir-signature` template uses:

```text
backend/templates/proposals/kashmir-signature/template.html
backend/static/css/proposals/kashmir-signature.css
```

All proposal templates use separate CSS files under:

```text
backend/static/css/proposals/
```

For any new template, use a separate CSS file so future design changes do not affect older templates.

## Recommended Template Folder Structure

For a new template called `kashmir-luxury`, create:

```text
backend/templates/proposals/kashmir-luxury/
  template.html

backend/static/css/proposals/
  kashmir-luxury.css
```

The template id is the folder name under `backend/templates/proposals/`.

## Step 1: Create The Template Folder

```bash
cd /home/neo/travelIdeate/backend
mkdir -p templates/proposals/kashmir-luxury
mkdir -p static/css/proposals
```

## Step 2: Create `template.html`

Start with this minimal template:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <base href="{{ proposal.assetBaseUrl }}" />
    <title>{{ proposal.trip.title }} - Proposal</title>
    <link rel="stylesheet" href="/static/css/proposals/kashmir-luxury.css" />
  </head>
  <body>
    <main class="proposal">
      <section class="cover">
        <p>{{ proposal.company.name }}</p>
        <h1>{{ proposal.trip.title }}</h1>
        <p>{{ proposal.trip.subtitle }}</p>
        <p>Prepared for {{ proposal.customer.name }}</p>
      </section>

      <section class="page">
        <h2>Itinerary</h2>

        {% for day in proposal.days %}
          <article class="day">
            <h3>Day {{ day.dayNumber }}: {{ day.title }}</h3>
            <p>{{ day.destination }}</p>
            <p>{{ day.summary }}</p>

            <ul>
              {% for activity in day.activities %}
                <li>{{ activity }}</li>
              {% endfor %}
            </ul>

            <p>Hotel: {{ day.hotelName }}</p>
            <p>Meals: {{ day.meals }}</p>
          </article>
        {% endfor %}
      </section>
    </main>
  </body>
</html>
```

Important details:

- Keep `<base href="{{ proposal.assetBaseUrl }}" />`.
- Use absolute static paths like `/static/css/proposals/kashmir-luxury.css`.
- Use Jinja expressions like `{{ proposal.trip.title }}` for values.
- Use Jinja loops like `{% for day in proposal.days %}` for repeated sections.

## Step 3: Create The Template CSS

Create:

```text
backend/static/css/proposals/kashmir-luxury.css
```

Example:

```css
:root {
  --ink: #17211f;
  --paper: #fbfaf5;
  --accent: #b8893b;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: Arial, Helvetica, sans-serif;
}

.cover {
  min-height: 100vh;
  padding: 56px;
  display: grid;
  align-content: center;
  page-break-after: always;
}

.cover h1 {
  max-width: 760px;
  font-size: 64px;
  line-height: 1;
}

.page {
  padding: 52px;
  page-break-after: always;
}

.day {
  border-top: 1px solid #d7ddd7;
  padding: 22px 0;
  page-break-inside: avoid;
}

@page {
  size: A4;
  margin: 0;
}
```

PDF rules to remember:

- Use `@page { size: A4; margin: 0; }`.
- Use `page-break-after: always` for major sections.
- Use `page-break-inside: avoid` for day cards, hotel cards, and pricing boxes.
- Keep image sizes explicit with fixed height, `aspect-ratio`, or grid columns.
- Avoid complex browser-only effects that may print poorly.

## Step 4: Register The Template In Inventory

Edit:

```text
backend/data/kashmir_inventory.json
```

Add a new entry inside `templates`:

```json
{
  "id": "kashmir-luxury",
  "name": "Kashmir Luxury",
  "description": "A refined high-end proposal layout for premium Kashmir trips."
}
```

Current frontend behavior still assumes the active template from the sample proposal. This inventory entry is useful preparation for the future template selector.

## Step 5: Use The New Template In The Sample Proposal

Edit:

```text
backend/data/sample_proposal.json
```

Change:

```json
"templateId": "kashmir-signature"
```

to:

```json
"templateId": "kashmir-luxury"
```

When the frontend sends render/export requests, it sends:

```js
{ proposal, template_id: proposal.templateId }
```

So changing `templateId` is enough to test a new template.

## Step 6: Run And Test

Start backend:

```bash
cd /home/neo/travelIdeate/backend
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Start frontend:

```bash
cd /home/neo/travelIdeate/frontend
npm run dev
```

Open:

```text
http://localhost:3000
```

Check:

- The live preview loads.
- Images load.
- Long day summaries do not overlap.
- Activity lists wrap correctly.
- Pricing does not overflow.
- PDF export works.
- PDF page breaks look acceptable.

## Testing A Template Without The Frontend

You can call the render endpoint directly:

```bash
cd /home/neo/travelIdeate/backend
.venv/bin/python -c "import json, urllib.request; p=json.load(open('data/sample_proposal.json')); req=urllib.request.Request('http://127.0.0.1:8000/api/proposals/render', data=json.dumps({'proposal':p,'template_id':p['templateId']}).encode(), headers={'Content-Type':'application/json'}); print(urllib.request.urlopen(req).read(500).decode())"
```

You can test PDF bytes:

```bash
cd /home/neo/travelIdeate/backend
.venv/bin/python -c "import json, urllib.request; p=json.load(open('data/sample_proposal.json')); req=urllib.request.Request('http://127.0.0.1:8000/api/proposals/pdf', data=json.dumps({'proposal':p,'template_id':p['templateId']}).encode(), headers={'Content-Type':'application/json'}); data=urllib.request.urlopen(req).read(); print(len(data), data[:4])"
```

Expected PDF signature:

```text
b'%PDF'
```

## Proposal Fields Available To Templates

Root:

```text
proposal.slug
proposal.templateId
proposal.assetBaseUrl
```

Company:

```text
proposal.company.name
proposal.company.email
proposal.company.phone
```

Customer:

```text
proposal.customer.name
proposal.customer.email
proposal.customer.phone
```

Trip:

```text
proposal.trip.title
proposal.trip.subtitle
proposal.trip.startDate
proposal.trip.duration
proposal.trip.travelers.adults
proposal.trip.travelers.children
proposal.trip.coverImage
```

Vehicle:

```text
proposal.vehicle.name
proposal.vehicle.capacity
proposal.vehicle.note
```

Pricing:

```text
proposal.pricing.currency
proposal.pricing.base
proposal.pricing.taxes
proposal.pricing.discount
proposal.pricing.total
```

Days:

```text
proposal.days
day.dayNumber
day.date
day.title
day.destination
day.summary
day.activities
day.hotelName
day.meals
day.image
```

Text sections:

```text
proposal.inclusions
proposal.exclusions
proposal.terms
```

## Common Jinja Patterns

Display a value:

```jinja2
{{ proposal.customer.name }}
```

Loop over days:

```jinja2
{% for day in proposal.days %}
  <h2>Day {{ day.dayNumber }}: {{ day.title }}</h2>
{% endfor %}
```

Conditional text:

```jinja2
{% if proposal.trip.travelers.children %}
  <span>{{ proposal.trip.travelers.children }} Children</span>
{% endif %}
```

Number formatting:

```jinja2
{{ "{:,.0f}".format(proposal.pricing.total) }}
```

Loop over activities:

```jinja2
{% for activity in day.activities %}
  <span>{{ activity }}</span>
{% endfor %}
```

## Adding New Data Fields

Example: add a `consultantName` to the proposal.

1. Add it to `backend/data/sample_proposal.json`:

```json
"consultant": {
  "name": "Aamir Khan"
}
```

2. Use it in a template:

```jinja2
{{ proposal.consultant.name }}
```

3. If the user should edit it, add an input in:

```text
frontend/app/page.js
```

Example:

```jsx
<input
  value={proposal.consultant.name}
  onChange={(event) => updateProposal(["consultant", "name"], event.target.value)}
/>
```

4. If it should come from inventory, add it to:

```text
backend/data/kashmir_inventory.json
```

## Template Quality Checklist

Before considering a template ready:

- It has a clear cover page.
- It uses real destination or hotel images.
- It has readable type sizes in A4 PDF.
- Long itinerary text does not overlap.
- Day cards do not split awkwardly.
- Pricing is easy to find.
- Inclusions and exclusions are separated.
- Contact details are visible.
- It works with 2-day and 10-day proposals.
- It exports as PDF from the frontend.

## What Not To Do In v0.1.0

- Do not let users edit raw HTML from the frontend.
- Do not hardcode customer-specific content in the template.
- Do not point production templates at remote image URLs if local files are available.
- Do not use one shared CSS file for many templates once designs start diverging.
- Do not make layout depend on exact text length.
