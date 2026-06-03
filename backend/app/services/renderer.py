from pathlib import Path
from typing import Any
from copy import deepcopy
import os
import time

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .inventory import load_inventory
from ..db.session import DEFAULT_TENANT_SLUG, db_session, is_database_configured
from .media_access import MEDIA_ACCESS_TTL_SECONDS, sign_image_record, signed_media_url
from .proposal_sections import enrich_sections, load_tenant_sections
from .template_themes import resolve_template_theme
from .trip_options import normalize_trip_duration


BASE_DIR = Path(__file__).resolve().parents[2]
TEMPLATES_DIR = BASE_DIR / "templates"

# One Jinja environment is shared across requests. The loader starts at
# backend/templates, so template ids map to proposals/<template_id>/template.html.
env = Environment(
    loader=FileSystemLoader(TEMPLATES_DIR),
    autoescape=select_autoescape(["html", "xml"]),
)


def _first_image(item: dict[str, Any] | None) -> dict[str, Any]:
    if not item:
        return {}

    images = item.get("images") or []
    if images:
        return images[0]

    if item.get("image"):
        return {"url": item.get("image", ""), "focalPoint": "center"}

    return {}


def _selected_image(item: dict[str, Any] | None, image_id: str | None) -> dict[str, Any]:
    if not item:
        return {}

    images = item.get("images") or []
    for image in images:
        if image.get("id") == image_id:
            return image

    return _first_image(item)


def _meal_plan_label(meal_plans: list[dict[str, Any]], meal_plan_id: str | None) -> str:
    for meal_plan in meal_plans:
        if meal_plan.get("id") == meal_plan_id:
            return meal_plan.get("description") or meal_plan.get("name") or ""
    return ""


def _summary_bullets(summary: str) -> list[str]:
    bullets = [item.strip() for item in (summary or "").split(",") if item.strip()]
    return bullets or ([summary] if summary else [])


def _authorize_proposal_media(proposal: dict[str, Any], tenant_id: str | None, expires_at: int) -> dict[str, Any]:
    if proposal.get("trip", {}).get("coverImage"):
        proposal["trip"]["coverImage"] = signed_media_url(proposal["trip"]["coverImage"], tenant_id, expires_at)

    for section in ("payment", "contact"):
        section_data = proposal.get("sections", {}).get(section, {})
        if section_data.get("qrUrl"):
            section_data["qrUrl"] = signed_media_url(section_data["qrUrl"], tenant_id, expires_at)

    for day in proposal.get("days", []):
        for field in ("image", "destinationImageUrl", "hotelImageUrl"):
            if day.get(field):
                day[field] = signed_media_url(day[field], tenant_id, expires_at)

    for collection in ("destinations", "hotels", "backgroundImages"):
        for item in proposal.get(collection, []):
            sign_image_record(item, tenant_id, expires_at)
            for image in item.get("images", []):
                sign_image_record(image, tenant_id, expires_at)

    return proposal


