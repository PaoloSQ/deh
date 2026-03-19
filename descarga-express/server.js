const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const morgan = require('morgan');

const app = express();
const PREFERRED_PORT = Number(process.env.PORT || 8080);
const PORT_SEARCH_LIMIT = Number(process.env.PORT_SEARCH_LIMIT || 100);
const SERVER_STATE_FILE = path.resolve(__dirname, '.server-port.json');

const sitesRoot = path.resolve(__dirname, 'sites');
const imagesRoot = path.resolve(__dirname, 'public', 'img');
const cssRoot = path.resolve(__dirname, 'public', 'css');
const jsRoot = path.resolve(__dirname, 'public', 'js');
const assetsRoot = path.resolve(__dirname, 'public', 'assets');
const docsRoot = path.resolve(__dirname, 'public', 'docs');
const mediaRoot = path.resolve(__dirname, 'public', 'media');
const bucketRoots = [sitesRoot, imagesRoot, cssRoot, jsRoot, assetsRoot, docsRoot, mediaRoot];
const LOCAL_HTML_HELPER_SCRIPTS = [
  '/assets/js/local/popup-restore.js'
];
const RESERVED_HOST_REWRITE_PREFIXES = [
  '/img',
  '/media',
  '/css',
  '/js',
  '/assets',
  '/docs',
  '/_api',
  '/_partials',
  '/static.parastorage.com',
  '/health',
  '/favicon.ico',
  '/frog.wix.com',
  '/panorama.wixapps.net',
  '/www/.google-analytics.com',
  '/.google-analytics.com'
];

app.set('x-powered-by', false);
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));

let activePort = PREFERRED_PORT;

function fileExists(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function getRequestHost(req) {
  const raw = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();
  return raw.split(':')[0].toLowerCase();
}

function isMirrorDomain(host) {
  return /\.dehonline\.es$/i.test(host) && fs.existsSync(path.join(sitesRoot, host));
}

function isReservedHostRewritePath(pathname) {
  return RESERVED_HOST_REWRITE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isLocalStubFile(p) {
  try {
    if (!fileExists(p)) return false;
    const stat = fs.statSync(p);
    if (stat.size > 64) return false;
    const text = fs.readFileSync(p, 'utf8').trim();
    return text === '// local stub' || text === '/* local stub */';
  } catch {
    return false;
  }
}

function rewriteIfExists(req, candidates) {
  const [pathname, query = ''] = req.url.split('?');
  for (const candidate of candidates) {
    const abs = path.join(assetsRoot, candidate);
    if (fileExists(abs) && !isLocalStubFile(abs)) {
      req.url = `/${candidate}${query ? `?${query}` : ''}`;
      return true;
    }
  }
  return false;
}

function findExistingAsset(candidate) {
  const abs = path.join(assetsRoot, candidate);
  return fileExists(abs) ? abs : null;
}

function findFirstFileRecursive(dirPath) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return null;
  const stack = [dirPath];
  const candidates = [];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isFile()) {
        candidates.push(abs);
        continue;
      }
      if (entry.isDirectory()) stack.push(abs);
    }
  }

  if (!candidates.length) return null;

  const score = (filePath) => {
    const rel = path.relative(dirPath, filePath).split(path.sep).join('/');
    let total = 0;

    if (/blur_\d+/i.test(rel)) total -= 1000000;
    if (/\/v1\/fill\//i.test(`/${rel}`)) total += 10000;
    if (/enc_avif/i.test(rel)) total += 100000;

    try {
      total += fs.statSync(filePath).size;
    } catch {
      // Conserva la puntuacion acumulada si el stat falla.
    }

    return total;
  };

  candidates.sort((left, right) => score(right) - score(left) || left.localeCompare(right));
  return candidates[0];
}

