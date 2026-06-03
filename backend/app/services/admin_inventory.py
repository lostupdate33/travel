import re
import json
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from .hotel_options import hotel_star_rating


ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "item"


def _tenant_id(session: Session, tenant_slug: str) -> str:
    tenant = session.execute(
        text("select id from tenants where slug = :slug"),
        {"slug": tenant_slug},
    ).mappings().first()
    if tenant is None:
        raise ValueError(f"Tenant '{tenant_slug}' was not found")
    return str(tenant["id"])


def _destination_id(session: Session, tenant_id: str, destination_slug: str) -> str:
    destination = session.execute(
        text(
            """
            select id
            from destinations
            where tenant_id = :tenant_id and slug = :slug and is_active = true
            """
        ),
        {"tenant_id": tenant_id, "slug": destination_slug},
    ).mappings().first()
    if destination is None:
        raise ValueError(f"Destination '{destination_slug}' was not found")
    return str(destination["id"])


def _hotel_id(session: Session, tenant_id: str, hotel_slug: str) -> str:
    hotel = session.execute(
        text(
            """
            select id
            from hotels
            where tenant_id = :tenant_id and slug = :slug and is_active = true
            """
        ),
        {"tenant_id": tenant_id, "slug": hotel_slug},
    ).mappings().first()
    if hotel is None:
        raise ValueError(f"Hotel '{hotel_slug}' was not found")
    return str(hotel["id"])


def _vehicle_id(session: Session, tenant_id: str, vehicle_id: str) -> str:
    try:
        UUID(vehicle_id)
    except ValueError as exc:
        raise ValueError(f"Vehicle '{vehicle_id}' was not found") from exc

    vehicle = session.execute(
        text(
            """
            select id
            from vehicles
            where tenant_id = :tenant_id and id = :id and is_active = true
            """
        ),
        {"tenant_id": tenant_id, "id": vehicle_id},
    ).mappings().first()
    if vehicle is None:
        raise ValueError(f"Vehicle '{vehicle_id}' was not found")
    return str(vehicle["id"])


def _day_plan_id(session: Session, tenant_id: str, day_plan_id: str) -> str:
    try:
        UUID(day_plan_id)
    except ValueError as exc:
        raise ValueError(f"Day plan '{day_plan_id}' was not found") from exc

    day_plan = session.execute(
        text(
            """
            select id
            from destination_day_plans
            where tenant_id = :tenant_id and id = :id and is_active = true
            """
        ),
        {"tenant_id": tenant_id, "id": day_plan_id},
    ).mappings().first()
    if day_plan is None:
        raise ValueError(f"Day plan '{day_plan_id}' was not found")
    return str(day_plan["id"])


def _unique_slug(session: Session, table_name: str, tenant_id: str, name: str, current_slug: str | None = None) -> str:
    base_slug = current_slug or _slugify(name)
    slug = base_slug
    suffix = 2

    while True:
        row = session.execute(
            text(f"select 1 from {table_name} where tenant_id = :tenant_id and slug = :slug"),
            {"tenant_id": tenant_id, "slug": slug},
        ).first()
        if row is None or slug == current_slug:
            return slug
        slug = f"{base_slug}-{suffix}"
        suffix += 1


def _validate_image(file_name: str, mime_type: str, content: bytes) -> None:
    if not content:
        raise ValueError("Uploaded image is empty")
    if len(content) > MAX_IMAGE_BYTES:
        raise ValueError("Image must be 8 MB or smaller")
    if not file_name:
        raise ValueError("Uploaded image needs a file name")
    if mime_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError("Only JPEG, PNG, and WebP images are supported")


def _room_type_rates(payload: dict[str, Any]) -> str:
    rates = {}
    for room_type, rate in (payload.get("roomTypeRates") or {}).items():
        amount = float(rate or 0)
        if amount > 0:
            rates[room_type] = amount

    default_room_type = (payload.get("roomType") or "").strip()
    default_rate = float(payload.get("defaultRoomNightRate") or 0)
    if default_room_type and default_rate > 0:
        rates.setdefault(default_room_type, default_rate)
    return json.dumps(rates)


def _meal_plan_rates(payload: dict[str, Any]) -> str:
    rates = {}
    for meal_plan, rate in (payload.get("mealPlanRates") or {}).items():
        amount = float(rate or 0)
        if amount > 0:
            rates[meal_plan] = amount
    return json.dumps(rates)


