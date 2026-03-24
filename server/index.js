require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const JSZip = require('jszip');
const { PNG } = require('pngjs');
const XLSX = require('xlsx');
const execFileAsync = promisify(execFile);

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
const allowAllOrigins = corsOrigins.includes('*');

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowAllOrigins || corsOrigins.includes(origin)) {
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
const CARGO_STATUS_TTL_MS = Number(process.env.CARGO_STATUS_TTL_MS || 300000);
const CARGO_CHECK_TIMEOUT_MS = Number(process.env.CARGO_CHECK_TIMEOUT_MS || 45000);
const CARGO_NAV_TIMEOUT_MS = Number(process.env.CARGO_NAV_TIMEOUT_MS || CARGO_CHECK_TIMEOUT_MS);
const CARGO_SCREENSHOTS_ENABLED = String(process.env.CARGO_SCREENSHOTS_ENABLED || 'true').toLowerCase() === 'true';
const TRIP_PDF_ENGINE = String(process.env.TRIP_PDF_ENGINE || '').trim().toLowerCase();
const TRIP_APPLICATION_TEMPLATE_PATH = (() => {
  const rawPath = String(process.env.TRIP_APPLICATION_TEMPLATE_PATH || './templates/STS order.docx').trim();
  if (!rawPath) {
    return path.resolve(__dirname, 'templates', 'STS order.docx');
  }
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(__dirname, rawPath);
})();
const MOSCOW_CARGO_URL = 'https://www.moscow-cargo.com/';
const SHER_CARGO_URL = 'https://www.shercargo.ru/it/free/';
const VNUKOVO_CARGO_URL = 'https://www.vnukovo.ru/ru/partneram/cargo/proverit-status-gruza/';
const DOMODEDOVO_CARGO_URL = 'https://business.dme.ru/cargo/';
const ZHUKOVSKY_CARGO_URL = 'https://www.aero-grad.ru/aircargo/info/ac_07.pub_info.main?p_lang=R';

const CARGO_TERMINAL_CONFIG = {
  svo_moscow: {
    key: 'svo_moscow',
    label: 'Москва-карго',
    url: MOSCOW_CARGO_URL,
    mode: 'moscow',
  },
  svo_sher: {
    key: 'svo_sher',
    label: 'Шереметьево-карго',
    url: SHER_CARGO_URL,
    mode: 'generic',
  },
  vko: {
    key: 'vko',
    label: 'Внуково',
    url: VNUKOVO_CARGO_URL,
    mode: 'generic',
  },
  dme: {
    key: 'dme',
    label: 'Домодедово',
    url: DOMODEDOVO_CARGO_URL,
    mode: 'generic',
  },
  zia: {
    key: 'zia',
    label: 'Жуковский',
    url: ZHUKOVSKY_CARGO_URL,
    mode: 'generic',
  },
};

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
const cargoStatusCache = new Map();
const cargoScreenshotStore = new Map();

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeAwb = (value) => String(value || '').replace(/\s+/g, '').trim();
const normalizeAwbPrefixPart = (value, maxLen) => String(value || '').replace(/\D/g, '').slice(0, maxLen);
const normalizeAwbNumberPart = (value, maxLen) => String(value || '').replace(/\s+/g, '').trim().slice(0, maxLen);
// eslint-disable-next-line no-control-regex
const stripAnsi = (value) => String(value || '').replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g, '');
const normalizeCargoErrorDetails = (error) => {
  const message = stripAnsi(error?.message || '').trim();
  if (!message) return 'Failed to check cargo status. Try again.';
  return message.length > 500 ? `${message.slice(0, 500)}...` : message;
};
const escapeHtml = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatTripDateRu = (rawDate) => {
  const value = String(rawDate || '').trim();
  if (!value) return '';
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
  }
  return value;
};

const buildTripApplicationPdfHtml = ({ trip, orders }) => {
  const rows = orders
    .map((order, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(order.name || order.recipient || 'Без названия')}</td>
        <td>${escapeHtml(order.awb || '-')}</td>
        <td>${escapeHtml(order.recipient || '-')}</td>
        <td>${escapeHtml(order.customsName || order.customsCode || '-')}</td>
        <td>${escapeHtml(order.quantity || '-')}</td>
        <td>${escapeHtml(order.weight || '-')}</td>
      </tr>
    `)
    .join('');

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <title>Заявка СТС</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { margin: 0; font-family: "Times New Roman", serif; color: #111; font-size: 13px; }
    .doc { width: 100%; }
    .title { text-align: center; font-size: 22px; font-weight: 700; margin-bottom: 14px; }
    .meta { margin-bottom: 12px; line-height: 1.5; }
    .meta-row { display: flex; gap: 10px; }
    .meta-key { min-width: 170px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #111; padding: 6px 7px; vertical-align: top; }
    th { text-align: left; font-weight: 700; }
    .signatures { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .sign-box { min-height: 90px; border-top: 1px solid #111; padding-top: 6px; }
    .muted { color: #444; font-size: 12px; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="doc">
    <div class="title">Заявка СТС</div>
    <div class="meta">
      <div class="meta-row"><div class="meta-key">Номер рейса:</div><div>${escapeHtml(trip.tripNumber || '-')}</div></div>
      <div class="meta-row"><div class="meta-key">Дата рейса:</div><div>${escapeHtml(formatTripDateRu(trip.tripDate) || '-')}</div></div>
      <div class="meta-row"><div class="meta-key">Автомобиль:</div><div>${escapeHtml(trip.carNumber || '-')}</div></div>
      <div class="meta-row"><div class="meta-key">Водитель:</div><div>${escapeHtml(trip.driverName || '-')}</div></div>
      <div class="meta-row"><div class="meta-key">Количество заказов:</div><div>${orders.length}</div></div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width: 34px;">№</th>
          <th>Заказ</th>
          <th>AWB</th>
          <th>Получатель</th>
          <th>Таможня назначения</th>
          <th style="width: 70px;">Мест</th>
          <th style="width: 70px;">Вес, кг</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <div class="signatures">
      <div>
        <div class="sign-box">Подпись ответственного</div>
        <div class="muted">ФИО, подпись, дата</div>
      </div>
      <div>
        <div class="sign-box">М.П.</div>
        <div class="muted">Печать</div>
      </div>
    </div>
  </div>
</body>
</html>`;
};

const generatePdfFromHtml = async (html) => {
  const playwright = getPlaywright();
  if (!playwright || !playwright.chromium) {
    const error = new Error('Playwright is not installed on server');
    error.code = 'playwright_missing';
    throw error;
  }

  const { chromium } = playwright;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' },
    });
  } finally {
    await browser.close();
  }
};

