HOTEL_CATEGORIES = ("2 Star", "3 Star", "4 Star", "5 Star", "Luxury")
HOTEL_ROOM_TYPES = ("Single", "Double", "Twin", "Triple", "Family", "Suite")
HOTEL_MEAL_PLANS = ("EP", "CP", "MAP", "AP")


def normalize_hotel_category(value: str | None) -> str:
    category = (value or "").strip()
    if category in HOTEL_CATEGORIES:
        return category
    return "3 Star"


def normalize_hotel_room_type(value: str | None) -> str:
    room_type = (value or "").strip()
    if room_type in HOTEL_ROOM_TYPES:
        return room_type
    return "Double"


def hotel_star_rating(category: str | None) -> int:
    normalized = normalize_hotel_category(category)
    if normalized == "Luxury":
        return 5
    return int(normalized.split(" ", 1)[0])