def create_media_asset(
    session: Session,
    tenant_slug: str,
    *,
    file_name: str,
    mime_type: str,
    content: bytes,
    focal_point: str = "center",
) -> str:
    tenant_id = _tenant_id(session, tenant_slug)
    _validate_image(file_name, mime_type, content)

    return str(
        session.execute(
            text(
                """
                insert into media_assets
                  (tenant_id, content, file_name, mime_type, file_size, focal_point)
                values
                  (:tenant_id, :content, :file_name, :mime_type, :file_size, :focal_point)
                returning id
                """
            ),
            {
                "tenant_id": tenant_id,
                "content": content,
                "file_name": file_name,
                "mime_type": mime_type,
                "file_size": len(content),
                "focal_point": focal_point or "center",
            },
        ).scalar_one()
    )


def attach_destination_image(
    session: Session,
    tenant_slug: str,
    destination_slug: str,
    *,
    media_asset_id: str,
    label: str,
    focal_point: str = "center",
) -> None:
    tenant_id = _tenant_id(session, tenant_slug)
    destination_id = _destination_id(session, tenant_id, destination_slug)
    image_label = (label or "Primary image").strip()

    session.execute(
        text(
            """
            insert into destination_images
              (tenant_id, destination_id, media_asset_id, image_key, label, focal_point)
            values
              (:tenant_id, :destination_id, :media_asset_id, :image_key, :label, :focal_point)
            """
        ),
        {
            "tenant_id": tenant_id,
            "destination_id": destination_id,
            "media_asset_id": media_asset_id,
            "image_key": _slugify(image_label),
            "label": image_label,
            "focal_point": focal_point or "center",
        },
    )


def attach_hotel_image(
    session: Session,
    tenant_slug: str,
    hotel_slug: str,
    *,
    media_asset_id: str,
    label: str,
    focal_point: str = "center",
) -> None:
    tenant_id = _tenant_id(session, tenant_slug)
    hotel_id = _hotel_id(session, tenant_id, hotel_slug)
    image_label = (label or "Primary image").strip()

    session.execute(
        text(
            """
            insert into hotel_images
              (tenant_id, hotel_id, media_asset_id, image_key, label, focal_point)
            values
              (:tenant_id, :hotel_id, :media_asset_id, :image_key, :label, :focal_point)
            """
        ),
        {
            "tenant_id": tenant_id,
            "hotel_id": hotel_id,
            "media_asset_id": media_asset_id,
            "image_key": _slugify(image_label),
            "label": image_label,
            "focal_point": focal_point or "center",
        },
    )


def attach_background_image(
    session: Session,
    tenant_slug: str,
    *,
    media_asset_id: str,
    label: str,
    focal_point: str = "center",
    usage_type: str = "cover",
) -> None:
    tenant_id = _tenant_id(session, tenant_slug)
    image_label = (label or "Cover image").strip()

    session.execute(
        text(
            """
            insert into background_images
              (tenant_id, media_asset_id, image_key, label, usage_type, focal_point)
            values
              (:tenant_id, :media_asset_id, :image_key, :label, :usage_type, :focal_point)
            """
        ),
        {
            "tenant_id": tenant_id,
            "media_asset_id": media_asset_id,
            "image_key": _slugify(image_label),
            "label": image_label,
            "usage_type": usage_type or "cover",
            "focal_point": focal_point or "center",
        },
    )


def archive_background_image(session: Session, tenant_slug: str, image_id: str) -> None:
    tenant_id = _tenant_id(session, tenant_slug)
    row = session.execute(
        text(
            """
            update background_images
            set is_active = false,
                archived_at = now(),
                updated_at = now()
            where tenant_id = :tenant_id and id = :id and is_active = true
            returning id
            """
        ),
        {"tenant_id": tenant_id, "id": image_id},
    ).mappings().first()
    if not row:
        raise ValueError("Background image was not found")


def load_media_asset(session: Session, media_asset_id: str, tenant_id: str | None = None) -> dict[str, Any] | None:
    tenant_filter = "and tenant_id = :tenant_id" if tenant_id else ""
    return session.execute(
        text(
            f"""
            select id, content, file_name, mime_type
            from media_assets
            where id = :id
            {tenant_filter}
            """
        ),
        {"id": media_asset_id, "tenant_id": tenant_id},
    ).mappings().first()


def create_destination(session: Session, tenant_slug: str, payload: dict[str, Any]) -> str:
    tenant_id = _tenant_id(session, tenant_slug)
    name = payload["name"].strip()
    slug = _unique_slug(session, "destinations", tenant_id, name)

    session.execute(
        text(
            """
            insert into destinations (tenant_id, slug, name, region, summary)
            values (:tenant_id, :slug, :name, :region, :summary)
            """
        ),
        {
            "tenant_id": tenant_id,
            "slug": slug,
            "name": name,
            "region": (payload.get("region") or "").strip(),
            "summary": (payload.get("summary") or "").strip(),
        },
    )
    return slug


