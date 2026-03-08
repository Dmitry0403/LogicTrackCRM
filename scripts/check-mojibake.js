const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const TARGETS = ["src", "server", "index.html", "oauth2callback.html", "README.md"];
const ALLOWED_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".css", ".html", ".json", ".md", ".sql"]);
const IGNORE_DIRS = new Set(["node_modules", "dist", ".git", ".codex"]);
const IGNORE_LINE_TOKEN = "encoding-check-ignore-line";
const MAX_REPORT_ITEMS = 120;

// Common mojibake fragments from broken UTF-8/CP1251 conversions.
const SUSPICIOUS_PATTERNS = [
  /\uFFFD/g,
  /[\u0400-\u040F\u0452-\u045F\u0460-\u052F]/g, // rare Cyrillic symbols (usually mojibake)
  /вЂ[^\s]*/g,
  /[ÐÑ][\u00A0-\u00BF]/g,
  /Ã[\u0080-\u00BF]/g,
  /Â[\u0080-\u00BF]/g,
];

const findings = [];
let scannedFiles = 0;

function shouldScanFile(filePath) {
  return ALLOWED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isProbablyBinary(content) {
  const probe = content.slice(0, 4000);
  return probe.includes("\u0000");
}

function addFinding(filePath, lineNumber, lineText, reason) {
  findings.push({
    file: path.relative(ROOT, filePath),
    line: lineNumber,
    reason,
    text: lineText.trim().slice(0, 220),
  });
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  if (isProbablyBinary(content)) return;
  scannedFiles += 1;

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes(IGNORE_LINE_TOKEN)) return;

    for (const pattern of SUSPICIOUS_PATTERNS) {
      pattern.lastIndex = 0;
      if (!pattern.test(line)) continue;
      addFinding(filePath, index + 1, line, pattern.toString());
      break;
    }
  });
}

function walk(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.statSync(targetPath);

  if (stat.isFile()) {
    if (shouldScanFile(targetPath)) scanFile(targetPath);
    return;
  }

  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walk(fullPath);
      continue;
    }
    if (entry.isFile() && shouldScanFile(fullPath)) scanFile(fullPath);
  }
}

for (const target of TARGETS) {
  walk(path.join(ROOT, target));
}

if (findings.length > 0) {
  console.error("Encoding check failed: suspicious mojibake fragments found.");
  findings.slice(0, MAX_REPORT_ITEMS).forEach((item) => {
    console.error(`- ${item.file}:${item.line} [${item.reason}] -> ${item.text}`);
  });
  if (findings.length > MAX_REPORT_ITEMS) {
    console.error(`... and ${findings.length - MAX_REPORT_ITEMS} more`);
  }
  process.exit(1);
}

console.log(`Encoding check passed. Scanned ${scannedFiles} files.`);