const generateTripPdfFromWordTemplate = async ({ templatePath, trip, orders }) => {
  const tempDir = path.join(os.tmpdir(), `trip-app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const tempDocxPath = path.join(tempDir, 'trip-application.docx');
  const tempPdfPath = path.join(tempDir, 'trip-application.pdf');
  await fs.mkdir(tempDir, { recursive: true });
  await fs.copyFile(templatePath, tempDocxPath);

  const payload = {
    tripNumber: String(trip.tripNumber || '').trim(),
    tripDate: formatTripDateRu(trip.tripDate),
    carNumber: String(trip.carNumber || '').trim(),
    driverName: String(trip.driverName || '').trim(),
    airport: String(orders[0]?.shipmentAirport || '').trim(),
    signerRole: String(trip.signerRole || 'Менеджер').trim(),
    signerName: String(trip.signerName || 'Косенко Д.В.').trim(),
    labels: {
      awbPrefix: '-авианакладная №',
      places: 'мест',
      kg: 'кг',
      customsPrefix: 'Таможня назначения -',
      notePrefix: 'Примечание:',
    },
    orders: orders.map((order) => ({
      name: String(order.name || order.recipient || 'Без названия').trim(),
      awb: String(order.awb || '').trim(),
      quantity: String(order.quantity || '').trim(),
      weight: String(order.weight || '').trim(),
      customsName: String(order.customsName || order.customsCode || '').trim(),
      customsCode: String(order.customsCode || '').trim(),
      notes: String(order.notes || '').trim(),
    })),
  };

  const payloadPath = path.join(tempDir, 'trip-application.payload.json');
  const psScriptPath = path.join(tempDir, 'trip-application.ps1');
  await fs.writeFile(payloadPath, JSON.stringify(payload), 'utf8');

  const psScript = `
param(
  [string]$payloadPath,
  [string]$tempDocxPath,
  [string]$tempPdfPath
)
$ErrorActionPreference = 'Stop'
$payloadBytes = [System.IO.File]::ReadAllBytes($payloadPath)
$payloadText = [System.Text.Encoding]::UTF8.GetString($payloadBytes)
$payload = $payloadText | ConvertFrom-Json

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $null

function Replace-InRange {
  param(
    [object]$range,
    [string]$searchText,
    [string]$replaceText
  )
  if (-not $range -or [string]::IsNullOrEmpty($searchText)) { return }
  $null = $range.Find.Execute(
    $searchText,
    $false, $false, $false, $false, $false,
    $true, 1, $false,
    [string]$replaceText,
    2
  )
}

try {
  $doc = $word.Documents.Open($tempDocxPath, $false, $false, $false)
  $wdExportFormatPDF = 17

  $fullRange = $doc.Range()
  Replace-InRange $fullRange '{{TRIP_NUMBER}}' $payload.tripNumber
  Replace-InRange $fullRange '{{TRIP_DATE}}' $payload.tripDate
  Replace-InRange $fullRange '{{AIRPORT}}' $payload.airport
  Replace-InRange $fullRange '{{CAR_NUMBER}}' $payload.carNumber
  Replace-InRange $fullRange '{{DRIVER_NAME}}' $payload.driverName

  Replace-InRange $fullRange '{{SIGNER_ROLE}}' $payload.signerRole
  Replace-InRange $fullRange '{{SIGNER_NAME}}' $payload.signerName
  Replace-InRange $fullRange '{{SIGNER_ROLE|Менеджер}}' $payload.signerRole
  Replace-InRange $fullRange '{{SIGNER_NAME|Косенко Д.В.}}' $payload.signerName

  $startPara = $null
  $endPara = $null
  for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
    $text = ($doc.Paragraphs.Item($i).Range.Text -replace '[\\r\\a]','').Trim()
    if (-not $startPara -and $text.Contains('{{ORDERS_START}}')) { $startPara = $doc.Paragraphs.Item($i) }
    if (-not $endPara -and $text.Contains('{{ORDERS_END}}')) { $endPara = $doc.Paragraphs.Item($i) }
  }

  if ($startPara -ne $null -and $endPara -ne $null -and $endPara.Range.Start -gt $startPara.Range.End) {
    $targetRange = $doc.Range($startPara.Range.End, $endPara.Range.Start)
    $lines = New-Object System.Collections.Generic.List[string]
    $index = 1
    foreach ($order in $payload.orders) {
      $lines.Add(("{0}.{1} {2} {3} - {4} {5} / {6} {7}," -f $index, $order.name, $payload.labels.awbPrefix, $order.awb, $order.quantity, $payload.labels.places, $order.weight, $payload.labels.kg))
      $lines.Add(("{0} {1} / {2}" -f $payload.labels.customsPrefix, $order.customsName, $order.customsCode))
      if (-not [string]::IsNullOrWhiteSpace([string]$order.notes)) {
        $lines.Add(("{0} {1}" -f $payload.labels.notePrefix, $order.notes))
      }
      $index++
    }
    $insertedText = if ($lines.Count -gt 0) { ($lines -join [Environment]::NewLine) + [Environment]::NewLine } else { '' }
    $targetRange.Text = $insertedText

    $startPara.Range.Text = ''
    $endPara.Range.Text = ''

    $ordersRange = $targetRange.Duplicate
    $orderIdx = 0
    foreach ($p in $ordersRange.Paragraphs) {
      $lineText = ($p.Range.Text -replace '[\\r\\a]','').Trim()
      if (-not $lineText) { continue }
      $isCustomsLine = $lineText.StartsWith([string]$payload.labels.customsPrefix, [System.StringComparison]::OrdinalIgnoreCase)
      $isNoteLine = $lineText.StartsWith([string]$payload.labels.notePrefix, [System.StringComparison]::OrdinalIgnoreCase)

      if (-not $isCustomsLine -and -not $isNoteLine -and $orderIdx -lt $payload.orders.Count) {
        $nameValue = [string]$payload.orders[$orderIdx].name
        $orderIdx++
        if ([string]::IsNullOrWhiteSpace($nameValue)) { continue }
        $p.Range.ParagraphFormat.LeftIndent = 0
        $p.Range.ParagraphFormat.FirstLineIndent = 0
        $p.Range.ParagraphFormat.SpaceAfter = 0
        $lineRange = $p.Range.Duplicate
        $lineRange.End = $lineRange.End - 1
        $recipientPos = $lineText.IndexOf($nameValue, [System.StringComparison]::OrdinalIgnoreCase)
        if ($recipientPos -ge 0) {
          $nameRange = $doc.Range($lineRange.Start + $recipientPos, $lineRange.Start + $recipientPos + $nameValue.Length)
          $nameRange.Bold = 1
        }
      }

      if ($isCustomsLine) {
        $p.Range.ParagraphFormat.LeftIndent = 32
        $p.Range.ParagraphFormat.FirstLineIndent = 0
        $p.Range.ParagraphFormat.SpaceAfter = 2
      } elseif ($isNoteLine) {
        $p.Range.ParagraphFormat.LeftIndent = 32
        $p.Range.ParagraphFormat.FirstLineIndent = 0
        $p.Range.ParagraphFormat.SpaceAfter = 8
      }
    }
  }

  $fullRangeAfter = $doc.Range()
  Replace-InRange $fullRangeAfter '{{ORDERS_START}}' ''
  Replace-InRange $fullRangeAfter '{{ORDERS_END}}' ''

  $doc.ExportAsFixedFormat($tempPdfPath, $wdExportFormatPDF)
}
finally {
  if ($doc -ne $null) {
    $doc.Close([ref]$false)
  }
  $word.Quit()
}
`;
  await fs.writeFile(psScriptPath, `\uFEFF${psScript}`, 'utf16le');

  try {
    const { stderr } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File',
      psScriptPath,
      '-payloadPath', payloadPath,
      '-tempDocxPath', tempDocxPath,
      '-tempPdfPath', tempPdfPath,
    ], { windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
    if (stderr && String(stderr).trim()) {
      throw new Error(String(stderr).trim());
    }
    const pdfBuffer = await fs.readFile(tempPdfPath);
    return pdfBuffer;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

const resolveTripPdfEngine = () => {
  if (TRIP_PDF_ENGINE === 'word' || TRIP_PDF_ENGINE === 'html') {
    return TRIP_PDF_ENGINE;
  }
  return process.platform === 'win32' ? 'word' : 'html';
};

const generateTripPdf = async ({ trip, orders }) => {
  const engine = resolveTripPdfEngine();
  if (engine === 'word') {
    return generateTripPdfFromWordTemplate({
      templatePath: TRIP_APPLICATION_TEMPLATE_PATH,
      trip,
      orders,
    });
  }
  const html = buildTripApplicationPdfHtml({ trip, orders });
  return generatePdfFromHtml(html);
};

const escapeXmlText = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeSplitPlaceholdersInXml = (xml) =>
  String(xml || '').replace(/\{\{[\s\S]*?\}\}/g, (segment) => segment.replace(/<[^>]+>/g, ''));

const findParagraphRangeByToken = (xml, token) => {
  const pattern = new RegExp(`<w:p[\\s\\S]*?${escapeRegExp(token)}[\\s\\S]*?<\\/w:p>`);
  const match = pattern.exec(xml);
  if (!match) return null;
  return { start: match.index, end: match.index + match[0].length };
};

const buildOrdersDocxParagraphs = (orders) => {
  const lines = [];
  orders.forEach((order, index) => {
    const name = String(order.name || order.recipient || 'Без названия').trim();
    const awb = String(order.awb || '').trim();
    const quantity = String(order.quantity || '').trim();
    const weight = String(order.weight || '').trim();
    const customsName = String(order.customsName || '').trim();
    const customsCode = String(order.customsCode || '').trim();
    const notes = String(order.notes || '').trim();
    lines.push(`${index + 1}. ${name} -авианакладная № ${awb} - ${quantity} мест / ${weight} кг,`);
    lines.push(`Таможня назначения - ${customsName} / ${customsCode}`);
    if (notes) {
      lines.push(`Примечание: ${notes}`);
    }
  });
  return lines
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXmlText(line)}</w:t></w:r></w:p>`)
    .join('');
};

const buildOrderTokenMap = (order, index) => {
  const recipient = String(order.name || order.recipient || 'Без названия').trim();
  const awb = String(order.awb || '').trim();
  const places = String(order.quantity || '').trim();
  const weight = String(order.weight || '').trim();
  const customsName = String(order.customsName || '').trim();
  const customsCode = String(order.customsCode || '').trim();
  const note = String(order.notes || '').trim();
  return new Map([
    ['{{N}}', String(index + 1)],
    ['{{RECIPIENT}}', recipient],
    ['{{AWB}}', awb],
    ['{{PLACES}}', places],
    ['{{WEIGHT}}', weight],
    ['{{CUSTOMS_NAME}}', customsName],
    ['{{CUSTOMS_CODE}}', customsCode],
    ['{{NOTE}}', note],
  ]);
};

const getParagraphEntries = (xml) => {
  const entries = [];
  const regex = /<w:p[\s\S]*?<\/w:p>/g;
  let match = regex.exec(xml);
  while (match) {
    entries.push({
      start: match.index,
      end: match.index + match[0].length,
      xml: match[0],
    });
    match = regex.exec(xml);
  }
  return entries;
};

const findParagraphEntryByToken = (entries, token, fromIndex = 0) =>
  entries.find((entry) => entry.start >= fromIndex && entry.xml.includes(token)) || null;

const expandOrderTemplateParagraph = (xml, orders) => {
  const entries = getParagraphEntries(xml);
  const mainEntry = entries.find((entry) => entry.xml.includes('{{N}}') && entry.xml.includes('{{RECIPIENT}}'));
  if (!mainEntry) return xml;

  const customsEntry = findParagraphEntryByToken(entries, '{{CUSTOMS_NAME}}', mainEntry.start);
  const noteEntry = findParagraphEntryByToken(entries, '{{NOTE}}', mainEntry.start);

  const blockTemplates = [mainEntry.xml];
  let blockEnd = mainEntry.end;

  if (customsEntry) {
    blockTemplates.push(customsEntry.xml);
    blockEnd = Math.max(blockEnd, customsEntry.end);
  }
  if (noteEntry) {
    blockTemplates.push(noteEntry.xml);
    blockEnd = Math.max(blockEnd, noteEntry.end);
  }

  const generatedBlocks = orders.map((order, index) => {
    const tokenMap = buildOrderTokenMap(order, index);
    return blockTemplates
      .map((templateParagraph) => {
        if (templateParagraph.includes('{{NOTE}}') && !String(order.notes || '').trim()) {
          return '';
        }
        let current = templateParagraph;
        tokenMap.forEach((value, token) => {
          current = current.replace(new RegExp(escapeRegExp(token), 'g'), escapeXmlText(value));
        });
        return current;
      })
      .filter(Boolean)
      .join('');
  });

  const spacerParagraph = '<w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>';
  const withSpacing = generatedBlocks
    .map((block, index) => (index < generatedBlocks.length - 1 ? `${block}${spacerParagraph}` : block))
    .join('');

  return `${xml.slice(0, mainEntry.start)}${withSpacing}${xml.slice(blockEnd)}`;
};