def update_destination(session: Session, tenant_slug: str, destination_slug: str, payload: dict[str, Any]) -> None:
    tenant_id = _tenant_id(session, tenant_slug)
    destination_id = _destination_id(session, tenant_id, destination_slug)

    session.execute(
        text(
            """
            update destinations
            set name = :name,
                region = :region,
                summary = :summary,
                updated_at = now()
            where tenant_id = :tenant_id and id = :id
            """
        ),
        {
            "tenant_id": tenant_id,
            "id": destination_id,
            "name": payload["name"].strip(),
            "region": (payload.get("region") or "").strip(),
            "summary": (payload.get("summary") or "").strip(),
        },
    )


def archive_destination(session: Session, tenant_slug: str, destination_slug: str) -> None:
    tenant_id = _tenant_id(session, tenant_slug)
    destination_id = _destination_id(session, tenant_id, destination_slug)

    session.execute(
        text(
            """
            update hotel_images
            set is_active = false,
                archived_at = now()
            where tenant_id = :tenant_id
              and hotel_id in (
                select id from hotels where tenant_id = :tenant_id and destination_id = :destination_id
              )
            """
        ),
        {"tenant_id": tenant_id, "destination_id": destination_id},
    )
    session.execute(
        text(
            """
            update hotels
            set is_active = false,
                archived_at = now(),
                updated_at = now()
            where tenant_id = :tenant_id and destination_id = :destination_id
            """
        ),
        {"tenant_id": tenant_id, "destination_id": destination_id},
    )
    session.execute(
        text(
            """
            update destination_images
            set is_active = false,
                archived_at = now()
            where tenant_id = :tenant_id and destination_id = :destination_id
            """
        ),
        {"tenant_id": tenant_id, "destination_id": destination_id},
    )
    session.execute(
        text(
            """
            update destinations
            set is_active = false,
                archived_at = now(),
                updated_at = now()
            where tenant_id = :tenant_id and id = :id
            """
        ),
        {"tenant_id": tenant_id, "id": destination_id},
    )


def create_hotel(session: Session, tenant_slug: str, payload: dict[str, Any]) -> str:
    tenant_id = _tenant_id(session, tenant_slug)
    destination_id = _destination_id(session, tenant_id, payload["destinationId"])
    name = payload["name"].strip()
    slug = _unique_slug(session, "hotels", tenant_id, name)

    session.execute(
        text(
            """
            insert into hotels
              (tenant_id, destination_id, slug, name, category, room_type, default_room_night_rate, room_type_rates, meal_plan_rates, star_rating, summary)
            values
              (:tenant_id, :destination_id, :slug, :name, :category, :room_type, :default_room_night_rate, cast(:room_type_rates as jsonb), cast(:meal_plan_rates as jsonb), :star_rating, :summary)
            """
        ),
        {
            "tenant_id": tenant_id,
            "destination_id": destination_id,
            "slug": slug,
            "name": name,
            "category": (payload.get("category") or "").strip(),
            "room_type": (payload.get("roomType") or "").strip(),
            "default_room_night_rate": payload.get("defaultRoomNightRate") or 0,
            "room_type_rates": _room_type_rates(payload),
            "meal_plan_rates": _meal_plan_rates(payload),
            "star_rating": hotel_star_rating(payload.get("category")),
            "summary": (payload.get("summary") or "").strip(),
        },
    )
    return slug


def update_hotel(session: Session, tenant_slug: str, hotel_slug: str, payload: dict[str, Any]) -> None:
    tenant_id = _tenant_id(session, tenant_slug)
    hotel_id = _hotel_id(session, tenant_id, hotel_slug)
    destination_id = _destination_id(session, tenant_id, payload["destinationId"])

    session.execute(
        text(
            """
            update hotels
            set destination_id = :destination_id,
                name = :name,
                category = :category,
                room_type = :room_type,
                default_room_night_rate = :default_room_night_rate,
                room_type_rates = cast(:room_type_rates as jsonb),
                meal_plan_rates = cast(:meal_plan_rates as jsonb),
                star_rating = :star_rating,
                summary = :summary,
                updated_at = now()
            where tenant_id = :tenant_id and id = :id
            """
        ),
        {
            "tenant_id": tenant_id,
            "id": hotel_id,
            "destination_id": destination_id,
            "name": payload["name"].strip(),
            "category": (payload.get("category") or "").strip(),
            "room_type": (payload.get("roomType") or "").strip(),
            "default_room_night_rate": payload.get("defaultRoomNightRate") or 0,
            "room_type_rates": _room_type_rates(payload),
            "meal_plan_rates": _meal_plan_rates(payload),
            "star_rating": hotel_star_rating(payload.get("category")),
            "summary": (payload.get("summary") or "").strip(),
        },
    )