function tryRewriteMediaVariant(req) {
  const [pathname, query = ''] = req.url.split('?');
  if (!pathname.startsWith('/assets/img/media/')) return false;

  const mediaPrefix = '/assets/img/media/';
  const remainder = pathname.slice(mediaPrefix.length);
  const firstSegment = remainder.split('/')[0];
  if (firstSegment) {
    const candidates = [];
    candidates.push(firstSegment);
    try {
      const decoded = decodeURIComponent(firstSegment);
      if (decoded && decoded !== firstSegment) candidates.push(decoded);
    } catch {
      // Mantiene la variante original.
    }
    for (const candidate of candidates) {
      const baseFile = path.join(assetsRoot, 'img', 'media', candidate);
      if (fileExists(baseFile)) {
        req.url = `${mediaPrefix}${candidate}${query ? `?${query}` : ''}`;
        req._parsedUrl = null;
        req._parsedOriginalUrl = null;
        return true;
      }
      if (fs.existsSync(baseFile) && fs.statSync(baseFile).isDirectory()) {
        const nestedFile = findFirstFileRecursive(baseFile);
        if (nestedFile) {
          const nestedRelPath = path.relative(assetsRoot, nestedFile).split(path.sep).join('/');
          req.url = `/assets/${nestedRelPath}${query ? `?${query}` : ''}`;
          req._parsedUrl = null;
          req._parsedOriginalUrl = null;
          return true;
        }
      }
    }
  }

  const relPath = pathname.replace(/^\/assets\//, '');
  const absPath = path.join(assetsRoot, relPath);
  if (fileExists(absPath)) return false;

  if (fs.existsSync(absPath) && fs.statSync(absPath).isDirectory()) {
    const nestedFile = findFirstFileRecursive(absPath);
    if (nestedFile) {
      const nestedRelPath = path.relative(assetsRoot, nestedFile).split(path.sep).join('/');
      req.url = `/assets/${nestedRelPath}${query ? `?${query}` : ''}`;
      req._parsedUrl = null;
      req._parsedOriginalUrl = null;
      return true;
    }
  }

  const dir = path.dirname(absPath);
  const ext = path.extname(absPath);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory() || !ext) return false;

  const stem = path.basename(absPath, ext);
  const variants = fs.readdirSync(dir).filter((name) => path.parse(name).name === stem);
  if (!variants.length) return false;

  const preferred = variants.find((name) => name.endsWith('.webp'))
    || variants.find((name) => name.endsWith('.jpg'))
    || variants.find((name) => name.endsWith('.png'))
    || variants[0];

  const nextRelPath = path.join(path.dirname(relPath), preferred).split(path.sep).join('/');
  req.url = `/assets/${nextRelPath}${query ? `?${query}` : ''}`;
  req._parsedUrl = null;
  req._parsedOriginalUrl = null;
  return true;
}

function tryRewriteImageVariant(req) {
  const [pathname, query = ''] = req.url.split('?');
  if (!pathname.startsWith('/img/')) return false;

  const imagePrefix = '/img/';
  const remainder = pathname.slice(imagePrefix.length);
  const candidates = [];

  for (const value of pathVariants(remainder)) {
    if (!value) continue;

    const direct = value.replace(/^\/+/, '');
    if (direct) candidates.push(direct);

    const trimmedVariant = direct.match(/^(.+?\.[a-z0-9]+)(?:,.*)?(?:\/.*)?$/i);
    if (trimmedVariant && trimmedVariant[1]) {
      candidates.push(trimmedVariant[1]);
    }
  }

  for (const candidate of candidates) {
    const normalized = candidate.replace(/^\/+/, '');
    if (!normalized) continue;

    const absPath = path.join(imagesRoot, normalized);
    if (!fileExists(absPath)) continue;

    req.url = `${imagePrefix}${normalized}${query ? `?${query}` : ''}`;
    req._parsedUrl = null;
    req._parsedOriginalUrl = null;
    return true;
  }

  return false;
}

function isLikelyMediaToken(value) {
  if (!value) return false;
  if (path.extname(value)) return false;
  if (/^(?:w|h|q|x|y|s)_[\d.]+$/i.test(value)) return true;
  if (/^usm_[\d._]+$/i.test(value)) return true;
  if (/^enc_[a-z0-9]+$/i.test(value)) return true;
  if (/^quality_auto$/i.test(value)) return true;
  if (/^al_[a-z0-9]+$/i.test(value)) return true;
  if (/^c_[a-z0-9]+$/i.test(value)) return true;
  if (/^g_[a-z0-9]+$/i.test(value)) return true;
  if (/^blur_\d+$/i.test(value)) return true;
  return false;
}

