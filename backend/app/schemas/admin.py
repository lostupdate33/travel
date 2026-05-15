from pydantic import BaseModel, Field, field_validator

from app.services.hotel_options import HOTEL_CATEGORIES, HOTEL_MEAL_PLANS, HOTEL_ROOM_TYPES


class DestinationAdminPayload(BaseModel):
    name: str = Field(..., min_length=1)
    region: str = ""
    summary: str = ""


class HotelAdminPayload(BaseModel):
    name: str = Field(..., min_length=1)
    destinationId: str = Field(..., min_length=1)
    category: str = HOTEL_CATEGORIES[1]
    roomType: str = HOTEL_ROOM_TYPES[1]
    defaultRoomNightRate: float = Field(0, ge=0)
    roomTypeRates: dict[str, float] = Field(default_factory=dict)
    mealPlanRates: dict[str, float] = Field(default_factory=dict)
    summary: str = ""

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str) -> str:
        category = value.strip()
        if category not in HOTEL_CATEGORIES:
            raise ValueError("Hotel category must be one of: " + ", ".join(HOTEL_CATEGORIES))
        return category

    @field_validator("roomType")
    @classmethod
    def validate_room_type(cls, value: str) -> str:
        room_type = value.strip()
        if room_type not in HOTEL_ROOM_TYPES:
            raise ValueError("Hotel room type must be one of: " + ", ".join(HOTEL_ROOM_TYPES))
        return room_type

    @field_validator("roomTypeRates")
    @classmethod
    def validate_room_type_rates(cls, value: dict[str, float]) -> dict[str, float]:
        rates: dict[str, float] = {}
        for room_type, rate in value.items():
            if room_type not in HOTEL_ROOM_TYPES:
                raise ValueError("Room type rate must be one of: " + ", ".join(HOTEL_ROOM_TYPES))
            amount = float(rate or 0)
            if amount < 0:
                raise ValueError("Room type rates must be zero or greater")
            rates[room_type] = amount
        return rates

    @field_validator("mealPlanRates")
    @classmethod
    def validate_meal_plan_rates(cls, value: dict[str, float]) -> dict[str, float]:
        rates: dict[str, float] = {}
        for meal_plan, rate in value.items():
            if meal_plan not in HOTEL_MEAL_PLANS:
                raise ValueError("Meal plan rate must be one of: " + ", ".join(HOTEL_MEAL_PLANS))
            amount = float(rate or 0)
            if amount < 0:
                raise ValueError("Meal plan rates must be zero or greater")
            rates[meal_plan] = amount
        return rates


class VehicleAdminPayload(BaseModel):
    name: str = Field(..., min_length=1)
    capacity: str = ""
    bestFor: str = ""
    defaultDayRate: float = Field(0, ge=0)
    defaultNote: str = ""


class DayPlanAdminPayload(BaseModel):
    destinationId: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    summary: str = Field(..., min_length=1)
