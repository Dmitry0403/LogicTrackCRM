const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const TARGETS = ["src", "server", "index.html", "oauth2callback.html", "README.md"];
const ALLOWED_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".css", ".html", ".json", ".md", ".sql"]);
const IGNORE_DIRS = new Set(["node_modules", "dist", ".git", ".codex"]);

// Detect common mojibake markers from UTF-8 <-> CP1251 mixups.
const SUSPICIOUS_PATTERNS = [
  /\uFFFD/g,
  /[\u0420\u0421][\u0080-\u00BF]/g,
  /[\u0420\u0421][\u0400-\u040F\u0450-\u045F]/g,
  /\u0432\u0402/g,
  /\u00D0\u009F|\u00D1\u0081/g,
];

const findings = [];

function shouldScanFile(filePath) {
  return ALLOWED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({
          file: path.relative(ROOT, filePath),
          line: index + 1,
          text: line.trim().slice(0, 180),
        });
        pattern.lastIndex = 0;
        break;
      }
      pattern.lastIndex = 0;
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

for (const target of TARGETS) walk(path.join(ROOT, target));

if (findings.length > 0) {
  console.error("Encoding check failed: suspicious mojibake fragments found.");
  findings.slice(0, 100).forEach((item) => {
    console.error(`- ${item.file}:${item.line} -> ${item.text}`);
  });
  if (findings.length > 100) console.error(`... and ${findings.length - 100} more`);
  process.exit(1);
}

console.log("Encoding check passed.");
