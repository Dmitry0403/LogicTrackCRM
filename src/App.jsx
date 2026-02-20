import React from 'react';
import {
  OrderFormCard,
  SettingsModal,
  DriveSettingsModal,
} from './components/ui';
import {
  HeaderNavigation,
  WorkPanel,
  WorkflowBoard,
  TripFormCard,
} from './components/workspace';

const DRIVE_CONFIG = {
  CLIENT_ID: "389372481906-pfjepgeg2odfqmfdopdbsn2t890uoahe.apps.googleusercontent.com",
  API_KEY: "AIzaSyCU3YTk2rpt38Kyrz96Cz3Qh_xsMWOHMeA",
  REDIRECT_URI: "http://localhost:5173/",
  SCOPE: "https://www.googleapis.com/auth/drive.file",
};

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

const POWER_OF_ATTORNEY_REGISTRY_URL = "http://localhost:3001/poa/registry";
const POWER_OF_ATTORNEY_FALLBACK_URL = "/power-of-attorney-registry.json";
const CARGO_STATUS_URL = "http://localhost:3001/cargo/status";
const CARGO_API_BASE_URL = "http://localhost:3001";
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
  { id: "order-stage-plan", name: "План" },
  { id: "order-stage-warehouse", name: "На складе" },
  { id: "order-stage-in-car", name: "В машине" },
  { id: "order-stage-delivered", name: "Доставлено" },
];
const DEFAULT_TRIP_STAGES = [
  { id: "trip-stage-plan", name: "План" },
  { id: "trip-stage-in-route", name: "В рейсе" },
  { id: "trip-stage-completed", name: "Завершено" },
];
const ORDER_STAGE_PLAN_ID = "order-stage-plan";
const ORDER_STAGE_WAREHOUSE_ID = "order-stage-warehouse";
const ORDER_STAGE_IN_CAR_ID = "order-stage-in-car";
const ORDER_STAGE_DELIVERED_ID = "order-stage-delivered";
const TRIP_STAGE_COMPLETED_ID = "trip-stage-completed";
const DEFAULT_ORDER_STAGE_IDS = new Set(DEFAULT_ORDER_STAGES.map((stage) => stage.id));
const DEFAULT_TRIP_STAGE_IDS = new Set(DEFAULT_TRIP_STAGES.map((stage) => stage.id));

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

const composeAwb = (prefix, number) => {
  const p = String(prefix || "").replace(/\D/g, "").slice(0, 3);
  const n = String(number || "").replace(/\D/g, "").slice(0, 10);
  if (p && n) return `${p}-${n}`;
  if (p) return p;
  if (n) return n;
  return "";
};

