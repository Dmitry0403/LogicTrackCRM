import React from 'react';
import {
  OrderFormCard,
  SettingsModal,
  DriveSettingsModal,
  SignatureSettingsModal,
  AccountSettingsModal,
} from './components/ui';
import {
  HeaderNavigation,
  WorkPanel,
  WorkflowBoard,
  TripFormCard,
} from './components/workspace';
import {
  supabase,
  isSupabaseConfigured,
  SUPABASE_WORKSPACE_KEY,
} from "./lib/supabase";

const normalizeEnvValue = (rawValue) =>
  String(rawValue || "")
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/^'(.*)'$/, "$1");

const DRIVE_CONFIG = {
  CLIENT_ID: normalizeEnvValue(import.meta.env.VITE_GOOGLE_CLIENT_ID),
  API_KEY: normalizeEnvValue(import.meta.env.VITE_GOOGLE_API_KEY),
  REDIRECT_URI: normalizeEnvValue(import.meta.env.VITE_GOOGLE_REDIRECT_URI || "http://localhost:5173/"),
  SCOPE: normalizeEnvValue(import.meta.env.VITE_GOOGLE_DRIVE_SCOPE || "https://www.googleapis.com/auth/drive.file"),
};

const API_BASE_URL = normalizeEnvValue(
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:3001" : ""),
).replace(/\/+$/, "");

let pickerApiLoadPromise = null;

const loadGooglePickerApi = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('window is not available'));
  }

  if (window.google && window.google.picker) {
    return Promise.resolve();
  }

  if (!window.gapi || typeof window.gapi.load !== 'function') {
    return Promise.reject(new Error('Google API script is not loaded'));
  }

  if (!pickerApiLoadPromise) {
    pickerApiLoadPromise = new Promise((resolve, reject) => {
      window.gapi.load('picker', {
        callback: resolve,
        onerror: () => reject(new Error('Failed to load Google Picker API')),
      });
    });
  }

  return pickerApiLoadPromise;
};

// --- PKCE helpers ---
const base64url = (input) => {
  // input: ArrayBuffer or Uint8Array
  let str = '';
  const bytes = new Uint8Array(input);
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const generateCodeVerifier = () => {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return base64url(array);
};

const sha256 = async (plain) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return hash;
};

const generateCodeChallenge = async (verifier) => {
  const hashed = await sha256(verifier);
  return base64url(hashed);
};

// Helpers to store tokens
const getStoredTokens = () => {
  try {
    return JSON.parse(localStorage.getItem('gdrive_tokens') || '{}');
  } catch (e) {
    return {};
  }
};

const setStoredTokens = (tokens) => {
  localStorage.setItem('gdrive_tokens', JSON.stringify(tokens));
};


const customsCodeMap = {
  "06536": "ПТО Аэропорт Минск",
  "06533": "ПТО Минск-СЭЗ",
  "06529": "ПТО Колядичи-авто",
  "06611": "ПТО Белкультторг",
  "06650": "ПТО Минск-ТЛЦ-2",
  "06649": "ПТО Минск-ТЛЦ-1",
  "06544": "ПТО Белювелирторг",
  "06641": "ПТО Солигорск",
  "06651": "ПТО Великий Камень",
  "06613": "ПТО Жодино-Логистик",
  "06608": "ПТО Борисов-авто",
  "07242": "ПТО Полоцк-стекловолокно",
  "07260": "ПТО Витебск-Белтаможсервис",
  "07270": "ПТО Орша-Белтаможсервис",
  "07271": "ПТО Орша-ТЛЦ",
  "09146": "ПТО Барановичи-Фестивальная",
  "09159": "ПТО Брест-Белтаможсервис",
  "09161": "ПТО Пинск-Белтаможсервис",
  "09162": "ПТО Брест-Белтаможсервис-2",
  "14325": "ПТО Гомель-Белтаможсервис",
  "14336": "ПТО Жлобин-металлургический",
  "14354": "ПТО Гомель-СЭЗ",
  "09157": "ПТО Мозырь-Белтаможсервис",
  "16443": "ПТО Лида-авто",
  "16457": "ПТО Гродно-ГАП-2",
  "16463": "ПТО Брузги-ТЛЦ",
  "16464": "ПТО Каменный Лог-Белтаможсервис",
  "16465": "ПТО Берестовица-ТЛЦ",
  "20733": "ПТО Могилев-Белтаможсервис",
  "20734": "ПТО Бобруйск-Белтаможсервис",
};

const getCustomsName = (code) => customsCodeMap[code] || "Введите правильный код";

const getCustomsSuggestions = (typedValue) => {
  const typed = normalizeText(typedValue);

  return Object.entries(customsCodeMap)
    .filter(([code, name]) => {
      if (!typed) return true;
      return code.includes(typed) || normalizeText(name).includes(typed);
    })
    .map(([code, name]) => ({
      value: code,
      label: `${code} - ${name}`,
    }));
};

const POWER_OF_ATTORNEY_REGISTRY_URL = `${API_BASE_URL}/poa/registry`;
const POWER_OF_ATTORNEY_FALLBACK_URL = "/power-of-attorney-registry.json";
const CARGO_STATUS_URL = `${API_BASE_URL}/cargo/status`;
const CARGO_API_BASE_URL = API_BASE_URL;
const PRINT_SIGNER_STORAGE_KEY = "logictrack_print_signer";
const ORDER_STAGES_STORAGE_KEY = "logictrack_order_stages";
const TRIP_STAGES_STORAGE_KEY = "logictrack_trip_stages";
const DEFAULT_PRINT_SIGNER_SETTINGS = {
  signerRole: "Менеджер",
  signerName: "Косенко Д.В.",
};
const TRIP_CAR_NUMBERS = [
  "AC 7769-5",
  "AM 1019-5",
  "AT 9287-5",
  "AT 9288-5",
  "AM 2957-5",
  "AM 9118-5",
  "AT 2761-5",
  "AT 2762-5",
  "AP 7963-5",
  "AP 9736-5",
  "AT 0887-5",
];
const TRIP_DRIVER_NAMES = [
  "Бабрович Юрий",
  "Медведь Валерий",
  "Медведь Вадим",
  "Сержан Чеслав",
  "Латушко Олег",
  "Шамко Дмитрий",
];
const TRAILER_NUMBER = "А 1482 Е-5";
const DEFAULT_ORDER_STAGES = [
  { id: "order-stage-plan", code: "plan", name: "План" },
  { id: "order-stage-warehouse", code: "warehouse", name: "На складе" },
  { id: "order-stage-in-car", code: "in_car", name: "В машине" },
  { id: "order-stage-delivered", code: "delivered", name: "Доставлено" },
];
const DEFAULT_TRIP_STAGES = [
  { id: "trip-stage-plan", code: "plan", name: "План" },
  { id: "trip-stage-in-route", code: "in_route", name: "В рейсе" },
  { id: "trip-stage-completed", code: "completed", name: "Завершено" },
];
const ORDER_STAGE_PLAN_ID = "order-stage-plan";
const ORDER_STAGE_WAREHOUSE_ID = "order-stage-warehouse";
const ORDER_STAGE_IN_CAR_ID = "order-stage-in-car";
const ORDER_STAGE_DELIVERED_ID = "order-stage-delivered";
const TRIP_STAGE_COMPLETED_ID = "trip-stage-completed";
const ORDER_STAGE_CODES = {
  PLAN: "plan",
  WAREHOUSE: "warehouse",
  IN_CAR: "in_car",
  DELIVERED: "delivered",
};
const TRIP_STAGE_CODES = {
  PLAN: "plan",
  IN_ROUTE: "in_route",
  COMPLETED: "completed",
};

