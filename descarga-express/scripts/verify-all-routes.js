const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', 'sites');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';
const CONCURRENCY = Number(process.env.CHECK_CONCURRENCY || 40);

const textExt = new Set(['.html', '.htm', '.xml', '.css', '.js']);
const refScanExt = new Set(['.html', '.htm', '.xml', '.css']);

function normalizeLegacyRoute(routePath) {
  if (!routePath || !routePath.startsWith('/')) return routePath;
  return routePath.replace(/\/\/+/g, '/');
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function toUrlPath(relPath) {
  return '/' + relPath.split(path.sep).join('/');
}

function collectFileBasedRoutes(allFiles) {
  const routes = new Set();
  const dirsWithIndex = new Set();

  for (const f of allFiles) {
    const rel = path.relative(ROOT, f);
    const webPath = normalizeLegacyRoute(toUrlPath(rel));
    routes.add(webPath);

    const ext = path.extname(f).toLowerCase();
    if (ext === '.html') {
      const noExt = webPath.replace(/\.html$/i, '');
      routes.add(noExt || '/');
    }

    if (path.basename(f).toLowerCase() === 'index.html') {
      const dir = path.dirname(rel);
      const dirPath = normalizeLegacyRoute('/' + (dir === '.' ? '' : dir.split(path.sep).join('/')));
      dirsWithIndex.add(dirPath || '/');
    }
  }

  for (const d of dirsWithIndex) {
    routes.add(d);
    routes.add(d.endsWith('/') ? d : d + '/');
  }

  return routes;
}

function resolveRef(baseWebPath, ref) {
  if (!ref) return null;
  const r = ref.trim();
  if (!r) return null;
  if (r.length > 300) return null;
  if (/^(https?:)?\/\//i.test(r)) return null;
  if (/^(data:|javascript:|mailto:|tel:|#)/i.test(r)) return null;
  if (/[`{}$]/.test(r)) return null;
  if (/\s/.test(r)) return null;

  const noHash = r.split('#')[0];
  const noQuery = noHash.split('?')[0];
  if (!noQuery) return null;

  if (/https?:\\\/\\\//i.test(noQuery)) return null;
  if (/[()|"']/.test(noQuery)) return null;
  if (/window\.location|decodeURIComponent/i.test(noQuery)) return null;
  if (/^(true|false)$/i.test(noQuery)) return null;
  if (/^[a-z]$/i.test(noQuery)) return null;

  // Evita capturar tokens de JS minificado como rutas relativas triviales.
  if (!noQuery.startsWith('/') && !/[/.]/.test(noQuery) && noQuery.length < 3) return null;

  if (noQuery.startsWith('/')) return normalizeLegacyRoute(noQuery);

  const baseDir = baseWebPath.endsWith('/')
    ? baseWebPath
    : baseWebPath.slice(0, baseWebPath.lastIndexOf('/') + 1);

  const joined = path.posix.normalize(path.posix.join(baseDir, noQuery));
  const normalized = joined.startsWith('/') ? joined : '/' + joined;
  return normalizeLegacyRoute(normalized);
}

function isNoiseRoute(routePath) {
  if (!routePath) return true;

  // Tokens de parseo que no representan rutas navegables.
  if (/\/(?:blog\/categories|blog\/page|grupos|post)?\/?page$/i.test(routePath)) return true;
  if (/\/siteAssets\/media\/(?:item\.uri|jquery-1\.8\.3\.js)$/i.test(routePath)) return true;

  return false;
}

function collectReferenceRoutes(allFiles) {
  const routes = new Set();
  const attrRe = /(href|src|action)\s*=\s*(["'])(.*?)\2/gi;
  const cssRe = /url\((['"]?)(.*?)\1\)/gi;

  for (const f of allFiles) {
    if (!refScanExt.has(path.extname(f).toLowerCase())) continue;
    const rel = path.relative(ROOT, f);
    const webPath = normalizeLegacyRoute(toUrlPath(rel));
    const txt = fs.readFileSync(f, 'utf8');

    let m;
    while ((m = attrRe.exec(txt))) {
      const p = resolveRef(webPath, m[3]);
      if (p && !isNoiseRoute(p)) routes.add(p);
    }
    while ((m = cssRe.exec(txt))) {
      const p = resolveRef(webPath, m[2]);
      if (p && !isNoiseRoute(p)) routes.add(p);
    }
  }

  return routes;
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
        const ok = res.statusCode >= 200 && res.statusCode < 400;
        resolve({ path: routePath, status: res.statusCode, ok });
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

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let idx = 0;

  async function next() {
    const i = idx++;
    if (i >= items.length) return;
    results[i] = await worker(items[i]);
    await next();
  }

  const jobs = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) jobs.push(next());
  await Promise.all(jobs);
  return results;
}

(async () => {
  const allFiles = walk(ROOT);
  const fromFiles = collectFileBasedRoutes(allFiles);
  const fromRefs = collectReferenceRoutes(allFiles);

  const allRoutes = new Set([...fromFiles, ...fromRefs]);
  allRoutes.add('/health');

  const sorted = [...allRoutes].sort();
  const checked = await runPool(sorted, checkOne, CONCURRENCY);

  const failed = checked.filter((x) => !x.ok);
  const summary = {
    baseUrl: BASE,
    filesScanned: allFiles.length,
    routesFromFiles: fromFiles.size,
    routesFromRefs: fromRefs.size,
    uniqueRoutesChecked: checked.length,
    ok: checked.length - failed.length,
    failed: failed.length
  };

  const out = path.resolve(__dirname, '..', 'ROUTES-CHECK-REPORT.md');
  let md = '# Verificacion completa de rutas\n\n';
  md += `- Base URL: ${summary.baseUrl}\n`;
  md += `- Archivos escaneados: ${summary.filesScanned}\n`;
  md += `- Rutas detectadas por estructura: ${summary.routesFromFiles}\n`;
  md += `- Rutas detectadas por referencias: ${summary.routesFromRefs}\n`;
  md += `- Rutas unicas comprobadas: ${summary.uniqueRoutesChecked}\n`;
  md += `- OK: ${summary.ok}\n`;
  md += `- Fallidas: ${summary.failed}\n\n`;

  if (failed.length) {
    md += '## Fallidas\n\n';
    md += '| Ruta | Estado | Error |\n|---|---:|---|\n';
    for (const f of failed.slice(0, 5000)) {
      md += `| ${f.path.replace(/\|/g, '\\|')} | ${f.status} | ${(f.error || '').replace(/\|/g, '\\|')} |\n`;
    }
  } else {
    md += 'Sin fallos.\n';
  }

  fs.writeFileSync(out, md);
  console.log(JSON.stringify(summary, null, 2));
})();