const generateTripDocxFromTemplate = async ({ templatePath, trip, orders }) => {
  const templateBuffer = await fs.readFile(templatePath);
  const zip = await JSZip.loadAsync(templateBuffer);
  const documentXmlFile = zip.file('word/document.xml');
  if (!documentXmlFile) {
    throw new Error('template_invalid_missing_document_xml');
  }

  let xml = await documentXmlFile.async('string');
  xml = normalizeSplitPlaceholdersInXml(xml);
  const replacements = new Map([
    ['{{TRIP_NUMBER}}', String(trip.tripNumber || '').trim()],
    ['{{TRIP_DATE}}', formatTripDateRu(trip.tripDate)],
    ['{{AIRPORT}}', String(orders[0]?.shipmentAirport || '').trim()],
    ['{{CAR_NUMBER}}', String(trip.carNumber || '').trim()],
    ['{{DRIVER_NAME}}', String(trip.driverName || '').trim()],
    ['{{SIGNER_ROLE}}', String(trip.signerRole || 'Менеджер').trim()],
    ['{{SIGNER_NAME}}', String(trip.signerName || 'Косенко Д.В.').trim()],
    ['{{SIGNER_ROLE|Менеджер}}', String(trip.signerRole || 'Менеджер').trim()],
    ['{{SIGNER_NAME|Косенко Д.В.}}', String(trip.signerName || 'Косенко Д.В.').trim()],
  ]);

  replacements.forEach((value, token) => {
    xml = xml.replace(new RegExp(escapeRegExp(token), 'g'), escapeXmlText(value));
  });

  const startRange = findParagraphRangeByToken(xml, '{{ORDERS_START}}');
  const endRange = findParagraphRangeByToken(xml, '{{ORDERS_END}}');
  const ordersParagraphs = buildOrdersDocxParagraphs(orders);
  if (startRange && endRange && startRange.start < endRange.start) {
    xml = `${xml.slice(0, startRange.start)}${ordersParagraphs}${xml.slice(endRange.end)}`;
  } else {
    xml = expandOrderTemplateParagraph(xml, orders);
    xml = xml.replace(new RegExp(escapeRegExp('{{ORDERS_TEXT}}'), 'g'), escapeXmlText(orders.map((o) => o.name || o.recipient || '').join(', ')));
  }

  xml = xml
    .replace(new RegExp(escapeRegExp('{{ORDERS_START}}'), 'g'), '')
    .replace(new RegExp(escapeRegExp('{{ORDERS_END}}'), 'g'), '')
    .replace(new RegExp(escapeRegExp('{{N}}'), 'g'), '')
    .replace(new RegExp(escapeRegExp('{{RECIPIENT}}'), 'g'), '')
    .replace(new RegExp(escapeRegExp('{{AWB}}'), 'g'), '')
    .replace(new RegExp(escapeRegExp('{{PLACES}}'), 'g'), '')
    .replace(new RegExp(escapeRegExp('{{WEIGHT}}'), 'g'), '')
    .replace(new RegExp(escapeRegExp('{{CUSTOMS_NAME}}'), 'g'), '')
    .replace(new RegExp(escapeRegExp('{{CUSTOMS_CODE}}'), 'g'), '')
    .replace(new RegExp(escapeRegExp('{{NOTE}}'), 'g'), '');

  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};

const getCargoCacheKey = ({ terminal, awb }) => `${normalizeText(terminal)}::${normalizeAwb(awb)}`;

const getPlaywright = () => {
  try {
    return require('playwright');
  } catch (error) {
    return null;
  }
};

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

const makeCargoScreenshotMeta = ({ awb, terminalKey = 'cargo' }) => {
  const safeAwb = String(awb || '').replace(/[^0-9A-Za-z_-]/g, '_') || 'unknown';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTerminalKey = String(terminalKey || 'cargo').replace(/[^0-9A-Za-z_-]/g, '_');
  const id = `${safeTerminalKey}-${safeAwb}-${stamp}`;
  const logsDir = path.resolve(__dirname, 'logs', 'cargo-status');
  const filePath = path.join(logsDir, `${id}.png`);
  return { id, logsDir, filePath };
};

const rememberCargoScreenshot = ({ id, filePath }) => {
  cargoScreenshotStore.set(id, filePath);
};

