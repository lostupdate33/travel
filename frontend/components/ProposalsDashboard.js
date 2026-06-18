"use client";

import { Eye, FileText, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { createInvoiceFromProposal, fetchSavedProposal, searchSavedProposals } from "../lib/api";
import { currency } from "../lib/format";

const DEFAULT_FILTERS = {
  query: "",
  startDateFrom: "",
  startDateTo: "",
  amountMin: "",
  amountMax: "",
  page: 1,
  pageSize: 10
};

function nonNegativeNumberInput(value) {
  const clean = String(value || "").replace(/[^\d.]/g, "");
  const [integerPart, ...decimalParts] = clean.split(".");
  return decimalParts.length ? `${integerPart}.${decimalParts.join("")}` : integerPart;
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

export function ProposalsDashboard({ onGenerateInvoice, onOpenProposal }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [result, setResult] = useState({ proposals: [], page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [generatingId, setGeneratingId] = useState("");
  const [openingId, setOpeningId] = useState("");

  useEffect(() => {
    loadProposals(filters);
  }, []);

  async function loadProposals(nextFilters = filters) {
    setIsLoading(true);
    setMessage("");
    try {
      const data = await searchSavedProposals(nextFilters);
      setResult(data);
      if (!data.proposals?.length) {
        setMessage("No saved proposals matched.");
      }
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
    loadProposals(nextFilters);
  }

  function changePage(page) {
    const nextFilters = { ...filters, page };
    setFilters(nextFilters);
    loadProposals(nextFilters);
  }

  async function generateInvoice(proposalId) {
    setGeneratingId(proposalId);
    setMessage("");
    try {
      const data = await createInvoiceFromProposal(proposalId);
      onGenerateInvoice(data.invoice);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setGeneratingId("");
    }
  }

  async function openProposal(proposalId) {
    setOpeningId(proposalId);
    setMessage("");
    try {
      const data = await fetchSavedProposal(proposalId);
      onOpenProposal(data.proposal, data.savedProposal);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setOpeningId("");
    }
  }

  return (
    <div className="proposals-dashboard">
      <form className="panel" onSubmit={submitSearch}>
        <div className="panel-title">
          <Search size={18} />
          <h2>Saved Proposals</h2>
        </div>
        <div className="proposal-filter-grid">
          <label>
            Customer or title
            <input value={filters.query} onChange={(event) => updateFilter({ query: event.target.value })} />
          </label>
          <label>
            Start from
            <input type="date" value={filters.startDateFrom} onChange={(event) => updateFilter({ startDateFrom: event.target.value })} />
          </label>
          <label>
            Start to
            <input type="date" value={filters.startDateTo} onChange={(event) => updateFilter({ startDateTo: event.target.value })} />
          </label>
          <label>
            Min amount
            <input type="number" min="0" value={filters.amountMin} onKeyDown={blockInvalidNumberKey} onBeforeInput={blockInvalidNumberInput} onChange={(event) => updateFilter({ amountMin: nonNegativeNumberInput(event.target.value) })} />
          </label>
          <label>
            Max amount
            <input type="number" min="0" value={filters.amountMax} onKeyDown={blockInvalidNumberKey} onBeforeInput={blockInvalidNumberInput} onChange={(event) => updateFilter({ amountMax: nonNegativeNumberInput(event.target.value) })} />
          </label>
        </div>
        <div className="proposal-dashboard-actions">
          <button className="primary-button" type="submit" disabled={isLoading}>
            {isLoading ? <RefreshCw size={16} /> : <Search size={16} />}
            {isLoading ? "Searching" : "Search"}
          </button>
        </div>
        {message && <p className="status-line">{message}</p>}
      </form>

      <section className="panel proposal-table-panel">
        <div className="proposal-table-header">
          <span>{result.total} saved proposal{result.total === 1 ? "" : "s"}</span>
          <span>Page {result.page} of {result.totalPages}</span>
        </div>
        <div className="proposal-table">
          <div className="proposal-table-row proposal-table-head">
            <span>Customer</span>
            <span>Proposal</span>
            <span>Trip</span>
            <span>Route</span>
	            <span>Amount</span>
	            <span>Saved</span>
	            <span>Actions</span>
          </div>
          {result.proposals.map((proposal) => (
            <div className="proposal-table-row" key={proposal.id}>
              <div>
                <strong>{proposal.customerName}</strong>
                <small>{proposal.travelerCount || 0} traveler{proposal.travelerCount === 1 ? "" : "s"}</small>
              </div>
              <div>
                <strong>{proposal.title}</strong>
                <small>{proposal.duration || "No duration"}</small>
              </div>
              <span>{proposal.tripStartDate || "No date"}</span>
              <span>{proposal.destinationsSummary || "Not specified"}</span>
              <strong>INR {currency(proposal.totalAmount)}</strong>
              <span>{proposal.createdAt ? new Date(proposal.createdAt).toLocaleDateString() : ""}</span>
	              <div className="proposal-row-actions">
	                <button className="secondary-button" type="button" onClick={() => openProposal(proposal.id)} disabled={openingId === proposal.id}>
	                  {openingId === proposal.id ? <RefreshCw size={16} /> : <Eye size={16} />}
	                  {openingId === proposal.id ? "Opening" : "Open"}
	                </button>
	                <button className="secondary-button" type="button" onClick={() => generateInvoice(proposal.id)} disabled={generatingId === proposal.id}>
	                  <FileText size={16} />
	                  {generatingId === proposal.id ? "Generating" : "Invoice"}
	                </button>
	              </div>
            </div>
          ))}
        </div>
        <div className="proposal-card-list">
          {result.proposals.map((proposal) => (
            <article className="proposal-card" key={proposal.id}>
              <header>
                <div>
                  <strong>{proposal.customerName}</strong>
                  <span>{proposal.title}</span>
                </div>
                <strong>INR {currency(proposal.totalAmount)}</strong>
              </header>
              <div className="proposal-card-meta">
                <span>{proposal.tripStartDate || "No date"}</span>
                <span>{proposal.duration || "No duration"}</span>
                <span>{proposal.travelerCount || 0} traveler{proposal.travelerCount === 1 ? "" : "s"}</span>
              </div>
              <p>{proposal.destinationsSummary || "Route not specified"}</p>
	              <div className="proposal-row-actions">
	                <button className="secondary-button" type="button" onClick={() => openProposal(proposal.id)} disabled={openingId === proposal.id}>
	                  {openingId === proposal.id ? <RefreshCw size={16} /> : <Eye size={16} />}
	                  {openingId === proposal.id ? "Opening" : "Open"}
	                </button>
	                <button className="secondary-button" type="button" onClick={() => generateInvoice(proposal.id)} disabled={generatingId === proposal.id}>
	                  <FileText size={16} />
	                  {generatingId === proposal.id ? "Generating" : "Generate Invoice"}
	                </button>
	              </div>
            </article>
          ))}
        </div>
        <div className="pagination-row">
          <button className="secondary-button" type="button" onClick={() => changePage(Math.max(1, result.page - 1))} disabled={result.page <= 1 || isLoading}>
            Previous
          </button>
          <button className="secondary-button" type="button" onClick={() => changePage(Math.min(result.totalPages, result.page + 1))} disabled={result.page >= result.totalPages || isLoading}>
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
