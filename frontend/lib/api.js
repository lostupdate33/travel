// Empty default means browser requests go to the same origin as the frontend.
// next.config.js rewrites /api/* to the local FastAPI backend.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

const SESSION_CHECK_TIMEOUT_MS = 5000;

const JSON_HEADERS = { "Content-Type": "application/json" };

function proposalWithBrowserAssetBase(proposal) {
  return {
    ...proposal,
    assetBaseUrl: globalThis.location?.origin || proposal.assetBaseUrl
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = SESSION_CHECK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseError(response, fallback) {
  const error = await response.json().catch(() => ({}));
  return new Error(error.detail || fallback);
}

async function apiFetch(path, options = {}, fallback = "Request failed") {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body instanceof FormData ? {} : JSON_HEADERS),
      ...(options?.headers || {})
    }
  });

  if (!response.ok) {
    throw await parseError(response, fallback);
  }

  return response;
}

async function apiJson(path, options = {}, fallback = "Request failed") {
  const response = await apiFetch(path, options, fallback);
  return response.json();
}

export async function fetchBuilderData() {
  const [inventoryRes, proposalRes] = await Promise.all([
    apiFetch("/api/inventory", {}, "Inventory load failed"),
    apiFetch("/api/proposals/sample", {}, "Starter proposal load failed")
  ]);

  return {
    inventory: await inventoryRes.json(),
    proposal: await proposalRes.json()
  };
}

export async function fetchCurrentUser() {
  const response = await fetchWithTimeout(`${API_BASE}/api/auth/me`, { credentials: "include" });
  if (!response.ok) {
    throw await parseError(response, "Authentication required");
  }
  return response.json();
}

export async function loginRequest(payload) {
  return apiJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  }, "Login failed");
}

export async function logoutRequest() {
  return apiJson("/api/auth/logout", { method: "POST" }, "Logout failed");
}

export async function setupPasswordRequest(payload) {
  return apiJson("/api/auth/setup-password", {
    method: "POST",
    body: JSON.stringify(payload)
  }, "Password setup failed");
}

export async function fetchTeamMembers() {
  return apiJson("/api/admin/users", {}, "Team load failed");
}

export async function fetchOwnerTenants() {
  return apiJson("/api/owner/tenants", {}, "Tenants load failed");
}

export async function renderProposalHtml(proposal, options = {}) {
  const proposalPayload = proposalWithBrowserAssetBase(proposal);
  const response = await apiFetch("/api/proposals/render", {
    method: "POST",
    body: JSON.stringify({ proposal: proposalPayload, template_id: proposal.templateId }),
    signal: options.signal
  }, "Proposal preview failed");

  return response.text();
}

export async function fetchProposalPdf(proposal) {
  const proposalPayload = proposalWithBrowserAssetBase(proposal);
  const response = await apiFetch("/api/proposals/pdf", {
    method: "POST",
    body: JSON.stringify({ proposal: proposalPayload, template_id: proposal.templateId })
  }, "PDF export failed");

  return response.blob();
}

export async function saveProposalSnapshot(proposal, leadId = "") {
  return apiJson("/api/proposals/saved", {
    method: "POST",
    body: JSON.stringify({ proposal, lead_id: leadId })
  }, "Proposal save failed");
}

export async function fetchLeads({ query = "", status = "", assigned = "", dateMode = "start", startDateFrom = "", startDateTo = "", page = 1, pageSize = 20 } = {}) {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (status) params.set("status", status);
  if (assigned) params.set("assigned", assigned);
  if (dateMode) params.set("date_field", dateMode);
  if (startDateFrom) params.set("start_date_from", startDateFrom);
  if (startDateTo) params.set("start_date_to", startDateTo);
  params.set("page", page);
  params.set("page_size", pageSize);
  return apiJson(`/api/leads?${params}`, {}, "Leads load failed");
}

export async function fetchLeadStats() {
  return apiJson("/api/leads/stats", {}, "Lead stats load failed");
}