const removeCargoScreenshot = async (id) => {
  const fromStore = cargoScreenshotStore.get(id);
  const fallbackPath = path.resolve(__dirname, 'logs', 'cargo-status', `${id}.png`);
  const filePath = fromStore || fallbackPath;

  cargoScreenshotStore.delete(id);
  let removed = false;
  try {
    await fs.unlink(filePath);
    removed = true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  for (const [cacheKey, entry] of cargoStatusCache.entries()) {
    if (entry?.data?.screenshotId === id) {
      cargoStatusCache.delete(cacheKey);
    }
  }

  return removed;
};

const removeAllCargoScreenshots = async () => {
  const logsDir = path.resolve(__dirname, 'logs', 'cargo-status');
  let removed = 0;

  try {
    const files = await fs.readdir(logsDir);
    const pngFiles = files.filter((name) => name.toLowerCase().endsWith('.png'));
    await Promise.all(
      pngFiles.map(async (name) => {
        try {
          await fs.unlink(path.join(logsDir, name));
          removed += 1;
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error;
          }
        }
      }),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  cargoScreenshotStore.clear();

  for (const [cacheKey, entry] of cargoStatusCache.entries()) {
    if (entry?.data?.screenshotId) {
      cargoStatusCache.delete(cacheKey);
    }
  }

  return { removed };
};

const buildCargoScreenshotUrl = (id) => `/cargo/screenshot/${id}`;

const resolveCargoTerminalConfig = (terminalKeyRaw) => {
  const terminalKey = String(terminalKeyRaw || '').trim().toLowerCase();
  if (!terminalKey) return null;
  return CARGO_TERMINAL_CONFIG[terminalKey] || null;
};

const cropPngTop = (png, topPx) => {
  const cropTop = Math.max(0, Math.min(topPx, png.height - 1));
  if (cropTop === 0) return png;

  const cropped = new PNG({ width: png.width, height: png.height - cropTop });
  for (let y = cropTop; y < png.height; y += 1) {
    const srcStart = y * png.width * 4;
    const srcEnd = srcStart + (png.width * 4);
    const dstStart = (y - cropTop) * png.width * 4;
    png.data.copy(cropped.data, dstStart, srcStart, srcEnd);
  }
  return cropped;
};

const stitchPngSegments = (segments) => {
  const width = Math.max(...segments.map((segment) => segment.png.width));
  const height = segments.reduce((sum, segment) => sum + segment.png.height, 0);
  const merged = new PNG({ width, height });
  let cursorY = 0;

  segments.forEach((segment) => {
    const { png } = segment;
    for (let y = 0; y < png.height; y += 1) {
      const srcStart = y * png.width * 4;
      const srcEnd = srcStart + (png.width * 4);
      const dstStart = ((cursorY + y) * width * 4);
      png.data.copy(merged.data, dstStart, srcStart, srcEnd);
    }
    cursorY += png.height;
  });

  return PNG.sync.write(merged);
};

const captureMoscowCargoResultScreenshot = async ({ page, awb, terminalKey = 'cargo' }) => {
  if (!CARGO_SCREENSHOTS_ENABLED) {
    return {
      screenshotId: '',
      screenshotUrl: '',
    };
  }

  const meta = makeCargoScreenshotMeta({ awb, terminalKey });
  await fs.mkdir(meta.logsDir, { recursive: true });

  const targetInfo = await page.evaluate(() => {
    const hasVisibleBox = (el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 300 || rect.height < 200) return false;
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      return true;
    };

    const scoreElement = (el) => {
      if (!hasVisibleBox(el)) return -1;
      if (el.scrollHeight <= el.clientHeight + 20) return -1;
      const text = (el.innerText || '').toLowerCase();
      let score = 0;
      if (text.includes('история обработки груза')) score += 15;
      if (text.includes('параметры авианакладной')) score += 12;
      if (text.includes('таможенная информация')) score += 8;
      if (text.includes('дата awb')) score += 5;
      score += Math.min(el.scrollHeight / 500, 15);
      score += Math.min(el.clientHeight / 300, 5);
      return score;
    };

    const candidates = Array.from(document.querySelectorAll('div,section,article,main'));
    let best = null;
    let bestScore = -1;

    candidates.forEach((el) => {
      const score = scoreElement(el);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    });

    if (!best) return null;
    best.setAttribute('data-cargo-capture-target', '1');
    const rect = best.getBoundingClientRect();
    return {
      scrollHeight: best.scrollHeight,
      clientHeight: best.clientHeight,
      clip: {
        x: Math.max(0, rect.left),
        y: Math.max(0, rect.top),
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      },
    };
  });

  if (!targetInfo) {
    await page.screenshot({ path: meta.filePath, fullPage: true });
    rememberCargoScreenshot({ id: meta.id, filePath: meta.filePath });
    return {
      screenshotId: meta.id,
      screenshotUrl: buildCargoScreenshotUrl(meta.id),
    };
  }

  const scrollHeight = Number(targetInfo.scrollHeight || 0);
  const clientHeight = Number(targetInfo.clientHeight || 0);
  const clip = targetInfo.clip;
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  const offsets = [0];
  if (maxScroll > 0 && clientHeight > 0) {
    let next = clientHeight;
    while (next < maxScroll) {
      offsets.push(next);
      next += clientHeight;
    }
    offsets.push(maxScroll);
  }

  const buffers = [];
  for (const offset of offsets) {
    await page.evaluate((value) => {
      const target = document.querySelector('[data-cargo-capture-target="1"]');
      if (target) target.scrollTop = value;
    }, offset);
    await page.waitForTimeout(120);
    const frameBuffer = await page.screenshot({ clip });
    buffers.push({ offset, buffer: frameBuffer });
  }

  await page.evaluate(() => {
    const target = document.querySelector('[data-cargo-capture-target="1"]');
    if (target) target.removeAttribute('data-cargo-capture-target');
  });

  const segments = [];
  for (let i = 0; i < buffers.length; i += 1) {
    const current = buffers[i];
    const png = PNG.sync.read(current.buffer);
    if (i === 0) {
      segments.push({ png });
      continue;
    }

    const prevOffset = buffers[i - 1].offset;
    const overlap = Math.max(0, (prevOffset + clientHeight) - current.offset);
    segments.push({ png: cropPngTop(png, overlap) });
  }

  const mergedBuffer = stitchPngSegments(segments);
  await fs.writeFile(meta.filePath, mergedBuffer);
  rememberCargoScreenshot({ id: meta.id, filePath: meta.filePath });

  return {
    screenshotId: meta.id,
    screenshotUrl: buildCargoScreenshotUrl(meta.id),
  };
};

const fillGenericAwbInputs = async ({ page, awb, awbParts }) => {
  const inputs = page.locator('input:not([type="hidden"])');
  const count = await inputs.count();
  const resolvedAwbParts = awbParts || splitAwbParts(awb);
  let firstIndex = -1;
  let secondIndex = -1;
  let oneFieldIndex = -1;

  for (let i = 0; i < count; i += 1) {
    const input = inputs.nth(i);
    try {
      if (!(await input.isVisible())) continue;
      if (!(await input.isEditable())) continue;
      const type = ((await input.getAttribute('type')) || '').toLowerCase();
      const name = ((await input.getAttribute('name')) || '').toLowerCase();
      const id = ((await input.getAttribute('id')) || '').toLowerCase();
      const placeholder = ((await input.getAttribute('placeholder')) || '').toLowerCase();
      const hint = `${type} ${name} ${id} ${placeholder}`;

      if (/(date|email|password|tel)/.test(type)) continue;
      if (hint.includes('prefix') || hint.includes('преф') || hint.includes('code')) {
        if (firstIndex === -1) firstIndex = i;
      } else if (hint.includes('number') || hint.includes('номер') || hint.includes('awb') || hint.includes('наклад')) {
        if (oneFieldIndex === -1) oneFieldIndex = i;
        if (secondIndex === -1) secondIndex = i;
      } else if (oneFieldIndex === -1 && (type === 'text' || type === 'search' || type === '')) {
        oneFieldIndex = i;
      }
    } catch (error) {
      // Ignore and continue.
    }
  }

  if (resolvedAwbParts && firstIndex >= 0 && secondIndex >= 0 && firstIndex !== secondIndex) {
    await inputs.nth(firstIndex).fill('');
    await inputs.nth(secondIndex).fill('');
    await inputs.nth(firstIndex).fill(resolvedAwbParts.prefix);
    await inputs.nth(secondIndex).fill(resolvedAwbParts.number);
    return true;
  }

  if (oneFieldIndex >= 0) {
    await inputs.nth(oneFieldIndex).fill('');
    await inputs.nth(oneFieldIndex).fill(awb);
    return true;
  }

  return false;
};

const clickGenericSearchButton = async (page) => {
  const buttonTexts = ['провер', 'найти', 'поиск', 'статус', 'search', 'check'];
  const buttons = page.locator('button, input[type="submit"], input[type="button"]');
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    try {
      if (!(await button.isVisible())) continue;
      const text = (((await button.innerText()) || '') + ' ' + ((await button.getAttribute('value')) || '')).toLowerCase();
      if (buttonTexts.some((token) => text.includes(token))) {
        await button.click({ timeout: 5000 });
        return true;
      }
    } catch (error) {
      // Ignore.
    }
  }
  return false;
};

const fillFirstVisibleBySelectors = async (page, selectors, value) => {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (!(await locator.count())) continue;
      if (!(await locator.isVisible())) continue;
      if (!(await locator.isEditable())) continue;
      await locator.fill('');
      await locator.fill(value);
      return true;
    } catch (error) {
      // Try next selector.
    }
  }
  return false;
};

const clickFirstVisibleBySelectors = async (page, selectors) => {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (!(await locator.count())) continue;
      if (!(await locator.isVisible())) continue;
      await locator.click({ timeout: 5000 });
      return true;
    } catch (error) {
      // Try next selector.
    }
  }
  return false;
};

const readInputDigits = async (locator) => String((await locator.inputValue()) || '').replace(/\D/g, '');
const readInputCompactText = async (locator) => String((await locator.inputValue()) || '').replace(/\s+/g, '').trim();

const fillInputDigitsRobust = async (locator, value, options = {}) => {
  const target = String(value || '').replace(/\D/g, '');
  if (!target) return true;

  const {
    maxAttempts = 3,
    typeDelay = 35,
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await locator.click({ clickCount: 3, timeout: 3000 }).catch(() => {});
      await locator.press('ControlOrMeta+a').catch(() => {});
      await locator.press('Backspace').catch(() => {});
      await locator.fill('').catch(() => {});
      await locator.type(target, { delay: typeDelay }).catch(async () => {
        await locator.fill(target);
      });
      await locator.dispatchEvent('input').catch(() => {});
      await locator.dispatchEvent('change').catch(() => {});
      await locator.blur().catch(() => {});
    } catch (error) {
      // Try JS fallback below.
    }

    let actual = '';
    try {
      actual = await readInputDigits(locator);
    } catch (error) {
      actual = '';
    }
    if (actual === target) return true;

    try {
      await locator.evaluate((element, nextValue) => {
        element.focus();
        element.value = nextValue;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.blur();
      }, target);
    } catch (error) {
      // Ignore and retry if attempts remain.
    }

    actual = await readInputDigits(locator).catch(() => '');
    if (actual === target) return true;
  }

  return false;
};

const fillInputTextRobust = async (locator, value, options = {}) => {
  const target = String(value || '').replace(/\s+/g, '').trim();
  const {
    maxAttempts = 3,
    typeDelay = 35,
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await locator.click({ clickCount: 3, timeout: 3000 }).catch(() => {});
      await locator.press('ControlOrMeta+a').catch(() => {});
      await locator.press('Backspace').catch(() => {});
      await locator.fill('').catch(() => {});
      if (target) {
        await locator.type(target, { delay: typeDelay }).catch(async () => {
          await locator.fill(target);
        });
      }
      await locator.dispatchEvent('input').catch(() => {});
      await locator.dispatchEvent('change').catch(() => {});
      await locator.blur().catch(() => {});
    } catch (error) {
      // Try JS fallback below.
    }

    let actual = '';
    try {
      actual = await readInputCompactText(locator);
    } catch (error) {
      actual = '';
    }
    if (actual === target) return true;

    try {
      await locator.evaluate((element, nextValue) => {
        element.focus();
        element.value = nextValue;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.blur();
      }, target);
    } catch (error) {
      // Ignore and retry if attempts remain.
    }

    actual = await readInputCompactText(locator).catch(() => '');
    if (actual === target) return true;
  }

  return false;
};