function proxyRemoteJs(url, res) {
  https.get(url, (upstream) => {
    if (upstream.statusCode && upstream.statusCode >= 400) {
      upstream.resume();
      res.status(upstream.statusCode).end();
      return;
    }
    res.setHeader('Content-Type', upstream.headers['content-type'] || 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    upstream.pipe(res);
  }).on('error', () => {
    res.status(502).end();
  });
}

function safeJoin(baseDir, requestPath) {
  const normalized = path.normalize(requestPath).replace(/^([.][.][/\\])+/, '');
  const fullPath = path.join(baseDir, normalized);
  if (!fullPath.startsWith(baseDir)) return null;
  return fullPath;
}

function pathVariants(...requestPaths) {
  const out = [];
  for (const requestPath of requestPaths) {
    if (!requestPath) continue;
    const raw = requestPath.split('?')[0];
    if (!out.includes(raw)) out.push(raw);
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded !== raw && !out.includes(decoded)) out.push(decoded);
    } catch {
      // Ignora rutas mal codificadas y conserva la variante cruda.
    }
  }
  return out;
}

function resolveCandidates(...requestPaths) {
  const cleanPaths = [];
  for (const p of pathVariants(...requestPaths)) {
    const normalized = p.replace(/^\/+/, '');
    cleanPaths.push(normalized);
    if (normalized.endsWith('/') && normalized.length > 1) {
      cleanPaths.push(normalized.slice(0, -1));
    }
  }
  const suffixes = ['', '.html', '/index.html'];
  const out = [];

  for (const base of bucketRoots) {
    for (const cleanPath of cleanPaths) {
      const baseRelativePaths = [cleanPath];
      if (base === assetsRoot && cleanPath.startsWith('assets/')) {
        baseRelativePaths.push(cleanPath.slice('assets/'.length));
      }
      if (base === docsRoot && cleanPath.startsWith('docs/')) {
        baseRelativePaths.push(cleanPath.slice('docs/'.length));
      }

      for (const relPath of baseRelativePaths) {
        for (const suffix of suffixes) {
          const p = safeJoin(base, relPath + suffix);
          if (p) out.push(p);
        }
      }
    }
  }

  return out;
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function buildJsonScriptTag(id, value) {
  return `<script type="application/json" id="${id}">${escapeJsonForHtml(value)}</script>`;
}

function readJsonScriptValue(html, id) {
  const patterns = [
    new RegExp(`<script[^>]*id=["']${id}["'][^>]*type=["']application/json["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i'),
    new RegExp(`<script[^>]*type=["']application/json["'][^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i')
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }

  return undefined;
}

function upsertJsonScriptValue(html, id, value) {
  const nextTag = buildJsonScriptTag(id, value);
  const patterns = [
    new RegExp(`<script([^>]*)id=["']${id}["']([^>]*)type=["']application/json["']([^>]*)>[\\s\\S]*?<\\/script>`, 'i'),
    new RegExp(`<script([^>]*)type=["']application/json["']([^>]*)id=["']${id}["']([^>]*)>[\\s\\S]*?<\\/script>`, 'i')
  ];

  for (const pattern of patterns) {
    if (pattern.test(html)) {
      return html.replace(pattern, nextTag);
    }
  }

  if (html.includes('</head>')) {
    return html.replace('</head>', `${nextTag}\n</head>`);
  }

  return `${nextTag}\n${html}`;
}

function injectLocalHelperScripts(html) {
  let nextHtml = html;
  const essentialViewerModel = readJsonScriptValue(nextHtml, 'wix-essential-viewer-model');
  const viewerModel = readJsonScriptValue(nextHtml, 'wix-viewer-model');
  const fallbackViewerModel =
    (essentialViewerModel && typeof essentialViewerModel === 'object' && essentialViewerModel)
    || (viewerModel && typeof viewerModel === 'object' && viewerModel)
    || {};

  nextHtml = upsertJsonScriptValue(nextHtml, 'wix-essential-viewer-model', fallbackViewerModel);
  nextHtml = upsertJsonScriptValue(nextHtml, 'wix-viewer-model', fallbackViewerModel);

  if (readJsonScriptValue(nextHtml, 'wix-fedops') === undefined) {
    nextHtml = upsertJsonScriptValue(nextHtml, 'wix-fedops', {
      data: {
        site: {},
        rollout: {},
        fleetConfig: {},
        requestUrl: '',
        isInSEO: false,
        platformOnSite: true
      }
    });
  }

  if (readJsonScriptValue(nextHtml, 'used-platform-apis-data') === undefined) {
    nextHtml = upsertJsonScriptValue(nextHtml, 'used-platform-apis-data', []);
  }

  if (!nextHtml.includes('id="deh-runtime-bootstrap"')) {
    const bootstrapScript = `<script id="deh-runtime-bootstrap">(function(){try{var modelNode=document.getElementById('wix-essential-viewer-model')||document.getElementById('wix-viewer-model');window.viewerModel=window.viewerModel||JSON.parse(modelNode&&modelNode.textContent||'{}')}catch(_error){window.viewerModel=window.viewerModel||{}}var viewerModel=window.viewerModel;window.commonConfig=window.commonConfig||(viewerModel.commonConfig||{});var commonConfig=window.commonConfig;window.fedops=window.fedops||{};var fedops=window.fedops;window.usedPlatformApis=window.usedPlatformApis||[];}())</script>`;
    if (nextHtml.includes('</head>')) {
      nextHtml = nextHtml.replace('</head>', `${bootstrapScript}\n</head>`);
    } else {
      nextHtml = `${bootstrapScript}\n${nextHtml}`;
    }
  }

  for (const src of LOCAL_HTML_HELPER_SCRIPTS) {
    if (nextHtml.includes(src)) continue;
    const scriptTag = `<script defer src="${src}"></script>`;
    if (nextHtml.includes('</head>')) {
      nextHtml = nextHtml.replace('</head>', `${scriptTag}\n</head>`);
    } else {
      nextHtml = `${scriptTag}\n${nextHtml}`;
    }
  }

  return nextHtml;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, port: activePort, sitesRoot, imagesRoot, assetsRoot, docsRoot, bucketRoots });
});