const resolveCargoApiUrl = (urlPath) => {
  if (!urlPath) return "";
  if (/^https?:\/\//i.test(urlPath)) return urlPath;
  return `${CARGO_API_BASE_URL}${urlPath.startsWith("/") ? "" : "/"}${urlPath}`;
};

const resolveCargoTerminalKey = ({ shipmentAirport, shipmentTerminal }) => {
  if (shipmentAirport === "Шереметьево") {
    if (shipmentTerminal === "Москва-карго") return "svo_moscow";
    if (shipmentTerminal === "Шереметьево-карго") return "svo_sher";
    return "";
  }
  if (shipmentAirport === "Внуково") return "vko";
  if (shipmentAirport === "Домодедово") return "dme";
  if (shipmentAirport === "Жуковский") return "zia";
  return "";
};

const composeAwb = (prefix, number, hawb = "") => {
  const p = String(prefix || "").replace(/\D/g, "").slice(0, 3);
  const n = String(number || "").replace(/\D/g, "").slice(0, 10);
  const hawbPart = String(hawb || "").trim().replace(/\//g, "");
  if (p && n) {
    return hawbPart ? `${p}-${n}/${hawbPart}` : `${p}-${n}`;
  }
  if (p) return p;
  if (n) return n;
  return "";
};

const splitAwb = (awb) => {
  const clean = String(awb || "").trim();
  const slashIndex = clean.indexOf("/");
  const baseAwb = slashIndex >= 0 ? clean.slice(0, slashIndex).trim() : clean;
  const hawb = slashIndex >= 0 ? clean.slice(slashIndex + 1).trim() : "";
  const match = baseAwb.match(/^(\d{3})-(\d{1,10})$/);
  if (match) {
    return { awbPrefix: match[1], awbNumber: match[2], hasHawb: Boolean(hawb), hawb };
  }
  return {
    awbPrefix: "",
    awbNumber: baseAwb.replace(/\D/g, "").slice(0, 10),
    hasHawb: Boolean(hawb),
    hawb,
  };
};

const defaultPowerOfAttorneyRegistry = {
  "Шереметьево": {
    "Москва-карго": [
      // { recipient: "ООО Пример", hasAttorney: "+", validUntil: "2026-12-31" },
    ],
    "Шереметьево-карго": [
      // { recipient: "ООО Пример 2", hasAttorney: "+", validUntil: "2026-06-01" },
    ],
  },
  "Внуково": [],
  "Домодедово": [],
  "Жуковский": [],
};

const AIRPORT_ALIASES = new Map([
  ["Шереметьево", "Шереметьево"],
  ["Внуково", "Внуково"],
  ["Домодедово", "Домодедово"],
  ["Жуковский", "Жуковский"],
]);

const TERMINAL_ALIASES = new Map([
  ["Москва-карго", "Москва-карго"],
  ["Шереметьево-карго", "Шереметьево-карго"],
]);

const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();

const DEFAULT_ORDER_STAGE_CODES = new Set(Object.values(ORDER_STAGE_CODES));
const DEFAULT_TRIP_STAGE_CODES = new Set(Object.values(TRIP_STAGE_CODES));

const resolveOrderStageCode = (stage) => {
  const rawCode = String(stage?.code || "").trim();
  if (DEFAULT_ORDER_STAGE_CODES.has(rawCode)) return rawCode;

  const byLegacyId = new Map([
    [ORDER_STAGE_PLAN_ID, ORDER_STAGE_CODES.PLAN],
    [ORDER_STAGE_WAREHOUSE_ID, ORDER_STAGE_CODES.WAREHOUSE],
    [ORDER_STAGE_IN_CAR_ID, ORDER_STAGE_CODES.IN_CAR],
    [ORDER_STAGE_DELIVERED_ID, ORDER_STAGE_CODES.DELIVERED],
  ]);
  const legacyIdCode = byLegacyId.get(String(stage?.id || "").trim());
  if (legacyIdCode) return legacyIdCode;

  const normalizedName = normalizeText(stage?.name || "");
  if (normalizedName === normalizeText("План")) return ORDER_STAGE_CODES.PLAN;
  if (normalizedName === normalizeText("На складе")) return ORDER_STAGE_CODES.WAREHOUSE;
  if (normalizedName === normalizeText("В машине")) return ORDER_STAGE_CODES.IN_CAR;
  if (
    normalizedName === normalizeText("Доставлено") ||
    normalizedName === normalizeText("Доставлен")
  ) {
    return ORDER_STAGE_CODES.DELIVERED;
  }
  return "";
};

const resolveTripStageCode = (stage) => {
  const rawCode = String(stage?.code || "").trim();
  if (DEFAULT_TRIP_STAGE_CODES.has(rawCode)) return rawCode;

  const byLegacyId = new Map([
    ["trip-stage-plan", TRIP_STAGE_CODES.PLAN],
    ["trip-stage-in-route", TRIP_STAGE_CODES.IN_ROUTE],
    [TRIP_STAGE_COMPLETED_ID, TRIP_STAGE_CODES.COMPLETED],
  ]);
  const legacyIdCode = byLegacyId.get(String(stage?.id || "").trim());
  if (legacyIdCode) return legacyIdCode;

  const normalizedName = normalizeText(stage?.name || "");
  if (normalizedName === normalizeText("План")) return TRIP_STAGE_CODES.PLAN;
  if (normalizedName === normalizeText("В рейсе")) return TRIP_STAGE_CODES.IN_ROUTE;
  if (
    normalizedName === normalizeText("Завершено") ||
    normalizedName === normalizeText("Завершен")
  ) {
    return TRIP_STAGE_CODES.COMPLETED;
  }
  return "";
};

const normalizeOrderStages = (stages) =>
  (Array.isArray(stages) ? stages : []).map((stage) => {
    const code = resolveOrderStageCode(stage);
    return code ? { ...stage, code } : { ...stage };
  });

const normalizeTripStages = (stages) =>
  (Array.isArray(stages) ? stages : []).map((stage) => {
    const code = resolveTripStageCode(stage);
    return code ? { ...stage, code } : { ...stage };
  });

const normalizeAirport = (airport) => AIRPORT_ALIASES.get(airport) || airport;

const normalizeTerminal = (terminal) => TERMINAL_ALIASES.get(terminal) || terminal;

const hasPlusMark = (value) => {
  if (typeof value === "boolean") return value;
  if (value == null) return false;
  return String(value).includes("+");
};

const parseDate = (rawDate) => {
  if (!rawDate) return null;
  const value = String(rawDate).trim();
  if (!value) return null;

  const dotMatch = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const [, d, m, y] = dotMatch;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const formatRuDate = (date) =>
  `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;

const formatTripDateShort = (rawDate) => {
  const value = String(rawDate || "").trim();
  if (!value) return "—";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return `${day}.${month}.${year}`;
  }
  const parsed = parseDate(value);
  if (!parsed) return value;
  return `${String(parsed.getDate()).padStart(2, "0")}.${String(parsed.getMonth() + 1).padStart(2, "0")}.${String(parsed.getFullYear())}`;
};

const getPowerOfAttorneyStatus = ({ shipmentAirport, shipmentTerminal, recipient, registry }) => {
  const normalizedRecipient = normalizeText(recipient);
  if (!normalizedRecipient) return null;

  const airportKey = normalizeAirport(shipmentAirport);
  const airportRegistry = registry[airportKey];
  if (!airportRegistry) {
    return { type: "danger", message: "Доверенности нет." };
  }

  let records = [];
  if (airportKey === "Шереметьево") {
    const terminalKey = normalizeTerminal(shipmentTerminal) || "Москва-карго";
    records = airportRegistry[terminalKey] || [];
  } else if (Array.isArray(airportRegistry)) {
    records = airportRegistry;
  }

  const matchedRecords = records.filter(
    (record) =>
      normalizeText(record.recipient) === normalizedRecipient &&
      hasPlusMark(record.hasAttorney),
  );
  if (matchedRecords.length === 0) {
    return { type: "danger", message: "Доверенности нет." };
  }

  const validUntilDates = matchedRecords
    .map((record) => parseDate(record.validUntil))
    .filter(Boolean);

  if (validUntilDates.length > 0) {
    const latestValidUntil = validUntilDates.reduce((latest, current) =>
      current > latest ? current : latest,
    );
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (latestValidUntil < todayStart) {
      return {
        type: "danger",
        message: `Доверенность истекла ${formatRuDate(latestValidUntil)}.`,
      };
    }
    return {
      type: "success",
      message: `Доверенность действительна до ${formatRuDate(latestValidUntil)}.`,
    };
  }

  return { type: "success", message: "Доверенность действительна до: срок не указан." };
};

const getRecipientSuggestions = ({ shipmentAirport, shipmentTerminal, recipient, registry }) => {
  const airportKey = normalizeAirport(shipmentAirport);
  const airportRegistry = registry[airportKey];
  if (!airportRegistry) return [];

  let records = [];
  if (airportKey === "Шереметьево") {
    const terminalKey = normalizeTerminal(shipmentTerminal) || "Москва-карго";
    records = airportRegistry[terminalKey] || [];
  } else if (Array.isArray(airportRegistry)) {
    records = airportRegistry;
  }

  const typed = normalizeText(recipient);
  const uniq = new Set();
  const nameCounts = new Map();
  const suggestions = [];

  records.forEach((record) => {
    const name = String(record?.recipient || "").trim();
    if (!name) return;
    const normalizedName = normalizeText(name);
    nameCounts.set(normalizedName, (nameCounts.get(normalizedName) || 0) + 1);
  });

  records.forEach((record) => {
    const name = String(record?.recipient || "").trim();
    if (!name) return;
    const normalizedName = normalizeText(name);
    if (typed && !normalizedName.includes(typed)) return;

    const validUntilRaw = String(record?.validUntil || "").trim();
    const dedupeKey = `${normalizedName}::${validUntilRaw}`;
    if (uniq.has(dedupeKey)) return;
    uniq.add(dedupeKey);

    const hasMultipleByName = (nameCounts.get(normalizedName) || 0) > 1;
    const label = hasMultipleByName
      ? (validUntilRaw ? `${name} - до ${validUntilRaw}` : `${name} - срок не указан`)
      : name;

    suggestions.push({ value: name, label });
  });

  return suggestions;
};

const loadOrders = () => {
  const stored = localStorage.getItem("logictrack_orders");
  return stored ? JSON.parse(stored) : [];
};

const saveOrders = (orders) => {
  localStorage.setItem("logictrack_orders", JSON.stringify(orders));
};

const loadTrips = () => {
  const stored = localStorage.getItem("logictrack_trips");
  return stored ? JSON.parse(stored) : [];
};

const saveTrips = (trips) => {
  localStorage.setItem("logictrack_trips", JSON.stringify(trips));
};

const loadStages = (key, fallback) => {
  const stored = localStorage.getItem(key);
  const parsed = stored ? JSON.parse(stored) : null;
  return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback;
};

const saveStages = (key, stages) => {
  localStorage.setItem(key, JSON.stringify(stages));
};

const loadPrintSignerSettings = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRINT_SIGNER_STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return DEFAULT_PRINT_SIGNER_SETTINGS;
    return {
      signerRole: String(parsed.signerRole || DEFAULT_PRINT_SIGNER_SETTINGS.signerRole).trim(),
      signerName: String(parsed.signerName || DEFAULT_PRINT_SIGNER_SETTINGS.signerName).trim(),
    };
  } catch (_) {
    return DEFAULT_PRINT_SIGNER_SETTINGS;
  }
};

const createStage = (prefix, name) => ({
  id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name,
});

const getTodayIsoDate = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
};

const parseTripCarNumber = (rawValue) => {
  const value = String(rawValue || "").trim();
  if (!value) {
    return { carNumber: "", hasTrailer: false, trailerNumber: "" };
  }
  const parts = value.split("/");
  if (parts.length < 2) {
    return { carNumber: value, hasTrailer: false, trailerNumber: "" };
  }
  return {
    carNumber: String(parts[0] || "").trim(),
    hasTrailer: true,
    trailerNumber: String(parts.slice(1).join("/") || "").trim(),
  };
};

const extractDriverSurname = (driverName) => {
  const value = String(driverName || "").trim();
  if (!value) return "";
  return value.split(/\s+/)[0] || "";
};

const buildTripDriveFolderName = ({ carNumber, driverName }) => {
  const car = String(carNumber || "").trim();
  const surname = extractDriverSurname(driverName);
  return [car, surname].filter(Boolean).join(" ").trim() || "Рейс";
};

const App = () => {
  const SHEREMETYEVO_VALUES = new Set(["Шереметьево"]);
  const DEFAULT_SHEREMETYEVO_TERMINAL = "Москва-карго";

  const [orders, setOrders] = React.useState(loadOrders);
  const [trips, setTrips] = React.useState(loadTrips);
  const [orderStages, setOrderStages] = React.useState(() =>
    normalizeOrderStages(loadStages(ORDER_STAGES_STORAGE_KEY, DEFAULT_ORDER_STAGES))
  );
  const [tripStages, setTripStages] = React.useState(() =>
    normalizeTripStages(loadStages(TRIP_STAGES_STORAGE_KEY, DEFAULT_TRIP_STAGES))
  );
  const [activeView, setActiveView] = React.useState("orders");
  const [ordersScreenMode, setOrdersScreenMode] = React.useState("list");
  const [tripsScreenMode, setTripsScreenMode] = React.useState("list");
  const [driveConnected, setDriveConnected] = React.useState(false);
  const [powerOfAttorneyRegistry, setPowerOfAttorneyRegistry] = React.useState(defaultPowerOfAttorneyRegistry);
  const [isPowerOfAttorneySyncLoading, setIsPowerOfAttorneySyncLoading] = React.useState(false);
  const [driveHint, setDriveHint] = React.useState(
    "Чтобы активировать синхронизацию, укажите VITE_GOOGLE_CLIENT_ID и VITE_GOOGLE_API_KEY в .env."
  );

  const [formData, setFormData] = React.useState({
    shipmentAirport: "",
    shipmentTerminal: "",
    recipient: "",
    orderName: "",
    awb: "",
    awbPrefix: "",
    awbNumber: "",
    hasHawb: false,
    hawb: "",
    quantity: "",
    weight: "",
    customsCode: "",
    notes: "",
  });
  const [awbStatusCheck, setAwbStatusCheck] = React.useState({
    loading: false,
    error: "",
    data: null,
  });
  const [cargoScreenshotModal, setCargoScreenshotModal] = React.useState({
    isOpen: false,
    screenshotId: "",
    screenshotUrl: "",
  });
  const [isTripPrintLoading, setIsTripPrintLoading] = React.useState(false);
  const [isDeleteCardLoading, setIsDeleteCardLoading] = React.useState(false);
  const awbCheckAbortRef = React.useRef(null);
  const [editingOrderId, setEditingOrderId] = React.useState(null);
  const [editingTripId, setEditingTripId] = React.useState(null);
  const [deleteCardModal, setDeleteCardModal] = React.useState({
    isOpen: false,
    type: "",
    id: "",
    title: "",
  });
  const [showSettingsModal, setShowSettingsModal] = React.useState(false);
  const [showDriveSettingsModal, setShowDriveSettingsModal] = React.useState(false);
  const [showSignatureSettingsModal, setShowSignatureSettingsModal] = React.useState(false);
  const [showAccountSettingsModal, setShowAccountSettingsModal] = React.useState(false);
  const [printSignerSettings, setPrintSignerSettings] = React.useState(loadPrintSignerSettings);
  const [isCloudStateReady, setIsCloudStateReady] = React.useState(!isSupabaseConfigured);
  const [authReady, setAuthReady] = React.useState(!isSupabaseConfigured);
  const [currentUser, setCurrentUser] = React.useState(null);
  const [authForm, setAuthForm] = React.useState({ email: "", password: "" });
  const [authScreen, setAuthScreen] = React.useState("login");
  const [isAuthSubmitting, setIsAuthSubmitting] = React.useState(false);
  const [authError, setAuthError] = React.useState("");
  const [authInfo, setAuthInfo] = React.useState("");
  const [isChangePasswordScreenOpen, setIsChangePasswordScreenOpen] = React.useState(false);
  const [changePasswordForm, setChangePasswordForm] = React.useState({
    password: "",
    confirmPassword: "",
  });
  const [isChangePasswordSubmitting, setIsChangePasswordSubmitting] = React.useState(false);
  const [changePasswordError, setChangePasswordError] = React.useState("");
  const [changePasswordInfo, setChangePasswordInfo] = React.useState("");
  const [tripFormData, setTripFormData] = React.useState({
    tripNumber: "",
    tripDate: getTodayIsoDate(),
    carNumber: "",
    hasTrailer: false,
    driverName: "",
    orderIds: [],
  });

  
  const [selectedDriveFolder, setSelectedDriveFolder] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem('gdrive_selected_folder') || 'null');
    } catch (e) {
      return null;
    }
  });
  const backendWarmupAtRef = React.useRef(0);
  const cloudSaveTimeoutRef = React.useRef(null);
  const userScopedAppStateId = React.useMemo(
    () => (currentUser?.id ? `${currentUser.id}:${SUPABASE_WORKSPACE_KEY}` : ""),
    [currentUser],
  );
  const findOrderStageIdByCode = React.useCallback(
    (stageCode, fallbackId) => {
      const byCode = orderStages.find((stage) => stage.code === stageCode);
      if (byCode?.id) return byCode.id;
      const byDefaultId = orderStages.find((stage) => stage.id === fallbackId);
      return byDefaultId?.id || fallbackId;
    },
    [orderStages],
  );
  const findTripStageIdByCode = React.useCallback(
    (stageCode, fallbackId) => {
      const byCode = tripStages.find((stage) => stage.code === stageCode);
      if (byCode?.id) return byCode.id;
      const byDefaultId = tripStages.find((stage) => stage.id === fallbackId);
      return byDefaultId?.id || fallbackId;
    },
    [tripStages],
  );
  const planStageId = React.useMemo(
    () => findOrderStageIdByCode(ORDER_STAGE_CODES.PLAN, ORDER_STAGE_PLAN_ID),
    [findOrderStageIdByCode],
  );
  const warehouseStageId = React.useMemo(() => {
    return findOrderStageIdByCode(ORDER_STAGE_CODES.WAREHOUSE, ORDER_STAGE_WAREHOUSE_ID);
  }, [findOrderStageIdByCode]);
  const inCarStageId = React.useMemo(
    () => findOrderStageIdByCode(ORDER_STAGE_CODES.IN_CAR, ORDER_STAGE_IN_CAR_ID),
    [findOrderStageIdByCode],
  );
  const deliveredStageId = React.useMemo(
    () => findOrderStageIdByCode(ORDER_STAGE_CODES.DELIVERED, ORDER_STAGE_DELIVERED_ID),
    [findOrderStageIdByCode],
  );
  const completedTripStageId = React.useMemo(() => {
    return findTripStageIdByCode(TRIP_STAGE_CODES.COMPLETED, TRIP_STAGE_COMPLETED_ID);
  }, [findTripStageIdByCode]);

  const warmupBackend = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const now = Date.now();
    if (now - backendWarmupAtRef.current < 60000) return;
    backendWarmupAtRef.current = now;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 7000);
    void fetch(`${CARGO_API_BASE_URL}/health`, {
      method: "GET",
      cache: "no-store",
      signal: abortController.signal,
    })
      .catch(() => {
        // Warmup request is best-effort.
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });
  }, []);

  React.useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!mounted) return;
        setCurrentUser(data.session?.user || null);
      } catch (error) {
        console.error("Не удалось инициализировать сессию Supabase:", error);
      } finally {
        if (mounted) setAuthReady(true);
      }
    };

    void initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setCurrentUser(session?.user || null);
      if (event === "PASSWORD_RECOVERY") {
        setIsChangePasswordScreenOpen(true);
        setChangePasswordError("");
        setChangePasswordInfo("Введите новый пароль.");
      }
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    warmupBackend();
  }, [warmupBackend]);

  React.useEffect(() => {
    if (activeView === "orders" && ordersScreenMode === "create") {
      warmupBackend();
    }
  }, [activeView, ordersScreenMode, warmupBackend]);

  React.useEffect(() => {
    saveOrders(orders);
  }, [orders]);

  React.useEffect(() => {
    saveTrips(trips);
  }, [trips]);

  React.useEffect(() => {
    saveStages(ORDER_STAGES_STORAGE_KEY, orderStages);
  }, [orderStages]);

  React.useEffect(() => {
    saveStages(TRIP_STAGES_STORAGE_KEY, tripStages);
  }, [tripStages]);

  React.useEffect(() => {
    localStorage.setItem(PRINT_SIGNER_STORAGE_KEY, JSON.stringify(printSignerSettings));
  }, [printSignerSettings]);

  React.useEffect(() => {
    if (!isSupabaseConfigured) return;
    setIsCloudStateReady(Boolean(authReady && currentUser?.id));
  }, [authReady, currentUser]);

  React.useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !authReady || !currentUser?.id) return undefined;
    let cancelled = false;

    const bootstrapCloudState = async () => {
      try {
        const { data, error } = await supabase
          .from("app_state")
          .select("*")
          .eq("id", userScopedAppStateId)
          .maybeSingle();

        if (error) throw error;
        if (cancelled) return;

        if (!data) {
          const payload = {
            id: userScopedAppStateId,
            owner_user_id: currentUser.id,
            orders,
            trips,
            order_stages: orderStages,
            trip_stages: tripStages,
            print_signer: printSignerSettings,
          };
          const { error: insertError } = await supabase.from("app_state").upsert(payload);
          if (insertError) throw insertError;
          if (cancelled) return;
          setIsCloudStateReady(true);
          return;
        }

        const cloudOrders = Array.isArray(data.orders) ? data.orders : [];
        const cloudTrips = Array.isArray(data.trips) ? data.trips : [];
        const cloudOrderStages = Array.isArray(data.order_stages) && data.order_stages.length > 0
          ? normalizeOrderStages(data.order_stages)
          : DEFAULT_ORDER_STAGES;
        const cloudTripStages = Array.isArray(data.trip_stages) && data.trip_stages.length > 0
          ? normalizeTripStages(data.trip_stages)
          : DEFAULT_TRIP_STAGES;
        const cloudPrintSigner = data.print_signer && typeof data.print_signer === "object"
          ? {
              signerRole: String(data.print_signer.signerRole || DEFAULT_PRINT_SIGNER_SETTINGS.signerRole).trim(),
              signerName: String(data.print_signer.signerName || DEFAULT_PRINT_SIGNER_SETTINGS.signerName).trim(),
            }
          : DEFAULT_PRINT_SIGNER_SETTINGS;

        setOrders(cloudOrders);
        setTrips(cloudTrips);
        setOrderStages(cloudOrderStages);
        setTripStages(cloudTripStages);
        setPrintSignerSettings(cloudPrintSigner);
        setIsCloudStateReady(true);
      } catch (cloudError) {
        console.error("Не удалось загрузить состояние из Supabase:", cloudError);
        setIsCloudStateReady(true);
      }
    };

    void bootstrapCloudState();

    return () => {
      cancelled = true;
    };
  }, [isSupabaseConfigured, authReady, currentUser, userScopedAppStateId]);

  React.useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !authReady || !currentUser?.id || !isCloudStateReady) {
      return undefined;
    }
    if (cloudSaveTimeoutRef.current) {
      clearTimeout(cloudSaveTimeoutRef.current);
    }

    cloudSaveTimeoutRef.current = setTimeout(() => {
      void supabase.from("app_state").upsert({
        id: userScopedAppStateId,
        owner_user_id: currentUser.id,
        orders,
        trips,
        order_stages: orderStages,
        trip_stages: tripStages,
        print_signer: printSignerSettings,
      }).then(({ error }) => {
        if (error) {
          console.error("Не удалось сохранить состояние в Supabase:", error);
        }
      });
    }, 700);

    return () => {
      if (cloudSaveTimeoutRef.current) {
        clearTimeout(cloudSaveTimeoutRef.current);
      }
    };
  }, [
    isCloudStateReady,
    authReady,
    currentUser,
    userScopedAppStateId,
    orders,
    trips,
    orderStages,
    tripStages,
    printSignerSettings,
  ]);

  React.useEffect(() => {
    const fallbackStageId = orderStages[0]?.id;
    if (!fallbackStageId) return;
    const valid = new Set(orderStages.map((s) => s.id));
    setOrders((prev) =>
      prev.map((order) => ({
        ...order,
        stageId: valid.has(order.stageId) ? order.stageId : fallbackStageId,
      })),
    );
  }, [orderStages]);

  React.useEffect(() => {
    const fallbackStageId = tripStages[0]?.id;
    if (!fallbackStageId) return;
    const valid = new Set(tripStages.map((s) => s.id));
    setTrips((prev) =>
      prev.map((trip) => ({
        ...trip,
        stageId: valid.has(trip.stageId) ? trip.stageId : fallbackStageId,
      })),
    );
  }, [tripStages]);

  const loadPowerOfAttorneyRegistry = React.useCallback(async (forceRefresh = false) => {
    setIsPowerOfAttorneySyncLoading(true);
    try {
      let loaded = false;
      const url = forceRefresh
        ? `${POWER_OF_ATTORNEY_REGISTRY_URL}?force=1`
        : POWER_OF_ATTORNEY_REGISTRY_URL;
      const primaryRes = await fetch(url, { cache: "no-store" });
      if (primaryRes.ok) {
        const primaryData = await primaryRes.json();
        if (primaryData && typeof primaryData === "object") {
          setPowerOfAttorneyRegistry(primaryData);
          loaded = true;
        }
      }

      if (!loaded) {
        const fallbackRes = await fetch(POWER_OF_ATTORNEY_FALLBACK_URL, { cache: "no-store" });
        if (!fallbackRes.ok) return;
        const fallbackData = await fallbackRes.json();
        if (fallbackData && typeof fallbackData === "object") {
          setPowerOfAttorneyRegistry(fallbackData);
        }
      }
    } catch (error) {
      console.warn("Не удалось автозагрузить реестр доверенностей:", error);
    } finally {
      setIsPowerOfAttorneySyncLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadPowerOfAttorneyRegistry(false);
  }, [loadPowerOfAttorneyRegistry]);

  
  React.useEffect(() => {
    if (selectedDriveFolder) {
      localStorage.setItem('gdrive_selected_folder', JSON.stringify(selectedDriveFolder));
    }
  }, [selectedDriveFolder]);

  // On app load: handle OAuth redirect, check stored tokens and refresh if needed
  React.useEffect(() => {
    (async () => {
      // If tokens exist and not expired, mark connected
      const toks = getStoredTokens();
      if (toks && toks.access_token && toks.expires_at && Date.now() < toks.expires_at - 60000) {
        setDriveConnected(true);
        setDriveHint('Google Drive: подключено (токен в localStorage).');
        return; 
      }

      
      if (toks && toks.refresh_token) {
        try {
          setDriveHint('Обновляю токен доступа...');
          const res = await fetch(`${API_BASE_URL}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: toks.refresh_token, grant_type: 'refresh_token' }),
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error_description || data.error);
          
          const newTokens = {
            ...toks,
            access_token: data.access_token,
            expires_at: Date.now() + (data.expires_in || 3600) * 1000,
          };
          setStoredTokens(newTokens);
          setDriveConnected(true);
          setDriveHint('Google Drive: переподключено (обновлён токен).');
          return;
        } catch (err) {
          console.warn('Не удалось обновить токен:', err.message);
          // Продолжаем дальше, ниже обработаем redirect code если есть
        }
      }

      // Проверить, пришел ли код авторизации после редиректа
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (!code) return;

      try {
        setDriveHint('Обмениваю код авторизации на токен (через локальный прокси)...');
        const res = await fetch(`${API_BASE_URL}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error_description || data.error || JSON.stringify(data));

        const tokens = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Date.now() + (data.expires_in || 3600) * 1000,
        };
        setStoredTokens(tokens);
        setDriveConnected(true);
        setDriveHint('Успешно подключено к Google Drive (через сервер).');

        // Remove code from URL
        const url = new URL(window.location);
        url.searchParams.delete('code');
        window.history.replaceState({}, document.title, url.toString());
      } catch (err) {
        console.error(err);
        setDriveHint('Ошибка при получении токена: ' + (err.message || err));
      }
    })();
  }, []);


  const customsName = formData.customsCode
    ? getCustomsName(formData.customsCode.trim())
    : "Введите код таможни";
  const powerOfAttorneyStatus = getPowerOfAttorneyStatus({
    ...formData,
    registry: powerOfAttorneyRegistry,
  });
  const recipientSuggestions = getRecipientSuggestions({
    ...formData,
    registry: powerOfAttorneyRegistry,
  });
  const customsSuggestions = getCustomsSuggestions(formData.customsCode);
  const cargoTerminalKey = resolveCargoTerminalKey(formData);
  const isCargoCheckAvailable = Boolean(cargoTerminalKey);

  const runAwbStatusCheck = async ({ awb, awbPrefix, awbNumber, shipmentAirport, shipmentTerminal }) => {
    if (!awb) {
      setAwbStatusCheck({
        loading: false,
        error: "Введите номер авианакладной.",
        data: null,
      });
      return;
    }

    const terminalKey = resolveCargoTerminalKey({ shipmentAirport, shipmentTerminal });
    if (!terminalKey) {
      setAwbStatusCheck({
        loading: false,
        error: "Сначала выберите аэропорт и терминал для проверки.",
        data: null,
      });
      return;
    }

    setAwbStatusCheck({
      loading: true,
      error: "",
      data: null,
    });
    const abortController = new AbortController();
    awbCheckAbortRef.current = abortController;

    try {
      const response = await fetch(CARGO_STATUS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          awb,
          awbPrefix,
          awbNumber,
          terminal: shipmentTerminal || shipmentAirport,
          terminalKey,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.details || payload?.error || "Ошибка проверки статуса");
      }

      setAwbStatusCheck({
        loading: false,
        error: "",
        data: payload,
      });
      const screenshotId = String(payload?.screenshotId || "");
      const screenshotUrl = resolveCargoApiUrl(payload?.screenshotUrl || "");
      if (screenshotId && screenshotUrl) {
        setCargoScreenshotModal({
          isOpen: true,
          screenshotId,
          screenshotUrl,
        });
      } else {
        setCargoScreenshotModal({
          isOpen: false,
          screenshotId: "",
          screenshotUrl: "",
        });
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        setAwbStatusCheck({
          loading: false,
          error: "",
          data: null,
        });
        return;
      }
      setAwbStatusCheck({
        loading: false,
        error: error.message || "Не удалось проверить статус груза.",
        data: null,
      });
      setCargoScreenshotModal({
        isOpen: false,
        screenshotId: "",
        screenshotUrl: "",
      });
    } finally {
      if (awbCheckAbortRef.current === abortController) {
        awbCheckAbortRef.current = null;
      }
    }
  };

  const checkAwbStatus = async () => {
    const awb = composeAwb(formData.awbPrefix, formData.awbNumber) || formData.awb.trim();
    await runAwbStatusCheck({
      awb,
      awbPrefix: formData.awbPrefix,
      awbNumber: formData.awbNumber,
      shipmentAirport: formData.shipmentAirport,
      shipmentTerminal: formData.shipmentTerminal,
    });
  };

  const checkOrderAwbStatus = async (order) => {
    if (String(order?.shipmentAirport || "").trim() === "Внуково") {
      window.open(
        "https://www.vnukovo.ru/ru/partneram/cargo/proverit-status-gruza/",
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }

    const awbText = String(order?.awb || "").trim();
    const awbParts = splitAwb(awbText);
    const primaryAwb = composeAwb(awbParts.awbPrefix, awbParts.awbNumber);
    await runAwbStatusCheck({
      awb: primaryAwb || awbText,
      awbPrefix: awbParts.awbPrefix,
      awbNumber: awbParts.awbNumber,
      shipmentAirport: String(order?.shipmentAirport || ""),
      shipmentTerminal: String(order?.shipmentTerminal || ""),
    });
  };

  const clearCargoScreenshotsCache = async () => {
    try {
      await fetch(`${CARGO_API_BASE_URL}/cargo/screenshots`, {
        method: "DELETE",
      });
    } catch (error) {
      console.warn("Не удалось удалить скриншоты:", error);
    }
  };

  const scheduleCargoScreenshotsCleanup = () => {
    void clearCargoScreenshotsCache();
    [1500, 5000].forEach((delayMs) => {
      setTimeout(() => {
        void clearCargoScreenshotsCache();
      }, delayMs);
    });
  };

  const cancelAwbStatusCheck = async () => {
    if (awbCheckAbortRef.current) {
      awbCheckAbortRef.current.abort();
      awbCheckAbortRef.current = null;
    }
    scheduleCargoScreenshotsCleanup();
    setCargoScreenshotModal({
      isOpen: false,
      screenshotId: "",
      screenshotUrl: "",
    });
    setAwbStatusCheck({
      loading: false,
      error: "",
      data: null,
    });
  };

  const closeCargoScreenshotModal = async () => {
    scheduleCargoScreenshotsCleanup();

    setCargoScreenshotModal({
      isOpen: false,
      screenshotId: "",
      screenshotUrl: "",
    });
  };

  const openManualCargoCheck = async () => {
    const payload = awbStatusCheck?.data;
    if (!payload?.manualRequired) return;

    const awbNumber = String(formData.awbNumber || "").replace(/\D/g, "").slice(0, 10);
    if (awbNumber) {
      try {
        await navigator.clipboard.writeText(awbNumber);
      } catch (error) {
        // Clipboard can be blocked by browser policy.
      }
    }

    const baseUrl = payload.manualUrl || payload.sourceUrl || "https://www.vnukovo.ru/ru/partneram/cargo/proverit-status-gruza/";
    window.open(baseUrl, "_blank", "noopener,noreferrer");
  };

  const handleFieldChange = (field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "recipient") {
        const previousOrderName = String(prev.orderName || "").trim();
        const previousRecipient = String(prev.recipient || "").trim();
        if (!previousOrderName || previousOrderName === previousRecipient) {
          next.orderName = value.trim();
        }
      }
      if (field === "shipmentAirport") {
        next.shipmentTerminal = SHEREMETYEVO_VALUES.has(value) ? DEFAULT_SHEREMETYEVO_TERMINAL : "";
      }
      if (field === "hasHawb" && !value) {
        next.hawb = "";
      }
      if (field === "awbPrefix" || field === "awbNumber" || field === "hasHawb" || field === "hawb") {
        next.awb = composeAwb(
          field === "awbPrefix" ? value : next.awbPrefix,
          field === "awbNumber" ? value : next.awbNumber,
          next.hasHawb ? (field === "hawb" ? value : next.hawb) : "",
        );
      }
      return next;
    });

    if (
      field === "awb" ||
      field === "awbPrefix" ||
      field === "awbNumber" ||
      field === "hasHawb" ||
      field === "hawb" ||
      field === "shipmentAirport" ||
      field === "shipmentTerminal"
    ) {
      setAwbStatusCheck({
        loading: false,
        error: "",
        data: null,
      });
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const order = {
      id: editingOrderId || `order-${Date.now()}`,
      stageId: editingOrderId
        ? orders.find((item) => item.id === editingOrderId)?.stageId || (orderStages[0]?.id || "order-stage-plan")
        : (orderStages[0]?.id || "order-stage-plan"),
      shipmentAirport: formData.shipmentAirport.trim(),
      shipmentTerminal: formData.shipmentTerminal.trim(),
      name: formData.orderName.trim(),
      recipient: formData.recipient.trim(),
      awb:
        composeAwb(
          formData.awbPrefix,
          formData.awbNumber,
          formData.hasHawb ? formData.hawb : "",
        ) || formData.awb.trim(),
      quantity: formData.quantity.trim(),
      weight: formData.weight.trim(),
      customsCode: formData.customsCode.trim(),
      customsName: getCustomsName(formData.customsCode.trim()),
      notes: formData.notes.trim(),
      driveFolder: null,
      driveFolderId: null,
    };
    const originalOrder = editingOrderId
      ? orders.find((item) => item.id === editingOrderId)
      : null;
    if (originalOrder) {
      order.driveFolder = originalOrder.driveFolder || null;
      order.driveFolderId = originalOrder.driveFolderId || null;
      setOrders((prev) => prev.map((item) => (item.id === editingOrderId ? order : item)));
      if (originalOrder.name !== order.name && order.driveFolderId) {
        updateDriveFolderName(order.driveFolderId, order.name);
      }
    } else {
      setOrders((prev) => [order, ...prev]);
      if (driveConnected) {
        createDriveFolderForOrder(order.name, order.id);
      }
    }

    setFormData({
      shipmentAirport: "",
      shipmentTerminal: "",
      recipient: "",
      orderName: "",
      awb: "",
      awbPrefix: "",
      awbNumber: "",
      hasHawb: false,
      hawb: "",
      quantity: "",
      weight: "",
      customsCode: "",
      notes: "",
    });
    setEditingOrderId(null);
    setAwbStatusCheck({
      loading: false,
      error: "",
      data: null,
    });
    setOrdersScreenMode("list");
  };

  const handleTripFieldChange = (field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setTripFormData((prev) => ({ ...prev, [field]: value }));
  };

  const editingTrip = React.useMemo(
    () => trips.find((trip) => trip.id === editingTripId) || null,
    [trips, editingTripId],
  );
  const availableOrdersForTrip = React.useMemo(() => {
    const editingOrderIds = new Set(editingTrip?.orderIds || []);
    return orders.filter((order) => {
      if (editingOrderIds.has(order.id)) return true;
      const isWarehouse = order.stageId === warehouseStageId;
      // Warehouse status is the source of truth; stale trip links should not hide orders.
      return isWarehouse;
    });
  }, [orders, editingTrip, warehouseStageId]);

  React.useEffect(() => {
    const allowedOrderIds = new Set(availableOrdersForTrip.map((order) => order.id));
    setTripFormData((prev) => {
      const filteredOrderIds = prev.orderIds.filter((orderId) => allowedOrderIds.has(orderId));
      if (filteredOrderIds.length === prev.orderIds.length) return prev;
      return { ...prev, orderIds: filteredOrderIds };
    });
  }, [availableOrdersForTrip]);

  const handleToggleTripOrder = (orderId) => {
    setTripFormData((prev) => {
      const exists = prev.orderIds.includes(orderId);
      return {
        ...prev,
        orderIds: exists
          ? prev.orderIds.filter((id) => id !== orderId)
          : [...prev.orderIds, orderId],
      };
    });
  };

  const closeCreateTripForm = () => {
    setEditingTripId(null);
    setTripFormData({
      tripNumber: "",
      tripDate: getTodayIsoDate(),
      carNumber: "",
      hasTrailer: false,
      driverName: "",
      orderIds: [],
    });
    setTripsScreenMode("list");
  };

  const openCreateTripForm = () => {
    setEditingTripId(null);
    setTripFormData({
      tripNumber: "",
      tripDate: getTodayIsoDate(),
      carNumber: "",
      hasTrailer: false,
      driverName: "",
      orderIds: [],
    });
    setTripsScreenMode("create");
  };

  const saveTripFromForm = () => {
    const allowedOrderIds = new Set(availableOrdersForTrip.map((order) => order.id));
    const selectedOrderIds = tripFormData.orderIds.filter((orderId) => allowedOrderIds.has(orderId));
    if (!tripFormData.tripNumber.trim() || !tripFormData.carNumber || !tripFormData.driverName) {
      alert("Заполните обязательные поля рейса.");
      return null;
    }
    if (selectedOrderIds.length === 0) {
      alert("Выберите хотя бы один заказ для рейса.");
      return null;
    }

    const selectedOrders = orders.filter((order) => selectedOrderIds.includes(order.id));
    const ordersSummary = selectedOrders
      .slice(0, 3)
      .map((order) => order.name || order.recipient || order.id)
      .join(", ");

    const composedCarNumber = tripFormData.hasTrailer
      ? `${tripFormData.carNumber} / ${TRAILER_NUMBER}`
      : tripFormData.carNumber;

    const trip = {
      id: editingTripId || `trip-${Date.now()}`,
      stageId: editingTripId
        ? trips.find((item) => item.id === editingTripId)?.stageId || (tripStages[0]?.id || "trip-stage-plan")
        : (tripStages[0]?.id || "trip-stage-plan"),
      tripNumber: tripFormData.tripNumber.trim(),
      tripDate: tripFormData.tripDate,
      carNumberBase: tripFormData.carNumber,
      carNumber: composedCarNumber,
      hasTrailer: Boolean(tripFormData.hasTrailer),
      trailerNumber: tripFormData.hasTrailer ? TRAILER_NUMBER : "",
      driverName: tripFormData.driverName,
      orderIds: selectedOrderIds,
      driveFolder: editingTrip?.driveFolder || null,
      driveFolderId: editingTrip?.driveFolderId || null,
      ordersSummary:
        selectedOrders.length > 3
          ? `${ordersSummary} (+${selectedOrders.length - 3})`
          : ordersSummary,
    };
    if (editingTripId) {
      setTrips((prev) => prev.map((item) => (item.id === editingTripId ? trip : item)));
      const previousTripFolderName = buildTripDriveFolderName({
        carNumber: editingTrip?.carNumberBase || editingTrip?.carNumber,
        driverName: editingTrip?.driverName,
      });
      const nextTripFolderName = buildTripDriveFolderName({
        carNumber: trip.carNumberBase || trip.carNumber,
        driverName: trip.driverName,
      });
      if (editingTrip?.driveFolderId && previousTripFolderName !== nextTripFolderName) {
        void updateDriveFolderName(editingTrip.driveFolderId, nextTripFolderName);
      }
    } else {
      setTrips((prev) => [trip, ...prev]);
    }

    const previousOrderIds = new Set(editingTrip?.orderIds || []);
    const selectedOrderIdsSet = new Set(selectedOrderIds);
    const occupiedByOtherTrips = new Set();
    trips.forEach((existingTrip) => {
      if (existingTrip.id === editingTripId) return;
      (existingTrip.orderIds || []).forEach((orderId) => occupiedByOtherTrips.add(orderId));
    });
    setOrders((prev) =>
      prev.map((order) => {
        if (selectedOrderIdsSet.has(order.id)) {
          return { ...order, stageId: inCarStageId };
        }
        if (
          editingTripId &&
          previousOrderIds.has(order.id) &&
          !occupiedByOtherTrips.has(order.id) &&
          order.stageId === inCarStageId
        ) {
          return { ...order, stageId: warehouseStageId };
        }
        return order;
      }),
    );
    const addedOrderIds = selectedOrderIds.filter((orderId) => !previousOrderIds.has(orderId));
    const removedOrderIds = Array.from(previousOrderIds).filter((orderId) => !selectedOrderIdsSet.has(orderId));
    void syncTripOrderFolders({
      trip,
      previousTrip: editingTrip,
      addedOrderIds,
      removedOrderIds,
    });
    closeCreateTripForm();
    return { trip, selectedOrders };
  };

  const printTripApplication = async (trip, selectedOrders) => {
    if (typeof window === "undefined") return;
    setIsTripPrintLoading(true);
    try {
      const response = await fetch(resolveCargoApiUrl("/trip-application/docx"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trip: {
            tripNumber: trip.tripNumber,
            tripDate: trip.tripDate,
            carNumber: trip.carNumber,
            driverName: trip.driverName,
            signerRole: String(printSignerSettings.signerRole || "").trim(),
            signerName: String(printSignerSettings.signerName || "").trim(),
          },
          orders: selectedOrders.map((order) => ({
            name: order.name,
            awb: order.awb,
            recipient: order.recipient,
            shipmentAirport: order.shipmentAirport,
            customsName: String(order.customsName || "").trim() || getCustomsName(String(order.customsCode || "").trim()),
            customsCode: String(order.customsCode || "").trim(),
            quantity: order.quantity,
            weight: order.weight,
            notes: order.notes,
          })),
        }),
      });
      if (!response.ok) {
        let details = "";
        try {
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const data = await response.json();
            details = data?.details || data?.error || "";
          } else {
            const text = await response.text();
            details = text.slice(0, 240);
          }
        } catch (_) {
          // ignore parse errors
        }
        throw new Error(`DOCX generation failed: ${response.status}${details ? ` (${details})` : ""}`);
      }

      const docxBlob = await response.blob();
      const docxUrl = URL.createObjectURL(docxBlob);
      const suggestedName = `trip-application-${String(trip.tripNumber || "trip").replace(/[^0-9A-Za-z_-]+/g, "_")}.docx`;
      const downloadLink = document.createElement("a");
      downloadLink.href = docxUrl;
      downloadLink.download = suggestedName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      URL.revokeObjectURL(docxUrl);
    } catch (error) {
      alert(`Не удалось сформировать DOCX заявки: ${error?.message || "неизвестная ошибка"}`);
    } finally {
      setIsTripPrintLoading(false);
    }
  };

  const handleTripSubmit = (event) => {
    event.preventDefault();
    saveTripFromForm();
  };

  const handleTripPrint = async () => {
    const result = saveTripFromForm();
    if (!result) return;
    await printTripApplication(result.trip, result.selectedOrders);
  };

  const handlePrintTripCard = async (trip) => {
    if (!trip) return;
    const selectedOrderIds = Array.isArray(trip.orderIds) ? trip.orderIds : [];
    const selectedOrders = orders.filter((order) => selectedOrderIds.includes(order.id));
    if (selectedOrders.length === 0) {
      alert("В рейсе нет заказов для печати заявки.");
      return;
    }
    await printTripApplication(trip, selectedOrders);
  };

  const handleSelectView = (view) => {
    if (view === "settings") {
      setShowSettingsModal(true);
      return;
    }
    setActiveView(view);
    if (view === "orders") {
      setOrdersScreenMode("list");
    }
    if (view === "trips") {
      setTripsScreenMode("list");
    }
  };

  const moveItemByDirection = (stages, currentStageId, direction) => {
    const index = stages.findIndex((stage) => stage.id === currentStageId);
    if (index < 0) return currentStageId;
    const nextIndex = Math.min(Math.max(index + direction, 0), stages.length - 1);
    return stages[nextIndex]?.id || currentStageId;
  };

  const shouldRemoveOrderFromTrip = (stageId) =>
    stageId === planStageId || stageId === warehouseStageId;
  const buildTripOrdersSummary = (orderIds, sourceOrders) => {
    const selectedOrders = sourceOrders.filter((order) => orderIds.includes(order.id));
    const summaryHead = selectedOrders
      .slice(0, 3)
      .map((order) => order.name || order.recipient || order.id)
      .join(", ");
    return selectedOrders.length > 3
      ? `${summaryHead} (+${selectedOrders.length - 3})`
      : summaryHead;
  };
  const removeOrderIdsFromTrips = (orderIdsToRemove, sourceOrders, excludedTripId = "") => {
    const idsToRemove = new Set(orderIdsToRemove);
    if (idsToRemove.size === 0) return;
    const sourceOrdersById = new Map(sourceOrders.map((order) => [order.id, order]));
    setTrips((prevTrips) =>
      prevTrips.map((trip) => {
        if (excludedTripId && trip.id === excludedTripId) return trip;
        const currentOrderIds = Array.isArray(trip.orderIds) ? trip.orderIds : [];
        const nextOrderIds = currentOrderIds.filter((id) => !idsToRemove.has(id));
        if (nextOrderIds.length === currentOrderIds.length) return trip;
        if (driveConnected && trip.driveFolderId) {
          currentOrderIds
            .filter((id) => idsToRemove.has(id))
            .forEach((orderId) => {
              const order = sourceOrdersById.get(orderId);
              if (order?.driveFolderId) {
                void moveOrderFolderToBase(order);
              }
            });
        }
        return {
          ...trip,
          orderIds: nextOrderIds,
          ordersSummary: buildTripOrdersSummary(nextOrderIds, sourceOrders),
        };
      }),
    );
  };
  const removeOrderFromTrips = (orderId, sourceOrders = orders, excludedTripId = "") => {
    removeOrderIdsFromTrips([orderId], sourceOrders, excludedTripId);
  };

  const handleMoveOrder = (orderId, direction) => {
    const orderToMove = orders.find((order) => order.id === orderId);
    const nextStageId = orderToMove
      ? moveItemByDirection(orderStages, orderToMove.stageId, direction)
      : "";
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? { ...order, stageId: moveItemByDirection(orderStages, order.stageId, direction) }
          : order,
      ),
    );
    if (shouldRemoveOrderFromTrip(nextStageId)) {
      removeOrderFromTrips(orderId);
    }
  };

  const handleMoveOrderToStage = (orderId, stageId) => {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId ? { ...order, stageId } : order,
      ),
    );
    if (shouldRemoveOrderFromTrip(stageId)) {
      removeOrderFromTrips(orderId);
    }
  };

  const handleMoveTrip = (tripId, direction) => {
    setTrips((prev) => {
      let movedTrip = null;
      let previousStageId = "";
      let nextStageId = "";
      const nextTrips = prev.map((trip) => {
        if (trip.id !== tripId) return trip;
        movedTrip = trip;
        previousStageId = trip.stageId;
        nextStageId = moveItemByDirection(tripStages, trip.stageId, direction);
        return { ...trip, stageId: nextStageId };
      });

      if (movedTrip && nextStageId === completedTripStageId) {
        const movedOrderIds = new Set(movedTrip.orderIds || []);
        setOrders((prevOrders) =>
          prevOrders.map((order) =>
            movedOrderIds.has(order.id)
              ? { ...order, stageId: deliveredStageId }
              : order,
          ),
        );
      }
      if (
        movedTrip &&
        previousStageId === completedTripStageId &&
        nextStageId !== completedTripStageId
      ) {
        const movedOrderIds = new Set(movedTrip.orderIds || []);
        setOrders((prevOrders) =>
          prevOrders.map((order) =>
            movedOrderIds.has(order.id)
              ? { ...order, stageId: inCarStageId }
              : order,
          ),
        );
      }

      return nextTrips;
    });
  };

  const handleMoveTripToStage = (tripId, stageId) => {
    setTrips((prev) => {
      let movedTrip = null;
      let previousStageId = "";
      const nextTrips = prev.map((trip) => {
        if (trip.id !== tripId) return trip;
        movedTrip = trip;
        previousStageId = trip.stageId;
        return { ...trip, stageId };
      });

      if (movedTrip && stageId === completedTripStageId) {
        const movedOrderIds = new Set(movedTrip.orderIds || []);
        setOrders((prevOrders) =>
          prevOrders.map((order) =>
            movedOrderIds.has(order.id)
              ? { ...order, stageId: deliveredStageId }
              : order,
          ),
        );
      }
      if (
        movedTrip &&
        previousStageId === completedTripStageId &&
        stageId !== completedTripStageId
      ) {
        const movedOrderIds = new Set(movedTrip.orderIds || []);
        setOrders((prevOrders) =>
          prevOrders.map((order) =>
            movedOrderIds.has(order.id)
              ? { ...order, stageId: inCarStageId }
              : order,
          ),
        );
      }

      return nextTrips;
    });
  };

  const handleInsertOrderStage = (afterStageId) => {
    const stage = createStage("order-stage", "Новый этап");
    setOrderStages((prev) => {
      const index = prev.findIndex((item) => item.id === afterStageId);
      if (index < 0) return [...prev, stage];
      return [...prev.slice(0, index + 1), stage, ...prev.slice(index + 1)];
    });
    return stage.id;
  };

  const handleInsertTripStage = (afterStageId) => {
    const stage = createStage("trip-stage", "Новый этап");
    setTripStages((prev) => {
      const index = prev.findIndex((item) => item.id === afterStageId);
      if (index < 0) return [...prev, stage];
      return [...prev.slice(0, index + 1), stage, ...prev.slice(index + 1)];
    });
    return stage.id;
  };

  const handleRenameOrderStage = (stageId, name) => {
    const value = String(name || "").trim();
    if (!value) return;
    setOrderStages((prev) =>
      prev.map((stage) => (stage.id === stageId ? { ...stage, name: value } : stage)),
    );
  };

  const handleRenameTripStage = (stageId, name) => {
    const value = String(name || "").trim();
    if (!value) return;
    setTripStages((prev) =>
      prev.map((stage) => (stage.id === stageId ? { ...stage, name: value } : stage)),
    );
  };

  const handleDeleteOrderStage = (stageId) => {
    if (orderStages.length <= 1) return;
    const targetStage = orderStages.find((stage) => stage.id === stageId);
    if (DEFAULT_ORDER_STAGE_CODES.has(String(targetStage?.code || ""))) return;
    const remaining = orderStages.filter((stage) => stage.id !== stageId);
    const fallbackStageId = remaining[0]?.id;
    setOrderStages(remaining);
    setOrders((prev) =>
      prev.map((order) =>
        order.stageId === stageId ? { ...order, stageId: fallbackStageId } : order,
      ),
    );
  };

  const handleDeleteTripStage = (stageId) => {
    if (tripStages.length <= 1) return;
    const targetStage = tripStages.find((stage) => stage.id === stageId);
    if (DEFAULT_TRIP_STAGE_CODES.has(String(targetStage?.code || ""))) return;
    const remaining = tripStages.filter((stage) => stage.id !== stageId);
    const fallbackStageId = remaining[0]?.id;
    setTripStages(remaining);
    setTrips((prev) =>
      prev.map((trip) =>
        trip.stageId === stageId ? { ...trip, stageId: fallbackStageId } : trip,
      ),
    );
  };

  const connectGoogleDrive = async () => {
    if (!DRIVE_CONFIG.CLIENT_ID) {
      setDriveHint('Нужен VITE_GOOGLE_CLIENT_ID. Добавьте его в .env для подключения.');
      return;
    }

    try {
      const params = new URLSearchParams({
        client_id: DRIVE_CONFIG.CLIENT_ID,
        redirect_uri: DRIVE_CONFIG.REDIRECT_URI,
        response_type: 'code',
        scope: DRIVE_CONFIG.SCOPE,
        access_type: 'offline', // get refresh_token
        include_granted_scopes: 'true',
        prompt: 'consent',
      });

      // Redirect to Google OAuth 2.0 authorization endpoint (server-side code exchange)
      window.location = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    } catch (err) {
      console.error(err);
      setDriveHint('Ошибка инициации авторизации: ' + (err.message || err));
    }
  };

  const ensureAccessToken = async () => {
    const toks = getStoredTokens();
    if (toks && toks.access_token && toks.expires_at && Date.now() < toks.expires_at - 60000) {
      return toks.access_token;
    }

    // Try GIS token client first (no client_secret required)
    if (typeof gisTokenClient !== 'undefined' && gisTokenClient) {
      try {
        const token = await new Promise((resolve, reject) => {
          gisPendingResolver = { resolve, reject };
          // If user already consented, prompt can be empty, otherwise 'consent' will show screen
          gisTokenClient.requestAccessToken({ prompt: '' });
        });
        return token;
      } catch (err) {
        console.error('GIS token request failed', err);
        // fall through to try refresh_token if available
      }
    }

    // Fallback: try refresh token (server flow)
    if (toks && toks.refresh_token) {
      try {
        const res = await fetch(`${API_BASE_URL}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: toks.refresh_token, grant_type: 'refresh_token' }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error_description || data.error || JSON.stringify(data));
        const newTokens = {
          ...toks,
          access_token: data.access_token,
          expires_at: Date.now() + (data.expires_in || 3600) * 1000,
        };
        setStoredTokens(newTokens);
        setDriveConnected(true);
        return newTokens.access_token;
      } catch (err) {
        console.error(err);
        throw err;
      }
    }

    throw new Error('Требуется авторизация');
  };

  const createDriveFolder = async (name, parentId = null) => {
    try {
      const accessToken = await ensureAccessToken();
      const bodyObj = { name, mimeType: 'application/vnd.google-apps.folder' };
      if (parentId) {
        bodyObj.parents = [parentId];
      }

      const res = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyObj),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return {
        folderId: data.id,
        folderUrl: `https://drive.google.com/drive/folders/${data.id}`,
      };
    } catch (err) {
      console.error('Ошибка создания папки:', err);
      return null;
    }
  };

  // Создать папку в Google Drive для заказа
  const createDriveFolderForOrder = async (orderName, orderId) => {
    const created = await createDriveFolder(orderName, selectedDriveFolder?.id || null);
    if (!created) return null;

    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, driveFolder: created.folderUrl, driveFolderId: created.folderId } : o))
    );
    console.log('Папка заказа создана:', created.folderUrl);
    return created;
  };

  const createDriveFolderForTrip = async (trip) => {
    const tripFolderName = buildTripDriveFolderName({
      carNumber: trip.carNumberBase || trip.carNumber,
      driverName: trip.driverName,
    });
    const created = await createDriveFolder(tripFolderName, selectedDriveFolder?.id || null);
    if (!created) return null;

    setTrips((prev) =>
      prev.map((item) =>
        item.id === trip.id
          ? { ...item, driveFolder: created.folderUrl, driveFolderId: created.folderId }
          : item
      )
    );
    console.log('Папка рейса создана:', created.folderUrl);
    return created;
  };

  const moveDriveFolderToParent = async (folderId, parentId = null) => {
    if (!folderId) return false;
    try {
      const accessToken = await ensureAccessToken();
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}?fields=parents`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const meta = await metaRes.json();
      if (meta.error) throw new Error(meta.error.message || JSON.stringify(meta.error));

      const currentParents = Array.isArray(meta.parents) ? meta.parents : [];
      const removeParents = currentParents.filter((id) => id !== parentId).join(",");
      const shouldAddParent = Boolean(parentId) && !currentParents.includes(parentId);
      if (!removeParents && !shouldAddParent) return true;

      const params = new URLSearchParams();
      if (removeParents) params.set('removeParents', removeParents);
      if (shouldAddParent && parentId) params.set('addParents', parentId);

      const moveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}?${params.toString()}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        },
      );
      const moved = await moveRes.json();
      if (moved.error) throw new Error(moved.error.message || JSON.stringify(moved.error));
      return true;
    } catch (err) {
      console.error('Ошибка перемещения папки:', err);
      return false;
    }
  };

  const moveOrderFolderToTrip = async (order, tripFolderId) => {
    if (!order?.driveFolderId || !tripFolderId) return;
    await moveDriveFolderToParent(order.driveFolderId, tripFolderId);
  };

  const moveOrderFolderToBase = async (order) => {
    if (!order?.driveFolderId) return;
    await moveDriveFolderToParent(order.driveFolderId, selectedDriveFolder?.id || null);
  };

  const syncTripOrderFolders = async ({
    trip,
    previousTrip = null,
    addedOrderIds = [],
    removedOrderIds = [],
  }) => {
    if (!driveConnected) return;
    const ordersById = new Map(orders.map((order) => [order.id, order]));

    let tripFolderId = trip.driveFolderId || previousTrip?.driveFolderId || null;
    let orderIdsToMoveIntoTrip = addedOrderIds;
    if (!tripFolderId) {
      const created = await createDriveFolderForTrip(trip);
      tripFolderId = created?.folderId || null;
      orderIdsToMoveIntoTrip = Array.isArray(trip.orderIds) ? trip.orderIds : [];
    }

    if (tripFolderId) {
      for (const orderId of orderIdsToMoveIntoTrip) {
        const order = ordersById.get(orderId);
        if (!order) continue;

        let orderFolderId = order.driveFolderId || null;
        if (!orderFolderId) {
          const created = await createDriveFolderForOrder(
            order.name || order.recipient || order.id || "Заказ",
            order.id,
          );
          orderFolderId = created?.folderId || null;
        }

        if (orderFolderId) {
          await moveDriveFolderToParent(orderFolderId, tripFolderId);
        }
      }
    }

    for (const orderId of removedOrderIds) {
      const order = ordersById.get(orderId);
      if (order?.driveFolderId) {
        await moveOrderFolderToBase(order);
      }
    }
  };

  // Переименовать папку в Google Drive
  const updateDriveFolderName = async (folderId, newName) => {
    if (!folderId) return;
    try {
      const accessToken = await ensureAccessToken();
      await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newName }),
      });
      console.log('Папка переименована в:', newName);
    } catch (err) {
      console.error('Ошибка переименования папки:', err);
    }
  };

  // Удалить папку в Google Drive
  const deleteDriveFolder = async (folderId) => {
    if (!folderId) return;
    try {
      const accessToken = await ensureAccessToken();
      await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      console.log('Папка удалена:', folderId);
    } catch (err) {
      console.error('Ошибка удаления папки:', err);
    }
  };

  const selectDriveFolder = async () => {
    if (!driveConnected) {
      setDriveHint('Сначала подключите Google Drive.');
      return;
    }

    try {
      const accessToken = await ensureAccessToken();
      await loadGooglePickerApi();
      
      // Проверить, загружена ли Google Picker API
      if (!DRIVE_CONFIG.API_KEY) {
        setDriveHint('Укажите VITE_GOOGLE_API_KEY в .env, чтобы открыть выбор папки.');
        return;
      }

      if (typeof google === 'undefined' || typeof google.picker === 'undefined') {
        setDriveHint('Google Picker API ещё не загружена. Попробуйте через секунду.');
        return;
      }

      setDriveHint('Открываю выбор папки Google Drive...');
      
      // Создать Picker для выбора папки
      const folderView = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true);

      const picker = new google.picker.PickerBuilder()
        .addView(folderView)
        .setDeveloperKey(DRIVE_CONFIG.API_KEY)
        .setOAuthToken(accessToken)
        .setCallback((data) => {
          if (data.action === google.picker.Action.PICKED) {
            const folderData = data.docs[0];
            const folderObj = {
              id: folderData.id,
              name: folderData.name,
              url: `https://drive.google.com/drive/folders/${folderData.id}`,
            };
            setSelectedDriveFolder(folderObj);
            setDriveHint(`Выбрана папка: ${folderObj.name}`);
            console.log('Выбрана папка:', folderObj);
          } else if (data.action === google.picker.Action.CANCEL) {
            setDriveHint('Выбор папки отменён.');
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      console.error(err);
      setDriveHint('Ошибка открытия выбора папки: ' + (err.message || err));
    }
  };

  const handleDisconnectGoogleDrive = () => {
    localStorage.removeItem('gdrive_tokens');
    localStorage.removeItem('gdrive_selected_folder');
    setDriveConnected(false);
    setSelectedDriveFolder(null);
    setDriveHint('Токены очищены. Нажмите "Подключить Google Drive" заново.');
  };

  const openDeleteOrderConfirm = (order) => {
    setDeleteCardModal({
      isOpen: true,
      type: "order",
      id: order.id,
      title: order.name || "Без названия",
    });
  };

  const openDeleteTripConfirm = (trip) => {
    setDeleteCardModal({
      isOpen: true,
      type: "trip",
      id: trip.id,
      title: trip.tripNumber || "Без номера",
    });
  };

  const closeDeleteCardModal = () => {
    if (isDeleteCardLoading) return;
    setDeleteCardModal({
      isOpen: false,
      type: "",
      id: "",
      title: "",
    });
  };

  const confirmDeleteCard = async () => {
    const { type, id } = deleteCardModal;
    if (!id || !type || isDeleteCardLoading) return;
    setIsDeleteCardLoading(true);

    try {
      if (type === "order") {
        const orderToDelete = orders.find((o) => o.id === id);
        if (orderToDelete?.driveFolderId) {
          await deleteDriveFolder(orderToDelete.driveFolderId);
        }
        const remainingOrders = orders.filter((o) => o.id !== id);
        setOrders(remainingOrders);
        removeOrderFromTrips(id, remainingOrders);
        if (editingOrderId === id) {
          cancelOrderForm();
        }
      }

      if (type === "trip") {
        const tripToDelete = trips.find((trip) => trip.id === id);
        const tripOrderIds = new Set(tripToDelete?.orderIds || []);
      if (tripToDelete?.stageId === completedTripStageId) {
          const ordersToDelete = orders.filter((order) => tripOrderIds.has(order.id));
          for (const order of ordersToDelete) {
            if (order?.driveFolderId) {
              await deleteDriveFolder(order.driveFolderId);
            }
          }
          const remainingOrders = orders.filter((order) => !tripOrderIds.has(order.id));
          setOrders(remainingOrders);
          removeOrderIdsFromTrips(Array.from(tripOrderIds), remainingOrders, id);
        } else {
          const tripOrders = orders.filter((order) => tripOrderIds.has(order.id));
          for (const order of tripOrders) {
            if (order?.driveFolderId) {
              await moveOrderFolderToBase(order);
            }
          }
          setOrders((prevOrders) =>
            prevOrders.map((order) =>
            tripOrderIds.has(order.id)
                ? { ...order, stageId: warehouseStageId }
                : order,
            ),
          );
        }
        if (tripToDelete?.driveFolderId) {
          await deleteDriveFolder(tripToDelete.driveFolderId);
        }
        setTrips((prev) => prev.filter((trip) => trip.id !== id));
        if (editingTripId === id) {
          closeCreateTripForm();
        }
      }

      closeDeleteCardModal();
    } catch (error) {
      console.error("delete_card_failed", error);
      alert(`Не удалось удалить карточку: ${error?.message || "неизвестная ошибка"}`);
    } finally {
      setIsDeleteCardLoading(false);
    }
  };

  const createOrderFormDataFromOrder = (order) => {
    const awbParts = splitAwb(order.awb);
    return {
      shipmentAirport: order.shipmentAirport || "",
      shipmentTerminal: order.shipmentTerminal || "",
      recipient: order.recipient || "",
      orderName: order.name || "",
      awb: order.awb || "",
      awbPrefix: awbParts.awbPrefix,
      awbNumber: awbParts.awbNumber,
      hasHawb: awbParts.hasHawb,
      hawb: awbParts.hawb || "",
      quantity: order.quantity || "",
      weight: order.weight || "",
      customsCode: order.customsCode || "",
      notes: order.notes || "",
    };
  };

  const handleEditClick = (order) => {
    setFormData(createOrderFormDataFromOrder(order));
    setEditingOrderId(order.id);
    setOrdersScreenMode("create");
  };
  const handleCopyOrderClick = (order) => {
    setFormData(createOrderFormDataFromOrder(order));
    setEditingOrderId(null);
    setAwbStatusCheck({
      loading: false,
      error: "",
      data: null,
    });
    setOrdersScreenMode("create");
  };
  const handleEditOrderFromTripClick = (order) => {
    setActiveView("orders");
    handleEditClick(order);
  };

  const handleEditTripClick = (trip) => {
    const parsedCar = parseTripCarNumber(trip.carNumber);
    setTripFormData({
      tripNumber: trip.tripNumber || "",
      tripDate: trip.tripDate || getTodayIsoDate(),
      carNumber: trip.carNumberBase || parsedCar.carNumber,
      hasTrailer:
        typeof trip.hasTrailer === "boolean" ? trip.hasTrailer : parsedCar.hasTrailer,
      driverName: trip.driverName || "",
      orderIds: Array.isArray(trip.orderIds) ? trip.orderIds : [],
    });
    setEditingTripId(trip.id);
    setTripsScreenMode("create");
  };

  const cancelOrderForm = () => {
    setEditingOrderId(null);
    setFormData({
      shipmentAirport: "",
      shipmentTerminal: "",
      recipient: "",
      orderName: "",
      awb: "",
      awbPrefix: "",
      awbNumber: "",
      hasHawb: false,
      hawb: "",
      quantity: "",
      weight: "",
      customsCode: "",
      notes: "",
    });
    setOrdersScreenMode("list");
  };

  const handlePrintSignerChange = (field, value) => {
    if (field !== "signerRole" && field !== "signerName") return;
    setPrintSignerSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAuthFieldChange = (field) => (event) => {
    const value = String(event.target.value || "");
    setAuthForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSignIn = async () => {
    if (!supabase) return;
    setAuthError("");
    setAuthInfo("");
    setIsAuthSubmitting(true);
    try {
      const email = String(authForm.email || "").trim();
      const password = String(authForm.password || "");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (error) {
      setAuthError(error?.message || "Не удалось войти.");
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleSignUp = async () => {
    if (!supabase) return;
    setAuthError("");
    setAuthInfo("");
    setIsAuthSubmitting(true);
    try {
      const email = String(authForm.email || "").trim();
      const password = String(authForm.password || "");
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      setAuthInfo("Проверьте email: подтвердите регистрацию по ссылке.");
    } catch (error) {
      setAuthError(error?.message || "Не удалось зарегистрироваться.");
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleRequestPasswordReset = async () => {
    if (!supabase) return;
    setAuthError("");
    setAuthInfo("");
    setIsAuthSubmitting(true);
    try {
      const email = String(authForm.email || "").trim();
      if (!email) {
        throw new Error("Введите email для восстановления.");
      }
      const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setAuthInfo("Ссылка для восстановления отправлена на email.");
    } catch (error) {
      setAuthError(error?.message || "Не удалось отправить ссылку восстановления.");
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    setAuthError("");
    setAuthInfo("");
    setIsChangePasswordScreenOpen(false);
    setChangePasswordError("");
    setChangePasswordInfo("");
    setChangePasswordForm({ password: "", confirmPassword: "" });
    await supabase.auth.signOut();
  };

  const handleChangePasswordField = (field) => (event) => {
    const value = String(event.target.value || "");
    setChangePasswordForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleChangePasswordSubmit = async () => {
    if (!supabase) return;
    setChangePasswordError("");
    setChangePasswordInfo("");
    setIsChangePasswordSubmitting(true);
    try {
      const password = String(changePasswordForm.password || "");
      const confirmPassword = String(changePasswordForm.confirmPassword || "");
      if (password.length < 6) {
        throw new Error("Пароль должен быть не короче 6 символов.");
      }
      if (password !== confirmPassword) {
        throw new Error("Пароли не совпадают.");
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setChangePasswordInfo("Пароль успешно изменен.");
      setChangePasswordForm({ password: "", confirmPassword: "" });
    } catch (error) {
      setChangePasswordError(error?.message || "Не удалось изменить пароль.");
    } finally {
      setIsChangePasswordSubmitting(false);
    }
  };

  const settingsSections = [
    {
      id: 'google-drive',
      title: 'Google Drive',
      status: driveConnected ? 'подключен' : 'не подключен',
      actionLabel: 'Открыть',
      onOpen: () => {
        setShowSettingsModal(false);
        setShowDriveSettingsModal(true);
      },
    },
    {
      id: 'print-signature',
      title: 'Изменение подписи',
      status: `${printSignerSettings.signerRole || "—"} · ${printSignerSettings.signerName || "—"}`,
      actionLabel: 'Открыть',
      onOpen: () => {
        setShowSettingsModal(false);
        setShowSignatureSettingsModal(true);
      },
    },
    {
      id: 'account',
      title: 'Аккаунт',
      status: currentUser?.email || 'Вход выполнен',
      actionLabel: 'Открыть',
      onOpen: () => {
        setShowSettingsModal(false);
        setShowAccountSettingsModal(true);
      },
    },
  ];
  const isDefaultOrderStage = React.useCallback(
    (stage) => DEFAULT_ORDER_STAGE_CODES.has(String(stage?.code || "")),
    [],
  );
  const isDefaultTripStage = React.useCallback(
    (stage) => DEFAULT_TRIP_STAGE_CODES.has(String(stage?.code || "")),
    [],
  );

  if (isSupabaseConfigured && !authReady) {
    return (
      <div className="app">
        <main className="workspace">
          <section className="card panel-section">
            <h2>Авторизация</h2>
            <p>Проверяем сессию Supabase...</p>
          </section>
        </main>
      </div>
    );
  }

  if (isSupabaseConfigured && !currentUser) {
    return (
      <div className="app">
        <main className="workspace">
          <section className="card panel-section" style={{ maxWidth: "520px", margin: "0 auto" }}>
            <h2>{authScreen === "recover" ? "Восстановление пароля" : "Вход в систему"}</h2>
            <div style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}>
              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span>Email</span>
                <input
                  type="email"
                  value={authForm.email}
                  onChange={handleAuthFieldChange("email")}
                  placeholder="you@company.com"
                />
              </label>
              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span>Пароль</span>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={handleAuthFieldChange("password")}
                  placeholder="Минимум 6 символов"
                  disabled={authScreen === "recover"}
                />
              </label>
              {authError && <small style={{ color: "#b91c1c" }}>{authError}</small>}
              {authInfo && <small style={{ color: "#0f5132" }}>{authInfo}</small>}
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                {authScreen === "recover" ? (
                  <>
                    <button type="button" className="primary" onClick={handleRequestPasswordReset} disabled={isAuthSubmitting}>
                      {isAuthSubmitting ? "Выполняем..." : "Отправить ссылку"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthScreen("login");
                        setAuthError("");
                        setAuthInfo("");
                      }}
                      disabled={isAuthSubmitting}
                    >
                      Назад к входу
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="primary" onClick={handleSignIn} disabled={isAuthSubmitting}>
                      {isAuthSubmitting ? "Выполняем..." : "Войти"}
                    </button>
                    <button type="button" onClick={handleSignUp} disabled={isAuthSubmitting}>
                      {isAuthSubmitting ? "Выполняем..." : "Зарегистрироваться"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthScreen("recover");
                        setAuthError("");
                        setAuthInfo("");
                      }}
                      disabled={isAuthSubmitting}
                    >
                      Восстановить пароль по email
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (isSupabaseConfigured && currentUser && isChangePasswordScreenOpen) {
    return (
      <div className="app">
        <main className="workspace">
          <section className="card panel-section" style={{ maxWidth: "520px", margin: "0 auto" }}>
            <h2>Сменить пароль</h2>
            <div style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}>
              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span>Новый пароль</span>
                <input
                  type="password"
                  value={changePasswordForm.password}
                  onChange={handleChangePasswordField("password")}
                  placeholder="Минимум 6 символов"
                />
              </label>
              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span>Повторите пароль</span>
                <input
                  type="password"
                  value={changePasswordForm.confirmPassword}
                  onChange={handleChangePasswordField("confirmPassword")}
                  placeholder="Повторите пароль"
                />
              </label>
              {changePasswordError && <small style={{ color: "#b91c1c" }}>{changePasswordError}</small>}
              {changePasswordInfo && <small style={{ color: "#0f5132" }}>{changePasswordInfo}</small>}
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <button type="button" className="primary" onClick={handleChangePasswordSubmit} disabled={isChangePasswordSubmitting}>
                  {isChangePasswordSubmitting ? "Сохраняем..." : "Сохранить пароль"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsChangePasswordScreenOpen(false);
                    setChangePasswordError("");
                    setChangePasswordInfo("");
                    setChangePasswordForm({ password: "", confirmPassword: "" });
                  }}
                  disabled={isChangePasswordSubmitting}
                >
                  Назад
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app">

      <main className="workspace">
        <HeaderNavigation activeView={activeView} onSelectView={handleSelectView} />

        <section className="workspace__content workspace__content--full">
          {activeView === "orders" && (
            <>
              {ordersScreenMode === "list" ? (
                <WorkPanel
                  title="Реестр заказов"
                  actionLabel="Создать заказ"
                  onAction={() => {
                    setEditingOrderId(null);
                    setOrdersScreenMode("create");
                  }}
                >
                  <WorkflowBoard
                    boardTitle="Этапы заявок"
                    stages={orderStages}
                    items={orders}
                    getItemId={(order) => order.id}
                    getItemStageId={(order) => order.stageId}
                    getItemWeight={(order) => order.weight}
                    onMoveItemToStage={handleMoveOrderToStage}
                    onInsertStage={handleInsertOrderStage}
                    onRenameStage={handleRenameOrderStage}
                    onDeleteStage={handleDeleteOrderStage}
                    allowStageManagement
                    isStageDefault={isDefaultOrderStage}
                    renderItemCard={(order) => (
                      <div className="workflow-card">
                        <div className="workflow-card__top-actions">
                          <button type="button" className="workflow-card__icon-btn" title="Редактировать" onClick={() => handleEditClick(order)} aria-label="Редактировать">
                            <span aria-hidden="true">&#9998;</span>
                          </button>
                          <button type="button" className="workflow-card__icon-btn" title="Копировать" onClick={() => handleCopyOrderClick(order)} aria-label="Копировать">
                            <span aria-hidden="true">&#128203;</span>
                          </button>
                          <button type="button" className="workflow-card__icon-btn workflow-card__icon-btn--danger" title="Удалить" onClick={() => openDeleteOrderConfirm(order)} aria-label="Удалить">
                            <span aria-hidden="true">&#128465;</span>
                          </button>
                        </div>
                        <div className="workflow-card__title">{order.name || "Без названия"}</div>
                        <div className="workflow-card__meta workflow-card__meta--awb">
                          {order.shipmentAirport || "—"} - {order.customsName || order.customsCode || "—"}
                        </div>
                        <div className="workflow-card__meta">
                          AWB:{" "}
                          {order.awb ? (
                            <button
                              type="button"
                              className="workflow-card__order-link"
                              onClick={() => checkOrderAwbStatus(order)}
                              title="Проверить накладную"
                              aria-label={`Проверить накладную ${order.awb}`}
                            >
                              {order.awb}
                            </button>
                          ) : (
                            "—"
                          )}
                        </div>
                        <div className="workflow-card__meta">{order.quantity || "—"} мест / {order.weight || "—"} кг</div>
                      </div>
                    )}
                  />
                </WorkPanel>
              ) : (
                <WorkPanel
                  title={editingOrderId ? "Редактирование заказа" : "Создание заказа"}
                >
                  <OrderFormCard
                    formData={formData}
                    customsName={customsName}
                    customsSuggestions={customsSuggestions}
                    powerOfAttorneyStatus={powerOfAttorneyStatus}
                    recipientSuggestions={recipientSuggestions}
                    awbStatusCheck={awbStatusCheck}
                    isAwbCheckAvailable={isCargoCheckAvailable}
                    isPowerOfAttorneySyncLoading={isPowerOfAttorneySyncLoading}
                    onCheckAwbStatus={checkAwbStatus}
                    onOpenManualCheck={openManualCargoCheck}
                    onRefreshPowerOfAttorneyRegistry={() => loadPowerOfAttorneyRegistry(true)}
                    onFieldChange={handleFieldChange}
                    onSubmit={handleSubmit}
                    onCancel={cancelOrderForm}
                    embedded
                  />
                </WorkPanel>
              )}
            </>
          )}

          {activeView === "trips" && (
            <>
              {tripsScreenMode === "list" ? (
                <WorkPanel
                  title="Список рейсов"
                  actionLabel="Создать рейс"
                  onAction={openCreateTripForm}
                >
                  <WorkflowBoard
                    boardTitle="Этапы рейсов"
                    stages={tripStages}
                    items={trips}
                    getItemId={(trip) => trip.id}
                    getItemStageId={(trip) => trip.stageId}
                    getItemWeight={(trip) =>
                      (trip.orderIds || []).reduce((sum, orderId) => {
                        const order = orders.find((item) => item.id === orderId);
                        const weight = Number.parseFloat(String(order?.weight ?? "0").replace(",", "."));
                        return sum + (Number.isFinite(weight) ? weight : 0);
                      }, 0)
                    }
                    onMoveItemToStage={handleMoveTripToStage}
                    onInsertStage={handleInsertTripStage}
                    onRenameStage={handleRenameTripStage}
                    onDeleteStage={handleDeleteTripStage}
                    allowStageManagement
                    isStageDefault={isDefaultTripStage}
                    renderItemCard={(trip) => {
                      const tripOrders = orders.filter((order) => (trip.orderIds || []).includes(order.id));
                      const totalTripWeight = tripOrders.reduce((sum, order) => {
                        const parsed = Number.parseFloat(String(order.weight || "0").replace(",", "."));
                        return sum + (Number.isFinite(parsed) ? parsed : 0);
                      }, 0);
                      return (
                        <div className="workflow-card">
                          <div className="workflow-card__top-actions">
                            <button type="button" className="workflow-card__icon-btn" title="Редактировать" onClick={() => handleEditTripClick(trip)} aria-label="Редактировать">
                              <span aria-hidden="true">&#9998;</span>
                            </button>
                            <button
                              type="button"
                              className="workflow-card__icon-btn"
                              title="Печать заявки"
                              onClick={() => handlePrintTripCard(trip)}
                              aria-label="Печать заявки"
                              disabled={isTripPrintLoading}
                            >
                              <span aria-hidden="true">&#128424;</span>
                            </button>
                            <button type="button" className="workflow-card__icon-btn workflow-card__icon-btn--danger" title="Удалить" onClick={() => openDeleteTripConfirm(trip)} aria-label="Удалить">
                              <span aria-hidden="true">&#128465;</span>
                            </button>
                          </div>
                          <div className="workflow-card__title">
                            {(trip.tripNumber || "Без номера")} от {formatTripDateShort(trip.tripDate)}
                          </div>
                          <div className="workflow-card__meta">{trip.carNumber || "—"} · {trip.driverName || "—"}</div>
                          <div className="workflow-card__meta">
                            Заказов: {tripOrders.length} · Вес: {totalTripWeight.toLocaleString("ru-RU", {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })} кг
                          </div>
                          <div className="workflow-card__meta">
                            {tripOrders.length === 0
                              ? "—"
                              : tripOrders.map((order, index) => (
                                  <React.Fragment key={order.id}>
                                    <button
                                      type="button"
                                      className="workflow-card__order-link"
                                      onClick={() => handleEditOrderFromTripClick(order)}
                                      title="Открыть заказ для редактирования"
                                    >
                                      {order.name || order.recipient || order.awb || order.id}
                                    </button>
                                    {index < tripOrders.length - 1 ? ", " : ""}
                                  </React.Fragment>
                                ))}
                          </div>
                        </div>
                      );
                    }}
                  />
                </WorkPanel>
              ) : (
                <WorkPanel
                  title={editingTripId ? "Редактирование рейса" : "Создание рейса"}
                >
                  <TripFormCard
                    formData={tripFormData}
                    onFieldChange={handleTripFieldChange}
                    onToggleOrder={handleToggleTripOrder}
                    onSubmit={handleTripSubmit}
                    onPrint={handleTripPrint}
                    onCancel={closeCreateTripForm}
                    submitLabel="Сохранить"
                    orders={availableOrdersForTrip}
                    carNumbers={TRIP_CAR_NUMBERS}
                    driverNames={TRIP_DRIVER_NAMES}
                    isPrintLoading={isTripPrintLoading}
                    embedded
                  />
                </WorkPanel>
              )}
            </>
          )}

        </section>
      </main>

      <SettingsModal
        isOpen={showSettingsModal}
        settingsSections={settingsSections}
        onClose={() => setShowSettingsModal(false)}
      />

      <AccountSettingsModal
        isOpen={showAccountSettingsModal}
        accountEmail={currentUser?.email || ""}
        onOpenChangePassword={() => {
          setShowAccountSettingsModal(false);
          setIsChangePasswordScreenOpen(true);
        }}
        onSignOut={() => {
          setShowAccountSettingsModal(false);
          void handleSignOut();
        }}
        onClose={() => setShowAccountSettingsModal(false)}
      />

      <DriveSettingsModal
        isOpen={showDriveSettingsModal}
        driveConnected={driveConnected}
        selectedDriveFolder={selectedDriveFolder}
        driveHint={driveHint}
        onConnectGoogleDrive={connectGoogleDrive}
        onSelectDriveFolder={selectDriveFolder}
        onDisconnectGoogleDrive={handleDisconnectGoogleDrive}
        onClose={() => setShowDriveSettingsModal(false)}
      />

      <SignatureSettingsModal
        isOpen={showSignatureSettingsModal}
        printSignerSettings={printSignerSettings}
        onPrintSignerChange={handlePrintSignerChange}
        onClose={() => setShowSignatureSettingsModal(false)}
      />

      {deleteCardModal.isOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Подтверждение удаления карточки">
          <div className="modal-card workflow-modal">
            <div className="modal-card__header">
              <h2>Удалить карточку?</h2>
            </div>
            <div className="modal-card__body">
              <p>
                Карточка "{deleteCardModal.title}" будет удалена без возможности восстановления.
              </p>
              <div className="workflow-confirm-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={confirmDeleteCard}
                  disabled={isDeleteCardLoading}
                >
                  {isDeleteCardLoading ? "Удаление..." : "Удалить"}
                </button>
                <button type="button" onClick={closeDeleteCardModal} disabled={isDeleteCardLoading}>
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isDeleteCardLoading && (
        <div className="loader-overlay" role="status" aria-live="polite" aria-label="Удаление карточки">
          <div className="loader-overlay__content">
            <div className="loader-overlay__spinner" />
            <div className="loader-overlay__text">Удаляем карточку...</div>
          </div>
        </div>
      )}

      {awbStatusCheck.loading && (
        <div className="loader-overlay" role="status" aria-live="polite" aria-label="Проверка статуса">
          <div className="loader-overlay__content">
            <button
              type="button"
              className="loader-overlay__close"
              aria-label="Прервать проверку"
              title="Прервать проверку"
              onClick={cancelAwbStatusCheck}
            >
              &times;
            </button>
            <div className="loader-overlay__spinner" />
            <div className="loader-overlay__text">Проверяем накладную...</div>
          </div>
        </div>
      )}

      {isTripPrintLoading && (
        <div className="loader-overlay" role="status" aria-live="polite" aria-label="Подготовка печати">
          <div className="loader-overlay__content">
            <div className="loader-overlay__spinner" />
            <div className="loader-overlay__text">Готовим заявку к печати...</div>
          </div>
        </div>
      )}

      {cargoScreenshotModal.isOpen && cargoScreenshotModal.screenshotUrl && (
        <div
          className="screenshot-modal__overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Скриншот статуса груза"
          onClick={closeCargoScreenshotModal}
        >
          <div className="screenshot-modal" onClick={(event) => event.stopPropagation()}>
            <div className="screenshot-modal__header">
              <h3>Скриншот ответа терминала</h3>
              <button type="button" onClick={closeCargoScreenshotModal}>
                Закрыть
              </button>
            </div>
            <div className="screenshot-modal__body">
              <img src={cargoScreenshotModal.screenshotUrl} alt="Скриншот ответа терминала" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default App;


