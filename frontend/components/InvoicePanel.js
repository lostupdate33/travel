"use client";

import { Download, FileText, IndianRupee, Plus, Printer, RefreshCw, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchInvoiceDefaults,
  fetchInvoicePdf,
  renderInvoiceHtml,
  saveInvoiceRecord
} from "../lib/api";
import { openProposalPrintWindow } from "../lib/browserPrint";
import { currency } from "../lib/format";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setNestedValue(source, path, value) {
  const next = clone(source);
  let pointer = next;
  path.slice(0, -1).forEach((key) => {
    pointer[key] = pointer[key] || {};
    pointer = pointer[key];
  });
  pointer[path[path.length - 1]] = value;
  return next;
}

export function InvoicePanel({ initialInvoice = null, initialSavedInvoice = null, onInitialInvoiceConsumed = () => {} }) {
  const [invoice, setInvoice] = useState(initialInvoice);
  const [previewHtml, setPreviewHtml] = useState("");
  const [message, setMessage] = useState("");
  const [savedInvoiceId, setSavedInvoiceId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const consumedInvoiceRef = useRef(null);

  useEffect(() => {
    if (initialInvoice && consumedInvoiceRef.current !== initialInvoice) {
      consumedInvoiceRef.current = initialInvoice;
      setInvoice(initialInvoice);
      setSavedInvoiceId(initialSavedInvoice?.id || "");
      setMessage(initialSavedInvoice ? `Loaded invoice ${initialSavedInvoice.invoiceNumber}.` : "Invoice prefilled from proposal.");
      onInitialInvoiceConsumed();
      return;
    }
    if (invoice) return;

    async function loadDefaults() {
      try {
        const data = await fetchInvoiceDefaults();
        setInvoice(data.invoice);
      } catch (error) {
        setMessage(error.message);
      }
    }

    loadDefaults();
  }, [initialInvoice, initialSavedInvoice, invoice, onInitialInvoiceConsumed]);

  useEffect(() => {
    if (!invoice) return;
    let isCurrent = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const html = await renderInvoiceHtml(invoice, { signal: controller.signal });
        if (isCurrent) setPreviewHtml(html);
      } catch (error) {
        if (error.name === "AbortError") return;
        if (isCurrent) setMessage(error.message);
      }
    }, 500);
    return () => {
      isCurrent = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [invoice]);

  const total = useMemo(() => {
    return (invoice?.lineItems || []).reduce((sum, item) => {
      const taxable = Number(item.quantity || 0) * Number(item.unitPrice || 0);
      return sum + taxable + taxable * Number(item.taxPercent || 0) / 100;
    }, 0);
  }, [invoice]);

  function updateInvoice(path, value) {
    const resetSaved = Boolean(savedInvoiceId);
    if (resetSaved) setSavedInvoiceId("");
    setInvoice((current) => {
      const next = setNestedValue(current, path, value);
      if (resetSaved) next.invoiceNumber = "";
      return next;
    });
  }

  function updateLineItem(index, patch) {
    const resetSaved = Boolean(savedInvoiceId);
    if (resetSaved) setSavedInvoiceId("");
    setInvoice((current) => {
      const next = clone(current);
      next.lineItems[index] = { ...next.lineItems[index], ...patch };
      if (resetSaved) next.invoiceNumber = "";
      return next;
    });
  }

  function addLineItem() {
    const resetSaved = Boolean(savedInvoiceId);
    if (resetSaved) setSavedInvoiceId("");
    setInvoice((current) => {
      const next = clone(current);
      next.lineItems.push({
        id: `manual-${Date.now()}`,
        description: "Travel services",
        sac: next.lineItems[0]?.sac || "998555",
        quantity: 1,
        unitPrice: 0,
        taxPercent: next.lineItems[0]?.taxPercent ?? 5
      });
      if (resetSaved) next.invoiceNumber = "";
      return next;
    });
  }

  function removeLineItem(index) {
    const resetSaved = Boolean(savedInvoiceId);
    if (resetSaved) setSavedInvoiceId("");
    setInvoice((current) => {
      const next = clone(current);
      next.lineItems = next.lineItems.filter((_, itemIndex) => itemIndex !== index);
      if (resetSaved) next.invoiceNumber = "";
      return next;
    });
  }

  async function resetBlankInvoice() {
    setMessage("");
    const data = await fetchInvoiceDefaults();
    setInvoice(data.invoice);
    setSavedInvoiceId("");
  }

  async function saveInvoice() {
    setMessage("");
    setIsSaving(true);
    try {
      const data = await saveInvoiceRecord(invoice);
      setInvoice(data.invoice);
      setSavedInvoiceId(data.savedInvoice.id);
      setMessage(`Invoice ${data.savedInvoice.invoiceNumber} saved.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function exportPdf() {
    setMessage("");
    setIsExporting(true);
    try {
      const blob = await fetchInvoicePdf(invoice);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${invoice.invoiceNumber || "invoice"}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsExporting(false);
    }
  }

  function printInBrowser() {
    if (!previewHtml) {
      setMessage("Invoice preview is still loading.");
      return;
    }
    if (!openProposalPrintWindow({ previewHtml, printTitle: invoice.invoiceNumber || "Invoice" })) {
      setMessage("Browser blocked the print window.");
    }
  }

  if (!invoice) {
    return <div className="loading">Loading invoice workspace...</div>;
  }

  return (
    <div className="invoice-workspace">
      <section className="editor">
        <div className="panel invoice-actions-panel">
          <div className="panel-title">
            <FileText size={18} />
            <h2>Invoice</h2>
          </div>
          <div className="pricing-actions">
            <button className="secondary-button" type="button" onClick={resetBlankInvoice}>
              <Plus size={16} />
              Blank invoice
            </button>
            <button className="primary-button" type="button" onClick={saveInvoice} disabled={isSaving || Boolean(savedInvoiceId)}>
              {isSaving ? <RefreshCw size={16} /> : <Save size={16} />}
              {isSaving ? "Saving" : savedInvoiceId ? "Saved" : "Save invoice"}
            </button>
          </div>
          {message && <p className="status-line">{message}</p>}
        </div>

        <div className="panel">
          <div className="panel-title">
            <FileText size={18} />
            <h2>Invoice Details</h2>
          </div>
          <div className="form-grid">
            <label>
              Invoice number
              <input value={invoice.invoiceNumber || "Assigned on save"} disabled />
            </label>
            <label>
              Invoice date
              <input type="date" value={invoice.invoiceDate} onChange={(event) => updateInvoice(["invoiceDate"], event.target.value)} />
            </label>
            <label>
              Due date
              <input type="date" value={invoice.dueDate || ""} onChange={(event) => updateInvoice(["dueDate"], event.target.value)} />
            </label>
            <label>
              Reverse charge
              <select value={invoice.reverseCharge || "No"} onChange={(event) => updateInvoice(["reverseCharge"], event.target.value)}>
                <option>No</option>
                <option>Yes</option>
              </select>
            </label>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">
            <FileText size={18} />
            <h2>Customer</h2>
          </div>
          <div className="form-grid">
            <label>
              Name
              <input required value={invoice.customer.name} onChange={(event) => updateInvoice(["customer", "name"], event.target.value)} />
            </label>
            <label>
              GSTIN
              <input value={invoice.customer.gstin || ""} onChange={(event) => updateInvoice(["customer", "gstin"], event.target.value)} />
            </label>
            <label>
              State
              <input value={invoice.customer.stateName || ""} onChange={(event) => updateInvoice(["customer", "stateName"], event.target.value)} />
            </label>
            <label>
              State code
              <input value={invoice.customer.stateCode || ""} onChange={(event) => updateInvoice(["customer", "stateCode"], event.target.value)} />
            </label>
          </div>
          <label>
            Billing address
            <textarea value={invoice.customer.address || ""} onChange={(event) => updateInvoice(["customer", "address"], event.target.value)} />
          </label>
        </div>

        <div className="panel">
          <div className="panel-title with-action">
            <div>
              <IndianRupee size={18} />
              <h2>Line Items</h2>
            </div>
            <button className="icon-button" type="button" onClick={addLineItem} title="Add line">
              <Plus size={18} />
            </button>
          </div>
          <div className="invoice-lines">
            {(invoice.lineItems || []).map((item, index) => (
              <div className="invoice-line" key={item.id || index}>
                <input value={item.description} onChange={(event) => updateLineItem(index, { description: event.target.value })} aria-label="Service description" />
                <input value={item.sac} onChange={(event) => updateLineItem(index, { sac: event.target.value })} aria-label="SAC" />
                <input type="number" min="0" value={item.quantity} onChange={(event) => updateLineItem(index, { quantity: Number(event.target.value) })} aria-label="Quantity" />
                <input type="number" min="0" value={item.unitPrice} onChange={(event) => updateLineItem(index, { unitPrice: Number(event.target.value) })} aria-label="Rate" />
                <input type="number" min="0" value={item.taxPercent} onChange={(event) => updateLineItem(index, { taxPercent: Number(event.target.value) })} aria-label="Tax percent" />
                <button className="icon-button" type="button" title="Remove line" onClick={() => removeLineItem(index)} disabled={invoice.lineItems.length === 1}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="pricing-summary">
            <div><span>Estimated total</span><strong>INR {currency(total)}</strong></div>
          </div>
        </div>
      </section>

      <section className="preview-panel">
        <div className="preview-header">
          <div>
            <FileText size={18} />
            <strong>Live Invoice Preview</strong>
          </div>
          <span>A4 GST invoice</span>
        </div>
        <div className="invoice-export-row">
          <button className="primary-button" type="button" onClick={exportPdf} disabled={isExporting}>
            {isExporting ? <RefreshCw size={18} /> : <Download size={18} />}
            {isExporting ? "Exporting" : "Export PDF"}
          </button>
          <button className="secondary-button" type="button" onClick={printInBrowser}>
            <Printer size={18} />
            Print / Save PDF
          </button>
        </div>
        <iframe title="Invoice preview" srcDoc={previewHtml} />
      </section>
    </div>
  );
}
