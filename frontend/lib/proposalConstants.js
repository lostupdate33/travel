export const HOTEL_CATEGORIES = ["2 Star", "3 Star", "4 Star", "5 Star", "Luxury"];
export const HOTEL_ROOM_TYPES = ["Single", "Double", "Twin", "Triple", "Family", "Suite"];
export const HOTEL_MEAL_PLANS = ["EP", "CP", "MAP", "AP"];

export const TRIP_DURATIONS = [
  { id: "two-nights-three-days", label: "2 Nights / 3 Days", nights: 2, days: 3, isDefault: false },
  { id: "three-nights-four-days", label: "3 Nights / 4 Days", nights: 3, days: 4, isDefault: false },
  { id: "four-nights-five-days", label: "4 Nights / 5 Days", nights: 4, days: 5, isDefault: false },
  { id: "five-nights-six-days", label: "5 Nights / 6 Days", nights: 5, days: 6, isDefault: true },
  { id: "six-nights-seven-days", label: "6 Nights / 7 Days", nights: 6, days: 7, isDefault: false },
  { id: "seven-nights-eight-days", label: "7 Nights / 8 Days", nights: 7, days: 8, isDefault: false },
  { id: "eight-nights-nine-days", label: "8 Nights / 9 Days", nights: 8, days: 9, isDefault: false },
  { id: "nine-nights-ten-days", label: "9 Nights / 10 Days", nights: 9, days: 10, isDefault: false },
  { id: "ten-nights-eleven-days", label: "10 Nights / 11 Days", nights: 10, days: 11, isDefault: false }
];

export const emptyDestinationForm = {
  id: "",
  name: "",
  region: "",
  summary: "",
  imageLabel: "",
  focalPoint: "center"
};

export const emptyHotelForm = {
  id: "",
  name: "",
  destinationId: "",
  category: HOTEL_CATEGORIES[1],
  roomType: HOTEL_ROOM_TYPES[1],
  defaultRoomNightRate: 0,
  roomTypeRates: {},
  mealPlanRates: {},
  summary: "",
  imageLabel: "",
  focalPoint: "center"
};

export const emptyVehicleForm = {
  id: "",
  name: "",
  capacity: "",
  bestFor: "",
  defaultDayRate: 0,
  defaultNote: ""
};

export const emptyBackgroundForm = {
  label: "Cover image",
  focalPoint: "center"
};

export const emptyDayPlanForm = {
  id: "",
  destinationId: "",
  title: "",
  summary: ""
};
