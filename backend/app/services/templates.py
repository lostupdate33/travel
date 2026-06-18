from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


BASE_DIR = Path(__file__).resolve().parents[2]
PROPOSAL_TEMPLATES_DIR = BASE_DIR / "templates" / "proposals"

TEMPLATE_METADATA = {
    "kashmir-executive": {
        "name": "Kashmir Executive",
        "description": "A compact corporate-style proposal with tables, clear commercials, and dense itinerary detail.",
    },
    "kashmir-family": {
        "name": "Kashmir Family",
        "description": "A warm family-focused proposal layout for relaxed Kashmir itineraries.",
    },
    "kashmir-luxury": {
        "name": "Kashmir Luxury",
        "description": "A high-end editorial layout with large typography, gold accents, and premium journey pacing.",
    },
    "kashmir-signature": {
        "name": "Kashmir Signature",
        "description": "A premium editorial proposal layout for Kashmir itineraries.",
    },
}


def _display_name(template_key: str) -> str:
    return " ".join(part.capitalize() for part in template_key.split("-"))


def discover_template_files() -> list[dict[str, str]]:
    templates: list[dict[str, str]] = []
    for template_file in sorted(PROPOSAL_TEMPLATES_DIR.glob("*/template.html")):
        template_key = template_file.parent.name
        metadata = TEMPLATE_METADATA.get(template_key, {})
        templates.append(
            {
                "template_key": template_key,
                "name": metadata.get("name") or _display_name(template_key),
                "description": metadata.get("description") or f"{_display_name(template_key)} proposal template.",
            }
        )
    return templates


def onboard_system_templates(session: Session) -> list[dict[str, Any]]:
    templates = discover_template_files()
    for template in templates:
        session.execute(
            text(
                """
                insert into proposal_templates (template_key, name, description, is_system)
                values (:template_key, :name, :description, true)
                on conflict (template_key) do update
                  set name = excluded.name,
                      description = excluded.description,
                      is_system = true
                """
            ),
            template,
        )
    return list_templates(session)


def list_templates(session: Session) -> list[dict[str, Any]]:
    rows = session.execute(
        text(
            """
            select id, template_key, name, description, is_system
            from proposal_templates
            order by name
            """
        )
    ).mappings().all()
    return [
        {
            "id": str(row["id"]),
            "templateKey": row["template_key"],
            "name": row["name"],
            "description": row["description"] or "",
            "isSystem": bool(row["is_system"]),
        }
        for row in rows
    ]


def list_tenant_templates(session: Session, tenant_slug: str) -> dict[str, Any]:
    tenant = session.execute(
        text("select id, slug, name from tenants where slug = :slug"),
        {"slug": tenant_slug},
    ).mappings().first()
    if tenant is None:
        raise ValueError(f"Tenant '{tenant_slug}' was not found")

    rows = session.execute(
        text(
            """
            select pt.template_key, pt.name, pt.description, pt.is_system,
                   coalesce(tts.is_enabled, false) as is_enabled,
                   tts.sort_order
            from proposal_templates pt
            left join tenant_template_settings tts
              on tts.template_id = pt.id and tts.tenant_id = :tenant_id
            order by coalesce(tts.sort_order, 9999), pt.name
            """
        ),
        {"tenant_id": tenant["id"]},
    ).mappings().all()

    return {
        "tenant": {"id": str(tenant["id"]), "slug": tenant["slug"], "name": tenant["name"]},
        "templates": [
            {
                "templateKey": row["template_key"],
                "name": row["name"],
                "description": row["description"] or "",
                "isSystem": bool(row["is_system"]),
                "isEnabled": bool(row["is_enabled"]),
                "sortOrder": int(row["sort_order"] or 0),
            }
            for row in rows
        ],
    }


def set_tenant_template_enabled(
    session: Session,
    *,
    tenant_slug: str,
    template_key: str,
    is_enabled: bool,
) -> dict[str, Any]:
    tenant = session.execute(
        text("select id from tenants where slug = :slug"),
        {"slug": tenant_slug},
    ).mappings().first()
    if tenant is None:
        raise ValueError(f"Tenant '{tenant_slug}' was not found")

    template = session.execute(
        text("select id from proposal_templates where template_key = :template_key"),
        {"template_key": template_key},
    ).mappings().first()
    if template is None:
        raise ValueError(f"Template '{template_key}' was not found")

    session.execute(
        text(
            """
            insert into tenant_template_settings (tenant_id, template_id, is_enabled, sort_order)
            values (
              :tenant_id,
              :template_id,
              :is_enabled,
              coalesce(
                (select max(sort_order) + 1 from tenant_template_settings where tenant_id = :tenant_id),
                0
              )
            )
            on conflict (tenant_id, template_id) do update
              set is_enabled = excluded.is_enabled
            """
        ),
        {
            "tenant_id": tenant["id"],
            "template_id": template["id"],
            "is_enabled": is_enabled,
        },
    )
    return list_tenant_templates(session, tenant_slug)
