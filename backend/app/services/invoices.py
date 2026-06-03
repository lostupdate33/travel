from copy import deepcopy
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any
import json
import math
import os
import re
import time

from sqlalchemy import text
from sqlalchemy.orm import Session

from .media_access import MEDIA_ACCESS_TTL_SECONDS, signed_media_url
from .proposal_sections import load_tenant_sections
from .saved_proposals import load_saved_proposal

BASE_DIR = Path(__file__).resolve().parents[2]
TEMPLATES_DIR = BASE_DIR / "templates"


def money(value: Any) -> float:
    return float(Decimal(str(value or 0)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def financial_year(value: date) -> str:
    start_year = value.year if value.month >= 4 else value.year - 1
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def invoice_defaults(session: Session, *, tenant_id: str, tenant_slug: str) -> dict[str, Any]:
    tenant = session.execute(
        text(
            """
            select name, email, phone, logo_url, legal_name, billing_address, gstin,
                   state_name, state_code, invoice_prefix, default_sac,
                   default_tax_percent, signature_label
            from tenants
            where id = :tenant_id
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().one()
    sections = load_tenant_sections(session, tenant_slug)
    payment = sections.get("payment") or {}
    contact = sections.get("contact") or {}

    return {
        "supplier": {
            "name": tenant["legal_name"] or tenant["name"],
            "tradeName": tenant["name"],
            "email": tenant["email"] or contact.get("email", ""),
            "phone": tenant["phone"] or contact.get("phone", ""),
            "address": tenant["billing_address"] or "",
            "gstin": tenant["gstin"] or "",
            "stateName": tenant["state_name"] or "Jammu and Kashmir",
            "stateCode": tenant["state_code"] or "01",
            "logoUrl": tenant["logo_url"] or "/static/images/valleycraft-logo.svg",
            "signatureLabel": tenant["signature_label"] or f"For {tenant['legal_name'] or tenant['name']}",
        },
        "payment": payment,
        "invoice": {
            "currency": "INR",
            "prefix": tenant["invoice_prefix"] or "INV",
            "defaultSac": tenant["default_sac"] or "998555",
            "defaultTaxPercent": float(tenant["default_tax_percent"] or 5),
            "reverseCharge": "No",
        },
    }


def update_invoice_defaults(session: Session, *, tenant_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    supplier = payload.get("supplier") or {}
    invoice = payload.get("invoice") or {}
    session.execute(
        text(
            """
            update tenants
            set legal_name = :legal_name,
                billing_address = :billing_address,
                gstin = :gstin,
                state_name = :state_name,
                state_code = :state_code,
                logo_url = :logo_url,
                invoice_prefix = :invoice_prefix,
                default_sac = :default_sac,
                default_tax_percent = :default_tax_percent,
                signature_label = :signature_label,
                updated_at = now()
            where id = :tenant_id
            """
        ),
        {
            "tenant_id": tenant_id,
            "legal_name": supplier.get("name") or None,
            "billing_address": supplier.get("address") or None,
            "gstin": supplier.get("gstin") or None,
            "state_name": supplier.get("stateName") or None,
            "state_code": supplier.get("stateCode") or None,
            "logo_url": supplier.get("logoUrl") or None,
            "invoice_prefix": invoice.get("prefix") or "INV",
            "default_sac": invoice.get("defaultSac") or "998555",
            "default_tax_percent": invoice.get("defaultTaxPercent") or 5,
            "signature_label": supplier.get("signatureLabel") or None,
        },
    )
    return {"ok": True}


def blank_invoice(session: Session, *, tenant_id: str, tenant_slug: str) -> dict[str, Any]:
    defaults = invoice_defaults(session, tenant_id=tenant_id, tenant_slug=tenant_slug)
    today = date.today()
    supplier = defaults["supplier"]
    return normalize_invoice(
        {
            "sourceProposalId": "",
            "invoiceNumber": "",
            "invoicePrefix": defaults["invoice"]["prefix"],
            "invoiceDate": today.isoformat(),
            "dueDate": (today + timedelta(days=7)).isoformat(),
            "financialYear": financial_year(today),
            "currency": "INR",
            "reverseCharge": defaults["invoice"]["reverseCharge"],
            "supplier": supplier,
            "customer": {
                "name": "",
                "email": "",
                "phone": "",
                "address": "",
                "gstin": "",
                "stateName": supplier["stateName"],
                "stateCode": supplier["stateCode"],
            },
            "lineItems": [
                {
                    "id": "service-1",
                    "description": "Travel package services",
                    "sac": defaults["invoice"]["defaultSac"],
                    "quantity": 1,
                    "unitPrice": 0,
                    "taxPercent": defaults["invoice"]["defaultTaxPercent"],
                }
            ],
            "payment": defaults["payment"],
            "notes": "Thank you for choosing us for your travel arrangements.",
        }
    )


def invoice_from_saved_proposal(
    session: Session,
    *,
    tenant_id: str,
    tenant_slug: str,
    proposal_id: str,
) -> dict[str, Any]:
    row = load_saved_proposal(session, tenant_id=tenant_id, proposal_id=proposal_id)
    if not row:
        raise ValueError("Saved proposal was not found")

    proposal = dict(row["proposal_json"])
    invoice = blank_invoice(session, tenant_id=tenant_id, tenant_slug=tenant_slug)
    pricing = proposal.get("pricing", {})
    trip = proposal.get("trip", {})
    customer = proposal.get("customer", {})
    total = money(pricing.get("total"))
    tax_percent = float(pricing.get("taxPercent") or invoice["lineItems"][0]["taxPercent"] or 5)
    taxable_value = money(total / (1 + tax_percent / 100)) if tax_percent else total

    invoice.update(
        {
            "sourceProposalId": str(row["id"]),
            "customer": {
                **invoice["customer"],
                "name": customer.get("name", ""),
                "email": customer.get("email", ""),
                "phone": customer.get("phone", ""),
            },
            "lineItems": [
                {
                    "id": "proposal-package",
                    "description": trip.get("title") or row["title"],
                    "sac": invoice["lineItems"][0]["sac"],
                    "quantity": 1,
                    "unitPrice": taxable_value,
                    "taxPercent": tax_percent,
                }
            ],
            "notes": f"Invoice generated from proposal: {trip.get('title') or row['title']}",
        }
    )
    return normalize_invoice(invoice)


def save_invoice(
    session: Session,
    *,
    tenant_id: str,
    user_id: str,
    invoice: dict[str, Any],
) -> dict[str, Any]:
    normalized = normalize_invoice(invoice)
    source_proposal_id = normalized.get("sourceProposalId") or ""
    if source_proposal_id:
        existing = load_invoice_for_proposal(session, tenant_id=tenant_id, proposal_id=source_proposal_id)
        if existing:
            return existing

    invoice_date = date.fromisoformat(normalized["invoiceDate"])
    fy = financial_year(invoice_date)
    invoice_number = normalized.get("invoiceNumber") or _next_invoice_number(
        session,
        tenant_id=tenant_id,
        financial_year_value=fy,
        prefix=(invoice.get("invoicePrefix") or "INV"),
    )
    normalized["invoiceNumber"] = invoice_number
    normalized["financialYear"] = fy

    row = session.execute(
        text(
            """
            insert into invoices (
              tenant_id, created_by_user_id, source_proposal_id, invoice_number,
              financial_year, invoice_date, due_date, customer_name, customer_gstin,
              customer_state_code, taxable_value, cgst_amount, sgst_amount,
              igst_amount, total_amount, invoice_json
            )
            values (
              :tenant_id, :user_id, nullif(:source_proposal_id, '')::uuid, :invoice_number,
              :financial_year, :invoice_date, :due_date, :customer_name, :customer_gstin,
              :customer_state_code, :taxable_value, :cgst_amount, :sgst_amount,
              :igst_amount, :total_amount, cast(:invoice_json as jsonb)
            )
            returning id, invoice_number, financial_year, invoice_date, total_amount, created_at
            """
        ),
        {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "source_proposal_id": source_proposal_id,
            "invoice_number": invoice_number,
            "financial_year": fy,
            "invoice_date": normalized["invoiceDate"],
            "due_date": normalized.get("dueDate") or None,
            "customer_name": normalized["customer"]["name"] or "Unnamed customer",
            "customer_gstin": normalized["customer"].get("gstin", ""),
            "customer_state_code": normalized["customer"].get("stateCode", ""),
            "taxable_value": normalized["totals"]["taxableValue"],
            "cgst_amount": normalized["totals"]["cgst"],
            "sgst_amount": normalized["totals"]["sgst"],
            "igst_amount": normalized["totals"]["igst"],
            "total_amount": normalized["totals"]["grandTotal"],
            "invoice_json": json.dumps(normalized),
        },
    ).mappings().one()

    return {
        "invoice": normalized,
        "savedInvoice": {
            "id": str(row["id"]),
            "invoiceNumber": row["invoice_number"],
            "financialYear": row["financial_year"],
            "invoiceDate": row["invoice_date"].isoformat(),
            "totalAmount": float(row["total_amount"]),
            "createdAt": row["created_at"].isoformat(),
        },
    }


def search_invoices(
    session: Session,
    *,
    tenant_id: str,
    query: str = "",
    invoice_date_from: date | None = None,
    invoice_date_to: date | None = None,
    proposal_id: str = "",
    page: int = 1,
    page_size: int = 10,
) -> dict[str, Any]:
    filters = ["tenant_id = :tenant_id"]
    params: dict[str, Any] = {"tenant_id": tenant_id}
    page = max(1, int(page or 1))
    page_size = min(100, max(1, int(page_size or 10)))

    if query:
        filters.append("(invoice_number ilike :query or customer_name ilike :query)")
        params["query"] = f"%{query.strip()}%"
    if invoice_date_from:
        filters.append("invoice_date >= :invoice_date_from")
        params["invoice_date_from"] = invoice_date_from
    if invoice_date_to:
        filters.append("invoice_date <= :invoice_date_to")
        params["invoice_date_to"] = invoice_date_to
    if proposal_id:
        filters.append("source_proposal_id = :proposal_id")
        params["proposal_id"] = proposal_id

    where_clause = " and ".join(filters)
    total = session.execute(text(f"select count(*) from invoices where {where_clause}"), params).scalar_one()
    params["limit"] = page_size
    params["offset"] = (page - 1) * page_size
    rows = session.execute(
        text(
            f"""
            select id, source_proposal_id, invoice_number, financial_year, invoice_date,
                   due_date, customer_name, customer_gstin, total_amount, created_at
            from invoices
            where {where_clause}
            order by invoice_date desc, created_at desc
            limit :limit offset :offset
            """
        ),
        params,
    ).mappings().all()
    return {
        "invoices": [_invoice_summary(row) for row in rows],
        "page": page,
        "pageSize": page_size,
        "total": int(total),
        "totalPages": max(1, math.ceil(int(total) / page_size)),
    }


def load_invoice(session: Session, *, tenant_id: str, invoice_id: str) -> dict[str, Any] | None:
    row = session.execute(
        text(
            """
            select id, source_proposal_id, invoice_number, financial_year, invoice_date,
                   due_date, customer_name, customer_gstin, total_amount, invoice_json, created_at
            from invoices
            where tenant_id = :tenant_id and id = :invoice_id
            """
        ),
        {"tenant_id": tenant_id, "invoice_id": invoice_id},
    ).mappings().first()
    return _saved_invoice_response(row) if row else None


def load_invoice_for_proposal(session: Session, *, tenant_id: str, proposal_id: str) -> dict[str, Any] | None:
    row = session.execute(
        text(
            """
            select id, source_proposal_id, invoice_number, financial_year, invoice_date,
                   due_date, customer_name, customer_gstin, total_amount, invoice_json, created_at
            from invoices
            where tenant_id = :tenant_id and source_proposal_id = :proposal_id
            order by created_at asc
            limit 1
            """
        ),
        {"tenant_id": tenant_id, "proposal_id": proposal_id},
    ).mappings().first()
    return _saved_invoice_response(row) if row else None


def _saved_invoice_response(row: Any) -> dict[str, Any]:
    return {
        "invoice": dict(row["invoice_json"]),
        "savedInvoice": _invoice_summary(row),
    }


def _invoice_summary(row: Any) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "sourceProposalId": str(row["source_proposal_id"]) if row["source_proposal_id"] else "",
        "invoiceNumber": row["invoice_number"],
        "financialYear": row["financial_year"],
        "invoiceDate": row["invoice_date"].isoformat() if row["invoice_date"] else "",
        "dueDate": row["due_date"].isoformat() if row.get("due_date") else "",
        "customerName": row["customer_name"],
        "customerGstin": row["customer_gstin"] or "",
        "totalAmount": float(row["total_amount"] or 0),
        "createdAt": row["created_at"].isoformat() if row["created_at"] else "",
    }


def normalize_invoice(invoice: dict[str, Any]) -> dict[str, Any]:
    normalized = deepcopy(invoice)
    supplier = normalized.setdefault("supplier", {})
    customer = normalized.setdefault("customer", {})
    line_items = normalized.get("lineItems") or []

    same_state = (supplier.get("stateCode") or "") == (customer.get("stateCode") or "")
    normalized_items = []
    totals = {"taxableValue": 0, "cgst": 0, "sgst": 0, "igst": 0, "grandTotal": 0}
    for index, item in enumerate(line_items):
        quantity = float(item.get("quantity") or 0)
        unit_price = money(item.get("unitPrice"))
        tax_percent = float(item.get("taxPercent") or 0)
        taxable = money(quantity * unit_price)
        tax_total = money(taxable * tax_percent / 100)
        cgst = money(tax_total / 2) if same_state else 0
        sgst = money(tax_total / 2) if same_state else 0
        igst = 0 if same_state else tax_total
        total = money(taxable + cgst + sgst + igst)
        normalized_items.append(
            {
                **item,
                "id": item.get("id") or f"line-{index + 1}",
                "description": item.get("description") or "Travel services",
                "sac": item.get("sac") or "998555",
                "quantity": quantity,
                "unitPrice": unit_price,
                "taxPercent": tax_percent,
                "taxableValue": taxable,
                "cgst": cgst,
                "sgst": sgst,
                "igst": igst,
                "total": total,
            }
        )
        totals["taxableValue"] += taxable
        totals["cgst"] += cgst
        totals["sgst"] += sgst
        totals["igst"] += igst
        totals["grandTotal"] += total

    normalized["lineItems"] = normalized_items
    normalized["totals"] = {key: money(value) for key, value in totals.items()}
    normalized["financialYear"] = financial_year(date.fromisoformat(normalized.get("invoiceDate") or date.today().isoformat()))
    normalized["currency"] = normalized.get("currency") or "INR"
    normalized["reverseCharge"] = normalized.get("reverseCharge") or "No"
    return normalized


def render_invoice_html(invoice: dict[str, Any], tenant_id: str | None = None) -> str:
    from jinja2 import Environment, FileSystemLoader, select_autoescape

    env = Environment(
        loader=FileSystemLoader(TEMPLATES_DIR),
        autoescape=select_autoescape(["html", "xml"]),
    )
    template = env.get_template("invoices/gst-invoice.html")
    view_model = normalize_invoice(invoice)
    expires_at = int(time.time()) + MEDIA_ACCESS_TTL_SECONDS
    if tenant_id:
        supplier = view_model.get("supplier", {})
        payment = view_model.get("payment", {})
        if supplier.get("logoUrl"):
            supplier["logoUrl"] = signed_media_url(supplier["logoUrl"], tenant_id, expires_at)
        if payment.get("qrUrl"):
            payment["qrUrl"] = signed_media_url(payment["qrUrl"], tenant_id, expires_at)
    view_model["assetBaseUrl"] = invoice.get("assetBaseUrl", os.getenv("ASSET_BASE_URL", "http://localhost:8000"))
    return template.render(invoice=view_model)


def _next_invoice_number(
    session: Session,
    *,
    tenant_id: str,
    financial_year_value: str,
    prefix: str,
) -> str:
    session.execute(
        text(
            """
            insert into invoice_counters (tenant_id, financial_year, next_number)
            values (:tenant_id, :financial_year, 1)
            on conflict (tenant_id, financial_year) do nothing
            """
        ),
        {"tenant_id": tenant_id, "financial_year": financial_year_value},
    )
    counter = session.execute(
        text(
            """
            select next_number
            from invoice_counters
            where tenant_id = :tenant_id and financial_year = :financial_year
            for update
            """
        ),
        {"tenant_id": tenant_id, "financial_year": financial_year_value},
    ).scalar_one()
    session.execute(
        text(
            """
            update invoice_counters
            set next_number = next_number + 1
            where tenant_id = :tenant_id and financial_year = :financial_year
            """
        ),
        {"tenant_id": tenant_id, "financial_year": financial_year_value},
    )
    safe_prefix = re.sub(r"[^A-Za-z0-9/-]+", "", prefix or "INV") or "INV"
    return f"{safe_prefix}/{financial_year_value}/{counter:04d}"
