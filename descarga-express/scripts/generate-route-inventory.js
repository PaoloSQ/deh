const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const REPO_SITES_ROOT = path.join(PROJECT_ROOT, 'sites');
const REPO_REPORT_MD = path.join(PROJECT_ROOT, 'ROUTE-INVENTORY-SUMMARY.md');
const EXTERNAL_REPORTS_DIR = path.resolve(PROJECT_ROOT, '..', 'reports');
const REMOTE_MISSING_FILE = path.join(EXTERNAL_REPORTS_DIR, 'missing_pages_remote.txt');
const LOCAL_LIST_FILE = path.join(EXTERNAL_REPORTS_DIR, 'local_pages_list.txt');
const CURRENT_ROUTES_FILE = path.join(EXTERNAL_REPORTS_DIR, 'current_routes_actual.txt');
const PENDING_REAL_FILE = path.join(EXTERNAL_REPORTS_DIR, 'pending_pages_real.txt');
const EXTRA_LOCAL_FILE = path.join(EXTERNAL_REPORTS_DIR, 'extra_local_pages_vs_missing.txt');

function walkHtmlFiles(dirPath, out = []) {
  if (!fs.existsSync(dirPath)) return out;

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkHtmlFiles(fullPath, out);
      continue;
    }
    if (/\.html?$/i.test(entry.name)) out.push(fullPath);
  }

  return out;
}

function normalizeUnicode(text) {
  return String(text || '').normalize('NFC');
}

function stripTrailingSlash(pathname) {
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/, '');
}

function canonicalizeUrl(raw) {
  if (!raw) return null;

  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return null;
  }

  const hostname = normalizeUnicode(url.hostname.toLowerCase());
  let pathname = normalizeUnicode(decodeURIComponent(url.pathname || '/'));
  pathname = pathname.replace(/\/index\.html?$/i, '/');
  pathname = pathname.replace(/\.html?$/i, '');
  pathname = pathname.replace(/\/+/g, '/');
  pathname = stripTrailingSlash(pathname || '/');

  return `https://${hostname}${pathname === '/' ? '' : pathname}`;
}

function localUrlFromFile(filePath) {
  const rel = path.relative(REPO_SITES_ROOT, filePath).split(path.sep).join('/');
  const parts = rel.split('/');
  const host = parts.shift();
  let pathname = '/' + parts.join('/');
  pathname = pathname.replace(/\/index\.html?$/i, '/');
  pathname = pathname.replace(/\.html?$/i, '');
  pathname = pathname.replace(/\/+/g, '/');
  pathname = stripTrailingSlash(pathname || '/');
  return `https://${host}${pathname === '/' ? '' : pathname}`;
}

function readList(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function writeList(filePath, values) {
  fs.writeFileSync(filePath, `${values.join('\n')}\n`);
}

function main() {
  if (!fs.existsSync(EXTERNAL_REPORTS_DIR)) {
    throw new Error(`No existe el directorio de reportes: ${EXTERNAL_REPORTS_DIR}`);
  }

  const htmlFiles = walkHtmlFiles(REPO_SITES_ROOT);
  const localActual = htmlFiles.map(localUrlFromFile);
  const localActualCanonical = [...new Set(localActual.map(canonicalizeUrl).filter(Boolean))].sort();

  const remoteMissingRaw = readList(REMOTE_MISSING_FILE);
  const remoteMissingCanonical = [...new Set(remoteMissingRaw.map(canonicalizeUrl).filter(Boolean))].sort();

  const localListedRaw = readList(LOCAL_LIST_FILE);
  const localListedCanonical = [...new Set(localListedRaw.map(canonicalizeUrl).filter(Boolean))].sort();

  const localActualSet = new Set(localActualCanonical);
  const remoteMissingSet = new Set(remoteMissingCanonical);
  const localListedSet = new Set(localListedCanonical);

  const pendingReal = remoteMissingCanonical.filter((url) => !localActualSet.has(url));
  const extraLocalVsMissing = localActualCanonical.filter((url) => !remoteMissingSet.has(url));
  const localListedOnly = localListedCanonical.filter((url) => !localActualSet.has(url));

  writeList(CURRENT_ROUTES_FILE, localActualCanonical);
  writeList(PENDING_REAL_FILE, pendingReal);
  writeList(EXTRA_LOCAL_FILE, extraLocalVsMissing);

  const md = [
    '# Route Inventory Summary',
    '',
    `- Fecha: ${new Date().toISOString()}`,
    `- Rutas reales actuales en \`sites/\`: ${localActualCanonical.length}`,
    `- URLs en \`reports/missing_pages_remote.txt\`: ${remoteMissingCanonical.length}`,
    `- URLs en \`reports/local_pages_list.txt\`: ${localListedCanonical.length}`,
    `- Pendientes reales tras normalizacion: ${pendingReal.length}`,
    `- Rutas locales fuera de \`missing_pages_remote\`: ${extraLocalVsMissing.length}`,
    `- Rutas listadas en \`local_pages_list.txt\` que no existen hoy en \`sites/\`: ${localListedOnly.length}`,
    '',
    '## Archivos generados',
    '',
    `- \`${path.relative(path.dirname(REPO_REPORT_MD), CURRENT_ROUTES_FILE).split(path.sep).join('/')}\``,
    `- \`${path.relative(path.dirname(REPO_REPORT_MD), PENDING_REAL_FILE).split(path.sep).join('/')}\``,
    `- \`${path.relative(path.dirname(REPO_REPORT_MD), EXTRA_LOCAL_FILE).split(path.sep).join('/')}\``,
    '',
    '## Lectura correcta',
    '',
    '- `current_routes_actual.txt` es la foto fiable de lo que el repo sirve ahora mismo desde `sites/`.',
    '- `pending_pages_real.txt` es la lista buena de pendientes reales contra `missing_pages_remote.txt`, ya normalizada.',
    '- `local_pages_list.txt` no debe usarse como verdad absoluta si no coincide con `sites/` actual.',
    '',
    '## Primeros pendientes reales',
    ''
  ];

  const preview = pendingReal.slice(0, 25);
  if (preview.length) {
    for (const item of preview) md.push(`- ${item}`);
  } else {
    md.push('- Ninguno');
  }

  if (pendingReal.length > preview.length) {
    md.push('');
    md.push(`Quedan ${pendingReal.length - preview.length} mas en \`../reports/pending_pages_real.txt\`.`);
  }

  fs.writeFileSync(REPO_REPORT_MD, `${md.join('\n')}\n`);

  const summary = {
    currentRoutes: localActualCanonical.length,
    remoteMissing: remoteMissingCanonical.length,
    localListed: localListedCanonical.length,
    pendingReal: pendingReal.length,
    extraLocalVsMissing: extraLocalVsMissing.length,
    localListedOnly: localListedOnly.length,
    currentRoutesFile: CURRENT_ROUTES_FILE,
    pendingRealFile: PENDING_REAL_FILE,
    extraLocalFile: EXTRA_LOCAL_FILE,
    markdownReport: REPO_REPORT_MD
  };

  console.log(JSON.stringify(summary, null, 2));
}

main();
