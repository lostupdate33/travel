import json
import mimetypes
from pathlib import Path

from sqlalchemy import create_engine, text

from app.db.session import DATABASE_URL, DEFAULT_TENANT_SLUG
from app.services.hotel_options import hotel_star_rating
from app.services.templates import discover_template_files


BASE_DIR = Path(__file__).resolve().parents[1]


def main() -> None:
    if not DATABASE_URL:
        raise SystemExit("DATABASE_URL is required to seed the database")

    inventory = json.loads((BASE_DIR / "data" / "kashmir_inventory.json").read_text(encoding="utf-8"))
    sample = json.loads((BASE_DIR / "data" / "sample_proposal.json").read_text(encoding="utf-8"))
    engine = create_engine(DATABASE_URL)

    with engine.begin() as conn:
        tenant_id = conn.execute(
            text(
                """
                insert into tenants (slug, name, email, phone, logo_url)
                values (:slug, :name, :email, :phone, null)
                on conflict (slug) do update
                  set name = excluded.name,
                      email = excluded.email,
                      phone = excluded.phone,
                      updated_at = now()
                returning id
                """
            ),
            {
                "slug": DEFAULT_TENANT_SLUG,
                "name": sample["company"]["name"],
                "email": sample["company"]["email"],
                "phone": sample["company"]["phone"],
            },
        ).scalar_one()

        destination_ids = {}
        for sort_order, destination in enumerate(inventory["destinations"]):
            destination_id = conn.execute(
                text(
                    """
                    insert into destinations (tenant_id, slug, name, region, summary, description, sort_order)
                    values (:tenant_id, :slug, :name, :region, :summary, :description, :sort_order)
                    on conflict (tenant_id, slug) do update
                      set name = excluded.name,
                          region = excluded.region,
                          summary = excluded.summary,
                          description = excluded.description,
                          sort_order = excluded.sort_order,
                          is_active = true,
                          archived_at = null,
                          updated_at = now()
                    returning id
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "slug": destination["id"],
                    "name": destination["name"],
                    "region": destination["region"],
                    "summary": destination["summary"],
                    "description": destination.get("description") or _destination_description(destination["id"]),
                    "sort_order": sort_order,
                },
            ).scalar_one()
            destination_ids[destination["id"]] = destination_id
            _seed_images(conn, "destination_images", tenant_id, destination_id, "destination_id", destination["images"])
            _seed_day_plans(conn, tenant_id, destination_id, destination["id"])

        for sort_order, hotel in enumerate(inventory["hotels"]):
            hotel_id = conn.execute(
                text(
                    """
                    insert into hotels (tenant_id, destination_id, slug, name, category, room_type, default_room_night_rate, room_type_rates, meal_plan_rates, star_rating, summary, sort_order)
                    values (:tenant_id, :destination_id, :slug, :name, :category, :room_type, :default_room_night_rate, cast(:room_type_rates as jsonb), cast(:meal_plan_rates as jsonb), :star_rating, :summary, :sort_order)
                    on conflict (tenant_id, slug) do update
                      set destination_id = excluded.destination_id,
                          name = excluded.name,
                          category = excluded.category,
                          room_type = excluded.room_type,
                          default_room_night_rate = excluded.default_room_night_rate,
                          room_type_rates = excluded.room_type_rates,
                          meal_plan_rates = excluded.meal_plan_rates,
                          star_rating = excluded.star_rating,
                          summary = excluded.summary,
                          sort_order = excluded.sort_order,
                          is_active = true,
                          archived_at = null,
                          updated_at = now()
                    returning id
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "destination_id": destination_ids[hotel["destinationId"]],
                    "slug": hotel["id"],
                    "name": hotel["name"],
                    "category": hotel["category"],
                    "room_type": hotel["roomType"],
                    "default_room_night_rate": hotel.get("defaultRoomNightRate", 0),
                    "room_type_rates": json.dumps(hotel.get("roomTypeRates") or {hotel["roomType"]: hotel.get("defaultRoomNightRate", 0)}),
                    "meal_plan_rates": json.dumps(hotel.get("mealPlanRates") or {}),
                    "star_rating": hotel_star_rating(hotel["category"]),
                    "summary": hotel.get("summary") or _hotel_summary(hotel["id"]),
                    "sort_order": sort_order,
                },
            ).scalar_one()
            _seed_images(conn, "hotel_images", tenant_id, hotel_id, "hotel_id", hotel["images"])

        cover_image = sample.get("trip", {}).get("coverImage")
        if cover_image:
            conn.execute(
                text("delete from background_images where tenant_id = :tenant_id and usage_type = 'cover'"),
                {"tenant_id": tenant_id},
            )
            _seed_background_image(conn, tenant_id, cover_image)

        for sort_order, vehicle in enumerate(inventory["vehicles"]):
            conn.execute(
                text("delete from vehicles where tenant_id = :tenant_id and name = :name"),
                {"tenant_id": tenant_id, "name": vehicle["name"]},
            )
            conn.execute(
                text(
                    """
                    insert into vehicles (tenant_id, name, capacity, best_for, default_day_rate, default_note, sort_order)
                    values (:tenant_id, :name, :capacity, :best_for, :default_day_rate, :default_note, :sort_order)
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "name": vehicle["name"],
                    "capacity": vehicle["capacity"],
                    "best_for": vehicle["bestFor"],
                    "default_day_rate": vehicle.get("defaultDayRate", 0),
                    "default_note": f"Private {vehicle['name']} with driver for airport transfers, sightseeing, and intercity movement.",
                    "sort_order": sort_order,
                },
            )

        for sort_order, activity in enumerate(inventory["activities"]):
            conn.execute(
                text("delete from activities where tenant_id = :tenant_id and name = :name"),
                {"tenant_id": tenant_id, "name": activity},
            )
            conn.execute(
                text(
                    """
                    insert into activities (tenant_id, name, sort_order)
                    values (:tenant_id, :name, :sort_order)
                    """
                ),
                {"tenant_id": tenant_id, "name": activity, "sort_order": sort_order},
            )

        for sort_order, template in enumerate(discover_template_files()):
            template_id = conn.execute(
                text(
                    """
                    insert into proposal_templates (template_key, name, description, is_system)
                    values (:template_key, :name, :description, true)
                    on conflict (template_key) do update
                      set name = excluded.name,
                          description = excluded.description
                    returning id
                    """
                ),
                {
                    "template_key": template["template_key"],
                    "name": template["name"],
                    "description": template["description"],
                },
            ).scalar_one()
            conn.execute(
                text(
                    """
                    insert into tenant_template_settings (tenant_id, template_id, is_enabled, sort_order)
                    values (:tenant_id, :template_id, true, :sort_order)
                    on conflict (tenant_id, template_id) do update
                      set is_enabled = true,
                          sort_order = excluded.sort_order
                    """
                ),
                {"tenant_id": tenant_id, "template_id": template_id, "sort_order": sort_order},
            )

        _seed_tenant_profiles(conn, tenant_id, sample)

    print(f"Seeded tenant '{DEFAULT_TENANT_SLUG}'")


def _seed_images(conn, table: str, tenant_id, owner_id, owner_column: str, images: list[dict]) -> None:
    conn.execute(
        text(f"delete from {table} where tenant_id = :tenant_id and {owner_column} = :owner_id"),
        {"tenant_id": tenant_id, "owner_id": owner_id},
    )
    for sort_order, image in enumerate(images):
        media_asset_id = _insert_media_asset(conn, tenant_id, image["url"], image.get("focalPoint", "center"))
        conn.execute(
            text(
                f"""
                insert into {table}
                  (tenant_id, {owner_column}, media_asset_id, image_key, label, aspect_ratio, focal_point, sort_order)
                values
                  (:tenant_id, :owner_id, :media_asset_id, :image_key, :label, :aspect_ratio, :focal_point, :sort_order)
                """
            ),
            {
                "tenant_id": tenant_id,
                "owner_id": owner_id,
                "media_asset_id": media_asset_id,
                "image_key": image["id"],
                "label": image["label"],
                "aspect_ratio": image.get("aspect", "4:3"),
                "focal_point": image.get("focalPoint", "center"),
                "sort_order": sort_order,
            },
        )


def _seed_background_image(conn, tenant_id, image_url: str) -> None:
    media_asset_id = _insert_media_asset(conn, tenant_id, image_url, "center")
    conn.execute(
        text(
            """
            insert into background_images
              (tenant_id, media_asset_id, image_key, label, usage_type, aspect_ratio, focal_point)
            values
              (:tenant_id, :media_asset_id, 'cover', 'Cover image', 'cover', '16:9', 'center')
            """
        ),
        {"tenant_id": tenant_id, "media_asset_id": media_asset_id},
    )


def _seed_day_plans(conn, tenant_id, destination_id, destination_slug: str) -> None:
    conn.execute(
        text("delete from destination_day_plans where tenant_id = :tenant_id and destination_id = :destination_id"),
        {"tenant_id": tenant_id, "destination_id": destination_id},
    )
    for sort_order, plan in enumerate(_day_plans(destination_slug)):
        conn.execute(
            text(
                """
                insert into destination_day_plans
                  (tenant_id, destination_id, plan_key, title, summary, sort_order)
                values
                  (:tenant_id, :destination_id, :plan_key, :title, :summary, :sort_order)
                """
            ),
            {
                "tenant_id": tenant_id,
                "destination_id": destination_id,
                "plan_key": plan["key"],
                "title": plan["title"],
                "summary": plan["summary"],
                "sort_order": sort_order,
            },
        )


def _insert_media_asset(conn, tenant_id, image_url: str, focal_point: str):
    path = BASE_DIR / "static" / image_url.removeprefix("/static/")
    content = path.read_bytes()
    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return conn.execute(
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
            "file_name": path.name,
            "mime_type": mime_type,
            "file_size": len(content),
            "focal_point": focal_point,
        },
    ).scalar_one()


def _insert_optional_media_asset(conn, tenant_id, image_url: str, focal_point: str):
    path = BASE_DIR / "static" / image_url.removeprefix("/static/")
    if not path.exists():
        return None
    return _insert_media_asset(conn, tenant_id, image_url, focal_point)


def _seed_tenant_profiles(conn, tenant_id, sample: dict) -> None:
    qr_media_asset_id = _insert_optional_media_asset(
        conn,
        tenant_id,
        "/static/images/payment/valleycraft-upi-qr.png",
        "center",
    )
    conn.execute(
        text(
            """
            insert into tenant_payment_profiles
              (tenant_id, payment_terms, bank_account_name, bank_account_number, ifsc_code, upi_id, qr_media_asset_id)
            values
              (:tenant_id, :payment_terms, :bank_account_name, :bank_account_number, :ifsc_code, :upi_id, :qr_media_asset_id)
            on conflict (tenant_id) do update
              set payment_terms = excluded.payment_terms,
                  bank_account_name = excluded.bank_account_name,
                  bank_account_number = excluded.bank_account_number,
                  ifsc_code = excluded.ifsc_code,
                  upi_id = excluded.upi_id,
                  qr_media_asset_id = excluded.qr_media_asset_id,
                  updated_at = now()
            """
        ),
        {
            "tenant_id": tenant_id,
            "payment_terms": "To confirm the booking, pay 30% of the package value as advance. Balance payment is due before the start of travel. Hotel rooms, vehicles, and activities are confirmed after advance payment and supplier availability.",
            "bank_account_name": sample["company"]["name"],
            "bank_account_number": "123456789012",
            "ifsc_code": "HDFC0001234",
            "upi_id": "valleycraft@upi",
            "qr_media_asset_id": qr_media_asset_id,
        },
    )
    conn.execute(
        text(
            """
            insert into tenant_contact_profiles
              (tenant_id, contact_name, role_title, phone, whatsapp, email, website, instagram_url, google_maps_url)
            values
              (:tenant_id, :contact_name, :role_title, :phone, :whatsapp, :email, :website, :instagram_url, :google_maps_url)
            on conflict (tenant_id) do update
              set contact_name = excluded.contact_name,
                  role_title = excluded.role_title,
                  phone = excluded.phone,
                  whatsapp = excluded.whatsapp,
                  email = excluded.email,
                  website = excluded.website,
                  instagram_url = excluded.instagram_url,
                  google_maps_url = excluded.google_maps_url,
                  updated_at = now()
            """
        ),
        {
            "tenant_id": tenant_id,
            "contact_name": "Aaliya Mir",
            "role_title": "Reservations Manager",
            "phone": sample["company"]["phone"],
            "whatsapp": sample["company"]["phone"],
            "email": sample["company"]["email"],
            "website": "https://valleycraft.example",
            "instagram_url": "https://instagram.com/valleycraft",
            "google_maps_url": "https://maps.google.com/?q=ValleyCraft+Travels",
        },
    )
    conn.execute(text("delete from tenant_reviews where tenant_id = :tenant_id"), {"tenant_id": tenant_id})
    reviews = [
        ("Priya Mehta", 5, "The Kashmir itinerary was smooth, scenic, and very well coordinated. Hotels and driver support were exactly as promised.", "Direct"),
        ("Arjun Nair", 5, "Loved the day-wise planning and quick support during the trip. The proposal made it very clear what was included.", "Google"),
        ("Neha Kapoor", 4, "Good hotel choices, comfortable vehicle, and helpful local guidance. The Gulmarg day was the highlight for our family.", "Direct"),
    ]
    for sort_order, review in enumerate(reviews):
        conn.execute(
            text(
                """
                insert into tenant_reviews (tenant_id, client_name, rating, review_text, source_label, sort_order)
                values (:tenant_id, :client_name, :rating, :review_text, :source_label, :sort_order)
                """
            ),
            {
                "tenant_id": tenant_id,
                "client_name": review[0],
                "rating": review[1],
                "review_text": review[2],
                "source_label": review[3],
                "sort_order": sort_order,
            },
        )


def _hotel_summary(hotel_id: str) -> str:
    summaries = {
        "lalit-srinagar": "A heritage palace stay with landscaped gardens, old-world architecture, and easy access to Srinagar sightseeing.",
        "vivanta-srinagar": "A refined hillside hotel known for Dal Lake views, calm rooms, and a polished resort-style experience.",
        "khyber-gulmarg": "A premium mountain resort with alpine views, warm interiors, and convenient access to Gulmarg's main experiences.",
        "pine-pahalgam": "A comfortable Pahalgam stay with river-valley character, pine surroundings, and relaxed service.",
    }
    return summaries.get(hotel_id, "A comfortable stay selected for location, service quality, and fit with the itinerary.")


def _destination_description(destination_id: str) -> str:
    descriptions = {
        "srinagar": "Srinagar blends Dal Lake, Mughal gardens, old-city lanes, and relaxed waterfront evenings. Days here are designed around easy sightseeing, local crafts, and scenic lake experiences.",
        "gulmarg": "Gulmarg is known for meadows, pine forests, gondola views, and snow-season landscapes. The plan keeps enough flexibility for weather and local operating rules.",
        "pahalgam": "Pahalgam brings river valleys, saffron-route drives, and optional valley excursions. It works well as a slower scenic leg after Srinagar and Gulmarg.",
        "sonamarg": "Sonamarg offers glacier views, mountain roads, and dramatic day-trip scenery. It is best planned with an early start and weather buffer.",
    }
    return descriptions.get(destination_id, "A scenic Kashmir destination selected for its fit with the route and guest interests.")


def _day_plans(destination_id: str) -> list[dict]:
    plans = {
        "srinagar": [
            {
                "key": "arrival-dal-lake",
                "title": "Arrival, Check-in, and Dal Lake",
                "summary": "Airport pickup, hotel check-in, a relaxed shikara ride on Dal Lake, and an easy evening around the boulevard.",
            },
            {
                "key": "gardens-old-city",
                "title": "Mughal Gardens and Old City",
                "summary": "Visit Nishat, Shalimar, and Chashme Shahi, then add a short old-city craft trail or local market stop.",
            },
        ],
        "gulmarg": [
            {
                "key": "transfer-gondola-base",
                "title": "Srinagar to Gulmarg with Gondola Base",
                "summary": "Drive through Tangmarg to Gulmarg, check into the resort, and visit the gondola base area with meadow viewpoints.",
            },
            {
                "key": "gondola-meadows",
                "title": "Gulmarg Gondola and Meadow Leisure",
                "summary": "Keep the day flexible for gondola phase one, pine forest viewpoints, photography stops, and relaxed resort time.",
            },
        ],
        "pahalgam": [
            {
                "key": "saffron-lidder-drive",
                "title": "Scenic Drive to Pahalgam",
                "summary": "Travel via Pampore saffron fields and river-valley viewpoints before checking in and exploring the local market.",
            },
            {
                "key": "valleys-departure",
                "title": "Pahalgam Valleys and Departure",
                "summary": "Visit Betaab Valley or Aru Valley depending on timing, then continue toward Srinagar for the onward departure.",
            },
        ],
        "sonamarg": [
            {
                "key": "glacier-day-trip",
                "title": "Sonamarg Glacier View Day",
                "summary": "Start early for the mountain drive, spend time around glacier viewpoints, and return with flexible photo stops.",
            }
        ],
    }
    return plans.get(destination_id, [])


if __name__ == "__main__":
    main()
