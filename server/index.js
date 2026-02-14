require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs/promises');
const path = require('path');
const XLSX = require('xlsx');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

const corsOrigins = allowedOrigins.length > 0 ? allowedOrigins : defaultOrigins;

app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
}));
app.use(express.json());

const POA_SYNC_TTL_MS = Number(process.env.POA_SYNC_TTL_MS || 300000);
const POA_XLSX_URL = process.env.POA_XLSX_URL || '';
const POA_XLSX_PATH = process.env.POA_XLSX_PATH || '';

const defaultSheetTabs = {
  'Шереметьево': 'Шереметьево',
  'Внуково': 'Внуково',
  'Домодедово': 'Домодедово',
  'Жуковский': 'Жуковский',
};

let poaCache = {
  expiresAt: 0,
  updatedAt: 0,
  data: null,
};

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();

const parseJsonEnv = (raw, fallback) => {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    console.warn('Invalid JSON env value:', error.message);
  }
  return fallback;
};

const getSheetTabs = () => parseJsonEnv(process.env.POA_SHEET_TABS_JSON, defaultSheetTabs);

const headerIncludes = (header, token) => normalizeText(header).includes(token);

const isDateHeader = (header) => {
  const h = normalizeText(header);
  return h.includes('срок') || h.includes('действ') || h.includes('до') || h.includes('expir');
};

const findHeaderIndex = (headers, predicate, fallback) => {
  const idx = headers.findIndex(predicate);
  return idx >= 0 ? idx : fallback;
};

const normalizePlusValue = (value) => {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.includes('+')) return '+';
  if (['да', 'yes', 'true', '1'].includes(text)) return '+';
  return '';
};

const getCell = (row, idx) => (idx >= 0 ? (row[idx] || '').toString().trim() : '');

const parseNonSheremetyevoRows = (rows) => {
  if (!rows || rows.length === 0) return [];
  const headers = rows[0];
  const body = rows.slice(1);

  const recipientIdx = findHeaderIndex(
    headers,
    (h) =>
      headerIncludes(h, 'получ') ||
      headerIncludes(h, 'наимен') ||
      headerIncludes(h, 'клиент') ||
      headerIncludes(h, 'компан'),
    0,
  );

  const plusIdx = findHeaderIndex(
    headers,
    (h) =>
      (headerIncludes(h, 'довер') && !isDateHeader(h)) ||
      normalizeText(h) === '+' ||
      headerIncludes(h, 'налич'),
    1,
  );

  const nonSheremetyevoValidUntilIdx = 3;

  return body
    .map((row) => ({
      recipient: getCell(row, recipientIdx),
      hasAttorney: normalizePlusValue(getCell(row, plusIdx)),
      validUntil: getCell(row, nonSheremetyevoValidUntilIdx),
    }))
    .filter((row) => row.recipient);
};

const parseSheremetyevoRows = (rows) => {
  const result = { 'Москва-карго': [], 'Шереметьево-карго': [] };
  if (!rows || rows.length === 0) return result;

  const headers = rows[0];
  const body = rows.slice(1);

  const recipientIdx = findHeaderIndex(
    headers,
    (h) =>
      headerIncludes(h, 'получ') ||
      headerIncludes(h, 'наимен') ||
      headerIncludes(h, 'клиент') ||
      headerIncludes(h, 'компан'),
    0,
  );

  const moscowPlusIdx = findHeaderIndex(
    headers,
    (h) => headerIncludes(h, 'москва') && headerIncludes(h, 'карго') && !isDateHeader(h),
    1,
  );
  const sheremetyevoValidUntilIdx = 4;

  const sherPlusIdx = findHeaderIndex(
    headers,
    (h) =>
      (
        headerIncludes(h, 'шерем') &&
        headerIncludes(h, 'карго') &&
        !isDateHeader(h)
      ) ||
      headerIncludes(h, 'шеркарго'),
    3,
  );

  body.forEach((row) => {
    const recipient = getCell(row, recipientIdx);
    if (!recipient) return;

    result['Москва-карго'].push({
      recipient,
      hasAttorney: normalizePlusValue(getCell(row, moscowPlusIdx)),
      validUntil: getCell(row, sheremetyevoValidUntilIdx),
    });

    result['Шереметьево-карго'].push({
      recipient,
      hasAttorney: normalizePlusValue(getCell(row, sherPlusIdx)),
      validUntil: getCell(row, sheremetyevoValidUntilIdx),
    });
  });

  return result;
};

