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
const TRIP_PDF_ENGINE = String(process.env.TRIP_PDF_ENGINE || '').trim().toLowerCase();
const TRIP_APPLICATION_TEMPLATE_PATH = (() => {
  const rawPath = String(process.env.TRIP_APPLICATION_TEMPLATE_PATH || './templates/STS order.docx').trim();
  if (!rawPath) {
    return path.resolve(__dirname, 'templates', 'STS order.docx');
  }
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(__dirname, rawPath);
})();
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







