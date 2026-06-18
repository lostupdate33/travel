import { HOTEL_CATEGORIES, HOTEL_ROOM_TYPES } from "./proposalConstants";

export function destinationPayload(form) {
  return {
    name: form.name,
    region: form.region,
    summary: form.summary
  };
}

export function hotelPayload(form) {
  return {
    name: form.name,
    destinationId: form.destinationId,
    category: form.category,
    roomType: form.roomType,
    defaultRoomNightRate: Number(form.defaultRoomNightRate || 0),
    roomTypeRates: Object.fromEntries(
      Object.entries(form.roomTypeRates || {}).map(([roomType, rate]) => [roomType, Number(rate || 0)])
    ),
    mealPlanRates: Object.fromEntries(
      Object.entries(form.mealPlanRates || {}).map(([mealPlan, rate]) => [mealPlan, Number(rate || 0)])
    ),
    summary: form.summary
  };
}

export function vehiclePayload(form) {
  return {
    name: form.name,
    capacity: form.capacity,
    bestFor: form.bestFor,
    defaultDayRate: Number(form.defaultDayRate || 0),
    defaultNote: form.defaultNote
  };
}

export function dayPlanPayload(form, fallbackDestinationId = "") {
  return {
    destinationId: form.destinationId || fallbackDestinationId,
    title: form.title,
    summary: form.summary
  };
}

export function destinationFormFromRecord(destination) {
  const image = destination.images?.[0] || {};
  return {
    id: destination.id,
    name: destination.name,
    region: destination.region || "",
    summary: destination.summary || "",
    imageLabel: image.label || "",
    focalPoint: image.focalPoint || "center"
  };
}

export function hotelFormFromRecord(hotel, fallbackDestinationId = "") {
  const image = hotel.images?.[0] || {};
  return {
    id: hotel.id,
    name: hotel.name,
    destinationId: hotel.destinationId || fallbackDestinationId,
    category: HOTEL_CATEGORIES.includes(hotel.category) ? hotel.category : HOTEL_CATEGORIES[1],
    roomType: HOTEL_ROOM_TYPES.includes(hotel.roomType) ? hotel.roomType : HOTEL_ROOM_TYPES[1],
    defaultRoomNightRate: hotel.defaultRoomNightRate || 0,
    roomTypeRates: hotel.roomTypeRates || {},
    mealPlanRates: hotel.mealPlanRates || {},
    summary: hotel.summary || "",
    imageLabel: image.label || "",
    focalPoint: image.focalPoint || "center"
  };
}

export function vehicleFormFromRecord(vehicle) {
  return {
    id: vehicle.id,
    name: vehicle.name,
    capacity: vehicle.capacity || "",
    bestFor: vehicle.bestFor || "",
    defaultDayRate: vehicle.defaultDayRate || 0,
    defaultNote: vehicle.defaultNote || ""
  };
}

export function dayPlanFormFromRecord(dayPlan, fallbackDestinationId = "") {
  return {
    id: dayPlan.id,
    destinationId: dayPlan.destinationId || fallbackDestinationId,
    title: dayPlan.title,
    summary: dayPlan.summary
  };
}
