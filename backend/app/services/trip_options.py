from enum import Enum
from typing import Any


class TripDuration(str, Enum):
    TWO_NIGHTS_THREE_DAYS = "2 Nights / 3 Days"
    THREE_NIGHTS_FOUR_DAYS = "3 Nights / 4 Days"
    FOUR_NIGHTS_FIVE_DAYS = "4 Nights / 5 Days"
    FIVE_NIGHTS_SIX_DAYS = "5 Nights / 6 Days"
    SIX_NIGHTS_SEVEN_DAYS = "6 Nights / 7 Days"
    SEVEN_NIGHTS_EIGHT_DAYS = "7 Nights / 8 Days"
    EIGHT_NIGHTS_NINE_DAYS = "8 Nights / 9 Days"
    NINE_NIGHTS_TEN_DAYS = "9 Nights / 10 Days"
    TEN_NIGHTS_ELEVEN_DAYS = "10 Nights / 11 Days"


DEFAULT_TRIP_DURATION = TripDuration.FIVE_NIGHTS_SIX_DAYS.value

TRIP_DURATIONS: list[dict[str, Any]] = [
    {
        "id": duration.name.lower().replace("_", "-"),
        "label": duration.value,
        "nights": index + 2,
        "days": index + 3,
        "isDefault": duration.value == DEFAULT_TRIP_DURATION,
    }
    for index, duration in enumerate(TripDuration)
]


def normalize_trip_duration(value: str | None) -> str:
    if value in {duration.value for duration in TripDuration}:
        return str(value)
    return DEFAULT_TRIP_DURATION