def archive_hotel(session: Session, tenant_slug: str, hotel_slug: str) -> None:
    tenant_id = _tenant_id(session, tenant_slug)
    hotel_id = _hotel_id(session, tenant_id, hotel_slug)

    session.execute(
        text(
            """
            update hotel_images
            set is_active = false,
                archived_at = now()
            where tenant_id = :tenant_id and hotel_id = :hotel_id
            """
        ),
        {"tenant_id": tenant_id, "hotel_id": hotel_id},
    )
    session.execute(
        text(
            """
            update hotels
            set is_active = false,
                archived_at = now(),
                updated_at = now()
            where tenant_id = :tenant_id and id = :id
            """
        ),
        {"tenant_id": tenant_id, "id": hotel_id},
    )


def create_vehicle(session: Session, tenant_slug: str, payload: dict[str, Any]) -> None:
    tenant_id = _tenant_id(session, tenant_slug)
    session.execute(
        text(
            """
            insert into vehicles (tenant_id, name, capacity, best_for, default_day_rate, default_note)
            values (:tenant_id, :name, :capacity, :best_for, :default_day_rate, :default_note)
            """
        ),
        {
            "tenant_id": tenant_id,
            "name": payload["name"].strip(),
            "capacity": (payload.get("capacity") or "").strip(),
            "best_for": (payload.get("bestFor") or "").strip(),
            "default_day_rate": payload.get("defaultDayRate") or 0,
            "default_note": (payload.get("defaultNote") or "").strip(),
        },
    )


def update_vehicle(session: Session, tenant_slug: str, vehicle_id: str, payload: dict[str, Any]) -> None:
    tenant_id = _tenant_id(session, tenant_slug)
    vehicle_id = _vehicle_id(session, tenant_id, vehicle_id)
    session.execute(
        text(
            """
            update vehicles
            set name = :name,
                capacity = :capacity,
                best_for = :best_for,
                default_day_rate = :default_day_rate,
                default_note = :default_note,
                updated_at = now()
            where tenant_id = :tenant_id and id = :id
            """
        ),
        {
            "tenant_id": tenant_id,
            "id": vehicle_id,
            "name": payload["name"].strip(),
            "capacity": (payload.get("capacity") or "").strip(),
            "best_for": (payload.get("bestFor") or "").strip(),
            "default_day_rate": payload.get("defaultDayRate") or 0,
            "default_note": (payload.get("defaultNote") or "").strip(),
        },
    )


def archive_vehicle(session: Session, tenant_slug: str, vehicle_id: str) -> None:
    tenant_id = _tenant_id(session, tenant_slug)
    vehicle_id = _vehicle_id(session, tenant_id, vehicle_id)
    session.execute(
        text(
            """
            update vehicles
            set is_active = false,
                archived_at = now(),
                updated_at = now()
            where tenant_id = :tenant_id and id = :id
            """
        ),
        {"tenant_id": tenant_id, "id": vehicle_id},
    )


def create_day_plan(session: Session, tenant_slug: str, payload: dict[str, Any]) -> None:
    tenant_id = _tenant_id(session, tenant_slug)
    destination_id = _destination_id(session, tenant_id, payload["destinationId"])
    title = payload["title"].strip()

    session.execute(
        text(
            """
            insert into destination_day_plans
              (tenant_id, destination_id, plan_key, title, summary)
            values
              (:tenant_id, :destination_id, :plan_key, :title, :summary)
            """
        ),
        {
            "tenant_id": tenant_id,
            "destination_id": destination_id,
            "plan_key": _slugify(title),
            "title": title,
            "summary": (payload.get("summary") or "").strip(),
        },
    )


def update_day_plan(session: Session, tenant_slug: str, day_plan_id: str, payload: dict[str, Any]) -> None:
    tenant_id = _tenant_id(session, tenant_slug)
    day_plan_id = _day_plan_id(session, tenant_id, day_plan_id)
    destination_id = _destination_id(session, tenant_id, payload["destinationId"])
    title = payload["title"].strip()

    session.execute(
        text(
            """
            update destination_day_plans
            set destination_id = :destination_id,
                plan_key = :plan_key,
                title = :title,
                summary = :summary,
                updated_at = now()
            where tenant_id = :tenant_id and id = :id
            """
        ),
        {
            "tenant_id": tenant_id,
            "id": day_plan_id,
            "destination_id": destination_id,
            "plan_key": _slugify(title),
            "title": title,
            "summary": (payload.get("summary") or "").strip(),
        },
    )


def archive_day_plan(session: Session, tenant_slug: str, day_plan_id: str) -> None:
    tenant_id = _tenant_id(session, tenant_slug)
    day_plan_id = _day_plan_id(session, tenant_id, day_plan_id)
    session.execute(
        text(
            """
            update destination_day_plans
            set is_active = false,
                archived_at = now(),
                updated_at = now()
            where tenant_id = :tenant_id and id = :id
            """
        ),
        {"tenant_id": tenant_id, "id": day_plan_id},
    )
