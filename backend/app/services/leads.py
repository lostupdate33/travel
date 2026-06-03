from datetime import date, timedelta
from typing import Any
import math

from sqlalchemy import text
from sqlalchemy.orm import Session


LEAD_STATUSES = {"new", "contacted", "proposal_sent", "negotiating", "won", "arriving", "completed", "lost"}
DATE_FIELDS = {"start": "l.expected_start_date", "end": "l.expected_end_date"}


def create_lead(session: Session, *, tenant_id: str, user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    item = _normalize_payload(payload)
    row = session.execute(
        text(
            """
            insert into leads (
              tenant_id, created_by_user_id, assigned_user_id, customer_name, phone,
              whatsapp, email, traveler_count, trip_type, destination_interest,
              expected_start_date, expected_end_date, budget_min, budget_max,
              source, status, notes
            )
            values (
              :tenant_id, :user_id, nullif(:assigned_user_id, '')::uuid, :customer_name, :phone,
              :whatsapp, :email, :traveler_count, :trip_type, :destination_interest,
              :expected_start_date, :expected_end_date, :budget_min, :budget_max,
              :source, :status, :notes
            )
            returning *
            """
        ),
        {"tenant_id": tenant_id, "user_id": user_id, **item},
    ).mappings().one()
    return _lead_dict(row)


def update_lead(session: Session, *, tenant_id: str, lead_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    item = _normalize_payload(payload)
    row = session.execute(
        text(
            """
            update leads
            set assigned_user_id = nullif(:assigned_user_id, '')::uuid,
                customer_name = :customer_name,
                phone = :phone,
                whatsapp = :whatsapp,
                email = :email,
                traveler_count = :traveler_count,
                trip_type = :trip_type,
                destination_interest = :destination_interest,
                expected_start_date = :expected_start_date,
                expected_end_date = :expected_end_date,
                budget_min = :budget_min,
                budget_max = :budget_max,
                source = :source,
                status = :status,
                notes = :notes,
                updated_at = now()
            where tenant_id = :tenant_id and id = :lead_id
            returning *
            """
        ),
        {"tenant_id": tenant_id, "lead_id": lead_id, **item},
    ).mappings().first()
    if not row:
        raise ValueError("Lead was not found")
    return _lead_dict(row)


def assign_lead_to_user(session: Session, *, tenant_id: str, lead_id: str, user_id: str) -> dict[str, Any]:
    row = session.execute(
        text(
            """
            update leads
            set assigned_user_id = :user_id, updated_at = now()
            where tenant_id = :tenant_id and id = :lead_id
            returning *
            """
        ),
        {"tenant_id": tenant_id, "lead_id": lead_id, "user_id": user_id},
    ).mappings().first()
    if not row:
        raise ValueError("Lead was not found")
    return _lead_dict(row)


def update_lead_status(session: Session, *, tenant_id: str, lead_id: str, status: str) -> dict[str, Any]:
    if status not in LEAD_STATUSES:
        raise ValueError("Invalid lead status")
    row = session.execute(
        text(
            """
            update leads
            set status = :status, updated_at = now()
            where tenant_id = :tenant_id and id = :lead_id
            returning *
            """
        ),
        {"tenant_id": tenant_id, "lead_id": lead_id, "status": status},
    ).mappings().first()
    if not row:
        raise ValueError("Lead was not found")
    return _lead_dict(row)


def mark_proposal_sent(session: Session, *, tenant_id: str, lead_id: str | None) -> None:
    if not lead_id:
        return
    session.execute(
        text(
            """
            update leads
            set status = case
                  when status in ('new', 'contacted') then 'proposal_sent'
                  else status
                end,
                updated_at = now()
            where tenant_id = :tenant_id and id = :lead_id
            """
        ),
        {"tenant_id": tenant_id, "lead_id": lead_id},
    )


def list_leads(
    session: Session,
    *,
    tenant_id: str,
    query: str = "",
    status: str = "",
    assigned: str = "",
    date_field: str = "start",
    start_date_from: str = "",
    start_date_to: str = "",
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    filters = ["l.tenant_id = :tenant_id"]
    params: dict[str, Any] = {"tenant_id": tenant_id}
    page = max(1, int(page or 1))
    page_size = min(100, max(1, int(page_size or 20)))

    if query:
        filters.append("(l.customer_name ilike :query or l.phone ilike :query or l.destination_interest ilike :query)")
        params["query"] = f"%{query.strip()}%"
    if status:
        filters.append("l.status = :status")
        params["status"] = status
    if assigned == "me":
        raise ValueError("Assigned='me' must be resolved by the router")
    if assigned == "unassigned":
        filters.append("l.assigned_user_id is null")
    elif assigned:
        filters.append("l.assigned_user_id = :assigned_user_id")
        params["assigned_user_id"] = assigned
    if date_field not in DATE_FIELDS:
        raise ValueError("date_field must be start or end")
    date_column = DATE_FIELDS[date_field]
    if start_date_from:
        filters.append(f"{date_column} >= :start_date_from")
        params["start_date_from"] = start_date_from
    if start_date_to:
        filters.append(f"{date_column} <= :start_date_to")
        params["start_date_to"] = start_date_to

    where_clause = " and ".join(filters)
    total = session.execute(text(f"select count(*) from leads l where {where_clause}"), params).scalar_one()
    params["limit"] = page_size
    params["offset"] = (page - 1) * page_size
    rows = session.execute(
        text(
            f"""
            select l.*, u.name as assigned_user_name
            from leads l
            left join users u on u.id = l.assigned_user_id
            where {where_clause}
            order by l.updated_at desc, l.created_at desc
            limit :limit offset :offset
            """
        ),
        params,
    ).mappings().all()
    return {
        "leads": [_lead_dict(row) for row in rows],
        "page": page,
        "pageSize": page_size,
        "total": int(total),
        "totalPages": max(1, math.ceil(int(total) / page_size)),
    }


def lead_stats(session: Session, *, tenant_id: str) -> dict[str, Any]:
    today = session.execute(text("select current_date")).scalar_one()
    tomorrow = today + timedelta(days=1)
    week_end = today + timedelta(days=7)
    counts = session.execute(
        text(
            """
            select status, count(*) as count
            from leads
            where tenant_id = :tenant_id
            group by status
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().all()
    by_status = {row["status"]: int(row["count"]) for row in counts}
    operational = session.execute(
        text(
            """
            select
              count(*) filter (where assigned_user_id is null) as unassigned,
              count(*) filter (where assigned_user_id is not null and status not in ('completed', 'lost')) as assigned_active,
              count(*) filter (where expected_start_date = current_date) as arriving_today,
              count(*) filter (where expected_start_date = current_date + interval '1 day') as arriving_tomorrow,
              count(*) filter (where expected_end_date = current_date) as ending_today,
              count(*) filter (where expected_end_date = current_date + interval '1 day') as ending_tomorrow,
              coalesce(sum(coalesce(budget_max, budget_min, 0)) filter (where status not in ('completed', 'lost')), 0) as pipeline_value
            from leads
            where tenant_id = :tenant_id
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().one()
    trend = session.execute(
        text(
            """
            with weeks as (
              select
                generate_series(
                  date_trunc('week', current_date)::date - interval '35 days',
                  date_trunc('week', current_date)::date,
                  interval '7 days'
                )::date as week_start
            )
            select
              w.week_start,
              (w.week_start + interval '6 days')::date as week_end,
              count(l.id) as count
            from weeks w
            left join leads l
              on l.tenant_id = :tenant_id
             and l.created_at::date between w.week_start and (w.week_start + interval '6 days')::date
            group by w.week_start
            order by w.week_start
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().all()
    leaderboard = session.execute(
        text(
            """
            with team as (
              select u.id, u.name
              from users u
              join tenant_memberships tm on tm.user_id = u.id
              where tm.tenant_id = :tenant_id and tm.is_active = true
            ),
            lead_metrics as (
              select
                assigned_user_id as user_id,
                count(*) filter (where status not in ('completed', 'lost')) as active_leads,
                count(*) filter (where status in ('proposal_sent', 'negotiating', 'won', 'arriving', 'completed')) as proposal_stage_leads,
                count(*) filter (where status = 'won') as won_leads,
                count(*) filter (where status = 'lost') as lost_leads,
                coalesce(sum(coalesce(budget_max, budget_min, 0)) filter (where status not in ('completed', 'lost')), 0) as pipeline_value
              from leads
              where tenant_id = :tenant_id
                and assigned_user_id is not null
                and updated_at >= current_date - interval '29 days'
              group by assigned_user_id
            ),
            proposal_metrics as (
              select l.assigned_user_id as user_id, count(sp.id) as saved_proposals
              from saved_proposals sp
              join leads l on l.tenant_id = sp.tenant_id and l.id = sp.lead_id
              where sp.tenant_id = :tenant_id
                and l.assigned_user_id is not null
                and sp.created_at >= current_date - interval '29 days'
              group by l.assigned_user_id
            ),
            invoice_metrics as (
              select l.assigned_user_id as user_id, coalesce(sum(i.total_amount), 0) as invoiced_value
              from invoices i
              join saved_proposals sp on sp.tenant_id = i.tenant_id and sp.id = i.source_proposal_id
              join leads l on l.tenant_id = sp.tenant_id and l.id = sp.lead_id
              where i.tenant_id = :tenant_id
                and l.assigned_user_id is not null
                and i.created_at >= current_date - interval '29 days'
              group by l.assigned_user_id
            )
            select
              t.id,
              t.name,
              coalesce(lm.active_leads, 0) as active_leads,
              greatest(coalesce(pm.saved_proposals, 0), coalesce(lm.proposal_stage_leads, 0)) as proposal_count,
              coalesce(lm.won_leads, 0) as won_leads,
              coalesce(lm.lost_leads, 0) as lost_leads,
              coalesce(lm.pipeline_value, 0) as pipeline_value,
              coalesce(im.invoiced_value, 0) as invoiced_value,
              (
                coalesce(lm.won_leads, 0) * 30
                + greatest(coalesce(pm.saved_proposals, 0), coalesce(lm.proposal_stage_leads, 0)) * 8
                + coalesce(lm.active_leads, 0) * 3
                + (coalesce(lm.pipeline_value, 0) / 100000.0 * 5)
                - coalesce(lm.lost_leads, 0) * 10
              ) as score
            from team t
            left join lead_metrics lm on lm.user_id = t.id
            left join proposal_metrics pm on pm.user_id = t.id
            left join invoice_metrics im on im.user_id = t.id
            where coalesce(lm.active_leads, 0) > 0
               or coalesce(lm.won_leads, 0) > 0
               or coalesce(lm.lost_leads, 0) > 0
               or coalesce(pm.saved_proposals, 0) > 0
               or coalesce(im.invoiced_value, 0) > 0
            order by score desc, won_leads desc, proposal_count desc, t.name
            limit 10
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().all()
    upcoming = _upcoming_windows(session, tenant_id=tenant_id, today=today, tomorrow=tomorrow, week_end=week_end)
    return {
        "byStatus": by_status,
        "unassigned": int(operational["unassigned"] or 0),
        "assignedActive": int(operational["assigned_active"] or 0),
        "arrivingToday": int(operational["arriving_today"] or 0),
        "arrivingTomorrow": int(operational["arriving_tomorrow"] or 0),
        "endingToday": int(operational["ending_today"] or 0),
        "endingTomorrow": int(operational["ending_tomorrow"] or 0),
        "pipelineValue": float(operational["pipeline_value"] or 0),
        "serverDate": today.isoformat(),
        "funnel": [{"status": status, "label": status, "count": by_status.get(status, 0)} for status in _sales_funnel_order()],
        "trend": [_weekly_trend_row(row) for row in trend],
        "leaderboard": [_leaderboard_row(row) for row in leaderboard],
        "upcoming": upcoming,
    }


def _sales_funnel_order() -> list[str]:
    return ["new", "contacted", "proposal_sent", "negotiating", "won", "lost"]


def _upcoming_windows(session: Session, *, tenant_id: str, today: date, tomorrow: date, week_end: date) -> dict[str, Any]:
    windows = {
        "today": {"label": "Today", "startDate": today, "endDate": today},
        "tomorrow": {"label": "Tomorrow", "startDate": tomorrow, "endDate": tomorrow},
        "week": {"label": "Next 7 days", "startDate": today, "endDate": week_end},
    }
    return {
        key: {
            "label": window["label"],
            "startDate": window["startDate"].isoformat(),
            "endDate": window["endDate"].isoformat(),
            "arrivals": _upcoming_movements(
                session,
                tenant_id=tenant_id,
                movement_type="arrival",
                date_column="l.expected_start_date",
                start_date=window["startDate"],
                end_date=window["endDate"],
            ),
            "departures": _upcoming_movements(
                session,
                tenant_id=tenant_id,
                movement_type="departure",
                date_column="l.expected_end_date",
                start_date=window["startDate"],
                end_date=window["endDate"],
            ),
        }
        for key, window in windows.items()
    }


def _upcoming_movements(
    session: Session,
    *,
    tenant_id: str,
    movement_type: str,
    date_column: str,
    start_date: date,
    end_date: date,
    preview_limit: int = 5,
) -> dict[str, Any]:
    params = {"tenant_id": tenant_id, "start_date": start_date, "end_date": end_date, "limit": preview_limit}
    total = session.execute(
        text(
            f"""
            select count(*)
            from leads l
            where l.tenant_id = :tenant_id
              and l.status not in ('completed', 'lost')
              and {date_column} between :start_date and :end_date
            """
        ),
        params,
    ).scalar_one()
    rows = session.execute(
        text(
            f"""
            select l.*, u.name as assigned_user_name, :movement_type as movement_type, {date_column} as movement_date
            from leads l
            left join users u on u.id = l.assigned_user_id
            where l.tenant_id = :tenant_id
              and l.status not in ('completed', 'lost')
              and {date_column} between :start_date and :end_date
            order by {date_column} asc, l.updated_at desc
            limit :limit
            """
        ),
        {**params, "movement_type": movement_type},
    ).mappings().all()
    return {"total": int(total), "items": [_upcoming_lead_dict(row) for row in rows]}


def _normalize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    status = payload.get("status") or "new"
    if status not in LEAD_STATUSES:
        raise ValueError("Invalid lead status")
    return {
        "assigned_user_id": payload.get("assignedUserId") or "",
        "customer_name": payload.get("customerName") or "Unnamed lead",
        "phone": payload.get("phone") or "",
        "whatsapp": payload.get("whatsapp") or "",
        "email": payload.get("email") or "",
        "traveler_count": max(1, int(payload.get("travelerCount") or 1)),
        "trip_type": payload.get("tripType") or "",
        "destination_interest": payload.get("destinationInterest") or "",
        "expected_start_date": payload.get("expectedStartDate") or None,
        "expected_end_date": payload.get("expectedEndDate") or None,
        "budget_min": payload.get("budgetMin"),
        "budget_max": payload.get("budgetMax"),
        "source": payload.get("source") or "",
        "status": status,
        "notes": payload.get("notes") or "",
    }


def _date_value(value: Any) -> str:
    return value.isoformat() if value else ""


def _lead_dict(row: Any) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "customerName": row["customer_name"],
        "phone": row["phone"] or "",
        "whatsapp": row["whatsapp"] or "",
        "email": row["email"] or "",
        "travelerCount": row["traveler_count"] or 1,
        "tripType": row["trip_type"] or "",
        "destinationInterest": row["destination_interest"] or "",
        "expectedStartDate": _date_value(row["expected_start_date"]),
        "expectedEndDate": _date_value(row["expected_end_date"]),
        "budgetMin": float(row["budget_min"]) if row["budget_min"] is not None else "",
        "budgetMax": float(row["budget_max"]) if row["budget_max"] is not None else "",
        "source": row["source"] or "",
        "status": row["status"],
        "assignedUserId": str(row["assigned_user_id"]) if row["assigned_user_id"] else "",
        "assignedUserName": row.get("assigned_user_name") or "",
        "notes": row["notes"] or "",
        "createdAt": row["created_at"].isoformat() if row["created_at"] else "",
        "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else "",
    }


def _upcoming_lead_dict(row: Any) -> dict[str, Any]:
    item = _lead_dict(row)
    item["movementType"] = row["movement_type"]
    item["movementDate"] = _date_value(row["movement_date"])
    return item


def _leaderboard_row(row: Any) -> dict[str, Any]:
    won = int(row["won_leads"] or 0)
    lost = int(row["lost_leads"] or 0)
    resolved = won + lost
    return {
        "userId": str(row["id"]),
        "name": row["name"],
        "score": round(float(row["score"] or 0)),
        "activeLeads": int(row["active_leads"] or 0),
        "proposalCount": int(row["proposal_count"] or 0),
        "wonLeads": won,
        "lostLeads": lost,
        "conversionRate": round((won / resolved) * 100) if resolved else 0,
        "pipelineValue": float(row["pipeline_value"] or 0),
        "invoicedValue": float(row["invoiced_value"] or 0),
    }


def _weekly_trend_row(row: Any) -> dict[str, Any]:
    return {
        "startDate": row["week_start"].isoformat(),
        "endDate": row["week_end"].isoformat(),
        "label": f"{row['week_start'].strftime('%d %b')}-{row['week_end'].strftime('%d %b')}",
        "count": int(row["count"] or 0),
    }