app.get('/favicon.ico', (_req, res) => {
  const candidate = findExistingAsset('img/client/pfavico.ico') || findExistingAsset('img/images/favicon.png');
  if (!candidate) return res.status(204).end();
  return res.sendFile(candidate);
});

app.all('/assets/fonts/fonts.gstatic.com*', (_req, res) => {
  res.status(204).end();
});

// Silencia endpoints de analitica externos durante pruebas locales.
app.all(['/frog.wix.com/*', '/panorama.wixapps.net/*'], (_req, res) => {
  res.status(204).end();
});

app.all(['/www/.google-analytics.com/*', '/.google-analytics.com/*'], (_req, res) => {
  res.type('application/javascript').status(200).send('');
});

app.all('/_api/tag-manager/*', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, X-XSRF-TOKEN');
  if (_req.method === 'OPTIONS') return res.status(204).end();
  return res.json({ tags: [], siteTags: [], consentPolicy: {}, settings: {} });
});

app.all('/_api/v1/access-tokens', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, X-XSRF-TOKEN');
  if (_req.method === 'OPTIONS') return res.status(204).end();
  return res.json({});
});

app.all('/_api/wix-code-app-registry-global/v1/public-code-config', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, X-XSRF-TOKEN');
  if (_req.method === 'OPTIONS') return res.status(204).end();
  return res.json({ codeAppConfigs: [] });
});

app.get('/_partials/wix-thunderbolt/dist/:file', (req, res) => {
  const localFile = path.join(assetsRoot, 'js', 'services', 'wix-thunderbolt', 'dist', req.params.file);
  if (fileExists(localFile)) return res.sendFile(localFile);
  return proxyRemoteJs(`https://static.parastorage.com/services/wix-thunderbolt/dist/${encodeURIComponent(req.params.file)}`, res);
});

