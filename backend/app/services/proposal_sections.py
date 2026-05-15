from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


CHECKLISTS: dict[str, dict[str, Any]] = {
    "kashmir_essentials": {
        "id": "kashmir_essentials",
        "title": "Things to Carry",
        "description": "A practical packing checklist for Kashmir weather, road travel, and day excursions.",
        "groups": [
            {
                "title": "Clothing",
                "items": ["Layered warm wear", "Light jacket or windcheater", "Comfortable day outfits", "Thermals in winter"],
            },
            {
                "title": "Footwear",
                "items": ["Comfortable walking shoes", "Warm socks", "Water-resistant footwear for snow or rain"],
            },
            {
                "title": "Essentials",
                "items": ["Government ID proof", "Personal medicines", "Sunscreen", "Sunglasses", "Reusable water bottle"],
            },
            {
                "title": "Electronics",
                "items": ["Phone charger", "Power bank", "Camera", "Extra memory card if required"],
            },
        ],
    },
    "family_trip": {
        "id": "family_trip",
        "title": "Family Travel Checklist",
        "description": "A simple checklist for families travelling with children or senior guests.",
        "groups": [
            {"title": "Comfort", "items": ["Snacks for drives", "Light blanket", "Motion sickness medicine", "Small day bag"]},
            {"title": "Kids", "items": ["Warm caps and gloves", "Extra clothes", "Favorite snacks", "Basic entertainment for long drives"]},
            {"title": "Documents", "items": ["ID cards", "Hotel confirmation copy", "Emergency contact numbers"]},
        ],
    },
}


CANCELLATION_POLICIES: dict[str, dict[str, Any]] = {
    "standard": {
        "id": "standard",
        "title": "Cancellation Policy",
        "terms": [
            "Booking amount is non-refundable once hotels and services are blocked.",
            "Date changes are subject to hotel and transport availability.",
            "Any cancellation caused by weather, road closure, or force majeure will follow supplier rules.",
        ],
        "charges": [
            {"window": "30+ days before travel", "charge": "20% of package cost"},
            {"window": "15-29 days before travel", "charge": "50% of package cost"},
            {"window": "0-14 days before travel", "charge": "100% of package cost"},
        ],
    },
    "flexible": {
        "id": "flexible",
        "title": "Flexible Cancellation Policy",
        "terms": [
            "Booking amount may be adjusted against a future trip when suppliers permit.",
            "Date changes are handled at actual hotel and transport difference.",
        ],
        "charges": [
            {"window": "15+ days before travel", "charge": "10% of package cost"},
            {"window": "7-14 days before travel", "charge": "35% of package cost"},
            {"window": "0-6 days before travel", "charge": "100% of package cost"},
        ],
    },
}


def section_options() -> dict[str, Any]:
    return {
        "checklists": [
            {"id": item["id"], "title": item["title"], "description": item["description"]}
            for item in CHECKLISTS.values()
        ],
        "cancellationPolicies": [
            {"id": item["id"], "title": item["title"]}
            for item in CANCELLATION_POLICIES.values()
        ],
    }


def load_tenant_sections(session: Session, tenant_slug: str) -> dict[str, Any]:
    tenant = session.execute(
        text("select id from tenants where slug = :slug"),
        {"slug": tenant_slug},
    ).mappings().first()
    if tenant is None:
        return {}

    tenant_id = tenant["id"]
    payment = session.execute(
        text(
            """
            select payment_terms, bank_account_name, bank_account_number, ifsc_code,
                   upi_id, qr_media_asset_id
            from tenant_payment_profiles
            where tenant_id = :tenant_id
            limit 1
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().first()
    contact = session.execute(
        text(
            """
            select contact_name, role_title, phone, whatsapp, email, website,
                   instagram_url, facebook_url, google_maps_url
            from tenant_contact_profiles
            where tenant_id = :tenant_id
            limit 1
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().first()
    reviews = session.execute(
        text(
            """
            select client_name, rating, review_text, source_label
            from tenant_reviews
            where tenant_id = :tenant_id and is_active = true
            order by sort_order, client_name
            limit 6
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().all()

    return {
        "payment": _payment_dict(payment),
        "contact": dict(contact) if contact else {},
        "reviews": [dict(review) for review in reviews],
    }


def enrich_sections(proposal: dict[str, Any], tenant_sections: dict[str, Any]) -> dict[str, Any]:
    selected = proposal.get("selectedSections", {})
    checklist_id = selected.get("checklistId") or "kashmir_essentials"
    cancellation_id = selected.get("cancellationPolicyId") or "standard"

    return {
        "checklist": CHECKLISTS.get(checklist_id, CHECKLISTS["kashmir_essentials"]),
        "cancellationPolicy": CANCELLATION_POLICIES.get(cancellation_id, CANCELLATION_POLICIES["standard"]),
        "payment": tenant_sections.get("payment") or {},
        "contact": tenant_sections.get("contact") or {},
        "reviews": tenant_sections.get("reviews") or [],
        "remarks": [item for item in proposal.get("remarks", []) if item],
        "showChecklist": selected.get("showChecklist", True),
        "showReviews": selected.get("showReviews", True),
        "showRemarks": selected.get("showRemarks", False),
    }


def _payment_dict(payment: Any) -> dict[str, Any]:
    if not payment:
        return {}
    item = dict(payment)
    qr_media_asset_id = item.pop("qr_media_asset_id", None)
    item["qrUrl"] = f"/api/media/{qr_media_asset_id}" if qr_media_asset_id else ""
    return item