const splitAwb = (awb) => {
  const clean = String(awb || "").trim();
  const match = clean.match(/^(\d{3})-(\d{1,10})$/);
  if (match) {
    return { awbPrefix: match[1], awbNumber: match[2] };
  }
  return { awbPrefix: "", awbNumber: clean.replace(/\D/g, "").slice(0, 10) };
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

const App = () => {
  const SHEREMETYEVO_VALUES = new Set(["Шереметьево"]);
  const DEFAULT_SHEREMETYEVO_TERMINAL = "Москва-карго";

  const [orders, setOrders] = React.useState(loadOrders);
  const [trips, setTrips] = React.useState(loadTrips);
  const [orderStages, setOrderStages] = React.useState(DEFAULT_ORDER_STAGES);
  const [tripStages, setTripStages] = React.useState(DEFAULT_TRIP_STAGES);
  const [activeView, setActiveView] = React.useState("orders");
  const [ordersScreenMode, setOrdersScreenMode] = React.useState("list");
  const [tripsScreenMode, setTripsScreenMode] = React.useState("list");
  const [driveConnected, setDriveConnected] = React.useState(false);
  const [powerOfAttorneyRegistry, setPowerOfAttorneyRegistry] = React.useState(defaultPowerOfAttorneyRegistry);
  const [isPowerOfAttorneySyncLoading, setIsPowerOfAttorneySyncLoading] = React.useState(false);
  const [driveHint, setDriveHint] = React.useState(
    "Чтобы активировать синхронизацию, укажите CLIENT_ID и API_KEY в app.jsx."
  );

  const [formData, setFormData] = React.useState({
    shipmentAirport: "",
    shipmentTerminal: "",
    recipient: "",
    orderName: "",
    awb: "",
    awbPrefix: "",
    awbNumber: "",
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

  React.useEffect(() => {
    saveOrders(orders);
  }, [orders]);

  React.useEffect(() => {
    saveTrips(trips);
  }, [trips]);

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
          const res = await fetch('http://localhost:3001/oauth/token', {
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
        const res = await fetch('http://localhost:3001/oauth/token', {
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
    await runAwbStatusCheck({
      awb: awbText,
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
    const value = event.target.value;
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
      if (field === "awbPrefix" || field === "awbNumber") {
        next.awb = composeAwb(
          field === "awbPrefix" ? value : prev.awbPrefix,
          field === "awbNumber" ? value : prev.awbNumber,
        );
      }
      return next;
    });

    if (
      field === "awb" ||
      field === "awbPrefix" ||
      field === "awbNumber" ||
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
      awb: composeAwb(formData.awbPrefix, formData.awbNumber) || formData.awb.trim(),
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
  const occupiedOrderIdsByOtherTrips = React.useMemo(() => {
    const ids = new Set();
    trips.forEach((trip) => {
      if (trip.id === editingTripId) return;
      (trip.orderIds || []).forEach((orderId) => ids.add(orderId));
    });
    return ids;
  }, [trips, editingTripId]);
  const availableOrdersForTrip = React.useMemo(() => {
    const editingOrderIds = new Set(editingTrip?.orderIds || []);
    return orders.filter((order) => {
      if (editingOrderIds.has(order.id)) return true;
      const isWarehouse = order.stageId === ORDER_STAGE_WAREHOUSE_ID;
      const isFree = !occupiedOrderIdsByOtherTrips.has(order.id);
      return isWarehouse && isFree;
    });
  }, [orders, occupiedOrderIdsByOtherTrips, editingTrip]);

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

  const handleTripSubmit = (event) => {
    event.preventDefault();
    const allowedOrderIds = new Set(availableOrdersForTrip.map((order) => order.id));
    const selectedOrderIds = tripFormData.orderIds.filter((orderId) => allowedOrderIds.has(orderId));
    if (selectedOrderIds.length === 0) {
      alert("Выберите хотя бы один заказ для рейса.");
      return;
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
      ordersSummary:
        selectedOrders.length > 3
          ? `${ordersSummary} (+${selectedOrders.length - 3})`
          : ordersSummary,
    };
    if (editingTripId) {
      setTrips((prev) => prev.map((item) => (item.id === editingTripId ? trip : item)));
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
          return { ...order, stageId: ORDER_STAGE_IN_CAR_ID };
        }
        if (
          editingTripId &&
          previousOrderIds.has(order.id) &&
          !occupiedByOtherTrips.has(order.id) &&
          order.stageId === ORDER_STAGE_IN_CAR_ID
        ) {
          return { ...order, stageId: ORDER_STAGE_WAREHOUSE_ID };
        }
        return order;
      }),
    );
    closeCreateTripForm();
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
    stageId === ORDER_STAGE_PLAN_ID || stageId === ORDER_STAGE_WAREHOUSE_ID;
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
    setTrips((prevTrips) =>
      prevTrips.map((trip) => {
        if (excludedTripId && trip.id === excludedTripId) return trip;
        const currentOrderIds = Array.isArray(trip.orderIds) ? trip.orderIds : [];
        const nextOrderIds = currentOrderIds.filter((id) => !idsToRemove.has(id));
        if (nextOrderIds.length === currentOrderIds.length) return trip;
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

      if (movedTrip && nextStageId === TRIP_STAGE_COMPLETED_ID) {
        const movedOrderIds = new Set(movedTrip.orderIds || []);
        setOrders((prevOrders) =>
          prevOrders.map((order) =>
            movedOrderIds.has(order.id)
              ? { ...order, stageId: ORDER_STAGE_DELIVERED_ID }
              : order,
          ),
        );
      }
      if (
        movedTrip &&
        previousStageId === TRIP_STAGE_COMPLETED_ID &&
        nextStageId !== TRIP_STAGE_COMPLETED_ID
      ) {
        const movedOrderIds = new Set(movedTrip.orderIds || []);
        setOrders((prevOrders) =>
          prevOrders.map((order) =>
            movedOrderIds.has(order.id)
              ? { ...order, stageId: ORDER_STAGE_IN_CAR_ID }
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

      if (movedTrip && stageId === TRIP_STAGE_COMPLETED_ID) {
        const movedOrderIds = new Set(movedTrip.orderIds || []);
        setOrders((prevOrders) =>
          prevOrders.map((order) =>
            movedOrderIds.has(order.id)
              ? { ...order, stageId: ORDER_STAGE_DELIVERED_ID }
              : order,
          ),
        );
      }
      if (
        movedTrip &&
        previousStageId === TRIP_STAGE_COMPLETED_ID &&
        stageId !== TRIP_STAGE_COMPLETED_ID
      ) {
        const movedOrderIds = new Set(movedTrip.orderIds || []);
        setOrders((prevOrders) =>
          prevOrders.map((order) =>
            movedOrderIds.has(order.id)
              ? { ...order, stageId: ORDER_STAGE_IN_CAR_ID }
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
      setDriveHint('Нужен CLIENT_ID. Добавьте его в app.jsx для подключения.');
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
        const res = await fetch('http://localhost:3001/oauth/token', {
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

  // Создать папку в Google Drive для заказа
  const createDriveFolderForOrder = async (orderName, orderId) => {
    try {
      const accessToken = await ensureAccessToken();
      const bodyObj = { name: orderName, mimeType: 'application/vnd.google-apps.folder' };
      
      // Если выбрана папка, создать подпапку внутри нее
      if (selectedDriveFolder && selectedDriveFolder.id) {
        bodyObj.parents = [selectedDriveFolder.id];
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
      
      const folderUrl = `https://drive.google.com/drive/folders/${data.id}`;
      // Обновить заказ ссылкой на папку
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, driveFolder: folderUrl, driveFolderId: data.id } : o))
      );
      console.log('Папка создана:', folderUrl);
      return { folderId: data.id, folderUrl };
    } catch (err) {
      console.error('Ошибка создания папки:', err);
      // Не прерываем создание заказа если Google Drive недоступен
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
        setDriveHint('Укажите API_KEY в DRIVE_CONFIG, чтобы открыть выбор папки.');
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
    setDeleteCardModal({
      isOpen: false,
      type: "",
      id: "",
      title: "",
    });
  };

  const confirmDeleteCard = async () => {
    const { type, id } = deleteCardModal;
    if (!id || !type) return;

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
      if (tripToDelete?.stageId === TRIP_STAGE_COMPLETED_ID) {
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
        setOrders((prevOrders) =>
          prevOrders.map((order) =>
            tripOrderIds.has(order.id)
              ? { ...order, stageId: ORDER_STAGE_WAREHOUSE_ID }
              : order,
          ),
        );
      }
      setTrips((prev) => prev.filter((trip) => trip.id !== id));
      if (editingTripId === id) {
        closeCreateTripForm();
      }
    }

    closeDeleteCardModal();
  };

  const handleEditClick = (order) => {
    const awbParts = splitAwb(order.awb);
    setFormData({
      shipmentAirport: order.shipmentAirport || "",
      shipmentTerminal: order.shipmentTerminal || "",
      recipient: order.recipient || "",
      orderName: order.name || "",
      awb: order.awb || "",
      awbPrefix: awbParts.awbPrefix,
      awbNumber: awbParts.awbNumber,
      quantity: order.quantity || "",
      weight: order.weight || "",
      customsCode: order.customsCode || "",
      notes: order.notes || "",
    });
    setEditingOrderId(order.id);
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
      quantity: "",
      weight: "",
      customsCode: "",
      notes: "",
    });
    setOrdersScreenMode("list");
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
  ];

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
                    isStageDefault={(stage) => DEFAULT_ORDER_STAGE_IDS.has(stage.id)}
                    renderItemCard={(order) => (
                      <div className="workflow-card">
                        <div className="workflow-card__top-actions">
                          <button type="button" className="workflow-card__icon-btn" title="Редактировать" onClick={() => handleEditClick(order)} aria-label="Редактировать">
                            <span aria-hidden="true">&#9998;</span>
                          </button>
                          <button type="button" className="workflow-card__icon-btn workflow-card__icon-btn--danger" title="Удалить" onClick={() => openDeleteOrderConfirm(order)} aria-label="Удалить">
                            <span aria-hidden="true">&#128465;</span>
                          </button>
                        </div>
                        <div className="workflow-card__title">{order.name || "Без названия"}</div>
                        <div className="workflow-card__meta">
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
                    isStageDefault={(stage) => DEFAULT_TRIP_STAGE_IDS.has(stage.id)}
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
                    onCancel={closeCreateTripForm}
                    submitLabel="Сохранить"
                    orders={availableOrdersForTrip}
                    carNumbers={TRIP_CAR_NUMBERS}
                    driverNames={TRIP_DRIVER_NAMES}
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
                <button type="button" className="primary" onClick={confirmDeleteCard}>
                  Удалить
                </button>
                <button type="button" onClick={closeDeleteCardModal}>
                  Отмена
                </button>
              </div>
            </div>
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
              ?
            </button>
            <div className="loader-overlay__spinner" />
            <div className="loader-overlay__text">Проверяем накладную...</div>
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