app.use((req, _res, next) => {
  const host = getRequestHost(req);
  if (!isMirrorDomain(host) || isReservedHostRewritePath(req.path)) return next();
  if (req.path === `/${host}` || req.path.startsWith(`/${host}/`)) return next();
  const [pathname, query = ''] = req.url.split('?');
  req.url = `/${host}${pathname}${query ? `?${query}` : ''}`;
  return next();
});

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/assets/') || req.path.startsWith('/_api/')) return next();

  const rawUrlPath = (req.originalUrl || '').split('?')[0];
  const candidates = resolveCandidates(rawUrlPath, req.path);
  const htmlCandidate = candidates.find((candidate) => {
    if (!candidate.endsWith('.html')) return false;
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return false;
    return candidate.startsWith(sitesRoot) || candidate.startsWith(docsRoot);
  });

  if (!htmlCandidate) return next();

  try {
    const html = fs.readFileSync(htmlCandidate, 'utf8');
    const responseHtml = injectLocalHelperScripts(html);
    res.type('html');
    if (req.method === 'HEAD') {
      return res.status(200).end();
    }
    return res.send(responseHtml);
  } catch (_error) {
    return next();
  }
});

app.get('/:domain/index', (req, res, next) => {
  const { domain } = req.params;
  if (!/\.dehonline\.es$/i.test(domain)) return next();
  if (getRequestHost(req) === domain.toLowerCase()) {
    return res.redirect(301, '/');
  }
  return res.redirect(301, `/${domain}/`);
});

// Compatibilidad para rutas legacy incrustadas en los HTML de Wix.
app.use((req, res, next) => {
  const pathname = req.path;

  if (pathname.includes('&quot;')) {
    return res.status(204).end();
  }

  if (pathname.startsWith('/assets/misc/services/wix-thunderbolt/dist/')) {
    const rel = pathname.replace('/assets/misc/', '');
    const relNoSlash = rel.replace(/^\/+/, '');
    const ext = path.extname(relNoSlash).toLowerCase();
    const candidates = [];

    if (ext === '.css') {
      candidates.push(`css/${relNoSlash}`);
    }
    if (ext === '.js' || ext === '.map' || ext === '') {
      candidates.push(`js/${relNoSlash}`);
    }
    candidates.push(`misc/${relNoSlash}`);

    if (rewriteIfExists(req, candidates)) return next();

    const basename = path.basename(relNoSlash);
    if (basename) {
      return res.redirect(302, `https://static.parastorage.com/services/wix-thunderbolt/dist/${basename}`);
    }
    return next();
  }

  if (pathname.startsWith('/static.parastorage.com/services/')) {
    const rel = pathname.replace('/static.parastorage.com/', '');
    const relNoSlash = rel.replace(/^\/+/, '');
    if (rewriteIfExists(req, [`js/${relNoSlash}`, `misc/${relNoSlash}`])) return next();
    return res.redirect(302, `https://static.parastorage.com/${relNoSlash}`);
  }

  if (pathname.startsWith('/static.parastorage.com/unpkg/')) {
    const rel = pathname.replace('/static.parastorage.com/', '');
    const relNoSlash = rel.replace(/^\/+/, '');
    if (rewriteIfExists(req, [`js/${relNoSlash}`, `misc/${relNoSlash}`])) return next();
    return res.redirect(302, `https://static.parastorage.com/${relNoSlash}`);
  }

  if (pathname.startsWith('/assets/misc/static.wixstatic.com/media/')) {
    const [, legacyQuery = ''] = req.url.split('?');
    const legacyMediaPath = pathname
      .replace('/assets/misc/static.wixstatic.com/media/', '/')
      .replace(/\/{2,}/g, '/');
    const [rewrittenPath] = legacyMediaPath.split('?');

    if (rewrittenPath.startsWith('/img/')) {
      req.url = `${rewrittenPath}${legacyQuery ? `?${legacyQuery}` : ''}`;
      req._parsedUrl = null;
      req._parsedOriginalUrl = null;

      if (tryRewriteImageVariant(req)) {
        return next();
      }

      return next();
    }
  }

  if (pathname.startsWith('/assets/img/media/')) {
    const rel = pathname.replace('/assets/img/media/', '').split('/')[0];
    if (rel && isLikelyMediaToken(rel)) {
      const abs = path.join(assetsRoot, 'img', 'media', rel);
      if (!fileExists(abs)) {
        return res.status(204).end();
      }
    }
  }

  if (tryRewriteMediaVariant(req)) {
    return next();
  }

  if (tryRewriteImageVariant(req)) {
    return next();
  }

  return next();
});

app.use(
  '/img',
  express.static(imagesRoot, {
    extensions: ['html'],
    index: ['index.html'],
    fallthrough: true,
    maxAge: process.env.NODE_ENV === 'development' ? 0 : '1h'
  })
);

