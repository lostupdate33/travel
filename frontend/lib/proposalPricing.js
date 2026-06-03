export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function addIsoDays(value, offset) {
  if (!value) return value;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function makeAdditionalDay(previousDay, dayNumber, fallbackStayDay = null) {
  const previousHotelId = previousDay?.hotelId || "";
  const previousHotelName = previousDay?.hotelName || "";
  const shouldCarryPreviousHotel = Boolean(previousHotelId) && previousHotelName !== "Checkout";
  const hotelSource = shouldCarryPreviousHotel ? previousDay : fallbackStayDay;
  const shouldCarryHotel = Boolean(hotelSource?.hotelId) && hotelSource?.hotelName !== "Checkout";

  return {
    ...previousDay,
    dayNumber,
    date: addIsoDays(previousDay?.date, 1),
    title: "New Kashmir Experience",
    dayPlanId: "",
    summary: "Add the day plan, transfers, sightseeing, meal plan, and hotel details.",
    activities: ["Custom sightseeing"],
    hotelId: shouldCarryHotel ? hotelSource.hotelId : "",
    hotelName: shouldCarryHotel ? hotelSource.hotelName : "To be confirmed",
    roomType: shouldCarryHotel ? hotelSource.roomType || "" : "",
    rooms: Math.max(1, Number(hotelSource?.rooms || previousDay?.rooms || 1)),
    hotelImageId: shouldCarryHotel ? hotelSource.hotelImageId || "" : ""
  };
}

export function syncDaysToCount(days, targetCount) {
  const nextDays = days.length ? days.map((day) => ({ ...day })) : [];

  while (nextDays.length < targetCount) {
    const previousDay = nextDays[nextDays.length - 1] || {};
    const fallbackStayDay = [...nextDays].reverse().find((day) => day.hotelId && day.hotelName !== "Checkout");
    nextDays.push(makeAdditionalDay(previousDay, nextDays.length + 1, fallbackStayDay));
  }

  return nextDays
    .slice(0, targetCount)
    .map((day, index) => ({
      ...day,
      dayNumber: index + 1,
      rooms: Math.max(1, Number(day.rooms || 1))
    }));
}

export function defaultTemplateTheme(template) {
  return template?.themes?.find((theme) => theme.isDefault)?.id || template?.themes?.[0]?.id || "";
}

export function roomTypeRate(hotel, roomType) {
  return Number(hotel?.roomTypeRates?.[roomType] || hotel?.defaultRoomNightRate || 0);
}

export function mealPlanRate(hotel, mealPlan) {
  return Number(hotel?.mealPlanRates?.[mealPlan] || 0);
}

function roundCurrency(value) {
  return Math.round(Number(value || 0));
}

export function pricingLineAmount(item) {
  return roundCurrency(Number(item.quantity || 0) * Number(item.unitPrice || 0));
}

export function syncPricingTotals(pricing) {
  const lineItems = (pricing.lineItems || []).map((item) => ({
    ...item,
    quantity: Number(item.quantity || 0),
    unitPrice: Number(item.unitPrice || 0),
    amount: pricingLineAmount(item)
  }));
  const base = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const taxPercent = Number(pricing.taxPercent ?? 5);
  const taxes = roundCurrency(base * taxPercent / 100);
  const discount = roundCurrency(pricing.discount);

  return {
    currency: pricing.currency || "INR",
    defaultMealPlan: pricing.defaultMealPlan || "MAP",
    taxPercent,
    lineItems,
    base,
    taxes,
    discount,
    total: base + taxes - discount,
    isCustomized: Boolean(pricing.isCustomized),
    showDetailedQuote: Boolean(pricing.showDetailedQuote)
  };
}

function buildGeneratedLineItems(proposal, inventory) {
  const defaultMealPlan = proposal.pricing?.defaultMealPlan || "MAP";
  const lineItems = [];

  (proposal.days || []).forEach((day, index) => {
    if (!day.hotelId) return;
    const hotel = inventory.hotels.find((item) => item.id === day.hotelId);
    if (!hotel) return;

    const selectedRoomType = day.roomType || hotel.roomType || "Double";
    const selectedMealPlan = day.mealPlan || defaultMealPlan;
    const roomRate = roomTypeRate(hotel, selectedRoomType);
    const mealRate = mealPlanRate(hotel, selectedMealPlan);
    const unitPrice = roomRate + mealRate;
    const rooms = Math.max(1, Number(day.rooms || 1));
    lineItems.push({
      id: `hotel-day-${day.dayNumber || index + 1}-${hotel.id}`,
      type: "hotel",
      source: "generated",
      sourceId: hotel.id,
      dayNumber: day.dayNumber || index + 1,
      roomType: selectedRoomType,
      mealPlan: selectedMealPlan,
      roomRate,
      mealPlanRate: mealRate,
      label: `Day ${day.dayNumber || index + 1}: ${hotel.name} - ${selectedRoomType}`,
      quantity: rooms,
      unitPrice,
      isManual: false
    });
  });

  const vehicle = inventory.vehicles.find((item) => item.name === proposal.vehicle?.name);
  if (vehicle) {
    lineItems.push({
      id: `vehicle-${vehicle.id}`,
      type: "vehicle",
      source: "generated",
      sourceId: vehicle.id,
      label: vehicle.name,
      quantity: (proposal.days || []).length,
      unitPrice: Number(vehicle.defaultDayRate || 0),
      isManual: false
    });
  }

  return lineItems.map((item) => ({ ...item, amount: pricingLineAmount(item) }));
}

export function normalizePricing(proposal, inventory, { regenerate = false, preserveManual = true } = {}) {
  const currentPricing = proposal.pricing || {};
  const manualItems = preserveManual
    ? (currentPricing.lineItems || []).filter((item) => item.source === "manual")
    : [];
  const hasLineItems = Array.isArray(currentPricing.lineItems) && currentPricing.lineItems.length > 0;
  const lineItems = regenerate || !hasLineItems
    ? [...buildGeneratedLineItems(proposal, inventory), ...manualItems]
    : currentPricing.lineItems;

  return {
    ...proposal,
    pricing: syncPricingTotals({
      ...currentPricing,
      lineItems,
      isCustomized: Boolean(currentPricing.isCustomized || manualItems.length)
    })
  };
}