const fillSplitAwbInputsRobust = async ({ firstInput, secondInput, prefix, number, typeDelay = 35 }) => {
  const normalizedPrefix = String(prefix || '').replace(/\D/g, '');
  const normalizedNumber = String(number || '').replace(/\s+/g, '').trim();

  const prefixOk = normalizedPrefix
    ? await fillInputDigitsRobust(firstInput, normalizedPrefix, { typeDelay })
    : await fillInputTextRobust(firstInput, '', { typeDelay });
  if (!prefixOk) return false;

  const numberOk = await fillInputTextRobust(secondInput, normalizedNumber, { typeDelay });
  if (!numberOk) return false;

  const firstVal = normalizedPrefix
    ? await readInputDigits(firstInput).catch(() => '')
    : await readInputCompactText(firstInput).catch(() => '');
  const secondVal = await readInputCompactText(secondInput).catch(() => '');
  return firstVal === normalizedPrefix && secondVal === normalizedNumber;
};
const searchShercargoStatus = async ({ page, awb, awbParts }) => {
  const resolvedAwbParts = awbParts || splitAwbParts(awb);

  const tryContext = async (ctx) => {
    const inputs = ctx.locator('input[type="text"], input[type="search"], input[type="tel"], input:not([type])');
    const count = await inputs.count();
    const visible = [];

    for (let i = 0; i < count; i += 1) {
      const input = inputs.nth(i);
      try {
        if (!(await input.isVisible())) continue;
        if (!(await input.isEditable())) continue;
        const box = await input.boundingBox();
        if (!box || box.width < 20 || box.height < 12) continue;
        const maxLength = Number((await input.getAttribute('maxlength')) || '0');
        visible.push({ input, box, maxLength });
      } catch (error) {
        // Ignore.
      }
    }

    if (visible.length < 2 || !resolvedAwbParts) return false;

    visible.sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
    const pair = (() => {
      for (let i = 0; i < visible.length - 1; i += 1) {
        for (let j = i + 1; j < visible.length; j += 1) {
          const dy = Math.abs(visible[i].box.y - visible[j].box.y);
          const dx = Math.abs(visible[i].box.x - visible[j].box.x);
          if (dy <= 40 && dx <= 500) return [visible[i], visible[j]];
        }
      }
      return [visible[0], visible[1]];
    })();

    let first = pair[0];
    let second = pair[1];
    if (first.box.x > second.box.x) {
      [first, second] = [second, first];
    }
    if (first.maxLength >= 6 && second.maxLength > 0 && second.maxLength <= 4) {
      [first, second] = [second, first];
    }

    const typed = await fillSplitAwbInputsRobust({
      firstInput: first.input,
      secondInput: second.input,
      prefix: resolvedAwbParts.prefix,
      number: resolvedAwbParts.number,
      typeDelay: 40,
    });
    if (!typed) return false;

    const searchButton = ctx.locator(
      'button[aria-label*="search" i], button[title*="search" i], button:has(i), button:has(svg), button[class*="search" i], input[type="submit"], input[type="button"], button',
    );
    const bCount = await searchButton.count();
    for (let i = 0; i < bCount; i += 1) {
      const btn = searchButton.nth(i);
      try {
        if (!(await btn.isVisible())) continue;
        const box = await btn.boundingBox();
        if (!box) continue;
        const nearY = Math.abs(box.y - second.box.y) <= 80;
        const nearX = box.x >= second.box.x - 40 && box.x <= second.box.x + 260;
        if (nearY && nearX) {
          await btn.click({ timeout: 5000 });
          return true;
        }
      } catch (error) {
        // Try next.
      }
    }

    await second.input.press('Enter').catch(() => {});
    return true;
  };

  if (await tryContext(page)) return true;
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    if (await tryContext(frame)) return true;
  }

  const awbSelectors = [
    'input[name*="awb" i]',
    'input[id*="awb" i]',
    'input[placeholder*="awb" i]',
    'input[placeholder*="наклад" i]',
    'input[name*="cargo" i]',
    'input[type="text"]',
    'input[type="search"]',
  ];
  const buttonSelectors = [
    'button:has-text("Провер")',
    'button:has-text("Найти")',
    'button:has-text("Search")',
    'input[type="submit"]',
    'input[type="button"]',
  ];

  const filled = await fillFirstVisibleBySelectors(page, awbSelectors, awb);
  if (!filled) return false;
  const clicked = await clickFirstVisibleBySelectors(page, buttonSelectors);
  if (!clicked) {
    const firstInput = page.locator('input:not([type="hidden"])').first();
    if (await firstInput.count()) {
      await firstInput.press('Enter').catch(() => {});
    }
  }
  return true;
};

const searchVnukovoStatus = async ({ page, awb, awbParts }) => {
  const resolvedAwbParts = awbParts || splitAwbParts(awb);

  const trySplitInputs = async () => {
    const inputs = page.locator('input[type="text"], input[type="search"], input[type="tel"], input:not([type])');
    const count = await inputs.count();
    const visible = [];

    for (let i = 0; i < count; i += 1) {
      const input = inputs.nth(i);
      try {
        if (!(await input.isVisible())) continue;
        if (!(await input.isEditable())) continue;
        const box = await input.boundingBox();
        if (!box || box.width < 25 || box.height < 14) continue;
        visible.push({ input, box });
      } catch (error) {
        // Ignore.
      }
    }

    if (visible.length < 2 || !resolvedAwbParts) return false;

    visible.sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
    let pair = null;
    for (let i = 0; i < visible.length - 1; i += 1) {
      for (let j = i + 1; j < visible.length; j += 1) {
        const dy = Math.abs(visible[i].box.y - visible[j].box.y);
        const dx = Math.abs(visible[i].box.x - visible[j].box.x);
        if (dy <= 50 && dx <= 900) {
          pair = [visible[i], visible[j]];
          break;
        }
      }
      if (pair) break;
    }
    if (!pair) pair = [visible[0], visible[1]];

    let first = pair[0];
    let second = pair[1];
    if (first.box.x > second.box.x) {
      [first, second] = [second, first];
    }

    const typed = await fillSplitAwbInputsRobust({
      firstInput: first.input,
      secondInput: second.input,
      prefix: resolvedAwbParts.prefix,
      number: resolvedAwbParts.number,
      typeDelay: 40,
    });
    if (!typed) return false;

    return true;
  };

  const splitFilled = await trySplitInputs();
  if (splitFilled) {
    const clicked = await clickFirstVisibleBySelectors(page, [
      'button:has-text("Проверить")',
      'button:has-text("Провер")',
      'button:has-text("Узнать")',
      'button:has-text("Найти")',
      'input[type="submit"]',
      'input[type="button"]',
    ]);
    if (!clicked) {
      const input = page.locator('input:not([type="hidden"])').nth(1);
      if (await input.count()) {
        await input.press('Enter').catch(() => {});
      }
    }
    return true;
  }

  const awbSelectors = [
    'input[name*="awb" i]',
    'input[id*="awb" i]',
    'input[placeholder*="наклад" i]',
    'input[placeholder*="awb" i]',
    'input[type="text"]',
    'input[type="search"]',
  ];
  const buttonSelectors = [
    'button:has-text("Провер")',
    'button:has-text("Узнать")',
    'button:has-text("Найти")',
    'input[type="submit"]',
    'input[type="button"]',
  ];

  const filled = await fillFirstVisibleBySelectors(page, awbSelectors, awb);
  if (!filled) return false;
  const clicked = await clickFirstVisibleBySelectors(page, buttonSelectors);
  if (!clicked) {
    const firstInput = page.locator('input:not([type="hidden"])').first();
    if (await firstInput.count()) {
      await firstInput.press('Enter').catch(() => {});
    }
  }
  return true;
};

const searchDomodedovoStatus = async ({ page, awb, awbParts }) => {
  const resolvedAwbParts = awbParts || splitAwbParts(awb);

  const tryCargoPanel = async () => {
    if (!resolvedAwbParts) return false;
    const payload = await page.evaluate(() => {
      const textMatch = (value, pattern) => pattern.test((value || '').toLowerCase());
      const isVisible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        return true;
      };

      const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,div,span,strong,p'))
        .filter((el) => textMatch(el.textContent, /информация\s+о\s+грузе/));

      for (const heading of headings) {
        let node = heading;
        for (let depth = 0; depth < 8 && node; depth += 1) {
          const inputs = Array.from(node.querySelectorAll('input')).filter((input) => {
            const type = (input.getAttribute('type') || '').toLowerCase();
            return (!type || type === 'text' || type === 'search' || type === 'tel') && isVisible(input);
          });
          const buttons = Array.from(node.querySelectorAll('button,input[type="submit"],input[type="button"]'))
            .filter((button) => isVisible(button));
          const hasCargoButton = buttons.some((button) => textMatch(button.textContent || button.value, /показать\s+информац/));
          if (inputs.length >= 2 && hasCargoButton) {
            return true;
          }
          node = node.parentElement;
        }
      }
      return false;
    });
    if (!payload) return false;

    // Prefer exact placeholders from DME cargo widget.
    let prefixInput = page.locator('input[placeholder="123"]').first();
    let numberInput = page.locator('input[placeholder="12345678"]').first();

    let useFallbackInputs = false;
    if (!(await prefixInput.count()) || !(await numberInput.count())) {
      useFallbackInputs = true;
    }
    if (!useFallbackInputs) {
      try {
        if (!(await prefixInput.isVisible()) || !(await numberInput.isVisible())) {
          useFallbackInputs = true;
        }
      } catch (error) {
        useFallbackInputs = true;
      }
    }

    if (useFallbackInputs) {
      const inputs = page.locator('input[type="text"], input[type="search"], input[type="tel"], input:not([type])');
      const count = await inputs.count();
      const visible = [];
      for (let i = 0; i < count; i += 1) {
        const input = inputs.nth(i);
        try {
          if (!(await input.isVisible())) continue;
          if (!(await input.isEditable())) continue;
          const box = await input.boundingBox();
          if (!box || box.width < 20 || box.height < 12) continue;
          visible.push({ input, box });
        } catch (error) {
          // Ignore.
        }
      }
      if (visible.length < 2) return false;
      visible.sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
      let first = visible[0];
      let second = visible[1];
      if (first.box.x > second.box.x) [first, second] = [second, first];
      prefixInput = first.input;
      numberInput = second.input;
    }

    const typed = await fillSplitAwbInputsRobust({
      firstInput: prefixInput,
      secondInput: numberInput,
      prefix: resolvedAwbParts.prefix,
      number: resolvedAwbParts.number,
      typeDelay: 40,
    });
    if (!typed) return false;

    const clickedInfo = await clickFirstVisibleBySelectors(page, [
      'button:has-text("Показать информацию")',
      'input[type="submit"][value*="Показать информацию"]',
      'input[type="button"][value*="Показать информацию"]',
    ]);
    if (clickedInfo) return true;

    const clickedGeneric = await clickFirstVisibleBySelectors(page, [
      'button:has-text("Показать")',
      'input[type="submit"]',
      'input[type="button"]',
    ]);
    if (clickedGeneric) return true;

    await numberInput.press('Enter').catch(() => {});
    return true;
  };

  const panelSubmitted = await tryCargoPanel();
  if (panelSubmitted) return true;

  const awbSelectors = [
    'input[name*="awb" i]',
    'input[id*="awb" i]',
    'input[placeholder*="наклад" i]',
    'input[placeholder*="awb" i]',
    'input[type="text"]',
    'input[type="search"]',
  ];
  const buttonSelectors = [
    'button:has-text("Провер")',
    'button:has-text("Найти")',
    'button:has-text("Search")',
    'input[type="submit"]',
    'input[type="button"]',
  ];

  const filled = await fillFirstVisibleBySelectors(page, awbSelectors, awb);
  if (!filled) return false;
  const clicked = await clickFirstVisibleBySelectors(page, buttonSelectors);
  if (!clicked) {
    const firstInput = page.locator('input:not([type="hidden"])').first();
    if (await firstInput.count()) {
      await firstInput.press('Enter').catch(() => {});
    }
  }
  return true;
};

