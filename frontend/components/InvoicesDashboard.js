"use client";

import { FileText, Plus, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchSavedInvoice, searchInvoices } from "../lib/api";
import { currency } from "../lib/format";

const DEFAULT_FILTERS = {
  query: "",
  invoiceDateFrom: "",
  invoiceDateTo: "",
  page: 1,
  pageSize: 10
};

export function InvoicesDashboard({ onOpenInvoice, onNewInvoice }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [result, setResult] = useState({ invoices: [], page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [openingId, setOpeningId] = useState("");

  useEffect(() => {
    loadInvoices(filters);
  }, []);

  async function loadInvoices(nextFilters = filters) {
    setIsLoading(true);
    setMessage("");
    try {
      const data = await searchInvoices(nextFilters);
      setResult(data);
      if (!data.invoices?.length) {
        setMessage("No saved invoices matched.");
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
    loadInvoices(nextFilters);
  }

  function changePage(page) {
    const nextFilters = { ...filters, page };
    setFilters(nextFilters);
    loadInvoices(nextFilters);
  }

  async function openInvoice(invoiceId) {
    setOpeningId(invoiceId);
    setMessage("");
    try {
      const data = await fetchSavedInvoice(invoiceId);
      onOpenInvoice(data.invoice, data.savedInvoice);
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
          <h2>Saved Invoices</h2>
        </div>
        <div className="invoice-filter-grid">
          <label>
            Customer or number
            <input value={filters.query} onChange={(event) => updateFilter({ query: event.target.value })} />
          </label>
          <label>
            Date from
            <input type="date" value={filters.invoiceDateFrom} onChange={(event) => updateFilter({ invoiceDateFrom: event.target.value })} />
          </label>
          <label>
            Date to
            <input type="date" value={filters.invoiceDateTo} onChange={(event) => updateFilter({ invoiceDateTo: event.target.value })} />
          </label>
          <button className="primary-button" type="submit" disabled={isLoading}>
            {isLoading ? <RefreshCw size={16} /> : <Search size={16} />}
            {isLoading ? "Searching" : "Search"}
          </button>
        </div>
        <div className="proposal-dashboard-actions">
          <button className="secondary-button" type="button" onClick={onNewInvoice}>
            <Plus size={16} />
            New invoice
          </button>
        </div>
        {message && <p className="status-line">{message}</p>}
      </form>

      <section className="panel proposal-table-panel">
        <div className="proposal-table-header">
          <span>{result.total} saved invoice{result.total === 1 ? "" : "s"}</span>
          <span>Page {result.page} of {result.totalPages}</span>
        </div>
        <div className="invoice-saved-list invoice-dashboard-list">
          {result.invoices.map((invoice) => (
            <article key={invoice.id}>
              <div>
                <strong>{invoice.invoiceNumber}</strong>
                <span>{invoice.customerName} · {invoice.invoiceDate}</span>
              </div>
              <strong>INR {currency(invoice.totalAmount)}</strong>
              <button className="secondary-button" type="button" onClick={() => openInvoice(invoice.id)} disabled={openingId === invoice.id}>
                {openingId === invoice.id ? <RefreshCw size={16} /> : <FileText size={16} />}
                {openingId === invoice.id ? "Opening" : "Open"}
              </button>
            </article>
          ))}
          {!result.invoices.length && <p className="empty-note">No saved invoices found.</p>}
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
