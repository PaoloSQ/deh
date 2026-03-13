const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_LOCAL_BASE = 'http://127.0.0.1:8080';
const SERVER_STATE_FILE = path.resolve(__dirname, '..', '..', '.server-port.json');

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readServerState() {
  try {
    if (!fs.existsSync(SERVER_STATE_FILE)) return null;
    const payload = JSON.parse(fs.readFileSync(SERVER_STATE_FILE, 'utf8'));
    if (!payload || !Number.isInteger(payload.port) || payload.port <= 0) return null;
    if (payload.pid && !isPidAlive(payload.pid)) return null;
    return payload;
  } catch {
    return null;
  }
}

function getLocalBaseUrl() {
  if (process.env.LOCAL_BASE_URL) return process.env.LOCAL_BASE_URL;
  const state = readServerState();
  if (state && state.port) return `http://127.0.0.1:${state.port}`;
  return DEFAULT_LOCAL_BASE;
}

const LOCAL_BASE = getLocalBaseUrl();

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function normalizeRoute(route = '/') {
  if (!route || route === '/') return '/';
  return `/${String(route).replace(/^\/+/, '').replace(/\/+/g, '/')}`;
}

function buildLocalMirrorBase(domain, baseUrl = LOCAL_BASE) {
  const url = new URL(baseUrl);
  const basePath = trimTrailingSlash(url.pathname || '');
  url.pathname = `${basePath}/${domain}`.replace(/\/+/g, '/');
  url.search = '';
  url.hash = '';
  return trimTrailingSlash(url.toString());
}

function buildLocalMirrorUrl(domain, route = '/', baseUrl = LOCAL_BASE) {
  const base = buildLocalMirrorBase(domain, baseUrl);
  const normalizedRoute = normalizeRoute(route);
  return normalizedRoute === '/' ? `${base}/` : `${base}${normalizedRoute}`;
}

function buildHostBasedUrl(domain, route = '/', baseUrl = LOCAL_BASE) {
  const base = new URL(baseUrl);
  const normalizedRoute = normalizeRoute(route);
  return `${base.protocol}//${domain}${base.port ? `:${base.port}` : ''}${normalizedRoute}`;
}

function isLocalUrlCandidate(value, baseUrl = LOCAL_BASE) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const base = new URL(baseUrl);
    const expectedPort = base.port || (base.protocol === 'https:' ? '443' : '80');
    const actualPort = url.port || (url.protocol === 'https:' ? '443' : '80');
    if (expectedPort !== actualPort) return false;
    return (
      url.hostname === base.hostname ||
      url.hostname === 'localhost' ||
      /\.dehonline\.es$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}

function requirePuppeteer() {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'node_modules', 'puppeteer'),
    path.resolve(__dirname, '..', '..', '..', 'simplified', 'node_modules', 'puppeteer'),
    'puppeteer'
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (_error) {
      // Sigue con el siguiente candidato.
    }
  }

  throw new Error('No se encontro puppeteer. Instala la dependencia o usa el workspace simplified.');
}

function checkHealth(baseUrl = getLocalBaseUrl()) {
  return new Promise((resolve) => {
    const url = new URL('/health', baseUrl);
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureLocalServer(baseUrl = getLocalBaseUrl()) {
  const initialBaseUrl = process.env.LOCAL_BASE_URL || baseUrl;
  if (await checkHealth(initialBaseUrl)) {
    return {
      startedByScript: false,
      baseUrl: initialBaseUrl,
      stop: async () => {}
    };
  }

  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..', '..'),
    stdio: 'ignore'
  });

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const resolvedBaseUrl = process.env.LOCAL_BASE_URL || getLocalBaseUrl();
    if (await checkHealth(resolvedBaseUrl)) {
      return {
        startedByScript: true,
        baseUrl: resolvedBaseUrl,
        stop: async () => {
          if (!child.killed) child.kill('SIGTERM');
        }
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (!child.killed) child.kill('SIGTERM');
  throw new Error(`No se pudo levantar el servidor local en ${process.env.LOCAL_BASE_URL || getLocalBaseUrl()}.`);
}

function walk(dir, out = []) {
  const fs = require('fs');
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

function isHtmlFile(filePath) {
  return ['.html', '.htm'].includes(path.extname(filePath).toLowerCase());
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/');
}

module.exports = {
  LOCAL_BASE,
  getLocalBaseUrl,
  buildHostBasedUrl,
  buildLocalMirrorBase,
  buildLocalMirrorUrl,
  isLocalUrlCandidate,
  requirePuppeteer,
  checkHealth,
  ensureLocalServer,
  walk,
  isHtmlFile,
  toPosix
};