const searchZhukovskyStatus = async ({ page, awb, awbParts }) => {
  const resolvedAwbParts = awbParts || splitAwbParts(awb);

  const trySplitInputs = async () => {
    if (!resolvedAwbParts) return false;

    const panel = page.locator('div, section, form').filter({ hasText: 'Номер накладной' }).first();
    if (!(await panel.count())) return false;

    const inputs = panel.locator('input[type="text"], input[type="search"], input[type="tel"], input:not([type])');
    const count = await inputs.count();
    const visible = [];
    for (let i = 0; i < count; i += 1) {
      const input = inputs.nth(i);
      try {
        if (!(await input.isVisible())) continue;
        if (!(await input.isEditable())) continue;
        const box = await input.boundingBox();
        if (!box || box.width < 20 || box.height < 12) continue;
        visible.push({ input, box });
      } catch (error) {
        // Ignore.
      }
    }

    if (visible.length < 2) return false;
    visible.sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
    let first = visible[0];
    let second = visible[1];
    if (first.box.x > second.box.x) {
      [first, second] = [second, first];
    }

    const typed = await fillSplitAwbInputsRobust({
      firstInput: first.input,
      secondInput: second.input,
      prefix: resolvedAwbParts.prefix,
      number: resolvedAwbParts.number,
      typeDelay: 35,
    });
    if (!typed) return false;

    const clicked = await clickFirstVisibleBySelectors(page, [
      'button:has-text("Поиск")',
      'input[type="submit"][value*="Поиск"]',
      'input[type="button"][value*="Поиск"]',
      'button:has-text("Найти")',
    ]);
    if (!clicked) {
      await second.input.press('Enter').catch(() => {});
    }
    return true;
  };

  const splitFilled = await trySplitInputs();
  if (splitFilled) return true;

  const awbSelectors = [
    'input[name*="awb" i]',
    'input[id*="awb" i]',
    'input[name*="nn" i]',
    'input[name*="num" i]',
    'input[placeholder*="наклад" i]',
    'input[type="text"]',
    'input[type="search"]',
  ];
  const buttonSelectors = [
    'button:has-text("Провер")',
    'button:has-text("Найти")',
    'button:has-text("Показ")',
    'input[type="submit"]',
    'input[type="button"]',
  ];

  const filled = await fillFirstVisibleBySelectors(page, awbSelectors, awb);
  if (!filled) return false;
  const clicked = await clickFirstVisibleBySelectors(page, buttonSelectors);
  if (!clicked) {
    const firstInput = page.locator('input:not([type="hidden"])').first();
    if (await firstInput.count()) {
      await firstInput.press('Enter').catch(() => {});
    }
  }
  return true;
};

const runSpecificTerminalSearch = async ({ page, awb, awbParts, terminalConfig }) => {
  if (terminalConfig.key === 'svo_sher') {
    return searchShercargoStatus({ page, awb, awbParts });
  }
  if (terminalConfig.key === 'vko') {
    return searchVnukovoStatus({ page, awb, awbParts });
  }
  if (terminalConfig.key === 'dme') {
    return searchDomodedovoStatus({ page, awb, awbParts });
  }
  if (terminalConfig.key === 'zia') {
    return searchZhukovskyStatus({ page, awb, awbParts });
  }
  return false;
};

const openCargoPageRobust = async (page, url) => {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CARGO_NAV_TIMEOUT_MS });
    return;
  } catch (error) {
    if (!/timeout/i.test(String(error?.message || ''))) {
      throw error;
    }
  }

  await page.goto(url, {
    waitUntil: 'commit',
    timeout: Math.min(CARGO_NAV_TIMEOUT_MS, 20000),
  });
  await page.waitForLoadState('domcontentloaded', { timeout: 12000 }).catch(() => {});
};

const scrapeGenericCargoStatus = async ({ awb, awbParts, terminalConfig }) => {
  const playwright = getPlaywright();
  if (!playwright || !playwright.chromium) {
    const error = new Error('Playwright is not installed on server');
    error.code = 'playwright_missing';
    throw error;
  }

  const { chromium } = playwright;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'ru-RU' });
  const page = await context.newPage();
  const checkedAt = Date.now();

  try {
    await openCargoPageRobust(page, terminalConfig.url);
    await page.waitForTimeout(1200);

    let submitted = await runSpecificTerminalSearch({ page, awb, awbParts, terminalConfig });
    if (!submitted) {
      const awbFilled = await fillGenericAwbInputs({ page, awb, awbParts });
      if (awbFilled) {
        submitted = await clickGenericSearchButton(page);
        if (!submitted) {
          const input = page.locator('input:not([type="hidden"])').first();
          if (await input.count()) {
            await input.press('Enter').catch(() => {});
            submitted = true;
          }
        }
      }
    }

    if (submitted) {
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    if (terminalConfig.key === 'vko') {
      const manualRequired = await detectVnukovoManualCheck(page);
      if (manualRequired) {
        const screenshot = await captureMoscowCargoResultScreenshot({ page, awb, terminalKey: terminalConfig.key });
        return {
          terminal: terminalConfig.label,
          awb,
          statusText: '',
          tables: [],
          checkedAt,
          sourceUrl: terminalConfig.url,
          screenshotId: screenshot.screenshotId,
          screenshotUrl: screenshot.screenshotUrl,
          manualRequired: true,
          manualMessage: 'Требуется ручная проверка на сайте Внуково.',
          manualUrl: terminalConfig.url,
        };
      }
    }

    const statusText = await extractMoscowCargoStatusText(page);
    const screenshot = await captureMoscowCargoResultScreenshot({ page, awb, terminalKey: terminalConfig.key });

    return {
      terminal: terminalConfig.label,
      awb,
      statusText,
      tables: [],
      checkedAt,
      sourceUrl: terminalConfig.url,
      screenshotId: screenshot.screenshotId,
      screenshotUrl: screenshot.screenshotUrl,
    };
  } catch (error) {
    if (CARGO_SCREENSHOTS_ENABLED) {
      const logsDir = path.resolve(__dirname, 'logs', 'cargo-status');
      await fs.mkdir(logsDir, { recursive: true });
      const safeAwb = awb.replace(/[^0-9A-Za-z_-]/g, '_') || 'unknown';
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = path.join(logsDir, `generic-cargo-${terminalConfig.key}-${safeAwb}-${stamp}.png`);
      try {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        error.screenshotPath = screenshotPath;
      } catch (screenshotError) {
        // Keep original error.
      }
    }
    throw error;
  } finally {
    await browser.close();
  }
};

const findHeaderIndex = (headers, predicate, fallback) => {
  const idx = headers.findIndex(predicate);
  return idx >= 0 ? idx : fallback;
};

const POA_KEY_MOSCOW_CARGO = '\u041c\u043e\u0441\u043a\u0432\u0430-\u043a\u0430\u0440\u0433\u043e';
const POA_KEY_SHER_CARGO = '\u0428\u0435\u0440\u0435\u043c\u0435\u0442\u044c\u0435\u0432\u043e-\u043a\u0430\u0440\u0433\u043e';

const normalizePlusValue = (value) => {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.includes('+')) return '+';
  if (['\u0434\u0430', 'yes', 'true', '1'].includes(text)) return '+';
  return '';
};

const getCell = (row, idx) => (idx >= 0 ? (row[idx] || '').toString().trim() : '');

const isSheremetyevoSheet = ({ airportName, tabTitle, rows }) => {
  const airport = normalizeText(airportName);
  const tab = normalizeText(tabTitle);
  const header = normalizeText((rows?.[0] || []).join(' '));

  if (airport.includes('\u0448\u0435\u0440\u0435\u043c\u0435\u0442')) return true;
  if (tab.includes('\u0448\u0435\u0440\u0435\u043c\u0435\u0442')) return true;
  if (header.includes('\u043c\u043e\u0441\u043a') && header.includes('\u0448\u0435\u0440\u0435\u043c\u0435\u0442') && header.includes('\u043a\u0430\u0440\u0433\u043e')) return true;

  return false;
};

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
  const result = { [POA_KEY_MOSCOW_CARGO]: [], [POA_KEY_SHER_CARGO]: [] };
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

    result[POA_KEY_MOSCOW_CARGO].push({
      recipient,
      hasAttorney: normalizePlusValue(getCell(row, moscowPlusIdx)),
      validUntil: getCell(row, sheremetyevoValidUntilIdx),
    });

    result[POA_KEY_SHER_CARGO].push({
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

    if (isSheremetyevoSheet({ airportName, tabTitle, rows })) {
      registry[airportName] = parseSheremetyevoRows(rows);
    } else {
      registry[airportName] = parseNonSheremetyevoRows(rows);
    }
  }

  return registry;
};

