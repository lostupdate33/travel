"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Car,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Hotel,
  Image as ImageIcon,
  IndianRupee,
  MapPin,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Sun,
  Trash2
} from "lucide-react";

import { StepperInput } from "../components/StepperInput";
import {
  fetchBuilderData,
  fetchProposalPdf,
  sendJsonRequest,
  uploadImageRequest
} from "../lib/api";
import {
  dayPlanFormFromRecord,
  dayPlanPayload,
  destinationFormFromRecord,
  destinationPayload,
  hotelFormFromRecord,
  hotelPayload,
  vehicleFormFromRecord,
  vehiclePayload
} from "../lib/adminForms";
import { useProposalPreview } from "../hooks/useProposalPreview";
import { useThemePreference } from "../hooks/useThemePreference";
import { currency } from "../lib/format";
import {
  HOTEL_CATEGORIES,
  HOTEL_MEAL_PLANS,
  HOTEL_ROOM_TYPES,
  TRIP_DURATIONS,
  emptyBackgroundForm,
  emptyDayPlanForm,
  emptyDestinationForm,
  emptyHotelForm,
  emptyVehicleForm
} from "../lib/proposalConstants";
import {
  clone,
  defaultTemplateTheme,
  makeAdditionalDay,
  normalizePricing,
  roomTypeRate,
  syncDaysToCount,
  syncPricingTotals
} from "../lib/proposalPricing";

const SUBTITLE_FORMATS = [
  {
    id: "curated",
    name: "Curated",
    template: "A curated {dayCount}-day private journey through {destinations}"
  },
  {
    id: "comfort",
    name: "Comfort",
    template: "{duration} with {stayStyle} stays, private transfers, and flexible sightseeing across {destinations}"
  },
  {
    id: "family",
    name: "Family",
    template: "A relaxed Kashmir plan for {travelers}, covering {destinations} with scenic days and easy pacing"
  },
  {
    id: "concise",
    name: "Concise",
    template: "{destinations} | {duration} | {travelers}"
  }
];