const normalizeXlsxUrl = (rawUrl) => {
  const url = String(rawUrl || '').trim();
  if (!url) return '';

  const sheetsMatch = url.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/i);
  if (sheetsMatch) {
    return `https://docs.google.com/spreadsheets/d/${sheetsMatch[1]}/export?format=xlsx`;
  }

  const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (driveFileMatch) {
    return `https://drive.google.com/uc?export=download&id=${driveFileMatch[1]}`;
  }

  return url;
};

const readWorkbookBuffer = async () => {
  if (POA_XLSX_PATH) {
    const resolvedPath = path.isAbsolute(POA_XLSX_PATH)
      ? POA_XLSX_PATH
      : path.resolve(process.cwd(), POA_XLSX_PATH);
    return fs.readFile(resolvedPath);
  }

  if (POA_XLSX_URL) {
    const url = normalizeXlsxUrl(POA_XLSX_URL);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download xlsx: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error('XLSX source is not configured. Set POA_XLSX_URL or POA_XLSX_PATH');
};

const buildPoaRegistryFromXlsx = async () => {
  const buffer = await readWorkbookBuffer();
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
  const sheetTabs = getSheetTabs();
  const registry = {};

  for (const [airportName, tabTitle] of Object.entries(sheetTabs)) {
    const worksheet = workbook.Sheets[tabTitle];
    if (!worksheet) {
      throw new Error(`Sheet "${tabTitle}" not found in xlsx`);
    }

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });

    if (normalizeText(airportName).includes('шерем')) {
      registry[airportName] = parseSheremetyevoRows(rows);
    } else {
      registry[airportName] = parseNonSheremetyevoRows(rows);
    }
  }

  return registry;
};

// Exchange authorization code or refresh token with Google
app.post('/oauth/token', async (req, res) => {
  try {
    const { code, refresh_token } = req.body;
    const params = new URLSearchParams();

    if (code) {
      params.set('code', code);
      params.set('grant_type', 'authorization_code');
      params.set('redirect_uri', process.env.REDIRECT_URI || 'http://localhost:5173/');
    } else if (refresh_token) {
      params.set('grant_type', 'refresh_token');
      params.set('refresh_token', refresh_token);
    } else {
      return res.status(400).json({ error: 'missing_code_or_refresh_token' });
    }

    params.set('client_id', process.env.GOOGLE_CLIENT_ID || '');
    params.set('client_secret', process.env.GOOGLE_CLIENT_SECRET || '');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(tokenRes.status).json(data);
    }

    return res.json(data);
  } catch (err) {
    console.error('oauth proxy error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

app.get('/poa/cache', (req, res) => {
  const now = Date.now();
  const expiresAt = Number(poaCache.expiresAt || 0);
  const updatedAt = Number(poaCache.updatedAt || 0);

  return res.json({
    hasData: Boolean(poaCache.data),
    isExpired: !poaCache.data || now >= expiresAt,
    updatedAt,
    expiresAt,
    expiresInMs: Math.max(0, expiresAt - now),
    data: poaCache.data,
  });
});
app.get('/poa/registry', async (req, res) => {
  try {
    const forceReload = req.query.force === '1';
    if (!forceReload && poaCache.data && Date.now() < poaCache.expiresAt) {
      return res.json(poaCache.data);
    }

    const registry = await buildPoaRegistryFromXlsx();
    poaCache = {
      data: registry,
      updatedAt: Date.now(),
      expiresAt: Date.now() + POA_SYNC_TTL_MS,
    };

    return res.json(registry);
  } catch (error) {
    console.error('POA sync error:', error.message);
    return res.status(500).json({
      error: 'poa_sync_failed',
      details: error.message,
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`OAuth proxy listening on http://localhost:${port}`));
