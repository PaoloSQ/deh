const fs = require('fs');
const path = require('path');
const http = require('http');
const { ensureLocalServer } = require('./lib/runtime-utils');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BETA_LIST = path.resolve(REPO_ROOT, 'reports', 'beta.txt');
const REPORT_MD = path.resolve(__dirname, '..', 'BETA-LOCAL-ROUTES-REPORT.md');
const REPORT_JSON = path.resolve(__dirname, '..', 'BETA-LOCAL-ROUTES-REPORT.json');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8080';
const LOCAL_PREFIX = '/www.dehonline.es';
const CONCURRENCY = Number(process.env.CHECK_CONCURRENCY || 40);
const TIMEOUT_MS = Number(process.env.CHECK_TIMEOUT_MS || 10000);

function readBetaUrls() {
  return fs
    .readFileSync(BETA_LIST, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeBetaEntry(rawUrl) {
  const input = new URL(rawUrl);
  const decodedPath = decodeURIComponent(input.pathname || '/');
  const route = decodedPath || '/';
  const localPath = route === '/' ? `${LOCAL_PREFIX}/` : `${LOCAL_PREFIX}${route}`;

  return {
    sourceUrl: rawUrl,
    route,
    localPath
  };
}

function requestOne(entry) {
  return new Promise((resolve) => {
    const url = new URL(entry.localPath, BASE_URL);
    const req = http.request(
      {
        method: 'HEAD',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        timeout: TIMEOUT_MS
      },
      (res) => {
        resolve({
          ...entry,
          finalUrl: url.toString(),
          status: res.statusCode || 0,
          ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 400,
          error: ''
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({
        ...entry,
        finalUrl: url.toString(),
        status: 0,
        ok: false,
        error: 'timeout'
      });
    });

    req.on('error', (error) => {
      resolve({
        ...entry,
        finalUrl: url.toString(),
        status: 0,
        ok: false,
        error: error.message
      });
    });

    req.end();
  });
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let index = 0;

  async function next() {
    const current = index++;
    if (current >= items.length) return;
    results[current] = await worker(items[current]);
    await next();
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
  return results;
}

function writeReports(results) {
  const failed = results.filter((entry) => !entry.ok);
  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    count: results.length,
    ok: results.length - failed.length,
    failed: failed.length,
    failures: failed
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(payload, null, 2));

  const lines = [];
  lines.push('# Verificacion local de beta.txt');
  lines.push('');
  lines.push(`- Base URL: ${BASE_URL}`);
  lines.push(`- Prefijo local: ${LOCAL_PREFIX}`);
  lines.push(`- Rutas comprobadas: ${results.length}`);
  lines.push(`- OK: ${payload.ok}`);
  lines.push(`- Fallidas: ${payload.failed}`);
  lines.push('');

  if (failed.length) {
    lines.push('## Fallidas');
    lines.push('');
    lines.push('| Ruta beta | Ruta local | Estado | Error |');
    lines.push('|---|---|---:|---|');
    for (const entry of failed) {
      lines.push(
        `| ${entry.route.replace(/\|/g, '\\|')} | ${entry.localPath.replace(/\|/g, '\\|')} | ${entry.status} | ${(entry.error || '').replace(/\|/g, '\\|')} |`
      );
    }
  } else {
    lines.push('Sin fallos.');
  }

  fs.writeFileSync(REPORT_MD, `${lines.join('\n')}\n`);
}

async function main() {
  await ensureLocalServer(BASE_URL);
  const entries = readBetaUrls().map(normalizeBetaEntry);
  const results = await runPool(entries, requestOne, CONCURRENCY);
  writeReports(results);

  const failed = results.filter((entry) => !entry.ok);
  console.log(
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        checked: results.length,
        ok: results.length - failed.length,
        failed: failed.length
      },
      null,
      2
    )
  );

  process.exitCode = failed.length ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
