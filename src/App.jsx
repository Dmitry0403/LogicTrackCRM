import React from 'react';
import {
  OrderFormCard,
  AlternateOrderFormCard,
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
  SvoMsqCalculator,
  calculateOrderDelivery,
  calculateStandaloneVehicleDelivery,
} from './components/workspace';
import {
  supabase,
  isSupabaseConfigured,
  SUPABASE_WORKSPACE_KEY,
} from "./lib/supabase";
import {
  composeAwb,
  getCustomsName as cargoGetCustomsName,
  getCustomsSuggestions as cargoGetCustomsSuggestions,
  resolveCargoTerminalKey as cargoResolveCargoTerminalKey,
  splitAwb,
} from "./lib/cargo";
import {
  getPowerOfAttorneyStatus as poaGetPowerOfAttorneyStatus,
  getRecipientSuggestions as poaGetRecipientSuggestions,
  parseDate,
} from "./lib/powerOfAttorney";
import {
  buildTripDriveFolderName as tripsBuildTripDriveFolderName,
  getTripsWithoutOrderIds as tripsGetTripsWithoutOrderIds,
  parseTripCarNumber as tripsParseTripCarNumber,
} from "./lib/trips";
import {
  buildCloudPayload,
  normalizeCloudSnapshot,
  parseCloudUpdatedAt,
  reassignItemsToValidStage,
  shouldApplyRemoteSnapshot,
} from "./lib/cloudState";
import {
  DRIVE_BACKEND_READY_TTL_MS,
  DRIVE_BACKEND_WAKE_REQUEST_TIMEOUT_MS,
  createDriveOpKey,
  createDriveOpRunner,
  createEnsureBackendAwake,
  getDriveRetryDelayMs,
  sleep,
} from "./lib/driveSync";
import { RU } from "./i18n/ru";
import {
  AIRPORT_ALIASES,
  CARGO_TERMINAL_URLS,
  CUSTOMS_CODE_MAP,
  DEFAULT_ORDER_STAGES,
  DEFAULT_ORDER_STAGE_CODES,
  DEFAULT_POWER_OF_ATTORNEY_REGISTRY,
  DEFAULT_PRINT_SIGNER_SETTINGS,
  DEFAULT_TRIP_STAGES,
  DEFAULT_TRIP_STAGE_CODES,
  ORDER_STAGE_CODES,
  ORDER_STAGE_DELIVERED_ID,
  ORDER_STAGE_IN_CAR_ID,
  ORDER_STAGE_PLAN_ID,
  ORDER_STAGE_WAREHOUSE_ID,
  TERMINAL_ALIASES,
  TRAILER_NUMBER,
  TRIP_CAR_NUMBERS,
  TRIP_DRIVER_NAMES,
  TRIP_FALLBACK_NAME,
  TRIP_STAGE_CODES,
  TRIP_STAGE_COMPLETED_ID,
} from "./constants/domain";

const normalizeEnvValue = (rawValue) =>
  String(rawValue || "")
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/^'(.*)'$/, "$1");

const DRIVE_CONFIG = {
  CLIENT_ID: normalizeEnvValue(import.meta.env.VITE_GOOGLE_CLIENT_ID),
  API_KEY: normalizeEnvValue(import.meta.env.VITE_GOOGLE_API_KEY),
  REDIRECT_URI: normalizeEnvValue(import.meta.env.VITE_GOOGLE_REDIRECT_URI || "http://localhost:5173/"),
  SCOPE: normalizeEnvValue(import.meta.env.VITE_GOOGLE_DRIVE_SCOPE || "https://www.googleapis.com/auth/drive"),
};

const DRIVE_PERMISSION_HINT = RU.drive.permissionHint;

const API_BASE_URL = normalizeEnvValue(
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:3001" : ""),
).replace(/\/+$/, "");
const CARGO_API_BASE_URL = API_BASE_URL;
const POWER_OF_ATTORNEY_REGISTRY_URL = `${API_BASE_URL}/poa/registry`;
const POWER_OF_ATTORNEY_FALLBACK_URL = "/power-of-attorney-registry.json";
const ORDER_STAGES_STORAGE_KEY = "logictrack_order_stages";
const TRIP_STAGES_STORAGE_KEY = "logictrack_trip_stages";
const PRINT_SIGNER_STORAGE_KEY = "logictrack_print_signer";
const DRIVE_OPS_QUEUE_STORAGE_KEY = "gdrive_ops_queue";
const DRIVE_MODAL_RESTORE_STORAGE_KEY = "gdrive_restore_modal";
const RENDER_KEEPALIVE_INTERVAL_MS = 14 * 60 * 1000;

const resolveCargoApiUrl = (pathOrUrl) => {
  const value = String(pathOrUrl || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (!CARGO_API_BASE_URL) return value;
  if (value.startsWith("/")) {
    return `${CARGO_API_BASE_URL}${value}`;
  }
  return `${CARGO_API_BASE_URL}/${value}`;
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

// Helpers to store tokens
const getStoredTokens = () => {
  try {
    return JSON.parse(localStorage.getItem('gdrive_tokens') || '{}');
  } catch (_error) {
    return {};
  }
};

const setStoredTokens = (tokens) => {
  localStorage.setItem('gdrive_tokens', JSON.stringify(tokens));
};

const getStoredDriveAccount = () => {
  try {
    return JSON.parse(localStorage.getItem('gdrive_account') || 'null');
  } catch (_error) {
    return null;
  }
};

const setStoredDriveAccount = (account) => {
  if (!account) {
    localStorage.removeItem('gdrive_account');
    return;
  }
  localStorage.setItem('gdrive_account', JSON.stringify(account));
};

const fetchGoogleDriveAccount = async (accessToken) => {
  if (!accessToken) return null;
  const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data?.error?.message || `Drive about request failed: ${res.status}`);
  }
  const email = String(data?.user?.emailAddress || '').trim();
  const name = String(data?.user?.displayName || '').trim();
  if (!email && !name) return null;
  return { email, name };
};

const localizeAuthErrorMessage = (error, fallbackMessage) => {
  const rawMessage = String(error?.message || "").trim();
  if (!rawMessage) return fallbackMessage;

  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return RU.authErrors.invalidLogin;
  }
  if (normalized.includes("email not confirmed")) {
    return RU.authErrors.emailNotConfirmed;
  }
  if (normalized.includes("user already registered")) {
    return RU.authErrors.userAlreadyRegistered;
  }
  if (normalized.includes("password should be at least")) {
    return RU.authErrors.passwordTooShort;
  }
  if (normalized.includes("unable to validate email address")) {
    return RU.authErrors.invalidEmail;
  }
  if (normalized.includes("too many requests")) {
    return RU.authErrors.tooManyRequests;
  }
  if (normalized.includes("network request failed") || normalized.includes("failed to fetch")) {
    return RU.authErrors.networkFailed;
  }

  return fallbackMessage;
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
  } catch (_error) {
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

const formatTripDateShort = (rawDate) => {
  const value = String(rawDate || "").trim();
  if (!value) return "?";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return `${day}.${month}.${year}`;
  }
  const parsed = parseDate(value);
  if (!parsed) return value;
  return `${String(parsed.getDate()).padStart(2, "0")}.${String(parsed.getMonth() + 1).padStart(2, "0")}.${String(parsed.getFullYear())}`;
};

const getCustomsNameLabel = (code) => cargoGetCustomsName(code, CUSTOMS_CODE_MAP, RU.domain.invalidCustomsCode);
const getCustomsSuggestionItems = (typedValue) => cargoGetCustomsSuggestions(typedValue, CUSTOMS_CODE_MAP);
const resolveCargoTerminal = (args) => cargoResolveCargoTerminalKey({ ...args, ru: RU });
const getPowerOfAttorneyState = (args) => poaGetPowerOfAttorneyStatus({
  ...args,
  ru: RU,
  airportAliases: AIRPORT_ALIASES,
  terminalAliases: TERMINAL_ALIASES,
});
const getRecipientSuggestionItems = (args) => poaGetRecipientSuggestions({
  ...args,
  ru: RU,
  airportAliases: AIRPORT_ALIASES,
  terminalAliases: TERMINAL_ALIASES,
});
const buildTripFolderName = (args) => tripsBuildTripDriveFolderName({ ...args, tripFallbackName: TRIP_FALLBACK_NAME });
const normalizeStages = (stages, defaultStages) => {
  const defaultStagesById = new Map(defaultStages.map((stage) => [stage.id, stage]));

  return (Array.isArray(stages) ? stages : [])
    .map((stage) => {
      if (!stage || typeof stage !== "object") return null;
      const fallbackStage = defaultStagesById.get(String(stage.id || "").trim());
      const id = String(stage.id || "").trim();
      const name = String(stage.name || fallbackStage?.name || "").trim();
      const code = String(stage.code || fallbackStage?.code || "").trim();
      if (!id || !name) return null;
      return code ? { id, name, code } : { id, name };
    })
    .filter(Boolean);
};
const normalizeOrderStages = (stages) => normalizeStages(stages, DEFAULT_ORDER_STAGES);
const normalizeTripStages = (stages) => normalizeStages(stages, DEFAULT_TRIP_STAGES);
const getE2EMode = () => {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("e2e") || "";
};

const E2E_WORKSPACE_USER = {
  id: "e2e-workspace-user",
  email: "e2e-user@logictrack.test",
};

const E2E_DRIVE_ACCOUNT = {
  email: "e2e-drive@logictrack.test",
  name: "E2E Drive",
};

const createEmptyOrderFormData = () => ({
  calculatorAirport: "svo-assembly",
  shipmentAirport: RU.orderForm.airports.sheremetyevo,
  shipmentTerminal: RU.orderForm.terminals.moscowCargo,
  recipient: "",
  orderName: "",
  awb: "",
  awbPrefix: "",
  awbNumber: "",
  hasHawb: false,
  hawb: "",
  hasAdditionalParams: false,
  additionalDistance: "",
  hasDelivery: false,
  quantity: "",
  weight: "",
  customsCode: "",
  transportCost: "",
  notes: "",
  customer: "",
  loadingPoint: "",
  unloadingPoint: "",
});

const getOrderAirportFromCalculatorAirport = (calculatorAirport) => {
  if (calculatorAirport === "vko") return RU.orderForm.airports.vnukovo;
  if (calculatorAirport === "dme") return RU.orderForm.airports.domodedovo;
  if (calculatorAirport === "zia") return RU.orderForm.airports.zhukovsky;
  return RU.orderForm.airports.sheremetyevo;
};

const getCalculatorAirportFromOrder = (order) => {
  if (order?.calculatorAirport) return order.calculatorAirport;
  if (order?.shipmentAirport === RU.orderForm.airports.vnukovo) return "vko";
  if (order?.shipmentAirport === RU.orderForm.airports.domodedovo) return "dme";
  if (order?.shipmentAirport === RU.orderForm.airports.zhukovsky) return "zia";
  return "svo";
};

const calculateOrderTransportCost = (values) => {
  const weight = Number.parseFloat(String(values.weight || "").replace(",", "."));
  if (!Number.isFinite(weight) || weight < 0) return "";
  const additionalDistance = values.hasAdditionalParams
    ? Number.parseFloat(String(values.additionalDistance || "").replace(",", "."))
    : Number.NaN;
  const customsCode = String(values.customsCode || "").trim();
  const hasOtherWarehouse = Boolean(customsCode && customsCode !== "06536");
  return String(calculateOrderDelivery(
    weight,
    values.calculatorAirport || "svo-assembly",
    additionalDistance,
    Boolean(values.hasAdditionalParams && values.hasDelivery),
    hasOtherWarehouse,
  ));
};

const calculateAlternateOrderTransportCost = (values) => {
  const weight = Number.parseFloat(String(values.weight || "").replace(",", "."));
  if (!Number.isFinite(weight) || weight < 0) return "";
  return String(calculateStandaloneVehicleDelivery(weight));
};

const getOrderFormVariantFromOrder = (order) =>
  order?.customer || order?.loadingPoint || order?.unloadingPoint ? "alternate" : "default";