const splitAwbParts = (awbRaw) => {
  const raw = String(awbRaw || '').trim();
  if (!raw) return null;

  const direct = raw.match(/^(\d{3})\D+(.+)$/);
  if (direct) {
    return { prefix: direct[1], number: String(direct[2] || '').replace(/\s+/g, '').trim() };
  }
  return null;
};

const resolveMoscowCargoTrackingWidget = async (page) => {
  const containers = page.locator('form, section, div');
  const total = await containers.count();
  const limit = Math.min(total, 300);

  for (let i = 0; i < limit; i += 1) {
    const container = containers.nth(i);
    try {
      if (!(await container.isVisible())) continue;
    } catch (error) {
      continue;
    }

    const textInputs = container.locator('input[type="text"], input[type="search"], input:not([type])');
    if ((await textInputs.count()) < 2) continue;

    let containerText = '';
    try {
      containerText = (await container.innerText()).toLowerCase();
    } catch (error) {
      // Ignore text read errors.
    }
    if (!containerText.includes('awb') && !containerText.includes('наклад')) continue;

    const hasActionButton =
      (await container.locator('button').count()) > 0 ||
      (await container.locator('input[type="submit"]').count()) > 0;
    if (!hasActionButton) continue;

    return { container, textInputs };
  }

  return null;
};

const fillMoscowCargoAwbInputs = async (widget, awbParts) => {
  const firstInput = widget.textInputs.nth(0);
  const secondInput = widget.textInputs.nth(1);

  const typed = await fillSplitAwbInputsRobust({
    firstInput,
    secondInput,
    prefix: awbParts.prefix,
    number: awbParts.number,
    typeDelay: 35,
  });
  if (!typed) {
    const error = new Error('Failed to fill AWB inputs in tracking widget');
    error.code = 'awb_fill_failed';
    throw error;
  }
};

const triggerMoscowCargoSearch = async (widget) => {
  const buttons = widget.container.locator('button');
  const buttonCount = await buttons.count();
  for (let i = 0; i < buttonCount; i += 1) {
    const button = buttons.nth(i);
    try {
      const text = (await button.innerText()).toLowerCase();
      if (text.includes('провер') || text.includes('найти') || text.includes('поиск')) {
        await button.click({ timeout: 5000 });
        return;
      }
    } catch (error) {
      // Try next button.
    }
  }

  const submitButton = widget.container.locator('input[type="submit"]').first();
  if (await submitButton.count()) {
    await submitButton.click({ timeout: 5000 });
    return;
  }

  await widget.textInputs.nth(1).press('Enter');
};

const extractMoscowCargoTables = async (page) => {
  const tables = page.locator('table');
  const tablesCount = await tables.count();
  const result = [];
  const limit = Math.min(tablesCount, 8);

  for (let i = 0; i < limit; i += 1) {
    const table = tables.nth(i);
    try {
      if (!(await table.isVisible())) continue;
    } catch (error) {
      continue;
    }

    const rows = table.locator('tr');
    const rowCount = await rows.count();
    const parsedRows = [];

    for (let r = 0; r < rowCount; r += 1) {
      const row = rows.nth(r);
      const cells = row.locator('th,td');
      const cellCount = await cells.count();
      const parsedCells = [];

      for (let c = 0; c < cellCount; c += 1) {
        const cell = cells.nth(c);
        const text = (await cell.innerText()).replace(/\s+/g, ' ').trim();
        parsedCells.push(text);
      }

      if (parsedCells.some(Boolean)) {
        parsedRows.push(parsedCells);
      }
    }

    if (parsedRows.length === 0) continue;

    const title = await table.evaluate((el) => {
      let prev = el.previousElementSibling;
      while (prev) {
        const text = (prev.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) return text;
        prev = prev.previousElementSibling;
      }
      return '';
    });

    result.push({
      title: title || `Таблица ${result.length + 1}`,
      rows: parsedRows,
    });
  }

  return result;
};

const extractMoscowCargoStatusText = async (page) => {
  const selectors = [
    '.tracking-result',
    '.search-result',
    '.result',
    '.cargo-status',
    '[id*="result" i]',
    '[class*="result" i]',
    '[class*="status" i]',
    'main',
  ];

const chunks = [];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      try {
        const text = (await locator.innerText()).trim();
        if (text) chunks.push(text);
      } catch (error) {
        // Ignore this selector.
      }
    }
  }

  const compactLines = chunks
    .flatMap((chunk) => chunk.split('\n'))
    .map((line) => line.trim())
    .filter(Boolean);
  if (compactLines.length > 0) {
    return [...new Set(compactLines)].slice(0, 25).join('\n');
  }

  const bodyText = (await page.locator('body').innerText()).trim();
  const lines = bodyText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /(статус|груз|наклад|awb|cargo|принят|выдан|достав|терминал)/i.test(line));

  return [...new Set(lines)].slice(0, 25).join('\n');
};

const detectVnukovoManualCheck = async (page) => {
  const bodyText = ((await page.locator('body').innerText()).trim() || '').toLowerCase();
  if (
    bodyText.includes('вы точно не робот') ||
    bodyText.includes('подтвердите, что вы не робот') ||
    bodyText.includes('captcha')
  ) {
    return true;
  }

  const selectors = [
    'iframe[src*="recaptcha" i]',
    '[class*="captcha" i]',
    '[id*="captcha" i]',
    '[data-sitekey]',
  ];

  for (const selector of selectors) {
    try {
      const locator = page.locator(selector);
      if ((await locator.count()) > 0) return true;
    } catch (error) {
      // Ignore.
    }
  }

  return false;
};

const scrapeMoscowCargoStatus = async ({ awb, awbParts, terminalLabel }) => {
  const playwright = getPlaywright();
  if (!playwright || !playwright.chromium) {
    const error = new Error('Playwright is not installed on server');
    error.code = 'playwright_missing';
    throw error;
  }

  const { chromium } = playwright;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'ru-RU' });
  const page = await context.newPage();
  const checkedAt = Date.now();

  try {
    await openCargoPageRobust(page, MOSCOW_CARGO_URL);

    const resolvedAwbParts = awbParts || splitAwbParts(awb);
    if (!resolvedAwbParts) {
      const error = new Error('AWB format is invalid. Expected prefix and number, e.g. 876-14889696');
      error.code = 'awb_format_invalid';
      throw error;
    }

    const trackingWidget = await resolveMoscowCargoTrackingWidget(page);
    if (!trackingWidget) {
      const error = new Error('Tracking widget with split AWB inputs was not found on Moscow Cargo page');
      error.code = 'tracking_widget_not_found';
      throw error;
    }

    await fillMoscowCargoAwbInputs(trackingWidget, resolvedAwbParts);
    await triggerMoscowCargoSearch(trackingWidget);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const tables = await extractMoscowCargoTables(page);
    const statusText = await extractMoscowCargoStatusText(page);
    if (!statusText && tables.length === 0) {
      const error = new Error('Status text was not found in Moscow Cargo response');
      error.code = 'status_not_found';
      throw error;
    }

    const screenshot = await captureMoscowCargoResultScreenshot({ page, awb, terminalKey: 'svo_moscow' });

    return {
      terminal: terminalLabel || 'Москва-карго',
      awb,
      statusText,
      tables,
      checkedAt,
      sourceUrl: MOSCOW_CARGO_URL,
      screenshotId: screenshot.screenshotId,
      screenshotUrl: screenshot.screenshotUrl,
    };
  } catch (error) {
    if (CARGO_SCREENSHOTS_ENABLED) {
      const logsDir = path.resolve(__dirname, 'logs', 'cargo-status');
      await fs.mkdir(logsDir, { recursive: true });

      const safeAwb = awb.replace(/[^0-9A-Za-z_-]/g, '_') || 'unknown';
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = path.join(logsDir, `moscow-cargo-${safeAwb}-${stamp}.png`);

      try {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        error.screenshotPath = screenshotPath;
      } catch (screenshotError) {
        // Keep original error.
      }
    }

    throw error;
  } finally {
    await browser.close();
  }
};

