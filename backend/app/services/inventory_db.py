from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from .hotel_options import normalize_hotel_category, normalize_hotel_room_type
from .proposal_sections import section_options
from .template_themes import template_theme_options
from .trip_options import TRIP_DURATIONS


MEAL_PLANS = [
    {"id": "EP", "name": "EP", "description": "Room only"},
    {"id": "CP", "name": "CP", "description": "Breakfast"},
    {"id": "MAP", "name": "MAP", "description": "Breakfast and dinner"},
    {"id": "AP", "name": "AP", "description": "Breakfast, lunch, and dinner"},
]


def _media_url(media_asset_id: Any) -> str:
    return f"/api/media/{media_asset_id}?variant=proposal" if media_asset_id else ""


def load_inventory_from_db(session: Session, tenant_slug: str) -> dict[str, Any]:
    tenant = session.execute(
        text("select id from tenants where slug = :slug"),
        {"slug": tenant_slug},
    ).mappings().first()
    if tenant is None:
        raise RuntimeError(f"Tenant '{tenant_slug}' was not found")

    tenant_id = tenant["id"]

    destinations = session.execute(
        text(
            """
            select id, slug, name, region, summary, description
            from destinations
            where tenant_id = :tenant_id and is_active = true
            order by sort_order, name
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().all()

    destination_images = session.execute(
        text(
            """
            select di.id, di.destination_id, di.media_asset_id, di.image_key, di.label, di.aspect_ratio, di.focal_point, di.sort_order
            from destination_images di
            where di.tenant_id = :tenant_id and di.is_active = true and di.media_asset_id is not null
            order by di.sort_order, di.label
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().all()

    hotels = session.execute(
        text(
            """
            select h.id, h.slug, h.name, h.destination_id, d.slug as destination_slug,
                   h.category, h.room_type, h.default_room_night_rate, h.room_type_rates, h.meal_plan_rates, h.star_rating, h.summary
            from hotels h
            join destinations d on d.id = h.destination_id and d.tenant_id = h.tenant_id
            where h.tenant_id = :tenant_id and h.is_active = true and d.is_active = true
            order by h.sort_order, h.name
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().all()

    hotel_images = session.execute(
        text(
            """
            select hi.id, hi.hotel_id, hi.media_asset_id, hi.image_key, hi.label, hi.aspect_ratio, hi.focal_point, hi.sort_order
            from hotel_images hi
            where hi.tenant_id = :tenant_id and hi.is_active = true and hi.media_asset_id is not null
            order by hi.sort_order, hi.label
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().all()

    vehicles = session.execute(
        text(
            """
            select id, name, capacity, best_for, default_day_rate, default_note
            from vehicles
            where tenant_id = :tenant_id and is_active = true
            order by sort_order, name
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().all()

    activities = session.execute(
        text(
            """
            select name
            from activities
            where tenant_id = :tenant_id and is_active = true
            order by sort_order, name
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().all()

    templates = session.execute(
        text(
            """
            select pt.template_key, pt.name, pt.description
            from tenant_template_settings tts
            join proposal_templates pt on pt.id = tts.template_id
            where tts.tenant_id = :tenant_id and tts.is_enabled = true
            order by tts.sort_order, pt.name
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().all()

    background_images = session.execute(
        text(
            """
            select bi.id, bi.media_asset_id, bi.image_key, bi.label, bi.usage_type, bi.aspect_ratio, bi.focal_point, bi.sort_order
            from background_images bi
            where bi.tenant_id = :tenant_id and bi.is_active = true and bi.media_asset_id is not null
            order by bi.sort_order, bi.label
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().all()

    day_plans = session.execute(
        text(
            """
            select ddp.id, ddp.plan_key, ddp.title, ddp.summary, d.slug as destination_slug
            from destination_day_plans ddp
            join destinations d on d.id = ddp.destination_id and d.tenant_id = ddp.tenant_id
            where ddp.tenant_id = :tenant_id and ddp.is_active = true and d.is_active = true
            order by d.sort_order, ddp.sort_order, ddp.title
            """
        ),
        {"tenant_id": tenant_id},
    ).mappings().all()

    destination_images_by_id: dict[Any, list[dict[str, Any]]] = {}
    for image in destination_images:
        destination_images_by_id.setdefault(image["destination_id"], []).append(
            {
                "id": str(image["id"]),
                "imageKey": image["image_key"],
                "label": image["label"],
                "url": _media_url(image["media_asset_id"]),
                "aspect": image["aspect_ratio"],
                "focalPoint": image["focal_point"],
            }
        )

    hotel_images_by_id: dict[Any, list[dict[str, Any]]] = {}
    for image in hotel_images:
        hotel_images_by_id.setdefault(image["hotel_id"], []).append(
            {
                "id": str(image["id"]),
                "imageKey": image["image_key"],
                "label": image["label"],
                "url": _media_url(image["media_asset_id"]),
                "aspect": image["aspect_ratio"],
                "focalPoint": image["focal_point"],
            }
        )

    return {
        "destinations": [
            {
                "id": destination["slug"],
                "name": destination["name"],
                "region": destination["region"],
                "summary": destination["summary"],
                "description": destination["description"],
                "images": destination_images_by_id.get(destination["id"], []),
            }
            for destination in destinations
        ],
        "hotels": [
            {
                "id": hotel["slug"],
                "name": hotel["name"],
                "destinationId": hotel["destination_slug"],
                "category": normalize_hotel_category(hotel["category"]),
                "roomType": normalize_hotel_room_type(hotel["room_type"]),
                "defaultRoomNightRate": float(hotel["default_room_night_rate"] or 0),
                "roomTypeRates": {
                    room_type: float(rate or 0)
                    for room_type, rate in (hotel["room_type_rates"] or {}).items()
                },
                "mealPlanRates": {
                    meal_plan: float(rate or 0)
                    for meal_plan, rate in (hotel["meal_plan_rates"] or {}).items()
                },
                "starRating": hotel["star_rating"],
                "summary": hotel["summary"],
                "images": hotel_images_by_id.get(hotel["id"], []),
            }
            for hotel in hotels
        ],
        "vehicles": [
            {
                "id": str(vehicle["id"]),
                "name": vehicle["name"],
                "capacity": vehicle["capacity"],
                "bestFor": vehicle["best_for"],
                "defaultDayRate": float(vehicle["default_day_rate"] or 0),
                "defaultNote": vehicle["default_note"],
            }
            for vehicle in vehicles
        ],
        "mealPlans": MEAL_PLANS,
        "tripDurations": TRIP_DURATIONS,
        "dayPlans": [
            {
                "id": str(plan["id"]),
                "key": plan["plan_key"],
                "destinationId": plan["destination_slug"],
                "title": plan["title"],
                "summary": plan["summary"],
            }
            for plan in day_plans
        ],
        "sectionOptions": section_options(),
        "backgroundImages": [
            {
                "id": str(image["id"]),
                "imageKey": image["image_key"],
                "label": image["label"],
                "usageType": image["usage_type"],
                "url": _media_url(image["media_asset_id"]),
                "aspect": image["aspect_ratio"],
                "focalPoint": image["focal_point"],
            }
            for image in background_images
        ],
        "activities": [activity["name"] for activity in activities],
        "templates": [
            {
                "id": template["template_key"],
                "name": template["name"],
                "description": template["description"],
                "themes": template_theme_options(template["template_key"]),
            }
            for template in templates
        ],
}
