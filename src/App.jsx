import React from 'react';
import {
  AppHeader,
  OrderFormCard,
  SettingsModal,
  DriveSettingsModal,
  OrdersTable,
  EditOrderModal,
} from './components/ui';

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

const POWER_OF_ATTORNEY_REGISTRY_URL = "http://localhost:3001/poa/registry";
const POWER_OF_ATTORNEY_FALLBACK_URL = "/power-of-attorney-registry.json";
const CARGO_STATUS_URL = "http://localhost:3001/cargo/status";
const CARGO_API_BASE_URL = "http://localhost:3001";

const resolveCargoApiUrl = (urlPath) => {
  if (!urlPath) return "";
  if (/^https?:\/\//i.test(urlPath)) return urlPath;
  return `${CARGO_API_BASE_URL}${urlPath.startsWith("/") ? "" : "/"}${urlPath}`;
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

const App = () => {
  const SHEREMETYEVO_VALUES = new Set(["Шереметьево"]);
  const DEFAULT_SHEREMETYEVO_TERMINAL = "Москва-карго";

  const [orders, setOrders] = React.useState(loadOrders);
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

  // Editing state
  const [editingOrderId, setEditingOrderId] = React.useState(null);
  const [editingFormData, setEditingFormData] = React.useState(null);
  const [showEditModal, setShowEditModal] = React.useState(false);
  const [showSettingsModal, setShowSettingsModal] = React.useState(false);
  const [showDriveSettingsModal, setShowDriveSettingsModal] = React.useState(false);

  
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
  const isMoscowCargoTerminal =
    formData.shipmentAirport === "Шереметьево" &&
    normalizeTerminal(formData.shipmentTerminal) === "Москва-карго";

  const checkAwbStatus = async () => {
    const awb = formData.awb.trim();
    if (!awb) {
      setAwbStatusCheck({
        loading: false,
        error: "Введите номер авианакладной.",
        data: null,
      });
      return;
    }

    if (!isMoscowCargoTerminal) {
      setAwbStatusCheck({
        loading: false,
        error: "Проверка сейчас доступна только для терминала Москва-карго.",
        data: null,
      });
      return;
    }

    setAwbStatusCheck({
      loading: true,
      error: "",
      data: null,
    });

    try {
      const response = await fetch(CARGO_STATUS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awb,
          terminal: formData.shipmentTerminal,
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
    }
  };

  const closeCargoScreenshotModal = async () => {
    const screenshotId = cargoScreenshotModal.screenshotId;
    if (screenshotId) {
      try {
        await fetch(`${CARGO_API_BASE_URL}/cargo/screenshot/${encodeURIComponent(screenshotId)}`, {
          method: "DELETE",
        });
      } catch (error) {
        console.warn("Не удалось удалить скриншот:", error);
      }
    }

    setCargoScreenshotModal({
      isOpen: false,
      screenshotId: "",
      screenshotUrl: "",
    });
  };

  const handleFieldChange = (field) => (event) => {
    const value = event.target.value;
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "recipient") {
        next.orderName = value.trim();
      }
      if (field === "shipmentAirport") {
        next.shipmentTerminal = SHEREMETYEVO_VALUES.has(value) ? DEFAULT_SHEREMETYEVO_TERMINAL : "";
      }
      return next;
    });

    if (field === "awb" || field === "shipmentAirport" || field === "shipmentTerminal") {
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
      id: `order-${Date.now()}`,
      shipmentAirport: formData.shipmentAirport.trim(),
      shipmentTerminal: formData.shipmentTerminal.trim(),
      name: formData.orderName.trim(),
      recipient: formData.recipient.trim(),
      awb: formData.awb.trim(),
      quantity: formData.quantity.trim(),
      weight: formData.weight.trim(),
      customsCode: formData.customsCode.trim(),
      customsName: getCustomsName(formData.customsCode.trim()),
      notes: formData.notes.trim(),
      driveFolder: null,
      driveFolderId: null,
    };

    setOrders((prev) => [order, ...prev]);

    // Автоматически создать папку в Google Drive если подключено
    if (driveConnected) {
      createDriveFolderForOrder(order.name, order.id);
    }

    setFormData({
      shipmentAirport: "",
      shipmentTerminal: "",
      recipient: "",
      orderName: "",
      awb: "",
      quantity: "",
      weight: "",
      customsCode: "",
      notes: "",
    });
    setAwbStatusCheck({
      loading: false,
      error: "",
      data: null,
    });
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

  // Delete order
  const handleDelete = async (orderId) => {
    if (confirm('Вы уверены? Этот заказ и его папка в Google Drive будут удалены.')) {
      // Найти заказ и удалить его папку в Google Drive
      const orderToDelete = orders.find((o) => o.id === orderId);
      if (orderToDelete && orderToDelete.driveFolderId) {
        await deleteDriveFolder(orderToDelete.driveFolderId);
      }
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    }
  };

  // Open edit modal
  const handleEditClick = (order) => {
    setEditingOrderId(order.id);
    setEditingFormData({ ...order });
    setShowEditModal(true);
  };

  // Handle edit form change
  const handleEditFieldChange = (field) => (event) => {
    const value = event.target.value;
    setEditingFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'recipient') {
        next.orderName = value.trim();
        next.name = value.trim();
      }
      return next;
    });
  };

  // Save edit
  const handleSaveEdit = () => {
    if (!editingFormData) return;
    
    // Найти оригинальный заказ, чтобы проверить, изменилось ли имя
    const originalOrder = orders.find((o) => o.id === editingOrderId);
    if (originalOrder && editingFormData.name !== originalOrder.name && editingFormData.driveFolderId) {
      // Переименовать папку в Google Drive если имя изменилось
      updateDriveFolderName(editingFormData.driveFolderId, editingFormData.name);
    }

    setOrders((prev) =>
      prev.map((o) => (o.id === editingOrderId ? editingFormData : o))
    );
    setShowEditModal(false);
    setEditingOrderId(null);
    setEditingFormData(null);
  };

  // Cancel edit
  const handleCancelEdit = () => {
    setShowEditModal(false);
    setEditingOrderId(null);
    setEditingFormData(null);
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
      <AppHeader
        driveConnected={driveConnected}
        onOpenSettings={() => setShowSettingsModal(true)}
      />

      <main className="grid">
        <OrderFormCard
          formData={formData}
          customsName={customsName}
          powerOfAttorneyStatus={powerOfAttorneyStatus}
          recipientSuggestions={recipientSuggestions}
          awbStatusCheck={awbStatusCheck}
          isAwbCheckAvailable={isMoscowCargoTerminal}
          isPowerOfAttorneySyncLoading={isPowerOfAttorneySyncLoading}
          onCheckAwbStatus={checkAwbStatus}
          onRefreshPowerOfAttorneyRegistry={() => loadPowerOfAttorneyRegistry(true)}
          onFieldChange={handleFieldChange}
          onSubmit={handleSubmit}
        />
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

      <OrdersTable
        orders={orders}
        onEditClick={handleEditClick}
        onDelete={handleDelete}
      />

      <EditOrderModal
        isOpen={showEditModal}
        editingFormData={editingFormData}
        onFieldChange={handleEditFieldChange}
        onSave={handleSaveEdit}
        onCancel={handleCancelEdit}
        getCustomsName={getCustomsName}
      />

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

