"use client";

import { Check, FileText, Plus, RefreshCw, Search, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { assignLeadToMe, createLead, fetchLeads, updateLeadStatus } from "../lib/api";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "../lib/leadConstants";

const EMPTY_LEAD = {
  customerName: "",
  phone: "",
  whatsapp: "",
  email: "",
  travelerCount: 1,
  tripType: "Family",
  destinationInterest: "Kashmir",
  expectedStartDate: "",
  expectedEndDate: "",
  budgetMin: "",
  budgetMax: "",
  source: "",
  status: "new",
  assignedUserId: "",
  notes: ""
};

const DEFAULT_FILTERS = { query: "", status: "", assigned: "", dateMode: "start", startDateFrom: "", startDateTo: "", page: 1, pageSize: 20 };

function nonNegativeNumberInput(value) {
  const clean = String(value || "").replace(/[^\d.]/g, "");
  const [integerPart, ...decimalParts] = clean.split(".");
  return decimalParts.length ? `${integerPart}.${decimalParts.join("")}` : integerPart;
}

function nonNegativeIntegerInput(value) {
  return String(value || "").replace(/\D/g, "");
}

function blockInvalidNumberKey(event) {
  if (["e", "E", "+", "-"].includes(event.key)) {
    event.preventDefault();
  }
}

function blockInvalidNumberInput(event) {
  const value = event.currentTarget.value || "";
  const text = event.data || "";
  if (!text) return;
  if (!/^\d*\.?\d*$/.test(text) || (text.includes(".") && value.includes("."))) {
    event.preventDefault();
  }
}

function blockInvalidIntegerInput(event) {
  const text = event.data || "";
  if (text && !/^\d+$/.test(text)) {
    event.preventDefault();
  }
}

function leadPayload(form) {
  return {
    ...form,
    expectedStartDate: form.expectedStartDate || null,
    expectedEndDate: form.expectedEndDate || null,
    budgetMin: form.budgetMin === "" ? null : Number(form.budgetMin),
    budgetMax: form.budgetMax === "" ? null : Number(form.budgetMax)
  };
}

export function LeadsDashboard({ initialFilters = {}, onGenerateProposal }) {
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS, ...initialFilters });
  const [result, setResult] = useState({ leads: [], stats: {}, page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [leadForm, setLeadForm] = useState(EMPTY_LEAD);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [draftStatuses, setDraftStatuses] = useState({});
  const [savingStatusId, setSavingStatusId] = useState("");
  const [assigningId, setAssigningId] = useState("");

  useEffect(() => {
    const nextFilters = { ...DEFAULT_FILTERS, ...initialFilters, page: 1 };
    setFilters(nextFilters);
    loadLeads(nextFilters);
  }, [initialFilters]);

  async function loadLeads(nextFilters = filters) {
    setIsLoading(true);
    setMessage("");
    try {
      const data = await fetchLeads(nextFilters);
      setResult(data);
      setDraftStatuses({});
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  function updateFilter(patch) {
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  }

  function submitSearch(event) {
    event.preventDefault();
    const nextFilters = { ...filters, page: 1 };
    setFilters(nextFilters);
    loadLeads(nextFilters);
  }

  async function submitLead(event) {
    event.preventDefault();
    setIsCreating(true);
    setMessage("");
    try {
      await createLead(leadPayload(leadForm));
      setLeadForm(EMPTY_LEAD);
      await loadLeads({ ...filters, page: 1 });
      setMessage("Lead created.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsCreating(false);
    }
  }

  async function assignMe(leadId) {
    setAssigningId(leadId);
    setMessage("");
    try {
      await assignLeadToMe(leadId);
      await loadLeads(filters);
      setMessage("Lead assigned to you.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setAssigningId("");
    }
  }

  async function saveStatus(leadId, status) {
    setSavingStatusId(leadId);
    setMessage("");
    try {
      await updateLeadStatus(leadId, status);
      await loadLeads(filters);
      setMessage("Lead status updated.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingStatusId("");
    }
  }

  function changePage(page) {
    const nextFilters = { ...filters, page };
    setFilters(nextFilters);
    loadLeads(nextFilters);
  }

  return (
    <div className="leads-dashboard">
      <section className="lead-main-grid">
        <form className="panel" onSubmit={submitLead}>
          <div className="panel-title">
            <Plus size={18} />
            <h2>Add Lead</h2>
          </div>
          <div className="form-grid">
            <label>Name<input required value={leadForm.customerName} onChange={(event) => setLeadForm({ ...leadForm, customerName: event.target.value })} /></label>
            <label>Phone<input value={leadForm.phone} onChange={(event) => setLeadForm({ ...leadForm, phone: event.target.value })} /></label>
            <label>Travelers<input type="number" min="1" value={leadForm.travelerCount} onKeyDown={blockInvalidNumberKey} onBeforeInput={blockInvalidIntegerInput} onChange={(event) => setLeadForm({ ...leadForm, travelerCount: nonNegativeIntegerInput(event.target.value) })} /></label>
            <label>Trip type<input value={leadForm.tripType} onChange={(event) => setLeadForm({ ...leadForm, tripType: event.target.value })} /></label>
            <label>Destination<input value={leadForm.destinationInterest} onChange={(event) => setLeadForm({ ...leadForm, destinationInterest: event.target.value })} /></label>
            <label>Source<input value={leadForm.source} onChange={(event) => setLeadForm({ ...leadForm, source: event.target.value })} /></label>
            <label>Start date<input type="date" value={leadForm.expectedStartDate} onChange={(event) => setLeadForm({ ...leadForm, expectedStartDate: event.target.value })} /></label>
            <label>End date<input type="date" value={leadForm.expectedEndDate} onChange={(event) => setLeadForm({ ...leadForm, expectedEndDate: event.target.value })} /></label>
            <label>Budget min<input type="number" min="0" value={leadForm.budgetMin} onKeyDown={blockInvalidNumberKey} onBeforeInput={blockInvalidNumberInput} onChange={(event) => setLeadForm({ ...leadForm, budgetMin: nonNegativeNumberInput(event.target.value) })} /></label>
            <label>Budget max<input type="number" min="0" value={leadForm.budgetMax} onKeyDown={blockInvalidNumberKey} onBeforeInput={blockInvalidNumberInput} onChange={(event) => setLeadForm({ ...leadForm, budgetMax: nonNegativeNumberInput(event.target.value) })} /></label>
          </div>
          <label>Notes<textarea value={leadForm.notes} onChange={(event) => setLeadForm({ ...leadForm, notes: event.target.value })} /></label>
          <button className="primary-button" type="submit" disabled={isCreating}>
            {isCreating ? <RefreshCw size={16} /> : <Plus size={16} />}
            {isCreating ? "Adding" : "Add lead"}
          </button>
        </form>

        <div className="lead-list-panel panel">
          <form className="lead-filters" onSubmit={submitSearch}>
            <label>Search<input value={filters.query} onChange={(event) => updateFilter({ query: event.target.value })} /></label>
            <label>Status<select value={filters.status} onChange={(event) => updateFilter({ status: event.target.value })}>
              <option value="">All statuses</option>
              {LEAD_STATUSES.map((status) => <option key={status} value={status}>{LEAD_STATUS_LABELS[status]}</option>)}
            </select></label>
            <label>Assigned<select value={filters.assigned} onChange={(event) => updateFilter({ assigned: event.target.value })}>
              <option value="">Anyone</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
            </select></label>
            <label>Date<select value={filters.dateMode} onChange={(event) => updateFilter({ dateMode: event.target.value })}>
              <option value="start">Starts</option>
              <option value="end">Ends</option>
            </select></label>
            <label>From<input type="date" value={filters.startDateFrom} onChange={(event) => updateFilter({ startDateFrom: event.target.value })} /></label>
            <label>To<input type="date" value={filters.startDateTo} onChange={(event) => updateFilter({ startDateTo: event.target.value })} /></label>
            <button className="primary-button" type="submit" disabled={isLoading}>
              {isLoading ? <RefreshCw size={16} /> : <Search size={16} />}
              Search
            </button>
          </form>
          {message && <p className="status-line">{message}</p>}
          <div className="lead-card-grid">
            {result.leads.map((lead) => (
              <article className={`lead-card status-${lead.status}`} key={lead.id}>
                <header>
                  <div>
                    <strong>{lead.customerName}</strong>
                    <span>{lead.phone || lead.whatsapp || lead.email || "No contact"}</span>
                  </div>
                  <span className="lead-status-badge">{LEAD_STATUS_LABELS[lead.status] || lead.status}</span>
                </header>
                <div className="lead-status-update">
                  <select
                    value={draftStatuses[lead.id] ?? lead.status}
                    onChange={(event) => setDraftStatuses((current) => ({ ...current, [lead.id]: event.target.value }))}
                  >
                    {LEAD_STATUSES.map((status) => <option key={status} value={status}>{LEAD_STATUS_LABELS[status]}</option>)}
                  </select>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => saveStatus(lead.id, draftStatuses[lead.id] ?? lead.status)}
                    disabled={(draftStatuses[lead.id] ?? lead.status) === lead.status || savingStatusId === lead.id}
                  >
                    {savingStatusId === lead.id ? <RefreshCw size={15} /> : <Check size={15} />}
                    {savingStatusId === lead.id ? "Updating" : "Update status"}
                  </button>
                </div>
                <div className="lead-tags">
                  <span>{lead.destinationInterest || "No destination"}</span>
                  <span>{lead.travelerCount} traveler{lead.travelerCount === 1 ? "" : "s"}</span>
                  <span>{lead.expectedStartDate || "No date"}</span>
                </div>
                <p>{lead.notes || `${lead.tripType || "Trip"} lead from ${lead.source || "unknown source"}.`}</p>
                <div className="lead-owner">
                  <span>{lead.assignedUserName ? `Assigned to ${lead.assignedUserName}` : "Unassigned"}</span>
                  <button className="text-button" type="button" onClick={() => assignMe(lead.id)} disabled={Boolean(assigningId)}>
                    {assigningId === lead.id ? <RefreshCw size={15} /> : <UserCheck size={15} />}
                    {assigningId === lead.id ? "Assigning" : "Assign to me"}
                  </button>
                </div>
                <button className="secondary-button" type="button" onClick={() => onGenerateProposal(lead)}>
                  <FileText size={16} />
                  Generate Proposal
                </button>
              </article>
            ))}
          </div>
          <div className="pagination-row">
            <button className="secondary-button" type="button" onClick={() => changePage(Math.max(1, result.page - 1))} disabled={result.page <= 1 || isLoading}>Previous</button>
            <button className="secondary-button" type="button" onClick={() => changePage(Math.min(result.totalPages, result.page + 1))} disabled={result.page >= result.totalPages || isLoading}>Next</button>
          </div>
        </div>
      </section>
    </div>
  );
}