def _enrich_proposal(proposal: dict[str, Any], tenant_slug: str = DEFAULT_TENANT_SLUG) -> dict[str, Any]:
    """Attach inventory-derived display fields before templates render."""

    inventory = load_inventory(tenant_slug)
    destination_by_id = {item["id"]: item for item in inventory.get("destinations", [])}
    destination_by_name = {item["name"]: item for item in inventory.get("destinations", [])}
    hotel_by_id = {item["id"]: item for item in inventory.get("hotels", [])}
    hotel_by_name = {item["name"]: item for item in inventory.get("hotels", [])}
    background_images = inventory.get("backgroundImages", [])
    meal_plans = inventory.get("mealPlans", [])
    day_plan_by_id = {item["id"]: item for item in inventory.get("dayPlans", [])}
    tenant_sections = {}
    if is_database_configured():
        with db_session() as session:
            tenant_sections = load_tenant_sections(session, tenant_slug)

    enriched = deepcopy(proposal)
    if "trip" in enriched:
        enriched["trip"]["duration"] = normalize_trip_duration(enriched["trip"].get("duration"))
    enriched["visualTheme"] = enriched.get("visualTheme") or enriched.get("templateTheme") or ""
    enriched["theme"] = resolve_template_theme(enriched.get("templateId", ""), enriched["visualTheme"])
    enriched["sections"] = enrich_sections(enriched, tenant_sections)
    if background_images and enriched.get("trip", {}).get("coverImage", "").startswith("/static/"):
        cover_image = background_images[0]
        enriched["trip"]["coverImage"] = cover_image.get("url", "")
        enriched["trip"]["coverImagePosition"] = cover_image.get("focalPoint", "center")

    default_meal_plan = enriched.get("pricing", {}).get("defaultMealPlan") or "MAP"
    for day in enriched.get("days", []):
        destination = destination_by_id.get(day.get("destinationId")) or destination_by_name.get(day.get("destination"))
        hotel = hotel_by_id.get(day.get("hotelId")) or hotel_by_name.get(day.get("hotelName"))
        day_plan = day_plan_by_id.get(day.get("dayPlanId"))

        if day_plan:
            day["title"] = day_plan.get("title", day.get("title", ""))
            day["summary"] = day_plan.get("summary", day.get("summary", ""))
            day["dayPlanBullets"] = _summary_bullets(day["summary"])
        else:
            day["dayPlanBullets"] = _summary_bullets(day.get("summary", ""))

        if destination:
            destination_image = _selected_image(destination, day.get("destinationImageId"))
            day["destinationId"] = day.get("destinationId") or destination.get("id", "")
            day["destination"] = day.get("destination") or destination.get("name", "")
            day["destinationDescription"] = destination.get("description", "")
            day["destinationImageUrl"] = destination_image.get("url", "")
            day["destinationImagePosition"] = destination_image.get("focalPoint", "center")
            day["image"] = day.get("image") or day["destinationImageUrl"]

        if hotel:
            hotel_image = _selected_image(hotel, day.get("hotelImageId"))
            day["hotelId"] = day.get("hotelId") or hotel.get("id", "")
            day["hotelName"] = day.get("hotelName") or hotel.get("name", "")
            day["hotelCategory"] = hotel.get("category", "")
            day["hotelRoomType"] = day.get("roomType") or hotel.get("roomType", "")
            day["hotelSummary"] = hotel.get("summary", "")
            day["hotelSummaryItems"] = _summary_bullets(day["hotelSummary"])
            day["hotelStarRating"] = hotel.get("starRating")
            day["hotelStars"] = "★" * int(hotel.get("starRating") or 0)
            day["hotelImageUrl"] = hotel_image.get("url", "")
            day["hotelImagePosition"] = hotel_image.get("focalPoint", "center")
        else:
            day["hotelCategory"] = ""
            day["hotelRoomType"] = ""
            day["hotelSummaryItems"] = []
            day["hotelImageUrl"] = ""
            day["hotelImagePosition"] = "center"

        day["destinationImageUrl"] = day.get("destinationImageUrl") or day.get("image", "")
        day["destinationImagePosition"] = day.get("destinationImagePosition", "center")
        day["mealPlan"] = day.get("mealPlan") or default_meal_plan
        day["meals"] = _meal_plan_label(meal_plans, day["mealPlan"])

    return enriched


def render_proposal_html(
    proposal: dict[str, Any],
    template_id: str,
    tenant_slug: str = DEFAULT_TENANT_SLUG,
    tenant_id: str | None = None,
) -> str:
    """Render one proposal snapshot into final HTML.

    The template is responsible only for presentation. The proposal object is
    already structured by the frontend/API contract before it reaches this
    function.
    """

    template_path = f"proposals/{template_id}/template.html"
    template = env.get_template(template_path)

    # Playwright renders the HTML in a browser context, so relative assets need
    # an absolute base URL. The default points at the local FastAPI server.
    enriched = _enrich_proposal(proposal, tenant_slug)
    if tenant_id:
        enriched = _authorize_proposal_media(enriched, tenant_id, int(time.time()) + MEDIA_ACCESS_TTL_SECONDS)

    view_model = {
        **enriched,
        "assetBaseUrl": proposal.get("assetBaseUrl", os.getenv("ASSET_BASE_URL", "http://localhost:8000")),
    }
    return template.render(proposal=view_model)
