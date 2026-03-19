const fs = require('fs');
const path = require('path');
const http = require('http');

const REPO = path.resolve(__dirname, '..');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';
const CONCURRENCY = Number(process.env.CHECK_CONCURRENCY || 40);

const domainRoot = path.join(REPO, 'sites', 'www.dehonline.es');
const cssDomainRoot = path.join(REPO, 'public', 'css', 'pages', 'www-dehonline-es');
const jsDomainRoot = path.join(REPO, 'public', 'js', 'pages', 'www-dehonline-es');

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function walk(dir, out = []) {
  if (!exists(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const next = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(next, out);
    else out.push(next);
  }
  return out;
}

function normalizeRoute(route) {
  if (!route) return null;
  return route.replace(/\\/g, '/').replace(/\/\/+/g, '/');
}

function toSiteUrl(file) {
  const rel = path.relative(path.join(REPO, 'sites'), file).split(path.sep).join('/');
  return `/${rel}`;
}

function toPublicUrl(file) {
  const rel = path.relative(path.join(REPO, 'public'), file).split(path.sep).join('/');
  return `/${rel}`;
}

function baseWebPathFor(file) {
  if (file.startsWith(path.join(REPO, 'sites') + path.sep)) return normalizeRoute(toSiteUrl(file));
  if (file.startsWith(path.join(REPO, 'public') + path.sep)) return normalizeRoute(toPublicUrl(file));
  return '/';
}

function resolveRef(baseWebPath, ref) {
  if (!ref) return null;
  const raw = String(ref).trim();
  if (!raw || raw.length > 350) return null;
  if (/\$\{[^}]+\}/.test(raw)) return null;
  if (/^(https?:)?\/\//i.test(raw)) return null;
  if (/^(data:|javascript:|mailto:|tel:|#)/i.test(raw)) return null;
  if (/^[a-zA-Z0-9_.$-]+$/.test(raw) && !raw.includes('/') && !raw.includes('.')) return null;
  if (/window\.|document\.|decodeURIComponent|encodeURIComponent/.test(raw)) return null;

  const noHash = raw.split('#')[0];
  const noQuery = noHash.split('?')[0];
  if (!noQuery) return null;
  if (/\s/.test(noQuery)) return null;
  if (/[<>`]/.test(noQuery)) return null;

  const cleaned = noQuery.replace(/^['"]|['"]$/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('/')) return normalizeRoute(cleaned);

  const baseDir = baseWebPath.endsWith('/')
    ? baseWebPath
    : baseWebPath.slice(0, baseWebPath.lastIndexOf('/') + 1);
  const joined = path.posix.normalize(path.posix.join(baseDir, cleaned));
  return normalizeRoute(joined.startsWith('/') ? joined : `/${joined}`);
}

function isNoise(route) {
  if (!route) return true;
  if (/^\/(?:undefined|null)(?:\/|$)/.test(route)) return true;
  return false;
}

function collectRoutes(files) {
  const htmlAttrRe = /(href|src|action)\s*=\s*(["'])(.*?)\2/gi;
  const cssUrlRe = /url\((['"]?)(.*?)\1\)/gi;
  const jsStringRe = /(["'`])((?:\\.|(?!\1).){1,300})\1/g;
  const routes = new Map();

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const text = fs.readFileSync(file, 'utf8');
    const baseWebPath = baseWebPathFor(file);
    let match;

    if (ext === '.html' || ext === '.htm') {
      while ((match = htmlAttrRe.exec(text))) {
        const route = resolveRef(baseWebPath, match[3]);
        if (route && !isNoise(route)) routes.set(route, (routes.get(route) || 0) + 1);
      }
      while ((match = cssUrlRe.exec(text))) {
        const route = resolveRef(baseWebPath, match[2]);
        if (route && !isNoise(route)) routes.set(route, (routes.get(route) || 0) + 1);
      }
      continue;
    }

    if (ext === '.css') {
      while ((match = cssUrlRe.exec(text))) {
        const route = resolveRef(baseWebPath, match[2]);
        if (route && !isNoise(route)) routes.set(route, (routes.get(route) || 0) + 1);
      }
      continue;
    }

    if (ext === '.js') {
      while ((match = jsStringRe.exec(text))) {
        const raw = match[2];
        if (!raw) continue;
        if (!(/^(\/|\.\/|\.\.\/)/.test(raw) || /\.(?:html?|css|js|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|eot|pdf)(?:$|[?#/])/i.test(raw))) {
          continue;
        }
        const route = resolveRef(baseWebPath, raw);
        if (route && !isNoise(route)) routes.set(route, (routes.get(route) || 0) + 1);
      }
    }
  }

  return [...routes.keys()].sort();
}

function checkOne(routePath) {
  return new Promise((resolve) => {
    const url = new URL(routePath, BASE);
    const req = http.request(
      {
        method: 'HEAD',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        timeout: 10000
      },
      (res) => {
        resolve({
          path: routePath,
          status: res.statusCode || 0,
          ok: res.statusCode >= 200 && res.statusCode < 400
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ path: routePath, status: 0, ok: false, error: 'timeout' });
    });
    req.on('error', (err) => {
      resolve({ path: routePath, status: 0, ok: false, error: err.message });
    });
    req.end();
  });
}

async function runPool(items, concurrency) {
  const results = new Array(items.length);
  let index = 0;

  async function next() {
    const current = index++;
    if (current >= items.length) return;
    results[current] = await checkOne(items[current]);
    await next();
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
  return results;
}

(async () => {
  const files = [
    ...walk(domainRoot).filter((file) => /\.(html?|css|js)$/i.test(file)),
    ...walk(cssDomainRoot).filter((file) => /\.(css|js)$/i.test(file)),
    ...walk(jsDomainRoot).filter((file) => /\.(css|js)$/i.test(file))
  ];

  const routes = collectRoutes(files);
  routes.push('/health');

  const uniqueRoutes = [...new Set(routes)].sort();
  const checked = await runPool(uniqueRoutes, CONCURRENCY);
  const failed = checked.filter((entry) => !entry.ok);

  const report = [];
  report.push('# Verificacion de referencias internas www.dehonline.es');
  report.push('');
  report.push(`- Base URL: ${BASE}`);
  report.push(`- Archivos analizados: ${files.length}`);
  report.push(`- Rutas unicas comprobadas: ${checked.length}`);
  report.push(`- OK: ${checked.length - failed.length}`);
  report.push(`- Fallidas: ${failed.length}`);
  report.push('');

  if (failed.length) {
    report.push('## Fallidas');
    report.push('');
    report.push('| Ruta | Estado | Error |');
    report.push('|---|---:|---|');
    for (const entry of failed) {
      report.push(`| ${entry.path.replace(/\|/g, '\\|')} | ${entry.status} | ${(entry.error || '').replace(/\|/g, '\\|')} |`);
    }
  } else {
    report.push('Sin fallos.');
  }

  const out = path.join(REPO, 'DEHONLINE-INTERNAL-LINKS-REPORT.md');
  fs.writeFileSync(out, report.join('\n'));

  console.log(JSON.stringify({
    baseUrl: BASE,
    filesAnalyzed: files.length,
    checked: checked.length,
    ok: checked.length - failed.length,
    failed: failed.length,
    report: out
  }, null, 2));
})();
