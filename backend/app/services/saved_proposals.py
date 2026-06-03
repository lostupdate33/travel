from datetime import date
from typing import Any
import json
import math

from sqlalchemy import text
from sqlalchemy.orm import Session

from .leads import mark_proposal_sent


def _proposal_metadata(proposal: dict[str, Any]) -> dict[str, Any]:
    trip = proposal.get("trip", {})
    customer = proposal.get("customer", {})
    pricing = proposal.get("pricing", {})
    trip_start = trip.get("startDate") or None
    travelers = trip.get("travelers", {})
    destinations = []
    for day in proposal.get("days", []):
        destination = day.get("destination")
        if destination and destination not in destinations:
            destinations.append(destination)
    return {
        "title": trip.get("title") or proposal.get("slug") or "Untitled proposal",
        "customer_name": customer.get("name") or "Unnamed customer",
        "trip_start_date": trip_start,
        "duration": trip.get("duration") or "",
        "traveler_count": int(travelers.get("adults") or 0) + int(travelers.get("children") or 0),
        "destinations_summary": ", ".join(destinations),
        "total_amount": float(pricing.get("total") or 0),
    }


def save_proposal_snapshot(
    session: Session,
    *,
    tenant_id: str,
    user_id: str,
    proposal: dict[str, Any],
    lead_id: str = "",
) -> dict[str, Any]:
    metadata = _proposal_metadata(proposal)
    row = session.execute(
        text(
            """
            insert into saved_proposals (
              tenant_id, created_by_user_id, lead_id, title, customer_name,
              trip_start_date, duration, traveler_count, destinations_summary,
              total_amount, proposal_json
            )
            values (
              :tenant_id, :user_id, nullif(:lead_id, '')::uuid, :title, :customer_name,
              :trip_start_date, :duration, :traveler_count, :destinations_summary,
              :total_amount, cast(:proposal_json as jsonb)
            )
            returning id, title, customer_name, trip_start_date, duration,
                      traveler_count, destinations_summary, total_amount, created_at
            """
        ),
        {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "lead_id": lead_id,
            **metadata,
            "proposal_json": json.dumps(proposal),
        },
    ).mappings().one()
    mark_proposal_sent(session, tenant_id=tenant_id, lead_id=lead_id)
    return _saved_proposal_summary(row)


def search_saved_proposals(
    session: Session,
    *,
    tenant_id: str,
    query: str = "",
    start_date_from: date | None = None,
    start_date_to: date | None = None,
    amount_min: float | None = None,
    amount_max: float | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    filters = ["tenant_id = :tenant_id"]
    params: dict[str, Any] = {"tenant_id": tenant_id}
    page = max(1, int(page or 1))
    page_size = min(100, max(1, int(page_size or 20)))

    if query:
        filters.append("(title ilike :query or customer_name ilike :query)")
        params["query"] = f"%{query.strip()}%"
    if start_date_from:
        filters.append("trip_start_date >= :start_date_from")
        params["start_date_from"] = start_date_from
    if start_date_to:
        filters.append("trip_start_date <= :start_date_to")
        params["start_date_to"] = start_date_to
    if amount_min is not None:
        filters.append("total_amount >= :amount_min")
        params["amount_min"] = amount_min
    if amount_max is not None:
        filters.append("total_amount <= :amount_max")
        params["amount_max"] = amount_max

    where_clause = " and ".join(filters)
    total = session.execute(
        text(f"select count(*) from saved_proposals where {where_clause}"),
        params,
    ).scalar_one()
    params["limit"] = page_size
    params["offset"] = (page - 1) * page_size
    rows = session.execute(
        text(
            f"""
            select id, title, customer_name, trip_start_date, duration,
                   traveler_count, destinations_summary, total_amount, created_at
            from saved_proposals
            where {where_clause}
            order by created_at desc
            limit :limit offset :offset
            """
        ),
        params,
    ).mappings().all()
    return {
        "proposals": [_saved_proposal_summary(row) for row in rows],
        "page": page,
        "pageSize": page_size,
        "total": int(total),
        "totalPages": max(1, math.ceil(int(total) / page_size)),
    }


def load_saved_proposal(session: Session, *, tenant_id: str, proposal_id: str) -> dict[str, Any] | None:
    row = session.execute(
        text(
            """
            select id, title, customer_name, trip_start_date, duration,
                   traveler_count, destinations_summary, total_amount, proposal_json, created_at
            from saved_proposals
            where tenant_id = :tenant_id and id = :proposal_id
            """
        ),
        {"tenant_id": tenant_id, "proposal_id": proposal_id},
    ).mappings().first()
    return dict(row) if row else None


def saved_proposal_response(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "proposal": dict(row["proposal_json"]),
        "savedProposal": _saved_proposal_summary(row),
    }


def _saved_proposal_summary(row: Any) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "title": row["title"],
        "customerName": row["customer_name"],
        "tripStartDate": row["trip_start_date"].isoformat() if row["trip_start_date"] else "",
        "duration": row["duration"] or "",
        "travelerCount": row["traveler_count"] or 0,
        "destinationsSummary": row["destinations_summary"] or "",
        "totalAmount": float(row["total_amount"] or 0),
        "createdAt": row["created_at"].isoformat() if row["created_at"] else "",
    }