function joinList(items) {
  const values = [...new Set(items.filter(Boolean))];
  if (values.length <= 2) return values.join(" and ");
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function durationDayCount(duration) {
  const match = String(duration || "").match(/(\d+)\s*Days?/i);
  return match ? Number(match[1]) : null;
}

function travelerLabel(travelers = {}) {
  const adults = Math.max(1, Number(travelers.adults || 1));
  const children = Math.max(0, Number(travelers.children || 0));
  return `${adults} adult${adults === 1 ? "" : "s"}${children ? ` and ${children} child${children === 1 ? "" : "ren"}` : ""}`;
}

function stayStyleLabel(days = [], inventory) {
  const hotelById = new Map((inventory?.hotels || []).map((hotel) => [hotel.id, hotel]));
  const categories = days.map((day) => hotelById.get(day.hotelId)?.category).filter(Boolean);
  if (categories.some((category) => ["Luxury", "5 Star"].includes(category))) return "premium";
  if (categories.some((category) => ["4 Star", "Deluxe"].includes(category))) return "comfortable";
  return "handpicked";
}

function subtitleFromFormat(formatId, proposal, inventory) {
  const format = SUBTITLE_FORMATS.find((item) => item.id === formatId) || SUBTITLE_FORMATS[0];
  const dayCount = durationDayCount(proposal?.trip?.duration) || proposal?.days?.length || 1;
  const destinationById = new Map((inventory?.destinations || []).map((destination) => [destination.id, destination.name]));
  const destinations = joinList((proposal?.days || []).map((day) => destinationById.get(day.destinationId) || day.destination));
  const values = {
    dayCount,
    destinations: destinations || "Kashmir",
    duration: proposal?.trip?.duration || `${dayCount} Days`,
    stayStyle: stayStyleLabel(proposal?.days || [], inventory),
    travelers: travelerLabel(proposal?.trip?.travelers)
  };

  return format.template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

function maybeRegeneratePricing(proposal, inventory) {
  if (proposal.pricing?.isCustomized) {
    return {
      ...proposal,
      pricing: syncPricingTotals(proposal.pricing)
    };
  }

  return normalizePricing(proposal, inventory, { regenerate: true, preserveManual: false });
}

export default function Home() {
  // inventory is the Kashmir master data used by dropdowns.
  const [inventory, setInventory] = useState(null);
  const [activeView, setActiveView] = useState("proposal");
  const [theme, setTheme] = useThemePreference();
  const [adminMessage, setAdminMessage] = useState("");
  const [destinationForm, setDestinationForm] = useState(emptyDestinationForm);
  const [hotelForm, setHotelForm] = useState(emptyHotelForm);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [backgroundForm, setBackgroundForm] = useState(emptyBackgroundForm);
  const [dayPlanForm, setDayPlanForm] = useState(emptyDayPlanForm);
  const [destinationImageFile, setDestinationImageFile] = useState(null);
  const [hotelImageFile, setHotelImageFile] = useState(null);
  const [backgroundImageFile, setBackgroundImageFile] = useState(null);
  const [subtitleFormat, setSubtitleFormat] = useState("curated");
  const [isSubtitleAuto, setIsSubtitleAuto] = useState(true);

  // proposal is the editable working copy generated for the current session.
  const [proposal, setProposal] = useState(null);

  const [activeDay, setActiveDay] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [mealPlanStatus, setMealPlanStatus] = useState("");
  const [roomsStatus, setRoomsStatus] = useState("");
  const mealPlanStatusTimer = useRef(null);
  const roomsStatusTimer = useRef(null);
  const previewHtml = useProposalPreview(proposal, (error) => setAdminMessage(error.message));
  const generatedSubtitle = useMemo(
    () => proposal && inventory ? subtitleFromFormat(subtitleFormat, proposal, inventory) : "",
    [inventory, proposal, subtitleFormat]
  );

  function showMealPlanStatus(message) {
    setMealPlanStatus(message);
    if (mealPlanStatusTimer.current) {
      window.clearTimeout(mealPlanStatusTimer.current);
    }
    mealPlanStatusTimer.current = window.setTimeout(() => setMealPlanStatus(""), 2800);
  }

  function showRoomsStatus(message) {
    setRoomsStatus(message);
    if (roomsStatusTimer.current) {
      window.clearTimeout(roomsStatusTimer.current);
    }
    roomsStatusTimer.current = window.setTimeout(() => setRoomsStatus(""), 2800);
  }

  useEffect(() => {
    async function load() {
      try {
        const { inventory: loadedInventory, proposal: sampleProposal } = await fetchBuilderData();
        setInventory(loadedInventory);
        setProposal(normalizePricing(sampleProposal, loadedInventory, { regenerate: true, preserveManual: true }));
        setHotelForm((current) => ({
          ...current,
          destinationId: sampleProposal.days?.[0]?.destinationId || ""
        }));
        setDayPlanForm((current) => ({
          ...current,
          destinationId: sampleProposal.days?.[0]?.destinationId || ""
        }));
      } catch (error) {
        setAdminMessage(error.message);
      }
    }

    load();
  }, []);

  useEffect(() => () => {
    if (mealPlanStatusTimer.current) {
      window.clearTimeout(mealPlanStatusTimer.current);
    }
    if (roomsStatusTimer.current) {
      window.clearTimeout(roomsStatusTimer.current);
    }
  }, []);

  useEffect(() => {
    if (!isSubtitleAuto || !generatedSubtitle) return;

    setProposal((current) => {
      if (!current || current.trip?.subtitle === generatedSubtitle) return current;
      const next = clone(current);
      next.trip.subtitle = generatedSubtitle;
      return next;
    });
  }, [generatedSubtitle, isSubtitleAuto]);

  const hotelByDestination = useMemo(() => {
    if (!inventory) return {};

    // Group hotels by destination id so the active day only shows relevant
    // hotel choices after a destination is selected.
    return inventory.hotels.reduce((groups, hotel) => {
      groups[hotel.destinationId] = groups[hotel.destinationId] || [];
      groups[hotel.destinationId].push(hotel);
      return groups;
    }, {});
  }, [inventory]);

  const tripDurationOptions = useMemo(() => {
    const options = inventory?.tripDurations?.length ? inventory.tripDurations : TRIP_DURATIONS;
    if (!proposal?.trip?.duration || options.some((option) => option.label === proposal.trip.duration)) {
      return options;
    }

    return [
      ...options,
      {
        id: "current-duration",
        label: proposal.trip.duration,
        nights: null,
        days: null,
        isDefault: false
      }
    ];
  }, [inventory, proposal?.trip?.duration]);

  const selectedDurationOption = tripDurationOptions.find((duration) => duration.label === proposal?.trip?.duration);
  const expectedItineraryDays = selectedDurationOption?.days || proposal?.days?.length || 1;
  const hasItineraryMismatch = Boolean(proposal?.days) && proposal.days.length !== expectedItineraryDays;

  function updateProposal(path, value) {
    // Generic nested updater for top-level proposal sections like trip,
    // customer, pricing, and vehicle.
    setProposal((current) => {
      const next = clone(current);
      let pointer = next;
      path.slice(0, -1).forEach((key) => {
        if (pointer[key] == null) {
          pointer[key] = {};
        }
        pointer = pointer[key];
      });
      pointer[path[path.length - 1]] = value;
      return next;
    });
  }

  function updatePricing(value) {
    setProposal((current) => {
      const next = clone(current);
      next.pricing = syncPricingTotals({
        ...next.pricing,
        ...value
      });
      return next;
    });
  }

  function regeneratePricing() {
    setProposal((current) => {
      const shouldReplace = !current.pricing?.isCustomized || window.confirm("Replace generated pricing from the current itinerary and keep manual rows?");
      if (!shouldReplace) return current;
      return normalizePricing(clone(current), inventory, { regenerate: true, preserveManual: true });
    });
  }

  function updatePricingLine(index, patch) {
    setProposal((current) => {
      const next = clone(current);
      const lineItems = next.pricing.lineItems || [];
      const currentItem = lineItems[index];
      lineItems[index] = {
        ...currentItem,
        ...patch,
        isManual: true
      };
      next.pricing = syncPricingTotals({
        ...next.pricing,
        lineItems,
        isCustomized: true
      });
      return next;
    });
  }

  function addManualPricingLine() {
    setProposal((current) => {
      const next = clone(current);
      const lineItems = next.pricing.lineItems || [];
      lineItems.push({
        id: `manual-${Date.now()}`,
        type: "manual",
        source: "manual",
        sourceId: "",
        label: "Manual charge",
        quantity: 1,
        unitPrice: 0,
        amount: 0,
        isManual: true
      });
      next.pricing = syncPricingTotals({
        ...next.pricing,
        lineItems,
        isCustomized: true
      });
      return next;
    });
  }

  function removePricingLine(index) {
    setProposal((current) => {
      const next = clone(current);
      const lineItems = (next.pricing.lineItems || []).filter((_, itemIndex) => itemIndex !== index);
      next.pricing = syncPricingTotals({
        ...next.pricing,
        lineItems,
        isCustomized: true
      });
      return next;
    });
  }

  function matchItineraryToDuration(durationLabel = proposal.trip.duration) {
    const duration = tripDurationOptions.find((option) => option.label === durationLabel);
    const targetDays = duration?.days;
    if (!targetDays) return false;

    if (targetDays < proposal.days.length) {
      const shouldTrim = window.confirm(`This duration uses ${targetDays} itinerary days. Trim the extra ${proposal.days.length - targetDays} day(s)?`);
      if (!shouldTrim) return false;
    }

    setProposal((current) => {
      const next = clone(current);
      next.days = syncDaysToCount(next.days, targetDays);
      return maybeRegeneratePricing(next, inventory);
    });
    setActiveDay((current) => Math.min(current, targetDays - 1));
    return true;
  }

  function changeTripDuration(durationLabel) {
    const duration = tripDurationOptions.find((option) => option.label === durationLabel);
    const targetDays = duration?.days;

    if (targetDays && targetDays < proposal.days.length) {
      const shouldTrim = window.confirm(`Changing to ${durationLabel} will trim the itinerary to ${targetDays} day(s). Continue?`);
      if (!shouldTrim) return;
    }

    setProposal((current) => {
      const next = clone(current);
      next.trip.duration = durationLabel;
      if (targetDays) {
        next.days = syncDaysToCount(next.days, targetDays);
      }
      return maybeRegeneratePricing(next, inventory);
    });

    if (targetDays) {
      setActiveDay((current) => Math.min(current, targetDays - 1));
    }
  }

  function changeTemplate(templateId) {
    const template = inventory.templates.find((item) => item.id === templateId);
    setProposal((current) => {
      const next = clone(current);
      next.templateId = templateId;
      next.visualTheme = defaultTemplateTheme(template);
      return next;
    });
  }

  function updateDay(index, key, value) {
    // Day updates are common enough to keep separate from the generic path
    // updater. This keeps itinerary field handlers readable.
    setProposal((current) => {
      const next = clone(current);
      next.days[index][key] = value;
      return next;
    });
  }

  function updateRemark(index, value) {
    setProposal((current) => {
      const next = clone(current);
      next.remarks = next.remarks || [];
      next.remarks[index] = value;
      return next;
    });
  }

  function addRemark() {
    setProposal((current) => {
      const next = clone(current);
      next.remarks = [...(next.remarks || []), ""];
      return next;
    });
  }

  function removeRemark(index) {
    setProposal((current) => {
      const next = clone(current);
      next.remarks = (next.remarks || []).filter((_, itemIndex) => itemIndex !== index);
      return next;
    });
  }

  function changeDayDestination(index, destinationId) {
    setProposal((current) => {
      const next = clone(current);
      const destination = inventory.destinations.find((item) => item.id === destinationId);
      const destinationImage = destination?.images?.[0];
      const dayPlan = (inventory.dayPlans || []).find((item) => item.destinationId === destinationId);
      const hotels = hotelByDestination[destinationId] || [];
      const currentHotel = hotels.find((hotel) => hotel.id === next.days[index].hotelId);
      const selectedHotel = currentHotel || hotels[0];

      next.days[index] = {
        ...next.days[index],
        destinationId,
        destination: destination?.name || "",
        dayPlanId: dayPlan?.id || "",
        title: dayPlan?.title || next.days[index].title,
        summary: dayPlan?.summary || next.days[index].summary,
        destinationImageId: destinationImage?.id || "",
        image: destinationImage?.url || "",
        hotelId: selectedHotel ? selectedHotel.id : "",
        hotelName: selectedHotel ? selectedHotel.name : "To be confirmed",
        roomType: selectedHotel ? selectedHotel.roomType : "",
        hotelImageId: selectedHotel?.images?.[0]?.id || ""
      };
      return maybeRegeneratePricing(next, inventory);
    });
  }

  function changeDayHotel(index, hotelId) {
    setProposal((current) => {
      const next = clone(current);
      const hotel = inventory.hotels.find((item) => item.id === hotelId);

      next.days[index] = {
        ...next.days[index],
        hotelId: hotel?.id || "",
        hotelName: hotel?.name || hotelId,
        roomType: hotel?.roomType || "",
        hotelImageId: hotel?.images?.[0]?.id || ""
      };
      return maybeRegeneratePricing(next, inventory);
    });
  }

  function changeDayRoomType(index, roomType) {
    setProposal((current) => {
      const next = clone(current);
      next.days[index] = {
        ...next.days[index],
        roomType
      };
      return maybeRegeneratePricing(next, inventory);
    });
  }

  function changeDayRooms(index, rooms) {
    setProposal((current) => {
      const next = clone(current);
      next.days[index] = {
        ...next.days[index],
        rooms
      };
      return maybeRegeneratePricing(next, inventory);
    });
    showRoomsStatus(`Day ${index + 1} set to ${rooms} room${rooms === 1 ? "" : "s"}.`);
  }

  function applyRoomsToAllDays(rooms) {
    const selectedRooms = Math.max(1, Number(rooms || 1));
    const dayCount = proposal.days.length;
    setProposal((current) => {
      const next = clone(current);
      next.days = next.days.map((day) => ({
        ...day,
        rooms: selectedRooms
      }));
      return maybeRegeneratePricing(next, inventory);
    });
    showRoomsStatus(`${selectedRooms} room${selectedRooms === 1 ? "" : "s"} applied to ${dayCount} days.`);
  }

  function changeDayMealPlan(index, mealPlan) {
    setProposal((current) => {
      const next = clone(current);
      next.days[index] = {
        ...next.days[index],
        mealPlan
      };
      return maybeRegeneratePricing(next, inventory);
    });
    showMealPlanStatus(`Day ${index + 1} meal plan set to ${mealPlan || "default"}.`);
  }

  function applyMealPlanToAllDays(mealPlan) {
    const selectedMealPlan = mealPlan || proposal.pricing?.defaultMealPlan || "MAP";
    const dayCount = proposal.days.length;
    setProposal((current) => {
      const next = clone(current);
      next.days = next.days.map((day) => ({
        ...day,
        mealPlan: selectedMealPlan
      }));
      return maybeRegeneratePricing(next, inventory);
    });
    showMealPlanStatus(`${selectedMealPlan} applied to ${dayCount} days.`);
  }

  function addDay() {
    // New days inherit the previous day's image/date shape so users do not start
    // from a completely blank object.
    setProposal((current) => {
      const next = clone(current);
      const last = next.days[next.days.length - 1];
      const fallbackStayDay = [...next.days].reverse().find((day) => day.hotelId && day.hotelName !== "Checkout");
      next.days.push(makeAdditionalDay(last, next.days.length + 1, fallbackStayDay));
      setActiveDay(next.days.length - 1);
      return maybeRegeneratePricing(next, inventory);
    });
  }

  function removeDay(index) {
    // Day numbers are display values, so re-number them after deletion.
    setProposal((current) => {
      const next = clone(current);
      next.days.splice(index, 1);
      next.days = next.days.map((day, dayIndex) => ({ ...day, dayNumber: dayIndex + 1 }));
      setActiveDay(Math.max(0, index - 1));
      return maybeRegeneratePricing(next, inventory);
    });
  }

  async function exportPdf() {
    if (!proposal) return;
    setIsExporting(true);

    try {
      const blob = await fetchProposalPdf(proposal);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      // Trigger a normal browser download without navigating away from the app.
      link.href = url;
      link.download = `${proposal.slug || "travel-proposal"}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setAdminMessage(error.message);
    } finally {
      setIsExporting(false);
    }
  }

  async function sendAdminRequest(path, options) {
    const nextInventory = await sendJsonRequest(path, options);
    setInventory(nextInventory);
    return nextInventory;
  }

  async function uploadAdminImage(path, file, label, focalPoint) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("label", label || "Primary image");
    formData.append("focal_point", focalPoint || "center");

    const nextInventory = await uploadImageRequest(path, formData);
    setInventory(nextInventory);
    return nextInventory;
  }

  async function submitDestination(event) {
    event.preventDefault();
    setAdminMessage("");

    const isEditing = Boolean(destinationForm.id);
    const path = isEditing
      ? `/api/admin/destinations/${encodeURIComponent(destinationForm.id)}`
      : "/api/admin/destinations";

    try {
      const nextInventory = await sendAdminRequest(path, {
        method: isEditing ? "PATCH" : "POST",
        body: JSON.stringify(destinationPayload(destinationForm))
      });
      const savedDestination = isEditing
        ? { id: destinationForm.id }
        : nextInventory.destinations.find((destination) => destination.name === destinationForm.name);
      if (destinationImageFile && savedDestination?.id) {
        await uploadAdminImage(
          `/api/admin/destinations/${encodeURIComponent(savedDestination.id)}/images`,
          destinationImageFile,
          destinationForm.imageLabel || destinationForm.name,
          destinationForm.focalPoint
        );
      }
      setDestinationForm(emptyDestinationForm);
      setDestinationImageFile(null);
      setAdminMessage(isEditing ? "Destination updated." : "Destination added.");
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  function editDestination(destination) {
    setDestinationForm(destinationFormFromRecord(destination));
    setDestinationImageFile(null);
    setActiveView("inventory");
  }

  async function archiveDestination(destinationId) {
    setAdminMessage("");
    try {
      await sendAdminRequest(`/api/admin/destinations/${encodeURIComponent(destinationId)}`, { method: "DELETE" });
      setAdminMessage("Destination archived.");
      if (destinationForm.id === destinationId) {
        setDestinationForm(emptyDestinationForm);
      }
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function submitHotel(event) {
    event.preventDefault();
    setAdminMessage("");

    const isEditing = Boolean(hotelForm.id);
    const path = isEditing
      ? `/api/admin/hotels/${encodeURIComponent(hotelForm.id)}`
      : "/api/admin/hotels";

    try {
      const nextInventory = await sendAdminRequest(path, {
        method: isEditing ? "PATCH" : "POST",
        body: JSON.stringify(hotelPayload(hotelForm))
      });
      const savedHotel = isEditing
        ? { id: hotelForm.id }
        : nextInventory.hotels.find((hotel) => hotel.name === hotelForm.name);
      if (hotelImageFile && savedHotel?.id) {
        await uploadAdminImage(
          `/api/admin/hotels/${encodeURIComponent(savedHotel.id)}/images`,
          hotelImageFile,
          hotelForm.imageLabel || hotelForm.name,
          hotelForm.focalPoint
        );
      }
      setHotelForm({
        ...emptyHotelForm,
        destinationId: inventory.destinations[0]?.id || ""
      });
      setHotelImageFile(null);
      setAdminMessage(isEditing ? "Hotel updated." : "Hotel added.");
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  function editHotel(hotel) {
    setHotelForm(hotelFormFromRecord(hotel, inventory.destinations[0]?.id || ""));
    setHotelImageFile(null);
    setActiveView("inventory");
  }

  async function archiveHotel(hotelId) {
    setAdminMessage("");
    try {
      await sendAdminRequest(`/api/admin/hotels/${encodeURIComponent(hotelId)}`, { method: "DELETE" });
      setAdminMessage("Hotel archived.");
      if (hotelForm.id === hotelId) {
        setHotelForm({
          ...emptyHotelForm,
          destinationId: inventory.destinations[0]?.id || ""
        });
      }
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function submitVehicle(event) {
    event.preventDefault();
    setAdminMessage("");

    const isEditing = Boolean(vehicleForm.id);
    const path = isEditing
      ? `/api/admin/vehicles/${encodeURIComponent(vehicleForm.id)}`
      : "/api/admin/vehicles";

    try {
      await sendAdminRequest(path, {
        method: isEditing ? "PATCH" : "POST",
        body: JSON.stringify(vehiclePayload(vehicleForm))
      });
      setVehicleForm(emptyVehicleForm);
      setAdminMessage(isEditing ? "Vehicle updated." : "Vehicle added.");
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  function editVehicle(vehicle) {
    setVehicleForm(vehicleFormFromRecord(vehicle));
    setActiveView("inventory");
  }

  async function archiveVehicle(vehicleId) {
    setAdminMessage("");
    try {
      await sendAdminRequest(`/api/admin/vehicles/${encodeURIComponent(vehicleId)}`, { method: "DELETE" });
      setAdminMessage("Vehicle archived.");
      if (vehicleForm.id === vehicleId) {
        setVehicleForm(emptyVehicleForm);
      }
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function submitBackgroundImage(event) {
    event.preventDefault();
    setAdminMessage("");

    if (!backgroundImageFile) {
      setAdminMessage("Choose an image file first.");
      return;
    }

    try {
      await uploadAdminImage(
        "/api/admin/background-images",
        backgroundImageFile,
        backgroundForm.label,
        backgroundForm.focalPoint
      );
      setBackgroundForm(emptyBackgroundForm);
      setBackgroundImageFile(null);
      setAdminMessage("Background image uploaded.");
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function submitDayPlan(event) {
    event.preventDefault();
    setAdminMessage("");

    const isEditing = Boolean(dayPlanForm.id);
    const path = isEditing
      ? `/api/admin/day-plans/${encodeURIComponent(dayPlanForm.id)}`
      : "/api/admin/day-plans";

    try {
      await sendAdminRequest(path, {
        method: isEditing ? "PATCH" : "POST",
        body: JSON.stringify(dayPlanPayload(dayPlanForm, inventory.destinations[0]?.id || ""))
      });
      setDayPlanForm({
        ...emptyDayPlanForm,
        destinationId: inventory.destinations[0]?.id || ""
      });
      setAdminMessage(isEditing ? "Day plan updated." : "Day plan added.");
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  function editDayPlan(dayPlan) {
    setDayPlanForm(dayPlanFormFromRecord(dayPlan, inventory.destinations[0]?.id || ""));
    setActiveView("inventory");
  }

  async function archiveDayPlan(dayPlanId) {
    setAdminMessage("");
    try {
      await sendAdminRequest(`/api/admin/day-plans/${encodeURIComponent(dayPlanId)}`, { method: "DELETE" });
      setAdminMessage("Day plan archived.");
      if (dayPlanForm.id === dayPlanId) {
        setDayPlanForm({
          ...emptyDayPlanForm,
          destinationId: inventory.destinations[0]?.id || ""
        });
      }
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  if (!inventory || !proposal) {
    return <div className="loading">{adminMessage || "Loading Kashmir proposal builder..."}</div>;
  }

  const day = proposal.days[activeDay];
  const activeTemplate = inventory.templates.find((template) => template.id === proposal.templateId) || inventory.templates[0];
  const activeTemplateThemes = activeTemplate?.themes || [];
  const selectedDestination = inventory.destinations.find((item) => item.id === day.destinationId) || inventory.destinations.find((item) => item.name === day.destination);

  // If a destination cannot be matched, show all hotels rather than leaving the
  // hotel select empty. This is useful while users manually edit JSON/data.
  const availableHotels = hotelByDestination[selectedDestination?.id] || inventory.hotels;
  const selectedHotel = inventory.hotels.find((item) => item.id === day.hotelId) || inventory.hotels.find((item) => item.name === day.hotelName);
  const availableDayPlans = (inventory.dayPlans || []).filter((plan) => plan.destinationId === selectedDestination?.id);
  const destinationImages = selectedDestination?.images || [];
  const hotelImages = selectedHotel?.images || [];
  const selectedRoomType = day.roomType || selectedHotel?.roomType || "";
  const selectedRooms = Math.max(1, Number(day.rooms || 1));
  const effectiveMealPlan = day.mealPlan || proposal.pricing.defaultMealPlan || "MAP";
  const visibleDayStart = Math.max(0, Math.min(activeDay - 1, proposal.days.length - 3));
  const visibleDayTabs = proposal.days
    .map((item, index) => ({ item, index }))
    .slice(visibleDayStart, visibleDayStart + 3);

  function changeDayPlan(index, dayPlanId) {
    const dayPlan = (inventory.dayPlans || []).find((item) => item.id === dayPlanId);
    setProposal((current) => {
      const next = clone(current);
      next.days[index] = {
        ...next.days[index],
        dayPlanId,
        title: dayPlan?.title || next.days[index].title,
        summary: dayPlan?.summary || next.days[index].summary
      };
      return next;
    });
  }

  return (
    <main className="app-shell" data-theme={theme}>
      {/* Left navigation is a product placeholder in v0.1.0. Only Proposal is active. */}
      <aside className="sidebar">
        <div className="logo">
          <Sparkles size={22} />
          <div>
            <strong>Travel Ideate</strong>
            <span>Kashmir proposals</span>
          </div>
        </div>

        <nav>
          <button className={activeView === "proposal" ? "active" : ""} onClick={() => setActiveView("proposal")}>Proposal</button>
          <button className={activeView === "inventory" ? "active" : ""} onClick={() => setActiveView("inventory")}>Inventory</button>
          <button disabled>Templates</button>
          <button disabled>Customers</button>
        </nav>

        <div className="template-card">
          <span>Active template</span>
          <strong>{activeTemplate.name}</strong>
          <p>{activeTemplate.description}</p>
        </div>
      </aside>

      <section className="builder">
        {/* Sticky header keeps export available while editing long itineraries. */}
        <header className="topbar">
          <div>
            <p>{activeView === "proposal" ? "Proposal Builder" : "Tenant Inventory"}</p>
            <h1>{activeView === "proposal" ? proposal.trip.title : "Destinations, hotels, and images"}</h1>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button theme-toggle"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {activeView === "proposal" && (
              <button className="primary-button" onClick={exportPdf} disabled={isExporting}>
                {isExporting ? <RefreshCw size={18} /> : <Download size={18} />}
                {isExporting ? "Exporting" : "Export PDF"}
              </button>
            )}
          </div>
        </header>

        {activeView === "inventory" ? (
          <div className="inventory-workspace">
            <section className="admin-grid">
              <form className="panel" onSubmit={submitDestination}>
                <div className="panel-title with-action">
                  <div>
                    <MapPin size={18} />
                    <h2>{destinationForm.id ? "Edit Destination" : "Add Destination"}</h2>
                  </div>
                  {destinationForm.id && (
                    <button type="button" className="text-button" onClick={() => setDestinationForm(emptyDestinationForm)}>
                      Clear
                    </button>
                  )}
                </div>
                <div className="form-grid">
                  <label>
                    Name
                    <input required value={destinationForm.name} onChange={(event) => setDestinationForm({ ...destinationForm, name: event.target.value })} />
                  </label>
                  <label>
                    Region
                    <input value={destinationForm.region} onChange={(event) => setDestinationForm({ ...destinationForm, region: event.target.value })} />
                  </label>
                  <label>
                    Image label
                    <input value={destinationForm.imageLabel} onChange={(event) => setDestinationForm({ ...destinationForm, imageLabel: event.target.value })} />
                  </label>
                  <label>
                    Image file
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setDestinationImageFile(event.target.files?.[0] || null)} />
                  </label>
                </div>
                <label>
                  Summary
                  <textarea value={destinationForm.summary} onChange={(event) => setDestinationForm({ ...destinationForm, summary: event.target.value })} />
                </label>
                <label>
                  Image focal point
                  <input value={destinationForm.focalPoint} onChange={(event) => setDestinationForm({ ...destinationForm, focalPoint: event.target.value })} />
                </label>
                <button className="primary-button" type="submit">
                  {destinationForm.id ? <Save size={18} /> : <Plus size={18} />}
                  {destinationForm.id ? "Save destination" : "Add destination"}
                </button>
              </form>

              <form className="panel" onSubmit={submitHotel}>
                <div className="panel-title with-action">
                  <div>
                    <Hotel size={18} />
                    <h2>{hotelForm.id ? "Edit Hotel" : "Add Hotel"}</h2>
                  </div>
                  {hotelForm.id && (
                    <button type="button" className="text-button" onClick={() => setHotelForm({ ...emptyHotelForm, destinationId: inventory.destinations[0]?.id || "" })}>
                      Clear
                    </button>
                  )}
                </div>
                <div className="form-grid">
                  <label>
                    Destination
                    <select
                      required
                      value={hotelForm.destinationId || inventory.destinations[0]?.id || ""}
                      onChange={(event) => setHotelForm({ ...hotelForm, destinationId: event.target.value })}
                    >
                      {inventory.destinations.map((destination) => (
                        <option key={destination.id} value={destination.id}>{destination.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Hotel name
                    <input required value={hotelForm.name} onChange={(event) => setHotelForm({ ...hotelForm, name: event.target.value })} />
                  </label>
                  <label>
                    Category
                    <select required value={hotelForm.category} onChange={(event) => setHotelForm({ ...hotelForm, category: event.target.value })}>
                      {HOTEL_CATEGORIES.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Room type
                    <select required value={hotelForm.roomType} onChange={(event) => setHotelForm({ ...hotelForm, roomType: event.target.value })}>
                      {HOTEL_ROOM_TYPES.map((roomType) => (
                        <option key={roomType} value={roomType}>{roomType}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Default rate
                    <input type="number" min="0" value={hotelForm.defaultRoomNightRate} onChange={(event) => setHotelForm({ ...hotelForm, defaultRoomNightRate: Number(event.target.value) })} />
                  </label>
                  <label>
                    Image label
                    <input value={hotelForm.imageLabel} onChange={(event) => setHotelForm({ ...hotelForm, imageLabel: event.target.value })} />
                  </label>
                  <label>
                    Image file
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setHotelImageFile(event.target.files?.[0] || null)} />
                  </label>
                  <label>
                    Image focal point
                    <input value={hotelForm.focalPoint} onChange={(event) => setHotelForm({ ...hotelForm, focalPoint: event.target.value })} />
                  </label>
                </div>
                <div className="room-rate-grid">
                  {HOTEL_ROOM_TYPES.map((roomType) => (
                    <label key={roomType}>
                      {roomType} rate
                      <input
                        type="number"
                        min="0"
                        value={hotelForm.roomTypeRates?.[roomType] || ""}
                        onChange={(event) => setHotelForm({
                          ...hotelForm,
                          roomTypeRates: {
                            ...(hotelForm.roomTypeRates || {}),
                            [roomType]: Number(event.target.value || 0)
                          }
                        })}
                      />
                    </label>
                  ))}
                </div>
                <div className="room-rate-grid">
                  {HOTEL_MEAL_PLANS.map((mealPlan) => (
                    <label key={mealPlan}>
                      {mealPlan} meal rate
                      <input
                        type="number"
                        min="0"
                        value={hotelForm.mealPlanRates?.[mealPlan] || ""}
                        onChange={(event) => setHotelForm({
                          ...hotelForm,
                          mealPlanRates: {
                            ...(hotelForm.mealPlanRates || {}),
                            [mealPlan]: Number(event.target.value || 0)
                          }
                        })}
                      />
                    </label>
                  ))}
                </div>
                <label>
                  Summary
                  <textarea value={hotelForm.summary} onChange={(event) => setHotelForm({ ...hotelForm, summary: event.target.value })} placeholder="Central location, mountain views, family-friendly rooms" />
                </label>
                <button className="primary-button" type="submit">
                  {hotelForm.id ? <Save size={18} /> : <Plus size={18} />}
                  {hotelForm.id ? "Save hotel" : "Add hotel"}
                </button>
              </form>

              <form className="panel" onSubmit={submitVehicle}>
                <div className="panel-title with-action">
                  <div>
                    <Car size={18} />
                    <h2>{vehicleForm.id ? "Edit Vehicle" : "Add Vehicle"}</h2>
                  </div>
                  {vehicleForm.id && (
                    <button type="button" className="text-button" onClick={() => setVehicleForm(emptyVehicleForm)}>
                      Clear
                    </button>
                  )}
                </div>
                <div className="form-grid">
                  <label>
                    Name
                    <input required value={vehicleForm.name} onChange={(event) => setVehicleForm({ ...vehicleForm, name: event.target.value })} />
                  </label>
                  <label>
                    Capacity
                    <input value={vehicleForm.capacity} onChange={(event) => setVehicleForm({ ...vehicleForm, capacity: event.target.value })} />
                  </label>
                  <label>
                    Day rate
                    <input type="number" min="0" value={vehicleForm.defaultDayRate} onChange={(event) => setVehicleForm({ ...vehicleForm, defaultDayRate: Number(event.target.value) })} />
                  </label>
                </div>
                <label>
                  Best for
                  <input value={vehicleForm.bestFor} onChange={(event) => setVehicleForm({ ...vehicleForm, bestFor: event.target.value })} />
                </label>
                <label>
                  Default note
                  <textarea value={vehicleForm.defaultNote} onChange={(event) => setVehicleForm({ ...vehicleForm, defaultNote: event.target.value })} />
                </label>
                <button className="primary-button" type="submit">
                  {vehicleForm.id ? <Save size={18} /> : <Plus size={18} />}
                  {vehicleForm.id ? "Save vehicle" : "Add vehicle"}
                </button>
              </form>

              <form className="panel" onSubmit={submitBackgroundImage}>
                <div className="panel-title">
                  <ImageIcon size={18} />
                  <h2>Background Images</h2>
                </div>
                <div className="form-grid">
                  <label>
                    Label
                    <input value={backgroundForm.label} onChange={(event) => setBackgroundForm({ ...backgroundForm, label: event.target.value })} />
                  </label>
                  <label>
                    Focal point
                    <input value={backgroundForm.focalPoint} onChange={(event) => setBackgroundForm({ ...backgroundForm, focalPoint: event.target.value })} />
                  </label>
                  <label>
                    Image file
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setBackgroundImageFile(event.target.files?.[0] || null)} />
                  </label>
                </div>
                <button className="primary-button" type="submit">
                  <Plus size={18} />
                  Upload background
                </button>
              </form>

              <form className="panel" onSubmit={submitDayPlan}>
                <div className="panel-title with-action">
                  <div>
                    <CalendarDays size={18} />
                    <h2>{dayPlanForm.id ? "Edit Day Plan" : "Add Day Plan"}</h2>
                  </div>
                  {dayPlanForm.id && (
                    <button type="button" className="text-button" onClick={() => setDayPlanForm({ ...emptyDayPlanForm, destinationId: inventory.destinations[0]?.id || "" })}>
                      Clear
                    </button>
                  )}
                </div>
                <div className="form-grid">
                  <label>
                    Destination
                    <select
                      required
                      value={dayPlanForm.destinationId || inventory.destinations[0]?.id || ""}
                      onChange={(event) => setDayPlanForm({ ...dayPlanForm, destinationId: event.target.value })}
                    >
                      {inventory.destinations.map((destination) => (
                        <option key={destination.id} value={destination.id}>{destination.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Title
                    <input required value={dayPlanForm.title} onChange={(event) => setDayPlanForm({ ...dayPlanForm, title: event.target.value })} />
                  </label>
                </div>
                <label>
                  Summary, comma separated bullets
                  <textarea required value={dayPlanForm.summary} onChange={(event) => setDayPlanForm({ ...dayPlanForm, summary: event.target.value })} />
                </label>
                <button className="primary-button" type="submit">
                  {dayPlanForm.id ? <Save size={18} /> : <Plus size={18} />}
                  {dayPlanForm.id ? "Save day plan" : "Add day plan"}
                </button>
              </form>
            </section>

            {adminMessage && <p className="status-line">{adminMessage}</p>}

            <section className="admin-grid">
              <div className="panel">
                <div className="panel-title">
                  <Database size={18} />
                  <h2>Destinations</h2>
                </div>
                <div className="admin-list">
                  {inventory.destinations.map((destination) => (
                    <div className="admin-row" key={destination.id}>
                      <div>
                        <strong>{destination.name}</strong>
                        <span>{destination.region || "No region"} · {destination.images?.length || 0} images</span>
                      </div>
                      <div className="admin-actions">
                        <button className="icon-button" title="Edit destination" onClick={() => editDestination(destination)}>
                          <Pencil size={16} />
                        </button>
                        <button className="danger-button" onClick={() => archiveDestination(destination.id)}>
                          <Trash2 size={16} />
                          Archive
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel">
                <div className="panel-title">
                  <Hotel size={18} />
                  <h2>Hotels</h2>
                </div>
                <div className="admin-list">
                  {inventory.hotels.map((hotel) => {
                    const hotelDestination = inventory.destinations.find((destination) => destination.id === hotel.destinationId);
                    return (
                      <div className="admin-row" key={hotel.id}>
                        <div>
                          <strong>{hotel.name}</strong>
                          <span>{hotelDestination?.name || "No destination"} · {hotel.category || "No category"} · {hotel.roomType || "No room type"} · INR {currency(hotel.defaultRoomNightRate)} default · {hotel.images?.length || 0} images</span>
                        </div>
                        <div className="admin-actions">
                          <button className="icon-button" title="Edit hotel" onClick={() => editHotel(hotel)}>
                            <Pencil size={16} />
                          </button>
                          <button className="danger-button" onClick={() => archiveHotel(hotel.id)}>
                            <Trash2 size={16} />
                            Archive
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="panel">
                <div className="panel-title">
                  <Car size={18} />
                  <h2>Vehicles</h2>
                </div>
                <div className="admin-list">
                  {inventory.vehicles.map((vehicle) => (
                    <div className="admin-row" key={vehicle.id}>
                      <div>
                        <strong>{vehicle.name}</strong>
                        <span>{vehicle.capacity || "No capacity"} · INR {currency(vehicle.defaultDayRate)} / day · {vehicle.bestFor || "No best-for note"}</span>
                      </div>
                      <div className="admin-actions">
                        <button className="icon-button" title="Edit vehicle" onClick={() => editVehicle(vehicle)}>
                          <Pencil size={16} />
                        </button>
                        <button className="danger-button" onClick={() => archiveVehicle(vehicle.id)}>
                          <Trash2 size={16} />
                          Archive
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel">
                <div className="panel-title">
                  <ImageIcon size={18} />
                  <h2>Backgrounds</h2>
                </div>
                <div className="admin-list">
                  {(inventory.backgroundImages || []).map((image) => (
                    <div className="admin-row" key={image.id}>
                      <div>
                        <strong>{image.label}</strong>
                        <span>{image.usageType} · {image.focalPoint}</span>
                      </div>
                      <img className="admin-thumb" src={image.url} alt={image.label} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel">
                <div className="panel-title">
                  <CalendarDays size={18} />
                  <h2>Day Plans</h2>
                </div>
                <div className="admin-list">
                  {(inventory.dayPlans || []).map((dayPlan) => {
                    const planDestination = inventory.destinations.find((destination) => destination.id === dayPlan.destinationId);
                    return (
                      <div className="admin-row" key={dayPlan.id}>
                        <div>
                          <strong>{dayPlan.title}</strong>
                          <span>{planDestination?.name || "No destination"} · {dayPlan.summary}</span>
                        </div>
                        <div className="admin-actions">
                          <button className="icon-button" title="Edit day plan" onClick={() => editDayPlan(dayPlan)}>
                            <Pencil size={16} />
                          </button>
                          <button className="danger-button" onClick={() => archiveDayPlan(dayPlan.id)}>
                            <Trash2 size={16} />
                            Archive
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        ) : (
        <div className="workspace">
          {/* Editor column: structured data entry. Users do not edit template HTML. */}
          <section className="editor">
            <div className="panel">
              {/* Trip basics map to proposal.trip and proposal.customer. */}
              <div className="panel-title">
                <MapPin size={18} />
                <h2>Trip Basics</h2>
              </div>
              <div className="form-grid">
                <label>
                  Template
                  <select value={proposal.templateId} onChange={(event) => changeTemplate(event.target.value)}>
                    {inventory.templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Trip title
                  <input value={proposal.trip.title} onChange={(event) => updateProposal(["trip", "title"], event.target.value)} />
                </label>
                <label>
                  Customer
                  <input value={proposal.customer.name} onChange={(event) => updateProposal(["customer", "name"], event.target.value)} />
                </label>
                <label>
                  Duration
                  <select value={proposal.trip.duration} onChange={(event) => changeTripDuration(event.target.value)}>
                    {tripDurationOptions.map((duration) => (
                      <option key={duration.id} value={duration.label}>
                        {duration.label}
                        {duration.isDefault ? " (Recommended)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start date
                  <input type="date" value={proposal.trip.startDate} onChange={(event) => updateProposal(["trip", "startDate"], event.target.value)} />
                </label>
                <StepperInput
                  label="Adults"
                  value={proposal.trip.travelers.adults}
                  min={1}
                  onChange={(value) => updateProposal(["trip", "travelers", "adults"], value)}
                />
                <StepperInput
                  label="Children"
                  value={proposal.trip.travelers.children}
                  min={0}
                  onChange={(value) => updateProposal(["trip", "travelers", "children"], value)}
                />
              </div>
              {activeTemplateThemes.length > 0 && (
                <div className="theme-swatches" aria-label="Template theme options">
                  {activeTemplateThemes.map((themeOption) => (
                    <button
                      key={themeOption.id}
                      className={themeOption.id === (proposal.visualTheme || defaultTemplateTheme(activeTemplate)) ? "selected" : ""}
                      type="button"
                      onClick={() => updateProposal(["visualTheme"], themeOption.id)}
                      title={themeOption.name}
                    >
                      <span>{themeOption.name}</span>
                      <i>
                        {(themeOption.swatches || []).map((color) => (
                          <b key={color} style={{ background: color }} />
                        ))}
                      </i>
                    </button>
                  ))}
                </div>
              )}
              <label>
                Subtitle
                <div className="subtitle-formats" aria-label="Subtitle format options">
                  {SUBTITLE_FORMATS.map((format) => (
                    <button
                      key={format.id}
                      className={isSubtitleAuto && subtitleFormat === format.id ? "selected" : ""}
                      type="button"
                      onClick={() => {
                        setSubtitleFormat(format.id);
                        setIsSubtitleAuto(true);
                      }}
                    >
                      <span>{format.name}</span>
                      <small>{subtitleFromFormat(format.id, proposal, inventory)}</small>
                    </button>
                  ))}
                </div>
                <textarea
                  value={proposal.trip.subtitle}
                  onChange={(event) => {
                    setIsSubtitleAuto(false);
                    updateProposal(["trip", "subtitle"], event.target.value);
                  }}
                />
              </label>
            </div>

            <div className="panel">
              {/* Itinerary editor changes one active day at a time. */}
              <div className="panel-title with-action">
                <div>
                  <CalendarDays size={18} />
                  <h2>Itinerary</h2>
                </div>
                <button className="icon-button" onClick={addDay} title="Add day">
                  <Plus size={18} />
                </button>
              </div>

              <div className="day-picker">
                <button
                  className="icon-button day-step"
                  type="button"
                  onClick={() => setActiveDay((current) => Math.max(current - 1, 0))}
                  disabled={activeDay === 0}
                  title="Previous day"
                  aria-label="Previous day"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="day-picker-body">
                  <div className="active-day-summary">
                    <strong>Day {day.dayNumber} of {proposal.days.length}</strong>
                    <span>{day.title}</span>
                  </div>
                  <div className="day-tabs" aria-label="Itinerary days">
                    {visibleDayTabs.map(({ item, index }) => (
                      <button
                        key={item.dayNumber}
                        className={index === activeDay ? "selected" : ""}
                        type="button"
                        onClick={() => setActiveDay(index)}
                        aria-label={`Edit day ${item.dayNumber}`}
                        aria-current={index === activeDay ? "step" : undefined}
                      >
                        <span>Day</span>
                        <strong>{item.dayNumber}</strong>
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  className="icon-button day-step"
                  type="button"
                  onClick={() => setActiveDay((current) => Math.min(current + 1, proposal.days.length - 1))}
                  disabled={activeDay === proposal.days.length - 1}
                  title="Next day"
                  aria-label="Next day"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              {hasItineraryMismatch && (
                <div className="consistency-note">
                  <span>
                    Duration expects {expectedItineraryDays} day(s). Current itinerary has {proposal.days.length}.
                  </span>
                  <button className="text-button" type="button" onClick={() => matchItineraryToDuration()}>
                    Match duration
                  </button>
                </div>
              )}

              <div className="form-grid">
                <label>
                  Destination
                  <select value={selectedDestination?.id || ""} onChange={(event) => changeDayDestination(activeDay, event.target.value)}>
                    {inventory.destinations.map((destination) => (
                      <option key={destination.id} value={destination.id}>{destination.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Hotel
                  {/* Hotel options are filtered from inventory by selected destination. */}
                  <select value={selectedHotel?.id || day.hotelName} onChange={(event) => changeDayHotel(activeDay, event.target.value)}>
                    <option value="To be confirmed">To be confirmed</option>
                    <option value="Checkout">Checkout</option>
                    {availableHotels.map((hotel) => (
                      <option key={hotel.id} value={hotel.id}>{hotel.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Room type
                  <select value={selectedRoomType} onChange={(event) => changeDayRoomType(activeDay, event.target.value)} disabled={!selectedHotel}>
                    {!selectedHotel && <option>No room type</option>}
                    {HOTEL_ROOM_TYPES.map((roomType) => (
                      <option key={roomType} value={roomType}>
                        {roomType} - INR {currency(roomTypeRate(selectedHotel, roomType))}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="day-bulk-field">
                  <div className="day-bulk-control">
                    <StepperInput
                      label="Rooms"
                      value={selectedRooms}
                      min={1}
                      onChange={(rooms) => changeDayRooms(activeDay, rooms)}
                    />
                    <button className="secondary-button compact-button" type="button" onClick={() => applyRoomsToAllDays(selectedRooms)}>
                      Apply to all
                    </button>
                  </div>
                  <div className="day-bulk-feedback" role="status" aria-live="polite">
                    {roomsStatus || `Day ${day.dayNumber} uses ${selectedRooms} room${selectedRooms === 1 ? "" : "s"}.`}
                  </div>
                </div>
                <label>
                  <span className="inline-label"><ImageIcon size={16} /> Destination image</span>
                  <select value={day.destinationImageId || destinationImages[0]?.id || ""} onChange={(event) => updateDay(activeDay, "destinationImageId", event.target.value)}>
                    {destinationImages.map((image) => (
                      <option key={image.id} value={image.id}>{image.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="inline-label"><ImageIcon size={16} /> Hotel image</span>
                  <select value={day.hotelImageId || hotelImages[0]?.id || ""} onChange={(event) => updateDay(activeDay, "hotelImageId", event.target.value)} disabled={!selectedHotel}>
                    {!selectedHotel && <option>No hotel image</option>}
                    {hotelImages.map((image) => (
                      <option key={image.id} value={image.id}>{image.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Day plan
                  <select value={day.dayPlanId || ""} onChange={(event) => changeDayPlan(activeDay, event.target.value)}>
                    <option value="">Custom plan</option>
                    {availableDayPlans.map((dayPlan) => (
                      <option key={dayPlan.id} value={dayPlan.id}>{dayPlan.title}</option>
                    ))}
                  </select>
                </label>
                <div className="day-bulk-field">
                  <div className="day-bulk-control">
                    <label>
                      Meal plan
                      <select value={day.mealPlan || ""} onChange={(event) => changeDayMealPlan(activeDay, event.target.value)}>
                        <option value="">Use default ({proposal.pricing.defaultMealPlan || "MAP"})</option>
                        {(inventory.mealPlans || []).map((mealPlan) => (
                          <option key={mealPlan.id} value={mealPlan.id}>{mealPlan.name}</option>
                        ))}
                      </select>
                    </label>
                    <button className="secondary-button compact-button" type="button" onClick={() => applyMealPlanToAllDays(day.mealPlan)}>
                      Apply to all
                    </button>
                  </div>
                  <div className="day-bulk-feedback" role="status" aria-live="polite">
                    {mealPlanStatus || `Day ${day.dayNumber} uses ${effectiveMealPlan}.`}
                  </div>
                </div>
              </div>

              <label>
                Activities, comma separated
                <input value={day.activities.join(", ")} onChange={(event) => updateDay(activeDay, "activities", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} />
              </label>
              <button className="danger-button" onClick={() => removeDay(activeDay)} disabled={proposal.days.length === 1}>
                <Trash2 size={16} />
                Remove this day
              </button>
            </div>

            <div className="panel">
              <div className="panel-title">
                <Sparkles size={18} />
                <h2>Proposal Sections</h2>
              </div>
              <div className="form-grid">
                <label>
                  Checklist
                  <select
                    value={proposal.selectedSections?.checklistId || "kashmir_essentials"}
                    onChange={(event) => updateProposal(["selectedSections", "checklistId"], event.target.value)}
                  >
                    {(inventory.sectionOptions?.checklists || []).map((checklist) => (
                      <option key={checklist.id} value={checklist.id}>{checklist.title}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Cancellation policy
                  <select
                    value={proposal.selectedSections?.cancellationPolicyId || "standard"}
                    onChange={(event) => updateProposal(["selectedSections", "cancellationPolicyId"], event.target.value)}
                  >
                    {(inventory.sectionOptions?.cancellationPolicies || []).map((policy) => (
                      <option key={policy.id} value={policy.id}>{policy.title}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="toggle-grid">
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={proposal.selectedSections?.showChecklist !== false}
                    onChange={(event) => updateProposal(["selectedSections", "showChecklist"], event.target.checked)}
                  />
                  Show checklist
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={proposal.selectedSections?.showReviews !== false}
                    onChange={(event) => updateProposal(["selectedSections", "showReviews"], event.target.checked)}
                  />
                  Show reviews
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={proposal.selectedSections?.showRemarks === true}
                    onChange={(event) => updateProposal(["selectedSections", "showRemarks"], event.target.checked)}
                  />
                  Show remarks
                </label>
              </div>
              {proposal.selectedSections?.showRemarks === true && (
                <div className="remarks-editor">
                  {(proposal.remarks || []).map((remark, index) => (
                    <div className="remark-row" key={index}>
                      <input value={remark} onChange={(event) => updateRemark(index, event.target.value)} />
                      <button className="icon-button" type="button" onClick={() => removeRemark(index)} title="Remove remark">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <button className="secondary-button" type="button" onClick={addRemark}>
                    <Plus size={16} />
                    Add remark
                  </button>
                </div>
              )}
            </div>

            <div className="panel pricing-panel">
              {/* Vehicle and pricing are separate proposal sections rendered later in the PDF. */}
              <div>
                <div className="panel-title">
                  <Car size={18} />
                  <h2>Vehicle</h2>
                </div>
                <select
                  value={proposal.vehicle.name}
                  onChange={(event) => {
                    const vehicle = inventory.vehicles.find((item) => item.name === event.target.value);
                    if (!vehicle) return;

                    // Copy the selected vehicle into the current proposal payload.
                    setProposal((current) => {
                      const next = clone(current);
                      next.vehicle = {
                        name: vehicle.name,
                        capacity: vehicle.capacity,
                        note: vehicle.defaultNote || `Private ${vehicle.name} with driver for airport transfers, sightseeing, and intercity movement.`
                      };
                      return maybeRegeneratePricing(next, inventory);
                    });
                  }}
                >
                  {inventory.vehicles.map((vehicle) => (
                    <option key={vehicle.id}>{vehicle.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="panel-title">
                  <IndianRupee size={18} />
                  <h2>Pricing</h2>
                </div>
                <div className="price-inputs">
                  <label>
                    Tax %
                    <input type="number" min="0" value={proposal.pricing.taxPercent ?? 5} onChange={(event) => updatePricing({ taxPercent: Number(event.target.value) })} />
                  </label>
                  <label>
                    Discount
                    <input type="number" min="0" value={proposal.pricing.discount} onChange={(event) => updatePricing({ discount: Number(event.target.value) })} />
                  </label>
                </div>
                <div className="pricing-lines">
                  <div className="pricing-line pricing-line-head">
                    <span>Item</span>
                    <span>Qty</span>
                    <span>Rate</span>
                    <span>Amount</span>
                    <span></span>
                  </div>
                  {(proposal.pricing.lineItems || []).map((item, index) => (
                    <div className="pricing-line" key={item.id || index}>
                      <div className="pricing-item-cell">
                        <input
                          aria-label="Pricing item label"
                          value={item.label}
                          onChange={(event) => updatePricingLine(index, { label: event.target.value })}
                        />
                        {item.type === "hotel" && Number(item.mealPlanRate || 0) > 0 && (
                          <span>
                            + meal INR {currency(item.mealPlanRate || 0)}
                          </span>
                        )}
                      </div>
                      {item.type === "hotel" && item.source === "generated" ? (
                        <span className="pricing-quantity-text">{item.quantity}</span>
                      ) : (
                        <StepperInput
                          label="Quantity"
                          value={item.quantity}
                          min={0}
                          onChange={(quantity) => updatePricingLine(index, { quantity })}
                          className="pricing-quantity"
                          hideLabel
                        />
                      )}
                      <input
                        aria-label="Unit price"
                        type="number"
                        min="0"
                        value={item.unitPrice}
                        onChange={(event) => updatePricingLine(index, { unitPrice: Number(event.target.value) })}
                      />
                      <strong>INR {currency(item.amount)}</strong>
                      <button className="icon-button" type="button" title="Remove pricing line" onClick={() => removePricingLine(index)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="pricing-actions">
                  <button className="secondary-button" type="button" onClick={addManualPricingLine}>
                    <Plus size={16} />
                    Add manual line
                  </button>
                  <button className="secondary-button" type="button" onClick={regeneratePricing}>
                    <RefreshCw size={16} />
                    Regenerate
                  </button>
                </div>
                <div className="pricing-summary">
                  <div><span>Subtotal</span><strong>INR {currency(proposal.pricing.base)}</strong></div>
                  <div><span>Tax ({proposal.pricing.taxPercent ?? 5}%)</span><strong>INR {currency(proposal.pricing.taxes)}</strong></div>
                  <div><span>Discount</span><strong>- INR {currency(proposal.pricing.discount)}</strong></div>
                  <div className="total"><span>Total</span><strong>INR {currency(proposal.pricing.total)}</strong></div>
                </div>
              </div>
            </div>
          </section>

          {/* Preview column: iframe displays backend-rendered HTML exactly as the PDF sees it. */}
          <section className="preview-panel">
            <div className="preview-header">
              <div>
                <Hotel size={18} />
                <strong>Live Proposal Preview</strong>
              </div>
              <span>A4 HTML template</span>
            </div>
            <iframe title="Proposal preview" srcDoc={previewHtml} />
          </section>
        </div>
        )}
      </section>
    </main>
  );
}