export async function createLead(payload) {
  return apiJson("/api/leads", {
    method: "POST",
    body: JSON.stringify(payload)
  }, "Lead create failed");
}

export async function updateLead(leadId, payload) {
  return apiJson(`/api/leads/${encodeURIComponent(leadId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  }, "Lead update failed");
}

export async function assignLeadToMe(leadId) {
  return apiJson(`/api/leads/${encodeURIComponent(leadId)}/assign-me`, {
    method: "POST",
    body: JSON.stringify({})
  }, "Lead assignment failed");
}

export async function updateLeadStatus(leadId, status) {
  return apiJson(`/api/leads/${encodeURIComponent(leadId)}/status`, {
    method: "POST",
    body: JSON.stringify({ status })
  }, "Lead status update failed");
}

export async function searchSavedProposals({
  query = "",
  startDateFrom = "",
  startDateTo = "",
  amountMin = "",
  amountMax = "",
  page = 1,
  pageSize = 10
} = {}) {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (startDateFrom) params.set("start_date_from", startDateFrom);
  if (startDateTo) params.set("start_date_to", startDateTo);
  if (amountMin !== "") params.set("amount_min", amountMin);
  if (amountMax !== "") params.set("amount_max", amountMax);
  params.set("page", page);
  params.set("page_size", pageSize);
  const suffix = params.toString() ? `?${params}` : "";
  return apiJson(`/api/proposals/saved${suffix}`, {}, "Proposal search failed");
}

export async function fetchSavedProposal(proposalId) {
  return apiJson(`/api/proposals/saved/${encodeURIComponent(proposalId)}`, {}, "Proposal load failed");
}

function invoiceWithBrowserAssetBase(invoice) {
  return {
    ...invoice,
    assetBaseUrl: globalThis.location?.origin || invoice.assetBaseUrl
  };
}

export async function fetchInvoiceDefaults() {
  return apiJson("/api/invoices/defaults", {}, "Invoice defaults load failed");
}

export async function searchInvoices({
  query = "",
  invoiceDateFrom = "",
  invoiceDateTo = "",
  proposalId = "",
  page = 1,
  pageSize = 10
} = {}) {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (invoiceDateFrom) params.set("invoice_date_from", invoiceDateFrom);
  if (invoiceDateTo) params.set("invoice_date_to", invoiceDateTo);
  if (proposalId) params.set("proposal_id", proposalId);
  params.set("page", page);
  params.set("page_size", pageSize);
  return apiJson(`/api/invoices?${params}`, {}, "Invoice search failed");
}

export async function fetchSavedInvoice(invoiceId) {
  return apiJson(`/api/invoices/${encodeURIComponent(invoiceId)}`, {}, "Invoice load failed");
}

export async function createInvoiceFromProposal(proposalId) {
  return apiJson("/api/invoices/from-proposal", {
    method: "POST",
    body: JSON.stringify({ proposal_id: proposalId })
  }, "Invoice prefill failed");
}

export async function saveInvoiceRecord(invoice) {
  return apiJson("/api/invoices", {
    method: "POST",
    body: JSON.stringify({ invoice: invoiceWithBrowserAssetBase(invoice) })
  }, "Invoice save failed");
}

export async function renderInvoiceHtml(invoice, options = {}) {
  const response = await apiFetch("/api/invoices/render", {
    method: "POST",
    body: JSON.stringify({ invoice: invoiceWithBrowserAssetBase(invoice) }),
    signal: options.signal
  }, "Invoice preview failed");

  return response.text();
}

export async function fetchInvoicePdf(invoice) {
  const response = await apiFetch("/api/invoices/pdf", {
    method: "POST",
    body: JSON.stringify({ invoice: invoiceWithBrowserAssetBase(invoice) })
  }, "Invoice PDF export failed");

  return response.blob();
}

export async function sendJsonRequest(path, options) {
  return apiJson(path, options, "Inventory update failed");
}

export async function uploadImageRequest(path, formData) {
  return apiJson(path, {
    method: "POST",
    body: formData
  }, "Image upload failed");
}
