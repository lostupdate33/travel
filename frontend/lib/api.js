// Empty default means browser requests go to the same origin as the frontend.
// next.config.js rewrites /api/* to the local FastAPI backend.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

async function parseError(response, fallback) {
  const error = await response.json().catch(() => ({}));
  return new Error(error.detail || fallback);
}

export async function fetchBuilderData() {
  const [inventoryRes, proposalRes] = await Promise.all([
    fetch(`${API_BASE}/api/inventory`),
    fetch(`${API_BASE}/api/proposals/sample`)
  ]);

  if (!inventoryRes.ok) {
    throw await parseError(inventoryRes, "Inventory load failed");
  }
  if (!proposalRes.ok) {
    throw await parseError(proposalRes, "Starter proposal load failed");
  }

  return {
    inventory: await inventoryRes.json(),
    proposal: await proposalRes.json()
  };
}

export async function renderProposalHtml(proposal) {
  const response = await fetch(`${API_BASE}/api/proposals/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposal, template_id: proposal.templateId })
  });

  if (!response.ok) {
    throw await parseError(response, "Proposal preview failed");
  }

  return response.text();
}

export async function fetchProposalPdf(proposal) {
  const response = await fetch(`${API_BASE}/api/proposals/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposal, template_id: proposal.templateId })
  });

  if (!response.ok) {
    throw await parseError(response, "PDF export failed");
  }

  return response.blob();
}

export async function sendJsonRequest(path, options) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {})
    }
  });

  if (!response.ok) {
    throw await parseError(response, "Inventory update failed");
  }

  return response.json();
}

export async function uploadImageRequest(path, formData) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw await parseError(response, "Image upload failed");
  }

  return response.json();
}