// Exchange authorization code or refresh token with Google
app.post('/oauth/token', async (req, res) => {
  try {
    const { code, refresh_token } = req.body;
    const params = new URLSearchParams();
    const redirectUri = String(process.env.REDIRECT_URI || '').trim();

    if (code) {
      if (!redirectUri) {
        return res.status(500).json({ error: 'missing_redirect_uri' });
      }
      params.set('code', code);
      params.set('grant_type', 'authorization_code');
      params.set('redirect_uri', redirectUri);
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

app.post('/cargo/status', async (req, res) => {
  try {
    const awbPrefix = normalizeAwbPrefixPart(req.body?.awbPrefix, 3);
    const awbNumber = normalizeAwbNumberPart(req.body?.awbNumber, 32);
    const hasExplicitAwbPrefix = Boolean(awbPrefix);
    const hasExplicitAwbNumber = Boolean(awbNumber);
    const awbFromParts = hasExplicitAwbPrefix && hasExplicitAwbNumber
      ? `${awbPrefix}-${awbNumber}`
      : (hasExplicitAwbNumber ? awbNumber : '');
    const awb = normalizeAwb(req.body?.awb || awbFromParts);
    const awbParts = hasExplicitAwbNumber
      ? { prefix: awbPrefix, number: awbNumber }
      : splitAwbParts(awb);
    const terminal = String(req.body?.terminal || '').trim();
    const terminalKey = String(req.body?.terminalKey || '').trim();
    const forceRefresh = req.body?.force === true;

    if (!awb) {
      return res.status(400).json({ error: 'awb_required' });
    }
    if (!terminal) {
      return res.status(400).json({ error: 'terminal_required' });
    }

    const terminalConfig = resolveCargoTerminalConfig(terminalKey);
    if (!terminalConfig) {
      return res.status(400).json({
        error: 'terminal_not_supported',
        details: 'Unsupported terminal key',
      });
    }

    if (terminalConfig.key === 'svo_moscow') {
      const hasStrictPrefix = /^\d{3}$/.test(awbPrefix);
      const hasStrictNumber = /^\d+$/.test(awbNumber);
      if (!hasStrictPrefix || !hasStrictNumber) {
        return res.status(400).json({
          error: 'awb_format_invalid',
          details: 'Moscow Cargo requires numeric prefix and numeric AWB number.',
        });
      }
    }

    if (terminalConfig.key === 'vko') {
      return res.json({
        terminal: terminalConfig.label,
        awb,
        statusText: '',
        tables: [],
        checkedAt: Date.now(),
        sourceUrl: terminalConfig.url,
        manualRequired: true,
        manualMessage: 'Требуется ручная проверка на сайте Внуково.',
        manualUrl: terminalConfig.url,
        cached: false,
        cacheExpiresAt: Date.now() + CARGO_STATUS_TTL_MS,
      });
    }

    const cacheKey = getCargoCacheKey({ terminal, awb });
    const cacheEntry = cargoStatusCache.get(cacheKey);
    if (!forceRefresh && cacheEntry && Date.now() < cacheEntry.expiresAt) {
      return res.json({
        ...cacheEntry.data,
        cached: true,
        cacheExpiresAt: cacheEntry.expiresAt,
      });
    }

    const data = terminalConfig.mode === 'moscow'
      ? await scrapeMoscowCargoStatus({ awb, awbParts, terminalLabel: terminalConfig.label })
      : await scrapeGenericCargoStatus({ awb, awbParts, terminalConfig });
    const expiresAt = Date.now() + CARGO_STATUS_TTL_MS;
    if (cacheEntry?.data?.screenshotId && cacheEntry.data.screenshotId !== data.screenshotId) {
      await removeCargoScreenshot(cacheEntry.data.screenshotId).catch(() => {});
    }
    cargoStatusCache.set(cacheKey, {
      data,
      expiresAt,
    });

    return res.json({
      ...data,
      cached: false,
      cacheExpiresAt: expiresAt,
    });
  } catch (error) {
    const details = normalizeCargoErrorDetails(error);
    const screenshotPath = error.screenshotPath
      ? path.relative(process.cwd(), error.screenshotPath)
      : null;

    return res.status(500).json({
      error: 'cargo_status_failed',
      details,
      screenshotPath,
      requiresPlaywrightInstall: error.code === 'playwright_missing',
    });
  }
});

app.get('/cargo/screenshot/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'screenshot_id_required' });
  }

  const filePath = cargoScreenshotStore.get(id);
  if (!filePath) {
    return res.status(404).json({ error: 'screenshot_not_found' });
  }

  try {
    await fs.access(filePath);
    return res.sendFile(filePath);
  } catch (error) {
    cargoScreenshotStore.delete(id);
    return res.status(404).json({ error: 'screenshot_not_found' });
  }
});

app.delete('/cargo/screenshot/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'screenshot_id_required' });
  }

  try {
    const removed = await removeCargoScreenshot(id);
    return res.json({ removed });
  } catch (error) {
    return res.status(500).json({
      error: 'screenshot_delete_failed',
      details: error.message,
    });
  }
});

app.delete('/cargo/screenshots', async (req, res) => {
  try {
    const result = await removeAllCargoScreenshots();
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: 'screenshots_delete_failed',
      details: error.message,
    });
  }
});

app.get('/cargo/cache', (req, res) => {
  const now = Date.now();
  const awb = normalizeAwb(req.query.awb || '');
  const terminal = String(req.query.terminal || '').trim();

  if (awb && terminal) {
    const key = getCargoCacheKey({ terminal, awb });
    const entry = cargoStatusCache.get(key);
    if (!entry) return res.json({ found: false });

    return res.json({
      found: true,
      cached: now < entry.expiresAt,
      expiresAt: entry.expiresAt,
      expiresInMs: Math.max(0, entry.expiresAt - now),
      data: entry.data,
    });
  }

  const items = Array.from(cargoStatusCache.entries()).map(([key, entry]) => ({
    key,
    cached: now < entry.expiresAt,
    expiresAt: entry.expiresAt,
    expiresInMs: Math.max(0, entry.expiresAt - now),
    data: entry.data,
  }));

  return res.json({ total: items.length, items });
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

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'logictrack-oauth-proxy',
    timestamp: new Date().toISOString(),
  });
});

app.post('/trip-application/pdf', async (req, res) => {
  try {
    const tripRaw = req.body?.trip || {};
    const ordersRaw = Array.isArray(req.body?.orders) ? req.body.orders : [];

    const trip = {
      tripNumber: String(tripRaw.tripNumber || '').trim(),
      tripDate: String(tripRaw.tripDate || '').trim(),
      carNumber: String(tripRaw.carNumber || '').trim(),
      driverName: String(tripRaw.driverName || '').trim(),
      signerRole: String(tripRaw.signerRole || '').trim(),
      signerName: String(tripRaw.signerName || '').trim(),
    };

    if (!trip.tripNumber || !trip.carNumber || !trip.driverName) {
      return res.status(400).json({ error: 'trip_fields_required' });
    }
    if (ordersRaw.length === 0) {
      return res.status(400).json({ error: 'orders_required' });
    }

    const orders = ordersRaw.map((order) => ({
      name: String(order?.name || '').trim(),
      awb: String(order?.awb || '').trim(),
      recipient: String(order?.recipient || '').trim(),
      shipmentAirport: String(order?.shipmentAirport || '').trim(),
      customsName: String(order?.customsName || '').trim(),
      customsCode: String(order?.customsCode || '').trim(),
      quantity: String(order?.quantity || '').trim(),
      weight: String(order?.weight || '').trim(),
      notes: String(order?.notes || '').trim(),
    }));

    const pdfBuffer = await generateTripPdf({ trip, orders });
    const safeTripNumber = (trip.tripNumber || 'trip').replace(/[^0-9A-Za-z_-]+/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="trip-application-${safeTripNumber}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('trip_pdf_generation_failed', {
      message: error.message,
      stack: error.stack,
      engine: resolveTripPdfEngine(),
      templatePath: TRIP_APPLICATION_TEMPLATE_PATH,
    });
    return res.status(500).json({
      error: 'trip_pdf_generation_failed',
      details: error.message,
    });
  }
});

app.post('/trip-application/docx', async (req, res) => {
  try {
    const tripRaw = req.body?.trip || {};
    const ordersRaw = Array.isArray(req.body?.orders) ? req.body.orders : [];

    const trip = {
      tripNumber: String(tripRaw.tripNumber || '').trim(),
      tripDate: String(tripRaw.tripDate || '').trim(),
      carNumber: String(tripRaw.carNumber || '').trim(),
      driverName: String(tripRaw.driverName || '').trim(),
      signerRole: String(tripRaw.signerRole || '').trim(),
      signerName: String(tripRaw.signerName || '').trim(),
    };

    if (!trip.tripNumber || !trip.carNumber || !trip.driverName) {
      return res.status(400).json({ error: 'trip_fields_required' });
    }
    if (ordersRaw.length === 0) {
      return res.status(400).json({ error: 'orders_required' });
    }

    const orders = ordersRaw.map((order) => ({
      name: String(order?.name || '').trim(),
      awb: String(order?.awb || '').trim(),
      recipient: String(order?.recipient || '').trim(),
      shipmentAirport: String(order?.shipmentAirport || '').trim(),
      customsName: String(order?.customsName || '').trim(),
      customsCode: String(order?.customsCode || '').trim(),
      quantity: String(order?.quantity || '').trim(),
      weight: String(order?.weight || '').trim(),
      notes: String(order?.notes || '').trim(),
    }));

    const docxBuffer = await generateTripDocxFromTemplate({
      templatePath: TRIP_APPLICATION_TEMPLATE_PATH,
      trip,
      orders,
    });
    const safeTripNumber = (trip.tripNumber || 'trip').replace(/[^0-9A-Za-z_-]+/g, '_');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="trip-application-${safeTripNumber}.docx"`);
    return res.send(docxBuffer);
  } catch (error) {
    console.error('trip_docx_generation_failed', {
      message: error.message,
      stack: error.stack,
      templatePath: TRIP_APPLICATION_TEMPLATE_PATH,
    });
    return res.status(500).json({
      error: 'trip_docx_generation_failed',
      details: error.message,
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`OAuth proxy listening on 0.0.0.0:${port}; CORS_ORIGIN=${allowAllOrigins ? '*' : corsOrigins.join(',')}`));







