"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Car,
  Download,
  Hotel,
  Image as ImageIcon,
  IndianRupee,
  MapPin,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2
} from "lucide-react";

// The frontend is intentionally API-driven even in the MVP. In production this
// can point to a deployed FastAPI host through NEXT_PUBLIC_API_BASE.
// Empty default means browser requests go to the same origin as the frontend.
// next.config.js rewrites /api/* to the local FastAPI backend, which makes
// temporary public tunnels work without exposing a second backend URL.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

function currency(value) {
  // Keep all visible proposal prices in Indian numbering format.
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function clone(value) {
  // The proposal object is plain JSON. Deep-cloning this way is sufficient for
  // the current nested object/array shape and keeps state updates immutable.
  return JSON.parse(JSON.stringify(value));
}

export default function Home() {
  // inventory is the Kashmir master data used by dropdowns.
  const [inventory, setInventory] = useState(null);

  // proposal is the editable working copy. v0.1.0 keeps it in browser memory;
  // a later version should persist it through backend save endpoints.
  const [proposal, setProposal] = useState(null);

  // previewHtml is the server-rendered Jinja output shown inside the iframe.
  const [previewHtml, setPreviewHtml] = useState("");
  const [activeDay, setActiveDay] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    async function load() {
      // Load inventory and the editable sample proposal in parallel to reduce
      // startup latency for the builder screen.
      const [inventoryRes, proposalRes] = await Promise.all([
        fetch(`${API_BASE}/api/inventory`),
        fetch(`${API_BASE}/api/proposals/sample`)
      ]);
      setInventory(await inventoryRes.json());
      setProposal(await proposalRes.json());
    }

    load();
  }, []);

  useEffect(() => {
    if (!proposal) return;

    // Render through the backend instead of duplicating template logic in React.
    // The short debounce prevents one render request per keystroke burst.
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

  const hotelByDestination = useMemo(() => {
    if (!inventory) return {};

    // Group hotels by destination id so the active day only shows relevant
    // hotel choices after a destination is selected.
    return inventory.hotels.reduce((groups, hotel) => {
      groups[hotel.destinationId] = groups[hotel.destinationId] || [];
      groups[hotel.destinationId].push(hotel);
      return groups;
    }, {});
  }, [inventory]);

  function updateProposal(path, value) {
    // Generic nested updater for top-level proposal sections like trip,
    // customer, pricing, and vehicle.
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

  function updateDay(index, key, value) {
    // Day updates are common enough to keep separate from the generic path
    // updater. This keeps itinerary field handlers readable.
    setProposal((current) => {
      const next = clone(current);
      next.days[index][key] = value;
      return next;
    });
  }

  function addDay() {
    // New days inherit the previous day's image/date shape so users do not start
    // from a completely blank object.
    setProposal((current) => {
      const next = clone(current);
      const last = next.days[next.days.length - 1];
      next.days.push({
        ...last,
        dayNumber: next.days.length + 1,
        date: last.date,
        title: "New Kashmir Experience",
        summary: "Add the day plan, transfers, sightseeing, meals, and hotel details.",
        activities: ["Custom sightseeing"],
        hotelName: "To be confirmed"
      });
      setActiveDay(next.days.length - 1);
      return next;
    });
  }

  function removeDay(index) {
    // Day numbers are display values, so re-number them after deletion.
    setProposal((current) => {
      const next = clone(current);
      next.days.splice(index, 1);
      next.days = next.days.map((day, dayIndex) => ({ ...day, dayNumber: dayIndex + 1 }));
      setActiveDay(Math.max(0, index - 1));
      return next;
    });
  }

  async function exportPdf() {
    if (!proposal) return;
    setIsExporting(true);

    // Send the current in-memory proposal snapshot to the backend. The backend
    // renders the same template used by the preview, then returns PDF bytes.
    const response = await fetch(`${API_BASE}/api/proposals/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposal, template_id: proposal.templateId })
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    // Trigger a normal browser download without navigating away from the app.
    link.href = url;
    link.download = `${proposal.slug || "travel-proposal"}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    setIsExporting(false);
  }

  if (!inventory || !proposal) {
    return <div className="loading">Loading Kashmir proposal builder...</div>;
  }

  const day = proposal.days[activeDay];
  const activeTemplate = inventory.templates.find((template) => template.id === proposal.templateId) || inventory.templates[0];
  const selectedDestination = inventory.destinations.find((item) => item.name === day.destination);

  // If a destination cannot be matched, show all hotels rather than leaving the
  // hotel select empty. This is useful while users manually edit JSON/data.
  const availableHotels = hotelByDestination[selectedDestination?.id] || inventory.hotels;

  return (
    <main className="app-shell">
      {/* Left navigation is a product placeholder in v0.1.0. Only Proposal is active. */}
      <aside className="sidebar">
        <div className="logo">
          <Sparkles size={22} />
          <div>
            <strong>Travel Ideate</strong>
            <span>Kashmir proposals</span>
          </div>
        </div>

        <nav>
          <a className="active">Proposal</a>
          <a>Inventory</a>
          <a>Templates</a>
          <a>Customers</a>
        </nav>

        <div className="template-card">
          <span>Active template</span>
          <strong>{activeTemplate.name}</strong>
          <p>{activeTemplate.description}</p>
        </div>
      </aside>

      <section className="builder">
        {/* Sticky header keeps export available while editing long itineraries. */}
        <header className="topbar">
          <div>
            <p>Proposal Builder</p>
            <h1>{proposal.trip.title}</h1>
          </div>
          <button className="primary-button" onClick={exportPdf} disabled={isExporting}>
            {isExporting ? <RefreshCw size={18} /> : <Download size={18} />}
            {isExporting ? "Exporting" : "Export PDF"}
          </button>
        </header>

        <div className="workspace">
          {/* Editor column: structured data entry. Users do not edit template HTML. */}
          <section className="editor">
            <div className="panel">
              {/* Trip basics map to proposal.trip and proposal.customer. */}
              <div className="panel-title">
                <MapPin size={18} />
                <h2>Trip Basics</h2>
              </div>
              <div className="form-grid">
                <label>
                  Template
                  <select value={proposal.templateId} onChange={(event) => updateProposal(["templateId"], event.target.value)}>
                    {inventory.templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Trip title
                  <input value={proposal.trip.title} onChange={(event) => updateProposal(["trip", "title"], event.target.value)} />
                </label>
                <label>
                  Customer
                  <input value={proposal.customer.name} onChange={(event) => updateProposal(["customer", "name"], event.target.value)} />
                </label>
                <label>
                  Duration
                  <input value={proposal.trip.duration} onChange={(event) => updateProposal(["trip", "duration"], event.target.value)} />
                </label>
                <label>
                  Start date
                  <input type="date" value={proposal.trip.startDate} onChange={(event) => updateProposal(["trip", "startDate"], event.target.value)} />
                </label>
                <label>
                  Adults
                  <input
                    type="number"
                    min="1"
                    value={proposal.trip.travelers.adults}
                    onChange={(event) => updateProposal(["trip", "travelers", "adults"], Number(event.target.value))}
                  />
                </label>
                <label>
                  Children
                  <input
                    type="number"
                    min="0"
                    value={proposal.trip.travelers.children}
                    onChange={(event) => updateProposal(["trip", "travelers", "children"], Number(event.target.value))}
                  />
                </label>
              </div>
              <label>
                Subtitle
                <textarea value={proposal.trip.subtitle} onChange={(event) => updateProposal(["trip", "subtitle"], event.target.value)} />
              </label>
            </div>

            <div className="panel">
              {/* Itinerary editor changes one active day at a time. */}
              <div className="panel-title with-action">
                <div>
                  <CalendarDays size={18} />
                  <h2>Itinerary</h2>
                </div>
                <button className="icon-button" onClick={addDay} title="Add day">
                  <Plus size={18} />
                </button>
              </div>

              <div className="day-tabs">
                {proposal.days.map((item, index) => (
                  <button key={item.dayNumber} className={index === activeDay ? "selected" : ""} onClick={() => setActiveDay(index)}>
                    Day {item.dayNumber}
                  </button>
                ))}
              </div>

              <div className="form-grid">
                <label>
                  Destination
                  {/* Destination names are stored on proposal days in v0.1.0. */}
                  <select value={day.destination} onChange={(event) => updateDay(activeDay, "destination", event.target.value)}>
                    {inventory.destinations.map((destination) => (
                      <option key={destination.id}>{destination.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Hotel
                  {/* Hotel options are filtered from inventory by selected destination. */}
                  <select value={day.hotelName} onChange={(event) => updateDay(activeDay, "hotelName", event.target.value)}>
                    <option>To be confirmed</option>
                    <option>Checkout</option>
                    {availableHotels.map((hotel) => (
                      <option key={hotel.id}>{hotel.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Day title
                  <input value={day.title} onChange={(event) => updateDay(activeDay, "title", event.target.value)} />
                </label>
                <label>
                  Meals
                  <input value={day.meals} onChange={(event) => updateDay(activeDay, "meals", event.target.value)} />
                </label>
              </div>

              <label>
                Day summary
                <textarea value={day.summary} onChange={(event) => updateDay(activeDay, "summary", event.target.value)} />
              </label>
              <label>
                Activities, comma separated
                <input value={day.activities.join(", ")} onChange={(event) => updateDay(activeDay, "activities", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} />
              </label>
              <label>
                <span className="inline-label"><ImageIcon size={16} /> Image URL</span>
                <input value={day.image} onChange={(event) => updateDay(activeDay, "image", event.target.value)} />
              </label>

              <button className="danger-button" onClick={() => removeDay(activeDay)} disabled={proposal.days.length === 1}>
                <Trash2 size={16} />
                Remove this day
              </button>
            </div>

            <div className="panel two-column">
              {/* Vehicle and pricing are separate proposal sections rendered later in the PDF. */}
              <div>
                <div className="panel-title">
                  <Car size={18} />
                  <h2>Vehicle</h2>
                </div>
                <select
                  value={proposal.vehicle.name}
                  onChange={(event) => {
                    const vehicle = inventory.vehicles.find((item) => item.name === event.target.value);

                    // Copy the selected vehicle into the proposal snapshot. This
                    // prevents old proposals from changing if inventory changes later.
                    updateProposal(["vehicle"], {
                      name: vehicle.name,
                      capacity: vehicle.capacity,
                      note: `Private ${vehicle.name} with driver for airport transfers, sightseeing, and intercity movement.`
                    });
                  }}
                >
                  {inventory.vehicles.map((vehicle) => (
                    <option key={vehicle.id}>{vehicle.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="panel-title">
                  <IndianRupee size={18} />
                  <h2>Pricing</h2>
                </div>
                <div className="price-inputs">
                  <label>
                    Base
                    <input type="number" value={proposal.pricing.base} onChange={(event) => updateProposal(["pricing", "base"], Number(event.target.value))} />
                  </label>
                  <label>
                    Taxes
                    <input type="number" value={proposal.pricing.taxes} onChange={(event) => updateProposal(["pricing", "taxes"], Number(event.target.value))} />
                  </label>
                  <label>
                    Discount
                    <input type="number" value={proposal.pricing.discount} onChange={(event) => updateProposal(["pricing", "discount"], Number(event.target.value))} />
                  </label>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => updateProposal(["pricing", "total"], proposal.pricing.base + proposal.pricing.taxes - proposal.pricing.discount)}
                >
                  Total INR {currency(proposal.pricing.total)}
                </button>
              </div>
            </div>
          </section>

          {/* Preview column: iframe displays backend-rendered HTML exactly as the PDF sees it. */}
          <section className="preview-panel">
            <div className="preview-header">
              <div>
                <Hotel size={18} />
                <strong>Live Proposal Preview</strong>
              </div>
              <span>A4 HTML template</span>
            </div>
            <iframe title="Proposal preview" srcDoc={previewHtml} />
          </section>
        </div>
      </section>
    </main>
  );
}
