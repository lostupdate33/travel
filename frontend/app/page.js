"use client";

import dynamic from "next/dynamic";
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
  LogOut,
  MapPin,
  Moon,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Sparkles,
  Sun,
  Trash2
} from "lucide-react";

import { LoginScreen, SetupPasswordScreen } from "../components/AuthScreens";
import { PrintGuideModal } from "../components/PrintGuideModal";
import { StepperInput } from "../components/StepperInput";
import { openProposalPrintWindow } from "../lib/browserPrint";
import {
  fetchBuilderData,
  fetchCurrentUser,
  fetchOwnerTenants,
  fetchProposalPdf,
  fetchTeamMembers,
  loginRequest,
  logoutRequest,
  saveProposalSnapshot,
  sendJsonRequest,
  setupPasswordRequest,
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

const InvoicePanel = dynamic(() => import("../components/InvoicePanel").then((module) => module.InvoicePanel));
const InvoicesDashboard = dynamic(() => import("../components/InvoicesDashboard").then((module) => module.InvoicesDashboard));
const LeadsDashboard = dynamic(() => import("../components/LeadsDashboard").then((module) => module.LeadsDashboard));
const OwnerPanel = dynamic(() => import("../components/OwnerPanel").then((module) => module.OwnerPanel));
const PipelineDashboard = dynamic(() => import("../components/PipelineDashboard").then((module) => module.PipelineDashboard));
const ProposalsDashboard = dynamic(() => import("../components/ProposalsDashboard").then((module) => module.ProposalsDashboard));
const TeamPanel = dynamic(() => import("../components/TeamPanel").then((module) => module.TeamPanel));

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

function nonNegativeNumberInput(value) {
  const clean = String(value || "").replace(/[^\d.]/g, "");
  const [integerPart, ...decimalParts] = clean.split(".");
  return decimalParts.length ? `${integerPart}.${decimalParts.join("")}` : integerPart;
}

function blockInvalidNumberKey(event) {
  if (["e", "E", "+", "-"].includes(event.key)) {
    event.preventDefault();
  }
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

function normalizeDayForInventory(day, inventory, hotelByDestinationMap) {
  const destinations = inventory?.destinations || [];
  const destination =
    destinations.find((item) => item.id === day.destinationId) ||
    destinations.find((item) => item.name === day.destination) ||
    destinations[0];
  if (!destination) return day;

  const destinationImages = destination.images || [];
  const destinationImage =
    destinationImages.find((image) => image.id === day.destinationImageId || image.imageKey === day.destinationImageId) ||
    destinationImages[0];
  const hotels = hotelByDestinationMap[destination.id] || [];
  const selectedHotel =
    hotels.find((hotel) => hotel.id === day.hotelId) ||
    hotels.find((hotel) => hotel.name === day.hotelName);
  const dayPlan = (inventory.dayPlans || []).find((item) => item.id === day.dayPlanId && item.destinationId === destination.id);

  return {
    ...day,
    destinationId: destination.id,
    destination: destination.name,
    destinationImageId: destinationImage?.id || "",
    image: destinationImage?.url || day.image || "",
    hotelId: selectedHotel?.id || "",
    hotelName: selectedHotel?.name || "To be confirmed",
    roomType: selectedHotel ? day.roomType || selectedHotel.roomType || "" : "",
    hotelImageId: selectedHotel?.images?.find((image) => image.id === day.hotelImageId || image.imageKey === day.hotelImageId)?.id || selectedHotel?.images?.[0]?.id || "",
    dayPlanId: dayPlan?.id || ""
  };
}

function normalizeProposalForInventory(proposal, inventory) {
  const hotelByDestinationMap = (inventory?.hotels || []).reduce((groups, hotel) => {
    groups[hotel.destinationId] = groups[hotel.destinationId] || [];
    groups[hotel.destinationId].push(hotel);
    return groups;
  }, {});

  return {
    ...proposal,
    days: (proposal.days || []).map((day) => normalizeDayForInventory(day, inventory, hotelByDestinationMap))
  };
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
  const [activeView, setActiveView] = useState("leads");
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [setupToken, setSetupToken] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [setupForm, setSetupForm] = useState({ password: "", confirmPassword: "" });
  const [authMessage, setAuthMessage] = useState("");
  const [theme, setTheme] = useThemePreference();
  const [adminMessage, setAdminMessage] = useState("");
  const [isLoadingBuilderData, setIsLoadingBuilderData] = useState(false);
  const [proposalSaveStatus, setProposalSaveStatus] = useState("idle");
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
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamForm, setTeamForm] = useState({ name: "", email: "", role: "editor" });
  const [teamSetupLink, setTeamSetupLink] = useState("");
  const [ownerTenants, setOwnerTenants] = useState([]);
  const [ownerTenantForm, setOwnerTenantForm] = useState({ slug: "", name: "", email: "", phone: "" });
  const [ownerAdminForm, setOwnerAdminForm] = useState({ tenantSlug: "", name: "", email: "" });
  const [ownerSetupLink, setOwnerSetupLink] = useState("");
  const [ownerTenantTemplates, setOwnerTenantTemplates] = useState({ tenant: null, templates: [] });
  const [showBrowserPrintGuide, setShowBrowserPrintGuide] = useState(false);
  const [prefilledInvoice, setPrefilledInvoice] = useState(null);
  const [prefilledInvoiceRecord, setPrefilledInvoiceRecord] = useState(null);
  const [proposalLead, setProposalLead] = useState(null);
  const [leadInitialFilters, setLeadInitialFilters] = useState({});

  // proposal is the editable working copy generated for the current session.
  const [proposal, setProposal] = useState(null);

  const [activeDay, setActiveDay] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [mealPlanStatus, setMealPlanStatus] = useState("");
  const [roomsStatus, setRoomsStatus] = useState("");
  const mealPlanStatusTimer = useRef(null);
  const roomsStatusTimer = useRef(null);
  const proposalSaveStatusTimer = useRef(null);
  const destinationFormRef = useRef(null);
  const hotelFormRef = useRef(null);
  const vehicleFormRef = useRef(null);
  const dayPlanFormRef = useRef(null);
  const previewHtml = useProposalPreview(activeView === "proposal" ? proposal : null, (error) => setAdminMessage(error.message));
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

  function focusInventoryForm(ref) {
    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function ensureBuilderData() {
    if (inventory && proposal) {
      return { inventory, proposal };
    }

    setIsLoadingBuilderData(true);
    try {
      const { inventory: loadedInventory, proposal: sampleProposal } = await fetchBuilderData();
      const inventoryProposal = normalizeProposalForInventory(sampleProposal, loadedInventory);
      const normalizedProposal = normalizePricing(inventoryProposal, loadedInventory, { regenerate: true, preserveManual: true });
      setInventory(loadedInventory);
      setProposal(normalizedProposal);
      setHotelForm((current) => ({
        ...current,
        destinationId: normalizedProposal.days?.[0]?.destinationId || ""
      }));
      setDayPlanForm((current) => ({
        ...current,
        destinationId: normalizedProposal.days?.[0]?.destinationId || ""
      }));
      return { inventory: loadedInventory, proposal: normalizedProposal };
    } catch (error) {
      setAdminMessage(error.message);
      throw error;
    } finally {
      setIsLoadingBuilderData(false);
    }
  }

  useEffect(() => {
    setSetupToken(new URLSearchParams(window.location.search).get("token") || "");
  }, []);

  useEffect(() => {
    if (setupToken === null) return;
    if (setupToken) {
      setAuthChecked(true);
      return;
    }

    async function loadSession() {
      try {
        const { user } = await fetchCurrentUser();
        setCurrentUser(user);
      } catch {
        setCurrentUser(null);
      } finally {
        setAuthChecked(true);
      }
    }

    loadSession();
  }, [setupToken]);

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.isPlatformOwner && !currentUser.tenant_slug) {
      setActiveView("owner");
      setInventory(null);
      setProposal(null);
      return;
    }

    if (["proposal", "inventory"].includes(activeView)) {
      ensureBuilderData().catch(() => {});
    }
  }, [activeView, currentUser]);

  useEffect(() => () => {
    if (mealPlanStatusTimer.current) {
      window.clearTimeout(mealPlanStatusTimer.current);
    }
    if (roomsStatusTimer.current) {
      window.clearTimeout(roomsStatusTimer.current);
    }
    if (proposalSaveStatusTimer.current) {
      window.clearTimeout(proposalSaveStatusTimer.current);
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
    if (!template) return;
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

  async function saveCurrentProposal() {
    if (!proposal) return;
    setAdminMessage("");
    setProposalSaveStatus("saving");
    try {
      const data = await saveProposalSnapshot(proposal, proposalLead?.id || "");
      setAdminMessage(`Saved proposal for ${data.proposal.customerName}.`);
      setProposalSaveStatus("saved");
      if (proposalSaveStatusTimer.current) {
        window.clearTimeout(proposalSaveStatusTimer.current);
      }
      proposalSaveStatusTimer.current = window.setTimeout(() => setProposalSaveStatus("idle"), 2200);
    } catch (error) {
      setAdminMessage(error.message);
      setProposalSaveStatus("error");
    }
  }

  function printInBrowser() {
    if (!previewHtml) {
      setAdminMessage("Proposal preview is still loading.");
      return;
    }

    const printTitle = `${proposal?.trip?.title || "Travel Proposal"} - ${proposal?.customer?.name || "Customer"}`;
    if (!openProposalPrintWindow({ previewHtml, printTitle })) {
      setAdminMessage("Allow pop-ups to use browser PDF export.");
    }
  }

  function openBrowserPrintGuide() {
    if (!previewHtml) {
      setAdminMessage("Proposal preview is still loading.");
      return;
    }
    setShowBrowserPrintGuide(true);
  }

  function confirmBrowserPrint() {
    setShowBrowserPrintGuide(false);
    printInBrowser();
  }

  async function generateProposalFromLead(lead) {
    let builderData;
    try {
      builderData = await ensureBuilderData();
    } catch {
      return;
    }
    setProposalLead(lead);
    setProposal((current) => {
      if (!current) return current;
      const next = clone(current);
      next.customer = {
        ...(next.customer || {}),
        name: lead.customerName || next.customer?.name || "",
        email: lead.email || next.customer?.email || "",
        phone: lead.phone || lead.whatsapp || next.customer?.phone || ""
      };
      next.trip = {
        ...(next.trip || {}),
        title: lead.destinationInterest
          ? `${lead.destinationInterest} ${lead.tripType || "Travel"} Plan`
          : next.trip?.title || "Travel Proposal",
        startDate: lead.expectedStartDate || next.trip?.startDate || "",
        travelers: {
          adults: Math.max(1, Number(lead.travelerCount || 1)),
          children: 0
        }
      };
      return maybeRegeneratePricing(next, builderData.inventory);
    });
    setIsSubtitleAuto(true);
    setActiveView("proposal");
    setAdminMessage(`Builder prepared for ${lead.customerName}.`);
  }

  async function openSavedProposal(savedProposal) {
    let builderData;
    try {
      builderData = await ensureBuilderData();
    } catch {
      return;
    }
    setProposal(normalizePricing(savedProposal, builderData.inventory, { regenerate: false, preserveManual: true }));
    setProposalLead(null);
    setActiveDay(0);
    setActiveView("proposal");
    setAdminMessage(`Opened saved proposal for ${savedProposal.customer?.name || savedProposal.trip?.title || "customer"}.`);
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
    setAdminMessage(`Editing destination: ${destination.name}.`);
    setActiveView("inventory");
    focusInventoryForm(destinationFormRef);
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
    setAdminMessage(`Editing hotel: ${hotel.name}.`);
    setActiveView("inventory");
    focusInventoryForm(hotelFormRef);
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
    setAdminMessage(`Editing vehicle: ${vehicle.name}.`);
    setActiveView("inventory");
    focusInventoryForm(vehicleFormRef);
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

  async function archiveBackgroundImage(imageId) {
    setAdminMessage("");
    try {
      await sendAdminRequest(`/api/admin/background-images/${encodeURIComponent(imageId)}`, { method: "DELETE" });
      setAdminMessage("Background image archived.");
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
    setAdminMessage(`Editing day plan: ${dayPlan.title}.`);
    setActiveView("inventory");
    focusInventoryForm(dayPlanFormRef);
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

  async function submitLogin(event) {
    event.preventDefault();
    setAuthMessage("");
    try {
      const { user } = await loginRequest(loginForm);
      setCurrentUser(user);
      if (user.isPlatformOwner && !user.tenant_slug) {
        setActiveView("owner");
      }
      setLoginForm({ email: "", password: "" });
    } catch (error) {
      setAuthMessage(error.message);
    }
  }

  async function submitSetupPassword(event) {
    event.preventDefault();
    setAuthMessage("");
    if (setupForm.password !== setupForm.confirmPassword) {
      setAuthMessage("Passwords do not match.");
      return;
    }

    try {
      await setupPasswordRequest({ token: setupToken, password: setupForm.password });
      setSetupForm({ password: "", confirmPassword: "" });
      setCurrentUser(null);
      setSetupToken("");
      setAuthChecked(true);
      window.location.replace("/");
    } catch (error) {
      setAuthMessage(error.message);
    }
  }

  async function logout() {
    await logoutRequest().catch(() => {});
    setCurrentUser(null);
    setInventory(null);
    setProposal(null);
    setActiveView("proposal");
  }

  async function loadTeamMembers() {
    if (currentUser?.role !== "admin") return;
    try {
      const data = await fetchTeamMembers();
      setTeamMembers(data.users || []);
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function createTeamMember(event) {
    event.preventDefault();
    setAdminMessage("");
    setTeamSetupLink("");
    try {
      const data = await sendJsonRequest("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(teamForm)
      });
      setTeamMembers(data.users || []);
      setTeamSetupLink(data.setupUrl || "");
      setTeamForm({ name: "", email: "", role: "editor" });
      setAdminMessage("Team member created.");
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function resendTeamSetupLink(userId) {
    setAdminMessage("");
    setTeamSetupLink("");
    try {
      const data = await sendJsonRequest(`/api/admin/users/${encodeURIComponent(userId)}/setup-link`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setTeamSetupLink(data.setupUrl || "");
      setAdminMessage("Setup link generated.");
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function deactivateTeamMember(userId) {
    setAdminMessage("");
    try {
      const data = await sendAdminRequest(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
      setTeamMembers(data.users || []);
      setAdminMessage("Team member deactivated.");
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function loadOwnerTenants() {
    if (!currentUser?.isPlatformOwner) return;
    try {
      const data = await fetchOwnerTenants();
      setOwnerTenants(data.tenants || []);
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function createOwnerTenant(event) {
    event.preventDefault();
    setAdminMessage("");
    try {
      const data = await sendJsonRequest("/api/owner/tenants", {
        method: "POST",
        body: JSON.stringify(ownerTenantForm)
      });
      setOwnerTenants(data.tenants || []);
      setOwnerAdminForm((current) => ({ ...current, tenantSlug: data.tenant?.slug || current.tenantSlug }));
      if (data.tenant?.slug) {
        await loadOwnerTenantTemplates(data.tenant.slug);
      }
      setOwnerTenantForm({ slug: "", name: "", email: "", phone: "" });
      setAdminMessage("Tenant saved.");
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function createOwnerTenantAdmin(event) {
    event.preventDefault();
    setAdminMessage("");
    setOwnerSetupLink("");
    try {
      const data = await sendJsonRequest(`/api/owner/tenants/${encodeURIComponent(ownerAdminForm.tenantSlug)}/admins`, {
        method: "POST",
        body: JSON.stringify({
          name: ownerAdminForm.name,
          email: ownerAdminForm.email
        })
      });
      setOwnerTenants(data.tenants || []);
      setOwnerSetupLink(data.setupUrl || "");
      setOwnerAdminForm((current) => ({ tenantSlug: current.tenantSlug, name: "", email: "" }));
      setAdminMessage("Tenant admin setup link created.");
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function onboardOwnerTemplates() {
    setAdminMessage("");
    try {
      await sendJsonRequest("/api/owner/templates/onboard", { method: "POST" });
      if (ownerAdminForm.tenantSlug) {
        await loadOwnerTenantTemplates(ownerAdminForm.tenantSlug);
      }
      setAdminMessage("Templates onboarded.");
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function loadOwnerTenantTemplates(tenantSlug) {
    if (!tenantSlug) {
      setOwnerTenantTemplates({ tenant: null, templates: [] });
      return;
    }
    try {
      const data = await sendJsonRequest(`/api/owner/tenants/${encodeURIComponent(tenantSlug)}/templates`);
      setOwnerTenantTemplates(data);
    } catch (error) {
      setOwnerTenantTemplates({ tenant: null, templates: [] });
      setAdminMessage(error.message);
    }
  }

  async function toggleOwnerTenantTemplate(templateKey, isEnabled) {
    if (!ownerAdminForm.tenantSlug) return;
    setAdminMessage("");
    try {
      const data = await sendJsonRequest(
        `/api/owner/tenants/${encodeURIComponent(ownerAdminForm.tenantSlug)}/templates/${encodeURIComponent(templateKey)}`,
        {
          method: "PUT",
          body: JSON.stringify({ is_enabled: isEnabled })
        }
      );
      setOwnerTenantTemplates(data);
      setAdminMessage(isEnabled ? "Template enabled." : "Template disabled.");
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  useEffect(() => {
    if (activeView === "team") {
      loadTeamMembers();
    }
  }, [activeView, currentUser?.role]);

  useEffect(() => {
    if (activeView === "owner") {
      loadOwnerTenants();
    }
  }, [activeView, currentUser?.isPlatformOwner]);

  useEffect(() => {
    if (activeView === "inventory" && currentUser?.role && !["admin", "editor"].includes(currentUser.role)) {
      setActiveView("proposal");
    }
    if (activeView === "pipeline" && currentUser?.role && currentUser.role !== "admin") {
      setLeadInitialFilters({});
      setActiveView("leads");
    }
  }, [activeView, currentUser?.role]);

  if (setupToken) {
    return (
      <SetupPasswordScreen
        authMessage={authMessage}
        setupForm={setupForm}
        setSetupForm={setSetupForm}
        submitSetupPassword={submitSetupPassword}
      />
    );
  }

  if (setupToken === null || !authChecked) {
    return <div className="loading">Checking session...</div>;
  }

  if (!currentUser) {
    return (
      <LoginScreen
        authMessage={authMessage}
        loginForm={loginForm}
        setLoginForm={setLoginForm}
        submitLogin={submitLogin}
      />
    );
  }

  const hasWorkspace = Boolean(inventory && proposal);
  const canManageInventory = currentUser.tenant_slug && ["admin", "editor"].includes(currentUser.role);
  const canViewPipeline = currentUser.tenant_slug && currentUser.role === "admin";
  const needsWorkspace = ["proposal", "inventory"].includes(activeView);

  if (needsWorkspace && !hasWorkspace) {
    return <div className="loading">{adminMessage || (isLoadingBuilderData ? "Loading builder data..." : "Loading Kashmir proposal builder...")}</div>;
  }

  const day = hasWorkspace ? proposal.days[activeDay] : {};
  const activeTemplate = hasWorkspace
    ? inventory.templates.find((template) => template.id === proposal.templateId) || inventory.templates[0]
    : { name: "Owner Console", description: "Manage tenants and tenant admins." };
  const hasTemplates = Boolean(activeTemplate);
  const activeTemplateThemes = activeTemplate?.themes || [];
  const selectedDestination = hasWorkspace
    ? inventory.destinations.find((item) => item.id === day.destinationId) || inventory.destinations.find((item) => item.name === day.destination)
    : null;

  // If a destination cannot be matched, show all hotels rather than leaving the
  // hotel select empty. This is useful while users manually edit JSON/data.
  const availableHotels = hasWorkspace ? hotelByDestination[selectedDestination?.id] || inventory.hotels : [];
  const selectedHotel = hasWorkspace ? inventory.hotels.find((item) => item.id === day.hotelId) || inventory.hotels.find((item) => item.name === day.hotelName) : null;
  const availableDayPlans = hasWorkspace ? (inventory.dayPlans || []).filter((plan) => plan.destinationId === selectedDestination?.id) : [];
  const destinationImages = selectedDestination?.images || [];
  const hotelImages = selectedHotel?.images || [];
  const selectedDestinationImageId = destinationImages.find(
    (image) => image.id === day.destinationImageId || image.imageKey === day.destinationImageId
  )?.id || destinationImages[0]?.id || "";
  const selectedHotelImageId = hotelImages.find(
    (image) => image.id === day.hotelImageId || image.imageKey === day.hotelImageId
  )?.id || hotelImages[0]?.id || "";
  const selectedRoomType = day.roomType || selectedHotel?.roomType || "";
  const selectedRooms = Math.max(1, Number(day.rooms || 1));
  const effectiveMealPlan = day.mealPlan || proposal?.pricing?.defaultMealPlan || "MAP";
  const visibleDayStart = Math.max(0, Math.min(activeDay - 1, (proposal?.days?.length || 0) - 3));
  const visibleDayTabs = (proposal?.days || [])
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
      {showBrowserPrintGuide && (
        <PrintGuideModal
          confirmBrowserPrint={confirmBrowserPrint}
          onCancel={() => setShowBrowserPrintGuide(false)}
        />
      )}
      <aside className="sidebar">
        <div className="logo">
          <Sparkles size={22} />
          <div>
            <strong>Travel Ideate</strong>
            <span>Kashmir proposals</span>
          </div>
        </div>

        <nav>
          {currentUser.tenant_slug && (
            <>
              <button className={activeView === "leads" ? "active" : ""} onClick={() => {
                setLeadInitialFilters({});
                setActiveView("leads");
              }}>Leads</button>
              {canViewPipeline && (
                <button className={activeView === "pipeline" ? "active" : ""} onClick={() => setActiveView("pipeline")}>Pipeline</button>
              )}
              <button className={activeView === "proposal" ? "active" : ""} onClick={() => setActiveView("proposal")}>Builder</button>
              <button className={activeView === "proposals" ? "active" : ""} onClick={() => setActiveView("proposals")}>Proposals</button>
              <button className={["invoices", "invoice"].includes(activeView) ? "active" : ""} onClick={() => setActiveView("invoices")}>Invoices</button>
              {canManageInventory && (
                <button className={activeView === "inventory" ? "active" : ""} onClick={() => setActiveView("inventory")}>Inventory</button>
              )}
            </>
          )}
          {currentUser.tenant_slug && currentUser.role === "admin" && (
            <button className={activeView === "team" ? "active" : ""} onClick={() => setActiveView("team")}>Team</button>
          )}
          {currentUser.isPlatformOwner && (
            <button className={activeView === "owner" ? "active" : ""} onClick={() => setActiveView("owner")}>Owner</button>
          )}
        </nav>

        {hasWorkspace && activeTemplate && (
          <div className="template-card">
            <span>Active template</span>
            <strong>{activeTemplate.name}</strong>
            <p>{activeTemplate.description}</p>
          </div>
        )}
      </aside>

      <section className="builder">
        {/* Sticky header keeps export available while editing long itineraries. */}
        <header className="topbar">
          <div>
            <p>{currentUser.tenant_name} · {currentUser.name}</p>
            <h1>
              {activeView === "proposal" && proposal.trip.title}
              {activeView === "leads" && "Leads"}
              {activeView === "pipeline" && "Pipeline"}
              {activeView === "proposals" && "Saved Proposals"}
              {activeView === "invoices" && "Saved Invoices"}
              {activeView === "invoice" && "Invoice"}
              {activeView === "inventory" && "Destinations, hotels, and images"}
              {activeView === "team" && "Team Access"}
              {activeView === "owner" && "Owner Console"}
            </h1>
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
              <>
                <button
                  className="secondary-button topbar-button"
                  type="button"
                  onClick={saveCurrentProposal}
                  disabled={proposalSaveStatus === "saving"}
                >
                  {proposalSaveStatus === "saving" ? <RefreshCw size={18} /> : <Save size={18} />}
                  {proposalSaveStatus === "saving" && "Saving"}
                  {proposalSaveStatus === "saved" && "Saved"}
                  {proposalSaveStatus === "error" && "Save failed"}
                  {proposalSaveStatus === "idle" && "Save Proposal"}
                </button>
                <button className="primary-button topbar-button" type="button" onClick={exportPdf} disabled={isExporting}>
                  {isExporting ? <RefreshCw size={18} /> : <Download size={18} />}
                  {isExporting ? "Exporting" : "Export PDF"}
                </button>
                <button className="secondary-button topbar-button" type="button" onClick={openBrowserPrintGuide}>
                  <Printer size={18} />
                  Print / Save PDF
                </button>
              </>
            )}
            <button className="icon-button" onClick={logout} title="Sign out" aria-label="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {activeView === "owner" ? (
          <OwnerPanel
            adminMessage={adminMessage}
            createOwnerTenant={createOwnerTenant}
            createOwnerTenantAdmin={createOwnerTenantAdmin}
            loadOwnerTenantTemplates={loadOwnerTenantTemplates}
            onboardOwnerTemplates={onboardOwnerTemplates}
            ownerAdminForm={ownerAdminForm}
            ownerSetupLink={ownerSetupLink}
            ownerTenantTemplates={ownerTenantTemplates}
            ownerTenantForm={ownerTenantForm}
            ownerTenants={ownerTenants}
            setOwnerAdminForm={setOwnerAdminForm}
            setOwnerTenantForm={setOwnerTenantForm}
            setupLinkOrigin={window.location.origin}
            toggleOwnerTenantTemplate={toggleOwnerTenantTemplate}
          />
        ) : activeView === "proposal" && hasWorkspace && !hasTemplates ? (
          <div className="empty-state">
            <h2>No proposal templates enabled</h2>
            <p>Ask the platform owner to onboard templates and enable at least one template for this tenant.</p>
          </div>
        ) : activeView === "team" ? (
          <TeamPanel
            adminMessage={adminMessage}
            createTeamMember={createTeamMember}
            currentUser={currentUser}
            deactivateTeamMember={deactivateTeamMember}
            resendTeamSetupLink={resendTeamSetupLink}
            setTeamForm={setTeamForm}
            setupLinkOrigin={window.location.origin}
            teamForm={teamForm}
            teamMembers={teamMembers}
            teamSetupLink={teamSetupLink}
          />
        ) : activeView === "leads" ? (
          <LeadsDashboard initialFilters={leadInitialFilters} onGenerateProposal={generateProposalFromLead} />
        ) : activeView === "pipeline" && canViewPipeline ? (
          <PipelineDashboard
            onViewLeads={(filters) => {
              setLeadInitialFilters(filters);
              setActiveView("leads");
            }}
          />
        ) : activeView === "proposals" ? (
          <ProposalsDashboard
            onOpenProposal={(savedProposal) => openSavedProposal(savedProposal)}
            onGenerateInvoice={(invoice) => {
              setPrefilledInvoice(invoice);
              setPrefilledInvoiceRecord(null);
              setActiveView("invoice");
            }}
          />
        ) : activeView === "invoices" ? (
          <InvoicesDashboard
            onNewInvoice={() => {
              setPrefilledInvoice(null);
              setPrefilledInvoiceRecord(null);
              setActiveView("invoice");
            }}
            onOpenInvoice={(invoice, savedInvoice) => {
              setPrefilledInvoice(invoice);
              setPrefilledInvoiceRecord(savedInvoice);
              setActiveView("invoice");
            }}
          />
        ) : activeView === "invoice" ? (
          <InvoicePanel
            initialInvoice={prefilledInvoice}
            initialSavedInvoice={prefilledInvoiceRecord}
            onInitialInvoiceConsumed={() => {
              setPrefilledInvoice(null);
              setPrefilledInvoiceRecord(null);
            }}
          />
        ) : activeView === "inventory" && canManageInventory ? (
          <div className="inventory-workspace">
            <section className="admin-grid">
              <form className="panel" ref={destinationFormRef} onSubmit={submitDestination}>
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

              <form className="panel" ref={hotelFormRef} onSubmit={submitHotel}>
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
                    <input type="number" min="0" value={hotelForm.defaultRoomNightRate} onKeyDown={blockInvalidNumberKey} onChange={(event) => setHotelForm({ ...hotelForm, defaultRoomNightRate: nonNegativeNumberInput(event.target.value) })} />
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
                        onKeyDown={blockInvalidNumberKey}
                        onChange={(event) => setHotelForm({
                          ...hotelForm,
                          roomTypeRates: {
                            ...(hotelForm.roomTypeRates || {}),
                            [roomType]: nonNegativeNumberInput(event.target.value)
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
                        onKeyDown={blockInvalidNumberKey}
                        onChange={(event) => setHotelForm({
                          ...hotelForm,
                          mealPlanRates: {
                            ...(hotelForm.mealPlanRates || {}),
                            [mealPlan]: nonNegativeNumberInput(event.target.value)
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

              <form className="panel" ref={vehicleFormRef} onSubmit={submitVehicle}>
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
                    <input type="number" min="0" value={vehicleForm.defaultDayRate} onKeyDown={blockInvalidNumberKey} onChange={(event) => setVehicleForm({ ...vehicleForm, defaultDayRate: nonNegativeNumberInput(event.target.value) })} />
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

              <form className="panel" ref={dayPlanFormRef} onSubmit={submitDayPlan}>
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
                        <button className="icon-button" type="button" title="Edit destination" onClick={() => editDestination(destination)}>
                          <Pencil size={16} />
                        </button>
                        <button className="danger-button" type="button" onClick={() => archiveDestination(destination.id)}>
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
                          <button className="icon-button" type="button" title="Edit hotel" onClick={() => editHotel(hotel)}>
                            <Pencil size={16} />
                          </button>
                          <button className="danger-button" type="button" onClick={() => archiveHotel(hotel.id)}>
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
                        <button className="icon-button" type="button" title="Edit vehicle" onClick={() => editVehicle(vehicle)}>
                          <Pencil size={16} />
                        </button>
                        <button className="danger-button" type="button" onClick={() => archiveVehicle(vehicle.id)}>
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
	                      <div className="admin-actions">
	                        <img className="admin-thumb" src={image.url} alt={image.label} />
	                        <button className="danger-button" type="button" onClick={() => archiveBackgroundImage(image.id)}>
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
                          <button className="icon-button" type="button" title="Edit day plan" onClick={() => editDayPlan(dayPlan)}>
                            <Pencil size={16} />
                          </button>
                          <button className="danger-button" type="button" onClick={() => archiveDayPlan(dayPlan.id)}>
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
            {proposalLead && (
              <div className="lead-context-note">
                <span>Linked lead</span>
                <strong>{proposalLead.customerName}</strong>
                <button className="text-button" type="button" onClick={() => setProposalLead(null)}>Clear link</button>
              </div>
            )}
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
                  <select value={selectedDestinationImageId} onChange={(event) => updateDay(activeDay, "destinationImageId", event.target.value)}>
                    {destinationImages.map((image) => (
                      <option key={image.id} value={image.id}>{image.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="inline-label"><ImageIcon size={16} /> Hotel image</span>
                  <select value={selectedHotelImageId} onChange={(event) => updateDay(activeDay, "hotelImageId", event.target.value)} disabled={!selectedHotel}>
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
                <label className="quote-mode-switch">
                  <span>
                    <strong>Detailed quote</strong>
                    <small>{proposal.pricing.showDetailedQuote ? "Proposal shows itemized package breakdown." : "Proposal shows the simple total quote."}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={Boolean(proposal.pricing.showDetailedQuote)}
                    onChange={(event) => updatePricing({ showDetailedQuote: event.target.checked })}
                  />
                  <i aria-hidden="true"></i>
                </label>
                <div className="price-inputs">
                  <label>
                    Tax %
                    <input type="number" min="0" value={proposal.pricing.taxPercent ?? 5} onKeyDown={blockInvalidNumberKey} onChange={(event) => updatePricing({ taxPercent: nonNegativeNumberInput(event.target.value) })} />
                  </label>
                  <label>
                    Discount
                    <input type="number" min="0" value={proposal.pricing.discount} onKeyDown={blockInvalidNumberKey} onChange={(event) => updatePricing({ discount: nonNegativeNumberInput(event.target.value) })} />
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
                        onKeyDown={blockInvalidNumberKey}
                        onChange={(event) => updatePricingLine(index, { unitPrice: nonNegativeNumberInput(event.target.value) })}
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