app.use(
  '/media',
  express.static(mediaRoot, {
    extensions: ['html'],
    index: ['index.html'],
    fallthrough: true,
    maxAge: process.env.NODE_ENV === 'development' ? 0 : '1h'
  })
);

app.use(
  '/css',
  express.static(cssRoot, {
    extensions: ['html'],
    index: ['index.html'],
    fallthrough: true,
    maxAge: process.env.NODE_ENV === 'development' ? 0 : '1h'
  })
);

app.use(
  '/js',
  express.static(jsRoot, {
    extensions: ['html'],
    index: ['index.html'],
    fallthrough: true,
    maxAge: process.env.NODE_ENV === 'development' ? 0 : '1h'
  })
);

app.use(
  '/assets',
  express.static(assetsRoot, {
    extensions: ['html'],
    index: ['index.html'],
    fallthrough: true,
    maxAge: process.env.NODE_ENV === 'development' ? 0 : '1h'
  })
);

app.use(
  '/docs',
  express.static(docsRoot, {
    extensions: ['html'],
    index: ['index.html'],
    fallthrough: true,
    maxAge: process.env.NODE_ENV === 'development' ? 0 : '1h'
  })
);

app.use(
  express.static(sitesRoot, {
    extensions: ['html'],
    index: ['index.html'],
    fallthrough: true,
    maxAge: process.env.NODE_ENV === 'development' ? 0 : '1h'
  })
);

app.get('/', (_req, res) => {
  res.redirect('/www.dehonline.es/');
});

app.get('*', (req, res, next) => {
  const rawUrlPath = (req.originalUrl || '').split('?')[0];
  const candidates = resolveCandidates(rawUrlPath, req.path);
  if (!candidates.length) return res.status(400).json({ error: 'Bad Path' });

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return res.sendFile(candidate);
    }
  }

  return next();
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

const server = http.createServer(app);
let portOffset = 0;

function writeServerState(port) {
  activePort = port;
  const payload = {
    pid: process.pid,
    port,
    preferredPort: PREFERRED_PORT,
    startedAt: new Date().toISOString()
  };
  try {
    fs.writeFileSync(SERVER_STATE_FILE, JSON.stringify(payload, null, 2));
  } catch (_error) {
    // El servidor puede seguir funcionando aunque no pueda persistir el puerto.
  }
}

function clearServerState() {
  try {
    if (!fs.existsSync(SERVER_STATE_FILE)) return;
    const payload = JSON.parse(fs.readFileSync(SERVER_STATE_FILE, 'utf8'));
    if (payload && payload.pid === process.pid) {
      fs.unlinkSync(SERVER_STATE_FILE);
    }
  } catch (_error) {
    // Ignora estados corruptos o ya eliminados.
  }
}

function startListening(port) {
  activePort = port;
  server.listen(port);
}

function shutdown(exitCode = 0) {
  clearServerState();
  if (!server.listening) {
    process.exit(exitCode);
    return;
  }
  server.close(() => process.exit(exitCode));
  setTimeout(() => process.exit(exitCode), 2000).unref();
}

server.on('error', (error) => {
  if (error.code !== 'EADDRINUSE') {
    console.error(`[descarga-express] Error al iniciar el servidor: ${error.message}`);
    shutdown(1);
    return;
  }

  portOffset += 1;
  if (portOffset > PORT_SEARCH_LIMIT) {
    console.error(`[descarga-express] No se encontro un puerto libre a partir de ${PREFERRED_PORT}.`);
    shutdown(1);
    return;
  }

  const fallbackPort = PREFERRED_PORT + portOffset;
  console.warn(`[descarga-express] Puerto ${activePort} ocupado. Reintentando en ${fallbackPort}...`);
  setImmediate(() => startListening(fallbackPort));
});

server.on('listening', () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : activePort;
  writeServerState(port);
  const suffix = port === PREFERRED_PORT ? '' : ` (fallback desde ${PREFERRED_PORT})`;
  console.log(`[descarga-express] Sirviendo sites=${sitesRoot} assets=${assetsRoot} en http://localhost:${port}${suffix}`);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('exit', clearServerState);

startListening(PREFERRED_PORT);