const getOrderDisplayName = (values) =>
  String(
    values.orderName ||
      values.name ||
      values.customer ||
      values.recipient ||
      values.unloadingPoint ||
      values.id ||
      "",
  ).trim();

const App = () => {
  const e2eMode = getE2EMode();
  const isE2EWorkspace = e2eMode === "workspace";
  const isSupabaseEnabled = isSupabaseConfigured && e2eMode !== "workspace";
  const SHEREMETYEVO_VALUES = new Set([RU.domain.airports.sheremetyevo]);
  const DEFAULT_SHEREMETYEVO_TERMINAL = RU.domain.terminals.moscowCargo;
  const ORDER_FORM_ID = "order-form-panel";
  const TRIP_FORM_ID = "trip-form-panel";

  const [orders, setOrders] = React.useState(loadOrders);
  const [trips, setTrips] = React.useState(loadTrips);
  const [orderStages, setOrderStages] = React.useState(() =>
    normalizeOrderStages(loadStages(ORDER_STAGES_STORAGE_KEY, DEFAULT_ORDER_STAGES))
  );
  const [tripStages, setTripStages] = React.useState(() =>
    normalizeTripStages(loadStages(TRIP_STAGES_STORAGE_KEY, DEFAULT_TRIP_STAGES))
  );
  const [activeView, setActiveView] = React.useState("orders");
  const [calculatorRoute, setCalculatorRoute] = React.useState("SVO - MSQ");
  const [ordersScreenMode, setOrdersScreenMode] = React.useState("list");
  const [tripsScreenMode, setTripsScreenMode] = React.useState("list");
  const [driveConnected, setDriveConnected] = React.useState(false);
  const [powerOfAttorneyRegistry, setPowerOfAttorneyRegistry] = React.useState(DEFAULT_POWER_OF_ATTORNEY_REGISTRY);
  const [isPowerOfAttorneySyncLoading, setIsPowerOfAttorneySyncLoading] = React.useState(false);
  const [driveHint, setDriveHint] = React.useState(
    RU.appMessages.driveHintConnect
  );

  const [formData, setFormData] = React.useState(createEmptyOrderFormData);
  const [orderFormVariant, setOrderFormVariant] = React.useState("default");
  const [cargoCheckNoticeModal, setCargoCheckNoticeModal] = React.useState({
    isOpen: false,
    manualUrl: "",
    awbNumber: "",
  });
  const [isTripPrintLoading, setIsTripPrintLoading] = React.useState(false);
  const [isDeleteCardLoading, setIsDeleteCardLoading] = React.useState(false);
  const [isOrderCloudSaving, setIsOrderCloudSaving] = React.useState(false);
  const [isTripSaving, setIsTripSaving] = React.useState(false);
  const cargoCheckNoticeTimeoutRef = React.useRef(null);
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
  const [shouldAutoOpenDrivePicker, setShouldAutoOpenDrivePicker] = React.useState(false);
  const [showSignatureSettingsModal, setShowSignatureSettingsModal] = React.useState(false);
  const [showAccountSettingsModal, setShowAccountSettingsModal] = React.useState(false);
  const [printSignerSettings, setPrintSignerSettings] = React.useState(loadPrintSignerSettings);
  const [isCloudStateReady, setIsCloudStateReady] = React.useState(!isSupabaseEnabled);
  const [authReady, setAuthReady] = React.useState(!isSupabaseEnabled);
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
    } catch (_error) {
      return null;
    }
  });
  const [driveAccount, setDriveAccount] = React.useState(() => getStoredDriveAccount());
  const [driveOpsQueue, setDriveOpsQueue] = React.useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(DRIVE_OPS_QUEUE_STORAGE_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (_error) {
      return [];
    }
  });
  const driveOpsQueueRef = React.useRef(driveOpsQueue);
  const driveOpsProcessingRef = React.useRef(false);
  const backendWarmupAtRef = React.useRef(0);
  const backendReadyAtRef = React.useRef(0);
  const backendWakePromiseRef = React.useRef(null);
  const cloudSaveTimeoutRef = React.useRef(null);
  const lastCloudUpdatedAtRef = React.useRef(0);
  const isApplyingCloudStateRef = React.useRef(false);
  const skipNextCloudSaveRef = React.useRef(false);
  const userScopedAppStateId = React.useMemo(
    () => (currentUser?.id ? `${currentUser.id}:${SUPABASE_WORKSPACE_KEY}` : ""),
    [currentUser],
  );

  React.useEffect(() => {
    if (!isE2EWorkspace) return;
    setCurrentUser((prev) => prev || E2E_WORKSPACE_USER);
    setAuthReady(true);
  }, [isE2EWorkspace]);

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

  const pingBackendHealth = React.useCallback(async ({ timeoutMs = DRIVE_BACKEND_WAKE_REQUEST_TIMEOUT_MS } = {}) => {
    if (!API_BASE_URL || typeof window === "undefined") return true;

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetch(`${CARGO_API_BASE_URL}/health`, {
        method: "GET",
        cache: "no-store",
        signal: abortController.signal,
      });
      if (!response.ok) {
        const error = new Error(`backend_health_${response.status}`);
        error.status = response.status;
        throw error;
      }
      backendReadyAtRef.current = Date.now();
      return true;
    } catch (error) {
      const wrappedError = new Error(error?.name === "AbortError" ? "backend_wake_timeout" : error?.message || "backend_unavailable");
      wrappedError.status = error?.status;
      throw wrappedError;
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const warmupBackend = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const now = Date.now();
    if (now - backendWarmupAtRef.current < DRIVE_BACKEND_READY_TTL_MS) return;
    backendWarmupAtRef.current = now;
    void pingBackendHealth().catch(() => {
      // Warmup request is best-effort.
    });
  }, [pingBackendHealth]);
  const isDrivePermissionError = (error) => {
    const reason = String(error?.reason || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();
    return (
      reason === "appnotauthorizedtochild" ||
      reason === "insufficientfilepermissions" ||
      reason === "insufficientpermissions" ||
      message.includes("appnotauthorizedtochild") ||
      message.includes("insufficient file permissions") ||
      message.includes("insufficientpermissions")
    );
  };
  React.useEffect(() => {
    if (!isSupabaseEnabled || !supabase) return undefined;
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
        setChangePasswordInfo(RU.appMessages.enterNewPassword);
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
    const intervalId = setInterval(() => {
      warmupBackend();
    }, RENDER_KEEPALIVE_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [warmupBackend]);

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

  const applyCloudSnapshot = React.useCallback((data) => {
    const normalizedSnapshot = normalizeCloudSnapshot(data, {
      normalizeOrderStages,
      normalizeTripStages,
      defaultOrderStages: DEFAULT_ORDER_STAGES,
      defaultTripStages: DEFAULT_TRIP_STAGES,
      defaultPrintSignerSettings: DEFAULT_PRINT_SIGNER_SETTINGS,
    });

    isApplyingCloudStateRef.current = true;
    skipNextCloudSaveRef.current = true;
    setOrders(normalizedSnapshot.orders);
    setTrips(normalizedSnapshot.trips);
    setOrderStages(normalizedSnapshot.orderStages);
    setTripStages(normalizedSnapshot.tripStages);
    setPrintSignerSettings(normalizedSnapshot.printSignerSettings);
    setTimeout(() => {
      isApplyingCloudStateRef.current = false;
    }, 0);
  }, []);

  React.useEffect(() => {
    if (!isSupabaseEnabled) return;
    if (!authReady || !currentUser?.id) {
      setIsCloudStateReady(false);
      lastCloudUpdatedAtRef.current = 0;
    }
  }, [isSupabaseEnabled, authReady, currentUser]);

  React.useEffect(() => {
    if (!isSupabaseEnabled || !supabase || !authReady || !currentUser?.id) return undefined;
    let cancelled = false;

    const bootstrapCloudState = async () => {
      setIsCloudStateReady(false);
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
          const { data: inserted, error: insertError } = await supabase
            .from("app_state")
            .upsert(payload)
            .select("updated_at")
            .maybeSingle();
          if (insertError) throw insertError;
          if (cancelled) return;
          lastCloudUpdatedAtRef.current = parseCloudUpdatedAt(inserted?.updated_at);
          setIsCloudStateReady(true);
          return;
        }

        applyCloudSnapshot(data);
        lastCloudUpdatedAtRef.current = parseCloudUpdatedAt(data.updated_at);
        setIsCloudStateReady(true);
      } catch (cloudError) {
        console.error("Failed to load state from Supabase:", cloudError);
        // Safe mode: do not push local data until cloud bootstrap succeeds.
        setIsCloudStateReady(false);
      }
    };

    void bootstrapCloudState();

    return () => {
      cancelled = true;
    };
  }, [
    isSupabaseEnabled,
    authReady,
    currentUser,
    userScopedAppStateId,
    applyCloudSnapshot,
    parseCloudUpdatedAt,
  ]);

  const saveCloudSnapshotNow = React.useCallback(async (snapshot) => {
    if (!isSupabaseEnabled || !supabase || !authReady || !currentUser?.id || !isCloudStateReady) {
      return { skipped: true };
    }

    try {
      const { data: remoteMeta, error: remoteMetaError } = await supabase
        .from("app_state")
        .select("id, updated_at, orders, trips, order_stages, trip_stages, print_signer")
        .eq("id", userScopedAppStateId)
        .maybeSingle();

      if (remoteMetaError) throw remoteMetaError;

      const remoteUpdatedAtMs = parseCloudUpdatedAt(remoteMeta?.updated_at);
      if (
        shouldApplyRemoteSnapshot({
          remoteUpdatedAt: remoteUpdatedAtMs,
          lastCloudUpdatedAt: lastCloudUpdatedAtRef.current,
        })
      ) {
        console.warn("Cloud conflict detected. Applying newer server snapshot.");
        applyCloudSnapshot(remoteMeta);
        lastCloudUpdatedAtRef.current = remoteUpdatedAtMs;
        return { conflict: true };
      }

      const payload = buildCloudPayload({
        currentUserId: currentUser.id,
        snapshot,
      });

      if (!remoteMeta) {
        const { data: inserted, error: insertError } = await supabase
          .from("app_state")
          .insert({ id: userScopedAppStateId, ...payload })
          .select("updated_at")
          .maybeSingle();
        if (insertError) throw insertError;
        lastCloudUpdatedAtRef.current = parseCloudUpdatedAt(inserted?.updated_at);
        return { saved: true };
      }

      let updateQuery = supabase
        .from("app_state")
        .update(payload)
        .eq("id", userScopedAppStateId);

      if (remoteMeta.updated_at) {
        updateQuery = updateQuery.eq("updated_at", remoteMeta.updated_at);
      }

      const { data: updated, error: updateError } = await updateQuery
        .select("updated_at")
        .maybeSingle();

      if (updateError) throw updateError;

      if (!updated) {
        const { data: freshRemote } = await supabase
          .from("app_state")
          .select("id, updated_at, orders, trips, order_stages, trip_stages, print_signer")
          .eq("id", userScopedAppStateId)
          .maybeSingle();
        if (freshRemote) {
          console.warn("Cloud CAS mismatch. Applying server snapshot.");
          applyCloudSnapshot(freshRemote);
          lastCloudUpdatedAtRef.current = parseCloudUpdatedAt(freshRemote.updated_at);
        }
        return { conflict: true };
      }

      lastCloudUpdatedAtRef.current = parseCloudUpdatedAt(updated.updated_at);
      return { saved: true };
    } catch (error) {
      console.error("Failed to save state to Supabase:", error);
      return { error };
    }
  }, [
    isSupabaseEnabled,
    supabase,
    authReady,
    currentUser,
    isCloudStateReady,
    userScopedAppStateId,
    parseCloudUpdatedAt,
    applyCloudSnapshot,
  ]);

  React.useEffect(() => {
    if (!isSupabaseEnabled || !supabase || !authReady || !currentUser?.id || !isCloudStateReady) {
      return undefined;
    }
    if (isApplyingCloudStateRef.current) return undefined;
    if (skipNextCloudSaveRef.current) {
      skipNextCloudSaveRef.current = false;
      return undefined;
    }

    if (cloudSaveTimeoutRef.current) {
      clearTimeout(cloudSaveTimeoutRef.current);
    }

    cloudSaveTimeoutRef.current = setTimeout(() => {
      void saveCloudSnapshotNow({
        orders,
        trips,
        orderStages,
        tripStages,
        printSignerSettings,
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
    applyCloudSnapshot,
    parseCloudUpdatedAt,
  ]);

  React.useEffect(() => {
    const fallbackStageId = orderStages[0]?.id;
    if (!fallbackStageId) return;
    setOrders((prev) => reassignItemsToValidStage(prev, orderStages, fallbackStageId));
  }, [orderStages]);

  React.useEffect(() => {
    const fallbackStageId = tripStages[0]?.id;
    if (!fallbackStageId) return;
    setTrips((prev) => reassignItemsToValidStage(prev, tripStages, fallbackStageId));
  }, [tripStages]);

  const loadPowerOfAttorneyRegistry = React.useCallback(async (forceRefresh = false) => {
    setIsPowerOfAttorneySyncLoading(true);
    try {
      let loaded = false;
      const url = forceRefresh
        ? `${POWER_OF_ATTORNEY_REGISTRY_URL}?force=1`
        : POWER_OF_ATTORNEY_REGISTRY_URL;
      if (API_BASE_URL) {
        try {
          await ensureBackendAwake();
        } catch (_backendWakeError) {
          // Best effort: if backend is still waking up, we'll retry the registry fetch below.
        }
      }

      for (let attempt = 0; attempt < 2 && !loaded; attempt += 1) {
        try {
          const primaryRes = await fetch(url, { cache: "no-store" });
          if (primaryRes.ok) {
            const primaryData = await primaryRes.json();
            if (primaryData && typeof primaryData === "object") {
              setPowerOfAttorneyRegistry(primaryData);
              loaded = true;
              break;
            }
          }
        } catch (_fetchError) {
          // Best effort: initial fetch can fail while Render wakes up.
        }

        if (!loaded && attempt === 0 && API_BASE_URL) {
          try {
            await ensureBackendAwake({ force: true });
          } catch (_backendWakeRetryError) {
            // Best effort: fallback data below remains the final safety net.
          }
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
    const timeoutId = setTimeout(() => {
      void loadPowerOfAttorneyRegistry(false);
    }, 5000);
    return () => clearTimeout(timeoutId);
  }, [loadPowerOfAttorneyRegistry]);

  
  React.useEffect(() => {
    if (selectedDriveFolder) {
      localStorage.setItem('gdrive_selected_folder', JSON.stringify(selectedDriveFolder));
    }
  }, [selectedDriveFolder]);

  React.useEffect(() => {
    driveOpsQueueRef.current = driveOpsQueue;
    localStorage.setItem(DRIVE_OPS_QUEUE_STORAGE_KEY, JSON.stringify(driveOpsQueue));
  }, [driveOpsQueue]);

  // On app load: handle OAuth redirect, check stored tokens and refresh if needed
  React.useEffect(() => {
    (async () => {
      const shouldRestoreDriveModal =
        localStorage.getItem(DRIVE_MODAL_RESTORE_STORAGE_KEY) === "1";
      const restoreDriveModalIfNeeded = () => {
        if (!shouldRestoreDriveModal) return;
        localStorage.removeItem(DRIVE_MODAL_RESTORE_STORAGE_KEY);
        setShowSettingsModal(false);
        setShowDriveSettingsModal(true);
      };

      // If tokens exist and not expired, mark connected
      const toks = getStoredTokens();
      if (toks && toks.access_token && toks.expires_at && Date.now() < toks.expires_at - 60000) {
        setDriveConnected(true);
        setDriveHint(RU.appMessages.driveConnected);
        try {
          const account = await fetchGoogleDriveAccount(toks.access_token);
          setDriveAccount(account);
          setStoredDriveAccount(account);
        } catch (err) {
          console.warn('Не удалось получить данные аккаунта Google Drive:', err);
        }
        restoreDriveModalIfNeeded();
        return; 
      }

      
      if (toks && toks.refresh_token) {
        try {
          setDriveHint(RU.appMessages.driveRefreshing);
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
          setDriveHint(RU.appMessages.driveConnected);
          try {
            const account = await fetchGoogleDriveAccount(newTokens.access_token);
            setDriveAccount(account);
            setStoredDriveAccount(account);
          } catch (err) {
            console.warn('Не удалось получить данные аккаунта Google Drive:', err);
          }
          restoreDriveModalIfNeeded();
          return;
        } catch (err) {
          console.warn('Не удалось обновить токен:', err.message);
          // Продолжаем дальше, ниже обработаем redirect code если есть
        }
      }

      // Проверить, пришел ли код авторизации после редиректа
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (!code) {
        restoreDriveModalIfNeeded();
        return;
      }

      try {
        setDriveHint(RU.appMessages.driveConnecting);
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
        setDriveHint(RU.appMessages.driveConnected);
        try {
          const account = await fetchGoogleDriveAccount(tokens.access_token);
          setDriveAccount(account);
          setStoredDriveAccount(account);
        } catch (fetchAccountError) {
          console.warn('Не удалось получить данные аккаунта Google Drive:', fetchAccountError);
        }
        setShouldAutoOpenDrivePicker(true);

        // Remove code from URL
        const url = new URL(window.location);
        url.searchParams.delete('code');
        window.history.replaceState({}, document.title, url.toString());
      } catch (err) {
        console.error(err);
        setDriveHint(RU.appMessages.driveConnectFailed);
      }
      restoreDriveModalIfNeeded();
    })();
  }, []);


  const customsName = formData.customsCode
    ? getCustomsNameLabel(formData.customsCode.trim())
    : RU.appMessages.enterCustomsCode;
  const powerOfAttorneyStatus = getPowerOfAttorneyState({
    ...formData,
    registry: powerOfAttorneyRegistry,
  });
  const recipientSuggestions = getRecipientSuggestionItems({
    ...formData,
    registry: powerOfAttorneyRegistry,
  });
  const customsSuggestions = getCustomsSuggestionItems(formData.customsCode);
  const cargoTerminalKey = resolveCargoTerminal(formData);
  const isCargoCheckAvailable = Boolean(cargoTerminalKey);

  const closeCargoCheckNoticeModal = React.useCallback(() => {
    setCargoCheckNoticeModal({
      isOpen: false,
      manualUrl: "",
      awbNumber: "",
    });
  }, []);

  const openCargoTerminalCheck = React.useCallback(async ({
    awbPrefix = "",
    awbNumber = "",
    shipmentAirport = "",
    shipmentTerminal = "",
    awb = "",
  }) => {
    const terminalKey = resolveCargoTerminal({ shipmentAirport, shipmentTerminal });
    if (!terminalKey) {
      alert(RU.appMessages.selectAirportTerminal);
      return;
    }

    const awbText = String(awb || composeAwb(awbPrefix, awbNumber) || "").trim();
    const awbParts = splitAwb(awbText);
    const numberToCopy = String(awbNumber || awbParts.awbNumber || "").trim().replace(/\s+/g, "").slice(0, 32);
    if (!numberToCopy) {
      alert(RU.appMessages.enterAwb);
      return;
    }

    try {
      await navigator.clipboard.writeText(numberToCopy);
    } catch (_error) {
      // Clipboard can be blocked by browser policy.
    }

    if (cargoCheckNoticeTimeoutRef.current) {
      clearTimeout(cargoCheckNoticeTimeoutRef.current);
      cargoCheckNoticeTimeoutRef.current = null;
    }

    const terminalUrl = CARGO_TERMINAL_URLS[terminalKey] || "https://www.vnukovo.ru/ru/partneram/cargo/proverit-status-gruza/";
    setCargoCheckNoticeModal({
      isOpen: true,
      manualUrl: terminalUrl,
      awbNumber: numberToCopy,
    });

    cargoCheckNoticeTimeoutRef.current = window.setTimeout(() => {
      window.open(terminalUrl, "_blank", "noopener,noreferrer");
      closeCargoCheckNoticeModal();
      cargoCheckNoticeTimeoutRef.current = null;
    }, 1000);
  }, [closeCargoCheckNoticeModal]);

  React.useEffect(() => () => {
    if (cargoCheckNoticeTimeoutRef.current) {
      clearTimeout(cargoCheckNoticeTimeoutRef.current);
      cargoCheckNoticeTimeoutRef.current = null;
    }
  }, []);

  const checkAwbStatus = async () => {
    await openCargoTerminalCheck({
      awbPrefix: formData.awbPrefix,
      awbNumber: formData.awbNumber,
      shipmentAirport: formData.shipmentAirport,
      shipmentTerminal: formData.shipmentTerminal,
      awb: formData.awb,
    });
  };

  const checkOrderAwbStatus = async (order) => {
    const awbText = String(order?.awb || "").trim();
    const awbParts = splitAwb(awbText);
    await openCargoTerminalCheck({
      awbPrefix: awbParts.awbPrefix,
      awbNumber: awbParts.awbNumber,
      shipmentAirport: String(order?.shipmentAirport || ""),
      shipmentTerminal: String(order?.shipmentTerminal || ""),
      awb: awbText,
    });
  };

  const handleFieldChange = (field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "recipient") {
        next.orderName = value.trim();
      }
      if (field === "customer") {
        next.orderName = String(value || "").trim();
      }
      if (field === "shipmentAirport") {
        next.shipmentTerminal = SHEREMETYEVO_VALUES.has(value) ? DEFAULT_SHEREMETYEVO_TERMINAL : "";
      }
      if (field === "calculatorAirport") {
        next.shipmentAirport = getOrderAirportFromCalculatorAirport(value);
        next.shipmentTerminal = value === "svo" || value === "svo-assembly"
          ? DEFAULT_SHEREMETYEVO_TERMINAL
          : "";
      }
      if (field === "awbPrefix") {
        next.awbPrefix = String(value || "").replace(/\D/g, "").slice(0, 3);
      }
      if (field === "awbNumber") {
        next.awbNumber = String(value || "").replace(/\s+/g, "").slice(0, 32);
      }
      if (field === "hasHawb" && !value) {
        next.hawb = "";
      }
      if (field === "hasAdditionalParams" && !value) {
        next.additionalDistance = "";
        next.hasDelivery = false;
      }
      if (
        field === "awbPrefix" ||
        field === "awbNumber" ||
        field === "hasHawb" ||
        field === "hawb" ||
        field === "shipmentAirport" ||
        field === "shipmentTerminal"
      ) {
        next.awb = composeAwb(
          next.awbPrefix,
          next.awbNumber,
          next.hasHawb ? (field === "hawb" ? value : next.hawb) : "",
        );
      }
      if (
        field === "weight" ||
        field === "calculatorAirport" ||
        field === "hasAdditionalParams" ||
        field === "additionalDistance" ||
        field === "hasDelivery" ||
        field === "customsCode"
      ) {
        next.transportCost = orderFormVariant === "alternate"
          ? calculateAlternateOrderTransportCost(next)
          : calculateOrderTransportCost(next);
      }
      return next;
    });

  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsOrderCloudSaving(true);
    try {
      const isAlternateOrder = Boolean(formData.customer || formData.loadingPoint || formData.unloadingPoint);
      const normalizedCustomer = String(formData.customer || "").trim();
      const normalizedLoadingPoint = String(formData.loadingPoint || "").trim();
      const normalizedUnloadingPoint = String(formData.unloadingPoint || "").trim();
      const normalizedRecipient = String(formData.recipient || "").trim();
      const normalizedOrderName = String(formData.orderName || "").trim();
      const resolvedName = getOrderDisplayName({
        orderName: isAlternateOrder ? normalizedCustomer : normalizedOrderName,
        customer: normalizedCustomer,
        recipient: normalizedRecipient,
        unloadingPoint: normalizedUnloadingPoint,
      });
      const order = {
        id: editingOrderId || `order-${Date.now()}`,
        stageId: editingOrderId
          ? orders.find((item) => item.id === editingOrderId)?.stageId || (orderStages[0]?.id || "order-stage-plan")
          : (orderStages[0]?.id || "order-stage-plan"),
        shipmentAirport: formData.shipmentAirport.trim() || normalizedLoadingPoint,
        calculatorAirport: formData.calculatorAirport || "",
        shipmentTerminal: formData.shipmentTerminal.trim(),
        name: resolvedName,
        recipient: normalizedRecipient || normalizedCustomer || normalizedUnloadingPoint,
        awb:
          composeAwb(
            formData.awbPrefix,
            formData.awbNumber,
            formData.hasHawb ? formData.hawb : "",
          ) || formData.awb.trim(),
        quantity: formData.quantity.trim(),
        weight: formData.weight.trim(),
        customsCode: formData.customsCode.trim(),
        transportCost: String(formData.transportCost || "").trim(),
        hasAdditionalParams: Boolean(formData.hasAdditionalParams),
        additionalDistance: formData.hasAdditionalParams
          ? String(formData.additionalDistance || "").trim()
          : "",
        hasDelivery: Boolean(formData.hasAdditionalParams && formData.hasDelivery),
        customsName: normalizedUnloadingPoint || getCustomsNameLabel(formData.customsCode.trim()),
        notes: formData.notes.trim(),
        customer: normalizedCustomer,
        loadingPoint: normalizedLoadingPoint,
        unloadingPoint: normalizedUnloadingPoint,
        driveFolder: null,
        driveFolderId: null,
      };
      const originalOrder = editingOrderId
        ? orders.find((item) => item.id === editingOrderId)
        : null;

      let nextOrders = orders;
      if (originalOrder) {
        order.driveFolder = originalOrder.driveFolder || null;
        order.driveFolderId = originalOrder.driveFolderId || null;
        nextOrders = orders.map((item) => (item.id === editingOrderId ? order : item));
        setOrders(nextOrders);
        if (originalOrder.name !== order.name && order.driveFolderId) {
          await updateDriveFolderName(order.driveFolderId, order.name);
        }
      } else {
        nextOrders = [order, ...orders];
        setOrders(nextOrders);
        if (driveConnected) {
          const created = await createDriveFolderForOrder(order.name, order.id);
          if (created?.folderId) {
            nextOrders = nextOrders.map((item) =>
              item.id === order.id
                ? { ...item, driveFolder: created.folderUrl, driveFolderId: created.folderId }
                : item,
            );
            setOrders(nextOrders);
          }
        }
      }

      setFormData(createEmptyOrderFormData());
      setEditingOrderId(null);
      setOrderFormVariant("default");
      setOrdersScreenMode("list");

      if (isSupabaseEnabled && authReady && currentUser?.id && isCloudStateReady) {
        await saveCloudSnapshotNow({
          orders: nextOrders,
          trips,
          orderStages,
          tripStages,
          printSignerSettings,
        });
      }
    } finally {
      setIsOrderCloudSaving(false);
    }
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

  const saveTripFromForm = async () => {
    setIsTripSaving(true);
    try {
      const allowedOrderIds = new Set(availableOrdersForTrip.map((order) => order.id));
      const selectedOrderIds = tripFormData.orderIds.filter((orderId) => allowedOrderIds.has(orderId));
      if (!tripFormData.tripNumber.trim() || !tripFormData.carNumber || !tripFormData.driverName) {
        alert(RU.appMessages.fillTripRequired);
        return null;
      }
      if (selectedOrderIds.length === 0) {
        alert(RU.appMessages.chooseTripOrders);
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

      const nextTrips = editingTripId
        ? trips.map((item) => (item.id === editingTripId ? trip : item))
        : [trip, ...trips];

      const previousOrderIds = new Set(editingTrip?.orderIds || []);
      const selectedOrderIdsSet = new Set(selectedOrderIds);
      const occupiedByOtherTrips = new Set();
      trips.forEach((existingTrip) => {
        if (existingTrip.id === editingTripId) return;
        (existingTrip.orderIds || []).forEach((orderId) => occupiedByOtherTrips.add(orderId));
      });
      const nextOrders = orders.map((order) => {
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
      });

      setTrips(nextTrips);
      setOrders(nextOrders);

      if (editingTripId) {
        const previousTripFolderName = buildTripFolderName({
          carNumber: editingTrip?.carNumberBase || editingTrip?.carNumber,
          driverName: editingTrip?.driverName,
        });
        const nextTripFolderName = buildTripFolderName({
          carNumber: trip.carNumberBase || trip.carNumber,
          driverName: trip.driverName,
        });
        if (editingTrip?.driveFolderId && previousTripFolderName !== nextTripFolderName) {
          await updateDriveFolderName(editingTrip.driveFolderId, nextTripFolderName);
        }
      }

      const addedOrderIds = selectedOrderIds.filter((orderId) => !previousOrderIds.has(orderId));
      const removedOrderIds = Array.from(previousOrderIds).filter((orderId) => !selectedOrderIdsSet.has(orderId));
      const tripFolderSyncResult = await syncTripOrderFolders({
        trip,
        previousTrip: editingTrip,
        addedOrderIds,
        removedOrderIds,
      });

      const syncedTrip = tripFolderSyncResult?.trip || trip;
      const syncedTrips = nextTrips.map((item) => (item.id === syncedTrip.id ? syncedTrip : item));

      setTrips(syncedTrips);

      await saveCloudSnapshotNow({
        orders: nextOrders,
        trips: syncedTrips,
        orderStages,
        tripStages,
        printSignerSettings,
      });

      closeCreateTripForm();
      return { trip: syncedTrip, selectedOrders };
    } finally {
      setIsTripSaving(false);
    }
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
            name: order.name || order.customer || order.unloadingPoint || "",
            awb: order.awb,
            recipient: order.recipient || order.customer || order.unloadingPoint || "",
            shipmentAirport: order.loadingPoint || order.shipmentAirport,
            customsName: String(order.unloadingPoint || order.customsName || "").trim() || getCustomsNameLabel(String(order.customsCode || "").trim()),
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
        } catch (_error) {
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
      alert(`${RU.appMessages.docxFailedPrefix} ${error?.message || RU.appMessages.unknownError}`);
    } finally {
      setIsTripPrintLoading(false);
    }
  };

  const handleTripSubmit = async (event) => {
    event.preventDefault();
    await saveTripFromForm();
  };

  const handleTripPrint = async () => {
    const result = await saveTripFromForm();
    if (!result) return;
    await printTripApplication(result.trip, result.selectedOrders);
  };

  const handlePrintTripCard = async (trip) => {
    if (!trip) return;
    const selectedOrderIds = Array.isArray(trip.orderIds) ? trip.orderIds : [];
    const selectedOrders = orders.filter((order) => selectedOrderIds.includes(order.id));
    if (selectedOrders.length === 0) {
      alert(RU.appMessages.noTripOrdersForPrint);
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

  const shouldRemoveOrderFromTrip = (stageId) =>
    stageId === planStageId || stageId === warehouseStageId;
  const handleMoveOrderToStage = async (orderId, stageId) => {
    const currentOrder = orders.find((order) => order.id === orderId);
    if (!currentOrder || currentOrder.stageId === stageId) return;

    const nextOrders = orders.map((order) =>
      order.id === orderId ? { ...order, stageId } : order,
    );
    const nextTrips = shouldRemoveOrderFromTrip(stageId)
      ? tripsGetTripsWithoutOrderIds(trips, [orderId], nextOrders)
      : trips;

    setOrders(nextOrders);
    setTrips(nextTrips);

    if (shouldRemoveOrderFromTrip(stageId) && currentOrder.driveFolderId) {
      void moveOrderFolderToBase(currentOrder);
    }

    await saveCloudSnapshotNow({
      orders: nextOrders,
      trips: nextTrips,
      orderStages,
      tripStages,
      printSignerSettings,
    });
  };

  const handleMoveTripToStage = async (tripId, stageId) => {
    const currentTrip = trips.find((trip) => trip.id === tripId);
    if (!currentTrip || currentTrip.stageId === stageId) return;

    const nextTrips = trips.map((trip) =>
      trip.id === tripId ? { ...trip, stageId } : trip,
    );

    let nextOrders = orders;
    const movedOrderIds = new Set(currentTrip.orderIds || []);

    if (stageId === completedTripStageId) {
      nextOrders = orders.map((order) =>
        movedOrderIds.has(order.id)
          ? { ...order, stageId: deliveredStageId }
          : order,
      );
    }

    if (currentTrip.stageId === completedTripStageId && stageId !== completedTripStageId) {
      nextOrders = orders.map((order) =>
        movedOrderIds.has(order.id)
          ? { ...order, stageId: inCarStageId }
          : order,
      );
    }

    setTrips(nextTrips);
    setOrders(nextOrders);

    await saveCloudSnapshotNow({
      orders: nextOrders,
      trips: nextTrips,
      orderStages,
      tripStages,
      printSignerSettings,
    });
  };
  const handleInsertOrderStage = async (afterStageId) => {
    const stage = createStage("order-stage", RU.workflow.newStage);
    const index = orderStages.findIndex((item) => item.id === afterStageId);
    const nextOrderStages = index < 0
      ? [...orderStages, stage]
      : [...orderStages.slice(0, index + 1), stage, ...orderStages.slice(index + 1)];
    setOrderStages(nextOrderStages);
    await saveCloudSnapshotNow({
      orders,
      trips,
      orderStages: nextOrderStages,
      tripStages,
      printSignerSettings,
    });
    return stage.id;
  };

  const handleInsertTripStage = async (afterStageId) => {
    const stage = createStage("trip-stage", RU.workflow.newStage);
    const index = tripStages.findIndex((item) => item.id === afterStageId);
    const nextTripStages = index < 0
      ? [...tripStages, stage]
      : [...tripStages.slice(0, index + 1), stage, ...tripStages.slice(index + 1)];
    setTripStages(nextTripStages);
    await saveCloudSnapshotNow({
      orders,
      trips,
      orderStages,
      tripStages: nextTripStages,
      printSignerSettings,
    });
    return stage.id;
  };

  const handleRenameOrderStage = async (stageId, name) => {
    const value = String(name || "").trim();
    if (!value) return;
    const nextOrderStages = orderStages.map((stage) =>
      stage.id === stageId ? { ...stage, name: value } : stage,
    );
    setOrderStages(nextOrderStages);
    await saveCloudSnapshotNow({
      orders,
      trips,
      orderStages: nextOrderStages,
      tripStages,
      printSignerSettings,
    });
  };

  const handleRenameTripStage = async (stageId, name) => {
    const value = String(name || "").trim();
    if (!value) return;
    const nextTripStages = tripStages.map((stage) =>
      stage.id === stageId ? { ...stage, name: value } : stage,
    );
    setTripStages(nextTripStages);
    await saveCloudSnapshotNow({
      orders,
      trips,
      orderStages,
      tripStages: nextTripStages,
      printSignerSettings,
    });
  };

  const handleDeleteOrderStage = async (stageId) => {
    if (orderStages.length <= 1) return;
    const targetStage = orderStages.find((stage) => stage.id === stageId);
    if (DEFAULT_ORDER_STAGE_CODES.has(String(targetStage?.code || ""))) return;
    const nextOrderStages = orderStages.filter((stage) => stage.id !== stageId);
    const fallbackStageId = nextOrderStages[0]?.id;
    const nextOrders = orders.map((order) =>
      order.stageId === stageId ? { ...order, stageId: fallbackStageId } : order,
    );
    setOrderStages(nextOrderStages);
    setOrders(nextOrders);
    await saveCloudSnapshotNow({
      orders: nextOrders,
      trips,
      orderStages: nextOrderStages,
      tripStages,
      printSignerSettings,
    });
  };

  const handleDeleteTripStage = async (stageId) => {
    if (tripStages.length <= 1) return;
    const targetStage = tripStages.find((stage) => stage.id === stageId);
    if (DEFAULT_TRIP_STAGE_CODES.has(String(targetStage?.code || ""))) return;
    const nextTripStages = tripStages.filter((stage) => stage.id !== stageId);
    const fallbackStageId = nextTripStages[0]?.id;
    const nextTrips = trips.map((trip) =>
      trip.stageId === stageId ? { ...trip, stageId: fallbackStageId } : trip,
    );
    setTripStages(nextTripStages);
    setTrips(nextTrips);
    await saveCloudSnapshotNow({
      orders,
      trips: nextTrips,
      orderStages,
      tripStages: nextTripStages,
      printSignerSettings,
    });
  };
  const clearGoogleDriveSession = React.useCallback(({ notify = false } = {}) => {
    localStorage.removeItem('gdrive_tokens');
    localStorage.removeItem('gdrive_selected_folder');
    localStorage.removeItem('gdrive_account');
    setDriveConnected(false);
    setSelectedDriveFolder(null);
    setDriveAccount(null);
    if (notify) {
      setDriveHint(RU.appMessages.driveSyncDisabled);
    }
  }, []);

  const connectGoogleDrive = async () => {
    if (isE2EWorkspace) {
      setStoredTokens({
        access_token: "e2e-access-token",
        refresh_token: "e2e-refresh-token",
        expires_at: Date.now() + 3600 * 1000,
      });
      setStoredDriveAccount(E2E_DRIVE_ACCOUNT);
      setDriveConnected(true);
      setDriveAccount(E2E_DRIVE_ACCOUNT);
      setDriveHint(RU.appMessages.driveConnected);
      return;
    }

    const currentTokens = getStoredTokens();
    const hasSavedSession = Boolean(currentTokens?.access_token || currentTokens?.refresh_token);
    if (driveConnected || selectedDriveFolder || hasSavedSession) {
      clearGoogleDriveSession();
      setDriveHint(RU.appMessages.driveConnecting);
    }

    if (!DRIVE_CONFIG.CLIENT_ID) {
      setDriveHint(RU.appMessages.driveUnavailable);
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

      localStorage.setItem(DRIVE_MODAL_RESTORE_STORAGE_KEY, "1");
      // Redirect to Google OAuth 2.0 authorization endpoint (server-side code exchange)
      window.location = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    } catch (err) {
      console.error(err);
      setDriveHint(RU.appMessages.driveStartFailed);
    }
  };

  const ensureBackendAwake = React.useMemo(
    () =>
      createEnsureBackendAwake({
        apiBaseUrl: API_BASE_URL,
        pingBackendHealth,
        backendReadyAtRef,
        backendWakePromiseRef,
      }),
    [pingBackendHealth],
  );

  const runDriveOpWithWakeRetry = React.useMemo(
    () =>
      createDriveOpRunner({
        ensureBackendAwake,
        isDrivePermissionError,
      }),
    [ensureBackendAwake],
  );
  const escapeDriveQueryValue = (value) =>
    String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");

  const upsertDriveOp = React.useCallback((type, payload, lastError = "") => {
    const opKey = createDriveOpKey(type, payload);
    setDriveOpsQueue((prev) => {
      const existingIndex = prev.findIndex((item) => item.opKey === opKey);
      const now = Date.now();
      const nextItem = {
        id: existingIndex >= 0 ? prev[existingIndex].id : `drive-op-${now}-${Math.random().toString(36).slice(2, 8)}`,
        opKey,
        type,
        payload,
        attempt: existingIndex >= 0 ? Number(prev[existingIndex].attempt || 0) : 0,
        nextRunAt: now,
        createdAt: existingIndex >= 0 ? prev[existingIndex].createdAt : now,
        lastError: String(lastError || ""),
      };
      if (existingIndex >= 0) {
        const clone = [...prev];
        clone[existingIndex] = nextItem;
        return clone;
      }
      return [...prev, nextItem];
    });
  }, []);

  const removeDriveOpByKey = React.useCallback((type, payload) => {
    const opKey = createDriveOpKey(type, payload);
    setDriveOpsQueue((prev) => prev.filter((item) => item.opKey !== opKey));
  }, []);

  const ensureAccessToken = async ({ forceRefresh = false } = {}) => {
    const toks = getStoredTokens();
    const hasFreshToken = toks && toks.access_token && toks.expires_at && Date.now() < toks.expires_at - 60000;
    if (!forceRefresh && hasFreshToken) {
      return toks.access_token;
    }

    if (toks && toks.refresh_token) {
      await ensureBackendAwake();
      const res = await fetch(`${API_BASE_URL}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: toks.refresh_token, grant_type: 'refresh_token' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data?.error_description || data?.error || 'refresh_token_failed');
      }
      const newTokens = {
        ...toks,
        access_token: data.access_token,
        expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      };
      setStoredTokens(newTokens);
      setDriveConnected(true);
      return newTokens.access_token;
    }
    throw new Error('Drive authorization is required');
  };
  const driveRequest = async (url, { method = 'GET', body = null, retries = 2, allow404 = false } = {}) => {
    let forceRefresh = false;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const accessToken = await ensureAccessToken({ forceRefresh });
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });

        if (allow404 && response.status === 404) {
          return { __notFound: true };
        }

        const rawText = await response.text();
        let data = null;
        if (rawText) {
          try {
            data = JSON.parse(rawText);
          } catch (_error) {
            data = { message: rawText };
          }
        }

        if (response.status === 401 && !forceRefresh) {
          forceRefresh = true;
          if (attempt < retries) continue;
        }

        if (!response.ok) {
          const reason = String(data?.error?.errors?.[0]?.reason || "");
          const details = data?.error?.message || data?.message || `Drive request failed: ${response.status}`;
          const transient = [408, 409, 425, 429, 500, 502, 503, 504].includes(response.status);
          if (transient && attempt < retries) {
            await sleep(getDriveRetryDelayMs(attempt));
            continue;
          }
          const error = new Error(details);
          error.status = response.status;
          error.reason = reason;
          throw error;
        }

        return data;
      } catch (error) {
        const isTransientNetwork = /network|fetch|timeout|timed out|failed to fetch/i.test(String(error?.message || ""));
        if ((isTransientNetwork || error?.status >= 500 || error?.status === 429) && attempt < retries) {
          await sleep(getDriveRetryDelayMs(attempt));
          continue;
        }
        throw error;
      }
    }

    throw new Error('Drive request failed');
  };

  const findDriveFolder = async ({ name, parentId = null, entityType = '', entityId = '' }) => {
    const qParts = ["mimeType='application/vnd.google-apps.folder'", 'trashed=false'];
    if (parentId) qParts.push(`'${escapeDriveQueryValue(parentId)}' in parents`);
    if (entityType && entityId) {
      qParts.push(`appProperties has { key='lt_entity' and value='${escapeDriveQueryValue(entityType)}' }`);
      qParts.push(`appProperties has { key='lt_entity_id' and value='${escapeDriveQueryValue(entityId)}' }`);
    } else if (name) {
      qParts.push(`name='${escapeDriveQueryValue(name)}'`);
    }

    const params = new URLSearchParams({
      q: qParts.join(' and '),
      fields: 'files(id,name,webViewLink,parents)',
      pageSize: '1',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });

    const data = await driveRequest(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, { method: 'GET' });
    const first = Array.isArray(data?.files) ? data.files[0] : null;
    if (!first?.id) return null;
    return {
      folderId: first.id,
      folderUrl: first.webViewLink || `https://drive.google.com/drive/folders/${first.id}`,
      name: first.name || '',
      parents: Array.isArray(first.parents) ? first.parents : [],
    };
  };

  const createDriveFolderRaw = async ({ name, parentId = null, entityType = '', entityId = '' }) => {
    const existing = await findDriveFolder({ name, parentId, entityType, entityId });
    if (existing) return existing;

    const payload = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
      ...(entityType && entityId
        ? { appProperties: { lt_entity: entityType, lt_entity_id: entityId } }
        : {}),
    };

    const data = await driveRequest('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
      method: 'POST',
      body: payload,
      retries: 3,
    });

    if (!data?.id) throw new Error('Drive folder create returned empty id');

    return {
      folderId: data.id,
      folderUrl: data.webViewLink || `https://drive.google.com/drive/folders/${data.id}`,
      name,
    };
  };

  const moveDriveFolderToParentRaw = async (folderId, parentId = null) => {
    if (!folderId) return true;

    const meta = await driveRequest(
      `https://www.googleapis.com/drive/v3/files/${folderId}?fields=parents&supportsAllDrives=true`,
      { method: 'GET', retries: 2 },
    );

    const currentParents = Array.isArray(meta?.parents) ? meta.parents : [];
    const removeParents = currentParents.filter((id) => id !== parentId).join(',');
    const shouldAddParent = Boolean(parentId) && !currentParents.includes(parentId);
    if (!removeParents && !shouldAddParent) return true;

    const params = new URLSearchParams({ supportsAllDrives: 'true' });
    if (removeParents) params.set('removeParents', removeParents);
    if (shouldAddParent && parentId) params.set('addParents', parentId);

    await driveRequest(`https://www.googleapis.com/drive/v3/files/${folderId}?${params.toString()}`, {
      method: 'PATCH',
      body: {},
      retries: 3,
    });
    return true;
  };

  const updateDriveFolderNameRaw = async (folderId, newName) => {
    if (!folderId) return true;
    await driveRequest(`https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true`, {
      method: 'PATCH',
      body: { name: String(newName || '').trim() },
      retries: 3,
    });
    return true;
  };

  const deleteDriveFolderRaw = async (folderId) => {
    if (!folderId) return true;
    await driveRequest(`https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true`, {
      method: 'DELETE',
      retries: 3,
      allow404: true,
    });
    return true;
  };

  const createDriveFolderForOrder = async (orderName, orderId) => {
    const parentId = selectedDriveFolder?.id || null;
    try {
      const created = await runDriveOpWithWakeRetry(() => createDriveFolderRaw({
        name: orderName,
        parentId,
        entityType: 'order',
        entityId: String(orderId || ''),
      }));
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, driveFolder: created.folderUrl, driveFolderId: created.folderId } : o)),
      );
      removeDriveOpByKey('create_order_folder', { orderId });
      return created;
    } catch (err) {
      console.error('Drive create order folder failed:', err);
      if (isDrivePermissionError(err)) {
        setDriveHint(DRIVE_PERMISSION_HINT);
        removeDriveOpByKey('create_order_folder', { orderId });
        return null;
      }
      upsertDriveOp('create_order_folder', { orderId, orderName, parentId }, err?.message || 'create_order_folder_failed');
      return null;
    }
  };

  const createDriveFolderForTrip = async (trip) => {
    const tripFolderName = buildTripFolderName({
      carNumber: trip.carNumberBase || trip.carNumber,
      driverName: trip.driverName,
    });
    const parentId = selectedDriveFolder?.id || null;

    try {
      const created = await runDriveOpWithWakeRetry(() => createDriveFolderRaw({
        name: tripFolderName,
        parentId,
        entityType: 'trip',
        entityId: String(trip.id || ''),
      }));

      setTrips((prev) =>
        prev.map((item) =>
          item.id === trip.id
            ? { ...item, driveFolder: created.folderUrl, driveFolderId: created.folderId }
            : item,
        ),
      );
      removeDriveOpByKey('create_trip_folder', { tripId: trip.id });
      return created;
    } catch (err) {
      console.error('Drive create trip folder failed:', err);
      if (isDrivePermissionError(err)) {
        setDriveHint(DRIVE_PERMISSION_HINT);
        removeDriveOpByKey('create_trip_folder', { tripId: trip.id });
        return null;
      }
      upsertDriveOp('create_trip_folder', { tripId: trip.id, parentId, tripFolderName }, err?.message || 'create_trip_folder_failed');
      return null;
    }
  };

  const moveDriveFolderToParent = async (folderId, parentId = null) => {
    try {
      await runDriveOpWithWakeRetry(() => moveDriveFolderToParentRaw(folderId, parentId));
      removeDriveOpByKey('move_folder', { folderId, parentId: parentId || null });
      return true;
    } catch (err) {
      console.error('Drive move folder failed:', err);
      if (isDrivePermissionError(err)) {
        setDriveHint(DRIVE_PERMISSION_HINT);
        removeDriveOpByKey('move_folder', { folderId, parentId: parentId || null });
        return false;
      }
      upsertDriveOp('move_folder', { folderId, parentId: parentId || null }, err?.message || 'move_folder_failed');
      return false;
    }
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
    if (!driveConnected) {
      return {
        trip,
        tripFolderId: trip?.driveFolderId || previousTrip?.driveFolderId || null,
        tripFolderUrl: trip?.driveFolder || previousTrip?.driveFolder || null,
      };
    }
    const ordersById = new Map(orders.map((order) => [order.id, order]));

    let tripFolderId = trip.driveFolderId || previousTrip?.driveFolderId || null;
    let tripFolderUrl = trip.driveFolder || previousTrip?.driveFolder || null;
    let orderIdsToMoveIntoTrip = addedOrderIds;
    if (!tripFolderId) {
      const created = await createDriveFolderForTrip(trip);
      tripFolderId = created?.folderId || null;
      tripFolderUrl = created?.folderUrl || tripFolderUrl;
      orderIdsToMoveIntoTrip = Array.isArray(trip.orderIds) ? trip.orderIds : [];
    }

    if (tripFolderId) {
      for (const orderId of orderIdsToMoveIntoTrip) {
        const order = ordersById.get(orderId);
        if (!order) continue;

        let orderFolderId = order.driveFolderId || null;
        if (!orderFolderId) {
          const created = await createDriveFolderForOrder(
            order.name || order.recipient || order.id || 'Order',
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

    return {
      trip: tripFolderId || tripFolderUrl
        ? {
            ...trip,
            driveFolderId: tripFolderId || null,
            driveFolder: tripFolderUrl || trip.driveFolder || null,
          }
        : trip,
      tripFolderId,
      tripFolderUrl,
    };
  };

  const updateDriveFolderName = async (folderId, newName) => {
    if (!folderId) return;
    try {
      await runDriveOpWithWakeRetry(() => updateDriveFolderNameRaw(folderId, newName));
      removeDriveOpByKey('rename_folder', { folderId });
    } catch (err) {
      console.error('Drive rename folder failed:', err);
      if (isDrivePermissionError(err)) {
        setDriveHint(DRIVE_PERMISSION_HINT);
        removeDriveOpByKey('rename_folder', { folderId });
        return;
      }
      upsertDriveOp('rename_folder', { folderId, newName }, err?.message || 'rename_folder_failed');
    }
  };

  const deleteDriveFolder = async (folderId) => {
    if (!folderId) return true;
    console.info("[drive.delete] start", { folderId });
    try {
      await runDriveOpWithWakeRetry(() => deleteDriveFolderRaw(folderId));
      console.info("[drive.delete] success", { folderId });
      removeDriveOpByKey('delete_folder', { folderId });
      return true;
    } catch (err) {
      console.error('Drive delete folder failed:', err);
      if (isDrivePermissionError(err)) {
        console.warn("[drive.delete] permission_error", {
          folderId,
          message: err?.message || "",
          reason: err?.reason || "",
        });
        setDriveHint(DRIVE_PERMISSION_HINT);
        removeDriveOpByKey('delete_folder', { folderId });
        return false;
      }
      console.warn("[drive.delete] queued", {
        folderId,
        message: err?.message || "",
        status: err?.status || null,
        reason: err?.reason || "",
      });
      upsertDriveOp('delete_folder', { folderId }, err?.message || 'delete_folder_failed');
      return false;
    }
  };

  const processDriveOpsQueue = React.useCallback(async () => {
    if (!driveConnected || driveOpsProcessingRef.current) return;
    driveOpsProcessingRef.current = true;

    try {
      while (true) {
        const queue = driveOpsQueueRef.current;
        const now = Date.now();
        const dueOp = queue.find((item) => Number(item?.nextRunAt || 0) <= now);
        if (!dueOp) break;

        try {
          console.info("[drive.queue] processing", {
            id: dueOp.id,
            type: dueOp.type,
            payload: dueOp.payload,
            attempt: dueOp.attempt || 0,
          });
          if (dueOp.type === 'create_order_folder') {
            const liveOrder = orders.find((item) => item.id === dueOp.payload?.orderId);
            if (liveOrder) {
              const created = await runDriveOpWithWakeRetry(() => createDriveFolderRaw({
                name: liveOrder.name || liveOrder.recipient || dueOp.payload?.orderName || 'Order',
                parentId: selectedDriveFolder?.id || dueOp.payload?.parentId || null,
                entityType: 'order',
                entityId: String(liveOrder.id || ''),
              }));
              setOrders((prev) =>
                prev.map((item) =>
                  item.id === liveOrder.id
                    ? { ...item, driveFolder: created.folderUrl, driveFolderId: created.folderId }
                    : item,
                ),
              );
            }
          } else if (dueOp.type === 'create_trip_folder') {
            const liveTrip = trips.find((item) => item.id === dueOp.payload?.tripId);
            if (liveTrip) {
              const folderName = buildTripFolderName({
                carNumber: liveTrip.carNumberBase || liveTrip.carNumber,
                driverName: liveTrip.driverName,
              });
              const created = await runDriveOpWithWakeRetry(() => createDriveFolderRaw({
                name: folderName,
                parentId: selectedDriveFolder?.id || dueOp.payload?.parentId || null,
                entityType: 'trip',
                entityId: String(liveTrip.id || ''),
              }));
              setTrips((prev) =>
                prev.map((item) =>
                  item.id === liveTrip.id
                    ? { ...item, driveFolder: created.folderUrl, driveFolderId: created.folderId }
                    : item,
                ),
              );
            }
          } else if (dueOp.type === 'move_folder') {
            await runDriveOpWithWakeRetry(() => moveDriveFolderToParentRaw(dueOp.payload?.folderId, dueOp.payload?.parentId || null));
          } else if (dueOp.type === 'rename_folder') {
            await runDriveOpWithWakeRetry(() => updateDriveFolderNameRaw(dueOp.payload?.folderId, dueOp.payload?.newName || ''));
          } else if (dueOp.type === 'delete_folder') {
            await runDriveOpWithWakeRetry(() => deleteDriveFolderRaw(dueOp.payload?.folderId));
          }

          console.info("[drive.queue] success", {
            id: dueOp.id,
            type: dueOp.type,
            payload: dueOp.payload,
          });
          setDriveOpsQueue((prev) => prev.filter((item) => item.id !== dueOp.id));
        } catch (error) {
          if (isDrivePermissionError(error)) {
            console.warn("[drive.queue] permission_error", {
              id: dueOp.id,
              type: dueOp.type,
              payload: dueOp.payload,
              message: error?.message || "",
              reason: error?.reason || "",
            });
            setDriveHint(DRIVE_PERMISSION_HINT);
            setDriveOpsQueue((prev) => prev.filter((item) => item.id !== dueOp.id));
            continue;
          }
          const nextAttempt = Number(dueOp.attempt || 0) + 1;
          const nextRunAt = Date.now() + getDriveRetryDelayMs(nextAttempt);
          console.warn("[drive.queue] retry_scheduled", {
            id: dueOp.id,
            type: dueOp.type,
            payload: dueOp.payload,
            currentAttempt: dueOp.attempt || 0,
            nextAttempt,
            nextRunAt,
            message: error?.message || "",
            status: error?.status || null,
            reason: error?.reason || "",
          });
          setDriveOpsQueue((prev) =>
            prev.map((item) =>
              item.id === dueOp.id
                ? {
                    ...item,
                    attempt: nextAttempt,
                    nextRunAt,
                    lastError: String(error?.message || 'drive_queue_retry_failed'),
                  }
                : item,
            ),
          );
        }
      }
    } finally {
      driveOpsProcessingRef.current = false;
    }
  }, [driveConnected, orders, selectedDriveFolder?.id, trips]);

  React.useEffect(() => {
    if (!driveConnected || driveOpsQueue.length === 0) return undefined;

    void processDriveOpsQueue();

    const now = Date.now();
    const nextRunAt = driveOpsQueue.reduce((min, item) => {
      const itemNextRunAt = Number(item?.nextRunAt || 0);
      return Math.min(min, itemNextRunAt);
    }, Number.POSITIVE_INFINITY);

    const retryDelayMs = Number.isFinite(nextRunAt)
      ? Math.max(250, nextRunAt - now)
      : 30000;

    const timeoutId = setTimeout(() => {
      void processDriveOpsQueue();
    }, retryDelayMs);

    return () => clearTimeout(timeoutId);
  }, [driveConnected, driveOpsQueue, processDriveOpsQueue]);

  const selectDriveFolder = async () => {
    if (!driveConnected) {
      setDriveHint(RU.appMessages.connectDriveFirst);
      return;
    }

    try {
      const accessToken = await ensureAccessToken();
      await loadGooglePickerApi();
      
      // Проверить, загружена ли Google Picker API
      if (!DRIVE_CONFIG.API_KEY) {
        setDriveHint(RU.appMessages.pickerAdminOnly);
        return;
      }

      if (typeof google === 'undefined' || typeof google.picker === 'undefined') {
        setDriveHint(RU.appMessages.pickerUnavailable);
        return;
      }

      setDriveHint(RU.appMessages.pickerOpening);
      
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
            setDriveHint(`${RU.appMessages.folderSelectedPrefix} ${folderObj.name}`);
            console.log('Выбрана папка:', folderObj);
          } else if (data.action === google.picker.Action.CANCEL) {
            setDriveHint(RU.appMessages.folderCanceled);
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      console.error(err);
      setDriveHint(RU.appMessages.folderOpenFailed);
    }
  };

  React.useEffect(() => {
    if (!shouldAutoOpenDrivePicker || !driveConnected || !showDriveSettingsModal) return undefined;

    setShouldAutoOpenDrivePicker(false);
    const timeoutId = window.setTimeout(() => {
      void selectDriveFolder();
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [shouldAutoOpenDrivePicker, driveConnected, showDriveSettingsModal]);

  const handleDisconnectGoogleDrive = () => {
    clearGoogleDriveSession({ notify: true });
  };

  const openDeleteOrderConfirm = (order) => {
    setDeleteCardModal({
      isOpen: true,
      type: "order",
      id: order.id,
      title: order.name || RU.deleteCardModal.orderFallbackTitle,
    });
  };

  const openDeleteTripConfirm = (trip) => {
    setDeleteCardModal({
      isOpen: true,
      type: "trip",
      id: trip.id,
      title: trip.tripNumber || RU.deleteCardModal.tripFallbackTitle,
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
        console.info("[delete.card] order", {
          id,
          driveFolderId: orderToDelete?.driveFolderId || null,
          driveFolder: orderToDelete?.driveFolder || null,
        });
        if (orderToDelete?.driveFolderId) {
          await deleteDriveFolder(orderToDelete.driveFolderId);
        }
        const nextOrders = orders.filter((o) => o.id !== id);
        const nextTrips = tripsGetTripsWithoutOrderIds(trips, [id], nextOrders);
        setOrders(nextOrders);
        setTrips(nextTrips);
        await saveCloudSnapshotNow({
          orders: nextOrders,
          trips: nextTrips,
          orderStages,
          tripStages,
          printSignerSettings,
        });
        if (editingOrderId === id) {
          cancelOrderForm();
        }
      }

      if (type === "trip") {
        const tripToDelete = trips.find((trip) => trip.id === id);
        console.info("[delete.card] trip", {
          id,
          stageId: tripToDelete?.stageId || null,
          driveFolderId: tripToDelete?.driveFolderId || null,
          driveFolder: tripToDelete?.driveFolder || null,
          orderIds: Array.isArray(tripToDelete?.orderIds) ? tripToDelete.orderIds : [],
        });
        const tripOrderIds = new Set(tripToDelete?.orderIds || []);
        let nextOrders = orders;
        let nextTrips = trips.filter((trip) => trip.id !== id);

        if (tripToDelete?.stageId === completedTripStageId) {
          const ordersToDelete = orders.filter((order) => tripOrderIds.has(order.id));
          for (const order of ordersToDelete) {
            if (order?.driveFolderId) {
              await deleteDriveFolder(order.driveFolderId);
            }
          }
          nextOrders = orders.filter((order) => !tripOrderIds.has(order.id));
          nextTrips = tripsGetTripsWithoutOrderIds(nextTrips, Array.from(tripOrderIds), nextOrders);
        } else {
          const tripOrders = orders.filter((order) => tripOrderIds.has(order.id));
          for (const order of tripOrders) {
            if (order?.driveFolderId) {
              await moveOrderFolderToBase(order);
            }
          }
          nextOrders = orders.map((order) =>
            tripOrderIds.has(order.id)
              ? { ...order, stageId: warehouseStageId }
              : order,
          );
        }
        if (tripToDelete?.driveFolderId) {
          await deleteDriveFolder(tripToDelete.driveFolderId);
        }
        setOrders(nextOrders);
        setTrips(nextTrips);
        await saveCloudSnapshotNow({
          orders: nextOrders,
          trips: nextTrips,
          orderStages,
          tripStages,
          printSignerSettings,
        });
        if (editingTripId === id) {
          closeCreateTripForm();
        }
      }

      closeDeleteCardModal();
    } catch (error) {
      console.error("delete_card_failed", error);
      alert(`${RU.appMessages.deleteCardFailedPrefix} ${error?.message || RU.appMessages.unknownError}`);
    } finally {
      setIsDeleteCardLoading(false);
    }
  };
  const createOrderFormDataFromOrder = (order) => {
    const awbParts = splitAwb(order.awb);
    return {
      calculatorAirport: getCalculatorAirportFromOrder(order),
      shipmentAirport: order.shipmentAirport || "",
      shipmentTerminal: order.shipmentTerminal || "",
      recipient: order.recipient || "",
      orderName: order.name || "",
      awb: order.awb || "",
      awbPrefix: awbParts.awbPrefix,
      awbNumber: awbParts.awbNumber,
      hasHawb: awbParts.hasHawb,
      hawb: awbParts.hawb || "",
      hasAdditionalParams: Boolean(order.hasAdditionalParams),
      additionalDistance: order.additionalDistance || "",
      hasDelivery: Boolean(order.hasDelivery),
      quantity: order.quantity || "",
      weight: order.weight || "",
      customsCode: order.customsCode || "",
      transportCost: order.transportCost || "",
      notes: order.notes || "",
      customer: order.customer || "",
      loadingPoint: order.loadingPoint || "",
      unloadingPoint: order.unloadingPoint || "",
    };
  };

  const handleEditClick = (order) => {
    setFormData(createOrderFormDataFromOrder(order));
    setEditingOrderId(order.id);
    setOrderFormVariant(getOrderFormVariantFromOrder(order));
    setOrdersScreenMode("create");
  };
  const handleCopyOrderClick = (order) => {
    setFormData(createOrderFormDataFromOrder(order));
    setEditingOrderId(null);
    setOrderFormVariant(getOrderFormVariantFromOrder(order));
    setOrdersScreenMode("create");
  };
  const handleEditOrderFromTripClick = (order) => {
    setActiveView("orders");
    handleEditClick(order);
  };

  const handleEditTripClick = (trip) => {
    const parsedCar = tripsParseTripCarNumber(trip.carNumber);
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
    setFormData(createEmptyOrderFormData());
    setOrderFormVariant("default");
    setOrdersScreenMode("list");
  };

  const handlePrintSignerChange = (field, value) => {
    if (field !== "signerRole" && field !== "signerName") return;
    setPrintSignerSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const closeSignatureSettingsModal = async () => {
    await saveCloudSnapshotNow({
      orders,
      trips,
      orderStages,
      tripStages,
      printSignerSettings,
    });
    setShowSignatureSettingsModal(false);
    setShowSettingsModal(true);
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
      setAuthError(localizeAuthErrorMessage(error, RU.authFlow.signInFailed));
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
      setAuthInfo(RU.authFlow.verifyEmail);
    } catch (error) {
      setAuthError(localizeAuthErrorMessage(error, RU.authFlow.signUpFailed));
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
        throw new Error(RU.authFlow.enterRecoveryEmail);
      }
      const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setAuthInfo(RU.authFlow.resetLinkSent);
    } catch (error) {
      setAuthError(localizeAuthErrorMessage(error, RU.authFlow.resetLinkFailed));
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    if (isE2EWorkspace) {
      setAuthError("");
      setAuthInfo("");
      setIsChangePasswordScreenOpen(false);
      setChangePasswordError("");
      setChangePasswordInfo("");
      setChangePasswordForm({ password: "", confirmPassword: "" });
      setShowAccountSettingsModal(false);
      setShowSettingsModal(false);
      setCurrentUser(null);
      return;
    }
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
    if (isE2EWorkspace) {
      setChangePasswordError("");
      setChangePasswordInfo("");
      setIsChangePasswordSubmitting(true);
      try {
        const password = String(changePasswordForm.password || "");
        const confirmPassword = String(changePasswordForm.confirmPassword || "");
        if (password.length < 6) {
          throw new Error(RU.authFlow.passwordTooShort);
        }
        if (password !== confirmPassword) {
          throw new Error(RU.authFlow.passwordsMismatch);
        }
        setChangePasswordInfo(RU.authFlow.passwordChanged);
        setChangePasswordForm({ password: "", confirmPassword: "" });
      } catch (error) {
        setChangePasswordError(localizeAuthErrorMessage(error, RU.authFlow.changePasswordFailed));
      } finally {
        setIsChangePasswordSubmitting(false);
      }
      return;
    }
    if (!supabase) return;
    setChangePasswordError("");
    setChangePasswordInfo("");
    setIsChangePasswordSubmitting(true);
    try {
      const password = String(changePasswordForm.password || "");
      const confirmPassword = String(changePasswordForm.confirmPassword || "");
      if (password.length < 6) {
        throw new Error(RU.authFlow.passwordTooShort);
      }
      if (password !== confirmPassword) {
        throw new Error(RU.authFlow.passwordsMismatch);
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setChangePasswordInfo(RU.authFlow.passwordChanged);
      setChangePasswordForm({ password: "", confirmPassword: "" });
    } catch (error) {
      setChangePasswordError(localizeAuthErrorMessage(error, RU.authFlow.changePasswordFailed));
    } finally {
      setIsChangePasswordSubmitting(false);
    }
  };

  const settingsSections = [
    {
      id: 'google-drive',
      title: 'Google Drive',
      status: driveConnected
        ? driveAccount?.email
          ? `${RU.settingsCards.driveStatusConnectedPrefix} ${driveAccount.email}`
          : RU.settingsCards.driveStatusConnectedUnknown
        : RU.settingsCards.driveStatusDisconnected,
      onOpen: () => {
        setShowSettingsModal(false);
        setShowDriveSettingsModal(true);
      },
    },
    {
      id: 'print-signature',
      title: RU.settingsCards.signatureTitle,
      status: `${printSignerSettings.signerRole || "—"} · ${printSignerSettings.signerName || "—"}`,
      onOpen: () => {
        setShowSettingsModal(false);
        setShowSignatureSettingsModal(true);
      },
    },
    {
      id: 'account',
      title: RU.settingsCards.accountTitle,
      status: currentUser?.email || RU.settingsCards.accountSignedIn,
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

  if (isSupabaseEnabled && !authReady) {
    return (
      <div className="app">
        <main className="workspace">
          <section className="card panel-section">
            <h2>{RU.authUi.authTitle}</h2>
            <p>{RU.authUi.checkingSession}</p>
          </section>
        </main>
      </div>
    );
  }

  if (isSupabaseEnabled && !currentUser) {
    return (
      <div className="app">
        <main className="workspace">
          <section className="card panel-section" style={{ maxWidth: "520px", margin: "0 auto" }}>
            <h2>{authScreen === "recover" ? RU.authUi.recoverTitle : RU.authUi.loginTitle}</h2>
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
                <span>{RU.authUi.password}</span>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={handleAuthFieldChange("password")}
                  placeholder={RU.authUi.minPassword}
                  disabled={authScreen === "recover"}
                />
              </label>
              {authError && <small style={{ color: "#b91c1c" }}>{authError}</small>}
              {authInfo && <small style={{ color: "#0f5132" }}>{authInfo}</small>}
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                {authScreen === "recover" ? (
                  <>
                    <button
                      type="button"
                      className="primary"
                      onClick={handleRequestPasswordReset}
                      disabled={isAuthSubmitting}
                      data-testid="auth-send-link"
                    >
                      {isAuthSubmitting ? RU.authUi.processing : RU.authUi.sendLink}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthScreen("login");
                        setAuthError("");
                        setAuthInfo("");
                      }}
                      disabled={isAuthSubmitting}
                      data-testid="auth-back-to-login"
                    >
                      {RU.authUi.backToLogin}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="primary"
                      onClick={handleSignIn}
                      disabled={isAuthSubmitting}
                      data-testid="auth-sign-in"
                    >
                      {isAuthSubmitting ? RU.authUi.processing : RU.authUi.signIn}
                    </button>
                    <button
                      type="button"
                      onClick={handleSignUp}
                      disabled={isAuthSubmitting}
                      data-testid="auth-sign-up"
                    >
                      {isAuthSubmitting ? RU.authUi.processing : RU.authUi.signUp}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthScreen("recover");
                        setAuthError("");
                        setAuthInfo("");
                      }}
                      disabled={isAuthSubmitting}
                      data-testid="auth-recover"
                    >
                      {RU.authUi.recoverByEmail}
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

  if ((isSupabaseEnabled || isE2EWorkspace) && currentUser && isChangePasswordScreenOpen) {
    return (
      <div className="app">
        <main className="workspace">
          <section className="card panel-section" style={{ maxWidth: "520px", margin: "0 auto" }}>
            <h2>{RU.authUi.changePasswordTitle}</h2>
            <div style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}>
              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span>{RU.authUi.newPassword}</span>
                <input
                  type="password"
                  value={changePasswordForm.password}
                  onChange={handleChangePasswordField("password")}
                  placeholder={RU.authUi.minPassword}
                  data-testid="change-password-input"
                />
              </label>
              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span>{RU.authUi.repeatPassword}</span>
                <input
                  type="password"
                  value={changePasswordForm.confirmPassword}
                  onChange={handleChangePasswordField("confirmPassword")}
                  placeholder={RU.authUi.repeatPasswordPlaceholder}
                  data-testid="change-password-confirm-input"
                />
              </label>
              {changePasswordError && <small style={{ color: "#b91c1c" }} data-testid="change-password-error">{changePasswordError}</small>}
              {changePasswordInfo && <small style={{ color: "#0f5132" }} data-testid="change-password-info">{changePasswordInfo}</small>}
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <button type="button" className="primary" onClick={handleChangePasswordSubmit} disabled={isChangePasswordSubmitting} data-testid="change-password-submit">
                  {isChangePasswordSubmitting ? RU.common.saveInProgress : RU.authUi.savePassword}
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
                  data-testid="change-password-back"
                >
                  {RU.authUi.back}
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
        <HeaderNavigation activeView={activeView} onSelectView={handleSelectView} driveConnected={driveConnected} />

        <section className="workspace__content workspace__content--full">
          {activeView === "orders" && (
            <>
              {ordersScreenMode === "list" ? (
                <WorkPanel
                  title={RU.ordersTable.title}
                  actionLabel={RU.ordersTable.create}
                  actionTestId="orders-create-action"
                  onAction={() => {
                    setFormData(createEmptyOrderFormData());
                    setEditingOrderId(null);
                    setOrderFormVariant("default");
                    setOrdersScreenMode("create");
                  }}
                >
                  <WorkflowBoard
                    boardTestId="orders-workflow"
                    boardTitle={RU.workflow.boardTitle}
                    stages={orderStages}
                    items={orders}
                    getItemId={(order) => order.id}
                    getItemStageId={(order) => order.stageId}
                    getItemWeight={(order) => order.weight}
                    getItemCost={(order) => order.transportCost}
                    onMoveItemToStage={handleMoveOrderToStage}
                    onInsertStage={handleInsertOrderStage}
                    onRenameStage={handleRenameOrderStage}
                    onDeleteStage={handleDeleteOrderStage}
                    allowStageManagement
                    isStageDefault={isDefaultOrderStage}
                    renderItemCard={(order) => {
                      const orderPowerOfAttorneyStatus = getPowerOfAttorneyState({
                        shipmentAirport: order.shipmentAirport,
                        shipmentTerminal: order.shipmentTerminal,
                        recipient: order.recipient,
                        registry: powerOfAttorneyRegistry,
                      });
                      const isAlternateOrder = Boolean(order.customer || order.loadingPoint || order.unloadingPoint);
                      const isOrderWithoutPowerOfAttorney = !isAlternateOrder && orderPowerOfAttorneyStatus?.type === "danger";
                      const assignedTrip = trips.find((trip) => (trip.orderIds || []).includes(order.id));
                      const assignedCarNumber = String(assignedTrip?.carNumber || "").trim();

                      return (
                      <div className="workflow-card">
                        <div className="workflow-card__top-actions">
                          <button
                            type="button"
                            className="workflow-card__icon-btn"
                            title={RU.orderCard.edit}
                            onClick={() => handleEditClick(order)}
                            aria-label={RU.orderCard.edit}
                            data-testid={`order-edit-${order.id}`}
                          >
                            <span aria-hidden="true">&#9998;</span>
                          </button>
                          <button type="button" className="workflow-card__icon-btn" title={RU.orderCard.copy} onClick={() => handleCopyOrderClick(order)} aria-label={RU.orderCard.copy}>
                            <span aria-hidden="true">&#128203;</span>
                          </button>
                          <button
                            type="button"
                            className="workflow-card__icon-btn workflow-card__icon-btn--danger"
                            title={RU.orderCard.delete}
                            onClick={() => openDeleteOrderConfirm(order)}
                            aria-label={RU.orderCard.delete}
                            data-testid={`order-delete-${order.id}`}
                          >
                            <span aria-hidden="true">&#128465;</span>
                          </button>
                        </div>
                        <div className={`workflow-card__title ${isOrderWithoutPowerOfAttorney ? "workflow-card__title--danger" : ""}`}>
                          {getOrderDisplayName(order) || RU.orderCard.untitled}
                        </div>
                        <div className="workflow-card__meta workflow-card__meta--awb">
                          {order.loadingPoint || order.shipmentAirport || "—"} - {order.unloadingPoint || order.customsName || order.customsCode || "—"}
                        </div>
                        {!isAlternateOrder && (
                          <div className="workflow-card__meta">
                            AWB:{" "}
                            {order.awb ? (
                              <button
                                type="button"
                                className="workflow-card__order-link"
                                onClick={() => checkOrderAwbStatus(order)}
                                title={RU.orderCard.checkAwb}
                                aria-label={`${RU.orderCard.checkAwb} ${order.awb}`}
                              >
                                {order.awb}
                              </button>
                            ) : (
                              "—"
                            )}
                          </div>
                        )}
                        <div className="workflow-card__meta">
                          {order.quantity || RU.common.emDash} {RU.orderCard.placesUnit} / {order.weight || RU.common.emDash} {RU.orderCard.weightUnit} / {order.transportCost || RU.common.emDash} {RU.workflow.costUnit}
                          {assignedTrip ? ` / ${assignedCarNumber || "—"}` : ""}
                        </div>
                      </div>
                      );
                    }}
                  />
                </WorkPanel>
              ) : (
                <WorkPanel
                  title={editingOrderId ? RU.orderView.editTitle : RU.orderView.createTitle}
                  headerActions={(
                    <button
                      type="button"
                      onClick={() => setOrderFormVariant((prev) => (prev === "default" ? "alternate" : "default"))}
                    >
                      {orderFormVariant === "default" ? "Другая форма" : "Основная форма"}
                    </button>
                  )}
                >
                  {orderFormVariant === "alternate" ? (
                    <AlternateOrderFormCard
                      formId={ORDER_FORM_ID}
                      formData={formData}
                      onFieldChange={handleFieldChange}
                      onSubmit={handleSubmit}
                      onCancel={cancelOrderForm}
                      isSaving={isOrderCloudSaving}
                      embedded
                    />
                  ) : (
                    <OrderFormCard
                      formId={ORDER_FORM_ID}
                      formData={formData}
                      customsName={customsName}
                      customsSuggestions={customsSuggestions}
                      powerOfAttorneyStatus={powerOfAttorneyStatus}
                      recipientSuggestions={recipientSuggestions}
                      isAwbCheckAvailable={isCargoCheckAvailable}
                      isPowerOfAttorneySyncLoading={isPowerOfAttorneySyncLoading}
                      onCheckAwbStatus={checkAwbStatus}
                      onRefreshPowerOfAttorneyRegistry={() => loadPowerOfAttorneyRegistry(true)}
                      onFieldChange={handleFieldChange}
                      onSubmit={handleSubmit}
                      onCancel={cancelOrderForm}
                      isSaving={isOrderCloudSaving}
                      embedded
                    />
                  )}
                </WorkPanel>
              )}
            </>
          )}

          {activeView === "trips" && (
            <>
              {tripsScreenMode === "list" ? (
                <WorkPanel
                  title={RU.tripView.listTitle}
                  actionLabel={RU.tripView.createAction}
                  actionTestId="trips-create-action"
                  onAction={openCreateTripForm}
                >
                  <WorkflowBoard
                    boardTestId="trips-workflow"
                    boardTitle={RU.tripView.boardTitle}
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
                      const totalTripCost = tripOrders.reduce((sum, order) => {
                        const parsed = Number.parseFloat(String(order.transportCost || "0").replace(",", "."));
                        return sum + (Number.isFinite(parsed) ? parsed : 0);
                      }, 0);
                      return (
                        <div className="workflow-card">
                          <div className="workflow-card__top-actions">
                            <button
                              type="button"
                              className="workflow-card__icon-btn"
                              title={RU.tripCard.edit}
                              onClick={() => handleEditTripClick(trip)}
                              aria-label={RU.tripCard.edit}
                              data-testid={`trip-edit-${trip.id}`}
                            >
                              <span aria-hidden="true">&#9998;</span>
                            </button>
                            <button
                              type="button"
                              className="workflow-card__icon-btn"
                              title={RU.tripCard.print}
                              onClick={() => handlePrintTripCard(trip)}
                              aria-label={RU.tripCard.print}
                              disabled={isTripPrintLoading}
                            >
                              <span aria-hidden="true">&#128424;</span>
                            </button>
                            <button
                              type="button"
                              className="workflow-card__icon-btn workflow-card__icon-btn--danger"
                              title={RU.tripCard.delete}
                              onClick={() => openDeleteTripConfirm(trip)}
                              aria-label={RU.tripCard.delete}
                              data-testid={`trip-delete-${trip.id}`}
                            >
                              <span aria-hidden="true">&#128465;</span>
                            </button>
                          </div>
                          <div className="workflow-card__title">
                            {(trip.tripNumber || RU.tripCard.untitled)} {RU.tripCard.from} {formatTripDateShort(trip.tripDate)}
                          </div>
                          <div className="workflow-card__meta">{trip.carNumber || "—"} · {trip.driverName || "—"}</div>
                          <div className="workflow-card__meta">
                            {RU.tripCard.ordersCount}: {tripOrders.length} · {RU.tripCard.weight}: {totalTripWeight.toLocaleString("ru-RU", {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })} {RU.tripCard.weightUnit} · {RU.tripCard.cost}: {totalTripCost.toLocaleString("ru-RU", {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })} {RU.tripCard.costUnit}
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
                                      title={RU.tripCard.openOrder}
                                    >
                                      {order.name || order.customer || order.recipient || order.unloadingPoint || order.awb || order.id}
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
                  title={editingTripId ? RU.tripView.editTitle : RU.tripView.createTitle}
                >
                  <TripFormCard
                    formId={TRIP_FORM_ID}
                    formData={tripFormData}
                    onFieldChange={handleTripFieldChange}
                    onToggleOrder={handleToggleTripOrder}
                    onSubmit={handleTripSubmit}
                    onPrint={handleTripPrint}
                    onCancel={closeCreateTripForm}
                    submitLabel={RU.tripView.save}
                    orders={availableOrdersForTrip}
                    carNumbers={TRIP_CAR_NUMBERS}
                    driverNames={TRIP_DRIVER_NAMES}
                    isSaving={isTripSaving}
                    isPrintLoading={isTripPrintLoading}
                    embedded
                  />
                </WorkPanel>
              )}
            </>
          )}

          {activeView === "calculator" && (
            <WorkPanel title={`${RU.calculator.title} ${calculatorRoute}`}>
              <div data-testid="calculator-view">
                <SvoMsqCalculator onRouteChange={setCalculatorRoute} />
              </div>
            </WorkPanel>
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
        onClose={() => {
          setShowAccountSettingsModal(false);
          setShowSettingsModal(true);
        }}
      />

      <DriveSettingsModal
        isOpen={showDriveSettingsModal}
        driveConnected={driveConnected}
        selectedDriveFolder={selectedDriveFolder}
        driveHint={driveHint}
        onConnectGoogleDrive={connectGoogleDrive}
        onSelectDriveFolder={selectDriveFolder}
        onDisconnectGoogleDrive={handleDisconnectGoogleDrive}
        onClose={() => {
          setShowDriveSettingsModal(false);
          setShowSettingsModal(true);
        }}
      />

      <SignatureSettingsModal
        isOpen={showSignatureSettingsModal}
        printSignerSettings={printSignerSettings}
        onPrintSignerChange={handlePrintSignerChange}
        onClose={closeSignatureSettingsModal}
      />

      {cargoCheckNoticeModal.isOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={RU.manualCargoModal.aria}
          data-testid="manual-cargo-modal"
        >
          <div className="modal-card workflow-modal">
            <div className="modal-card__header">
              <h2>{RU.manualCargoModal.title}</h2>
            </div>
            <div className="modal-card__body">
              <p>
                <span className="manual-cargo-modal__awb-badge" data-testid="manual-cargo-awb-number">
                  {cargoCheckNoticeModal.awbNumber || RU.common.emDash}
                </span>{" "}
                {"\u0441\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d \u0432 \u0431\u0443\u0444\u0435\u0440 \u043e\u0431\u043c\u0435\u043d\u0430."}
              </p>
             </div>
          </div>
        </div>
      )}

      {deleteCardModal.isOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={RU.deleteCardModal.aria} data-testid="delete-card-modal">
          <div className="modal-card workflow-modal">
            <div className="modal-card__header">
              <h2>{RU.deleteCardModal.title}</h2>
            </div>
            <div className="modal-card__body">
              <p>
                {RU.deleteCardModal.descriptionPrefix} "{deleteCardModal.title}" {RU.deleteCardModal.descriptionSuffix}
              </p>
              <div className="workflow-confirm-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={confirmDeleteCard}
                  disabled={isDeleteCardLoading}
                  data-testid="delete-card-confirm"
                >
                  {isDeleteCardLoading ? RU.deleteCardModal.deleting : RU.deleteCardModal.delete}
                </button>
                <button type="button" onClick={closeDeleteCardModal} disabled={isDeleteCardLoading} data-testid="delete-card-cancel">
                  {RU.common.cancel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isDeleteCardLoading && (
        <div className="loader-overlay" role="status" aria-live="polite" aria-label={RU.deleteCardModal.loaderAria}>
          <div className="loader-overlay__content">
            <div className="loader-overlay__spinner" />
            <div className="loader-overlay__text">{RU.deleteCardModal.loaderText}</div>
          </div>
        </div>
      )}

      {isTripPrintLoading && (
        <div className="loader-overlay" role="status" aria-live="polite" aria-label={RU.loaders.printAria}>
          <div className="loader-overlay__content">
            <div className="loader-overlay__spinner" />
            <div className="loader-overlay__text">{RU.loaders.printText}</div>
          </div>
        </div>
      )}

      {(isOrderCloudSaving || isTripSaving) && (
        <div className="loader-overlay" role="status" aria-live="polite" aria-label={RU.loaders.driveAria}>
          <div className="loader-overlay__content">
            <div className="loader-overlay__spinner" />
            <div className="loader-overlay__text">{RU.loaders.driveText}</div>
          </div>
        </div>
      )}
    </div>
  );
};
export default App;
