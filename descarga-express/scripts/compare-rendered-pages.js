const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const { spawn } = require('child_process');
const { getLocalBaseUrl } = require('./lib/runtime-utils');

const SITES_ROOT = path.resolve(__dirname, '..', 'sites');
const REPORT_PATH = path.resolve(__dirname, '..', 'RENDER-COMPARE-REPORT.md');
const JSON_REPORT_PATH = path.resolve(__dirname, '..', 'RENDER-COMPARE-REPORT.json');
const WAIT_AFTER_NETWORK_IDLE_MS = Number(process.env.RENDER_WAIT_MS || 4000);
const STABLE_INTERVAL_MS = Number(process.env.RENDER_STABLE_INTERVAL_MS || 1000);
const STABLE_ROUNDS = Number(process.env.RENDER_STABLE_ROUNDS || 3);
const CONCURRENCY = Number(process.env.RENDER_COMPARE_CONCURRENCY || 2);
const DEFAULT_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS || 120000);

function parseArgs(argv) {
  const options = {
    replace: false,
    onlyDifferent: false,
    limit: 0,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    filter: '',
    paths: []
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--replace') options.replace = true;
    else if (arg === '--only-different') options.onlyDifferent = true;
    else if (arg === '--limit') options.limit = Number(argv[++i] || 0);
    else if (arg === '--timeout') options.timeoutMs = Number(argv[++i] || DEFAULT_TIMEOUT_MS);
    else if (arg === '--filter') options.filter = String(argv[++i] || '').toLowerCase();
    else options.paths.push(arg);
  }

  return options;
}

function resolveLocalBase() {
  return process.env.LOCAL_BASE_URL || getLocalBaseUrl();
}

function requirePuppeteer() {
  const candidates = [
    path.resolve(__dirname, '..', 'node_modules', 'puppeteer'),
    path.resolve(__dirname, '..', '..', 'simplified', 'node_modules', 'puppeteer'),
    'puppeteer'
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (_error) {
      // Prueba el siguiente candidato.
    }
  }

  throw new Error('No se encontro puppeteer. Instala la dependencia o usa el workspace simplified.');
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs, out);
    else if (ent.isFile()) out.push(abs);
  }
  return out;
}

function isHtmlFile(filePath) {
  return ['.html', '.htm'].includes(path.extname(filePath).toLowerCase());
}

function unique(list) {
  return [...new Set(list)];
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/');
}

function routeFromRelativeHtml(relPath) {
  const posixRel = toPosix(relPath);
  if (/\/index\.html?$/i.test(posixRel)) {
    const route = '/' + posixRel.replace(/\/index\.html?$/i, '/');
    return route.replace(/\/\/+/g, '/');
  }
  return ('/' + posixRel.replace(/\.html?$/i, '')).replace(/\/\/+/g, '/');
}

function buildTargets(filePath, localBase) {
  const relPath = path.relative(SITES_ROOT, filePath);
  const posixRel = toPosix(relPath);
  const segments = posixRel.split('/');
  const domain = segments.shift();
  const routeWithinDomain = routeFromRelativeHtml(segments.join('/'));
  const remoteUrl = new URL(routeWithinDomain, `https://${domain}`).toString();
  const localUrl = new URL(('/' + domain + routeWithinDomain).replace(/\/\/+/g, '/'), localBase).toString();

  return {
    filePath,
    relPath: posixRel,
    domain,
    routeWithinDomain,
    localUrl,
    remoteUrl
  };
}

async function waitForRenderedPage(page, timeoutMs) {
  await page.waitForFunction(() => document.readyState === 'complete', { timeout: timeoutMs });
  await page.waitForNetworkIdle({ idleTime: 1000, timeout: timeoutMs });

  let lastHash = '';
  let stableCount = 0;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    const currentHash = crypto.createHash('sha1').update(html).digest('hex');

    if (currentHash === lastHash) {
      stableCount += 1;
    } else {
      stableCount = 0;
      lastHash = currentHash;
    }

    if (stableCount >= STABLE_ROUNDS) break;
    await new Promise((resolve) => setTimeout(resolve, STABLE_INTERVAL_MS));
  }

  await new Promise((resolve) => setTimeout(resolve, WAIT_AFTER_NETWORK_IDLE_MS));
}

async function captureRenderedPage(page, url, timeoutMs) {
  const logs = [];
  const consoleHandler = (msg) => logs.push({ type: 'console', level: msg.type(), text: msg.text() });
  const pageErrorHandler = (error) => logs.push({ type: 'pageerror', text: error.message });
  const responseHandler = (response) => {
    if (response.status() >= 400) {
      logs.push({
        type: 'response',
        status: response.status(),
        url: response.url()
      });
    }
  };
  const requestFailedHandler = (request) => {
    logs.push({
      type: 'requestfailed',
      url: request.url(),
      error: request.failure() ? request.failure().errorText : 'unknown'
    });
  };

  page.on('console', consoleHandler);
  page.on('pageerror', pageErrorHandler);
  page.on('response', responseHandler);
  page.on('requestfailed', requestFailedHandler);

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: timeoutMs });
    await waitForRenderedPage(page, timeoutMs);

    const doctype = await page.evaluate(() => {
      const dt = document.doctype;
      if (!dt) return '';
      return `<!DOCTYPE ${dt.name}${dt.publicId ? ` PUBLIC "${dt.publicId}"` : ''}${dt.systemId ? ` "${dt.systemId}"` : ''}>`;
    });
    const html = await page.content();
    const normalized = await page.evaluate(() => {
      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll('script, noscript').forEach((node) => node.remove());
      clone.querySelectorAll('iframe').forEach((node) => {
        node.removeAttribute('srcdoc');
        node.removeAttribute('data-src');
        node.removeAttribute('allowvr');
      });

      const volatileAttributes = [
        'data-reactroot',
        'data-reactid',
        'data-hydrated',
        'data-rendered',
        'nonce',
        'crossorigin',
        'integrity'
      ];

      clone.querySelectorAll('*').forEach((node) => {
        for (const attr of [...node.attributes]) {
          const name = attr.name.toLowerCase();
          if (volatileAttributes.includes(name) || name.startsWith('data-ssr') || name.startsWith('data-react')) {
            node.removeAttribute(attr.name);
          }
        }
      });

      return clone.outerHTML
        .replace(/\s+/g, ' ')
        .replace(/>\s+</g, '><')
        .trim();
    });

    return {
      finalUrl: page.url(),
      html: `${doctype}${html}`,
      normalized,
      hash: crypto.createHash('sha1').update(normalized).digest('hex'),
      logs
    };
  } finally {
    page.off('console', consoleHandler);
    page.off('pageerror', pageErrorHandler);
    page.off('response', responseHandler);
    page.off('requestfailed', requestFailedHandler);
  }
}

function summarizeLogs(logs) {
  const summary = {
    total: logs.length,
    errors: 0,
    warnings: 0,
    failedRequests: 0
  };

  for (const entry of logs) {
    if (entry.type === 'requestfailed' || entry.type === 'response') summary.failedRequests += 1;
    if (entry.type === 'pageerror' || entry.level === 'error') summary.errors += 1;
    if (entry.level === 'warning' || entry.level === 'warn') summary.warnings += 1;
  }

  return summary;
}

function trimSnippet(value, maxLength = 220) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function buildSnippetPair(a, b) {
  const maxPrefix = Math.min(a.length, b.length);
  let idx = 0;
  while (idx < maxPrefix && a[idx] === b[idx]) idx += 1;
  return {
    local: trimSnippet(a.slice(Math.max(0, idx - 80), idx + 140)),
    remote: trimSnippet(b.slice(Math.max(0, idx - 80), idx + 140))
  };
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function next() {
    const index = cursor++;
    if (index >= items.length) return;
    results[index] = await worker(items[index], index);
    await next();
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
  return results;
}

function checkHealth(url) {
  return new Promise((resolve) => {
    const target = new URL('/health', url);
    const req = http.get(target, (res) => {
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

async function ensureLocalServer(baseUrl = resolveLocalBase()) {
  if (await checkHealth(baseUrl)) {
    return {
      startedByScript: false,
      baseUrl,
      stop: async () => {}
    };
  }

  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'ignore'
  });

  const startDeadline = Date.now() + 30000;
  while (Date.now() < startDeadline) {
    const resolvedBaseUrl = resolveLocalBase();
    if (await checkHealth(resolvedBaseUrl)) {
      return {
        startedByScript: true,
        baseUrl: resolvedBaseUrl,
        stop: async () => {
          if (!child.killed) {
            child.kill('SIGTERM');
          }
        }
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (!child.killed) {
    child.kill('SIGTERM');
  }
  throw new Error(`No se pudo levantar el servidor local en ${resolveLocalBase()}.`);
}

function formatMarkdown(results, options, localBase) {
  const different = results.filter((item) => item.status === 'different');
  const same = results.filter((item) => item.status === 'same');
  const failed = results.filter((item) => item.status === 'error');

  let md = '# Comparacion de renderizado\n\n';
  md += `- Fecha: ${new Date().toISOString()}\n`;
  md += `- Local base: ${localBase}\n`;
  md += `- Reemplazo activado: ${options.replace ? 'si' : 'no'}\n`;
  md += `- Total analizadas: ${results.length}\n`;
  md += `- Iguales: ${same.length}\n`;
  md += `- Diferentes: ${different.length}\n`;
  md += `- Con error: ${failed.length}\n\n`;

  if (different.length) {
    md += '## Diferentes\n\n';
    md += '| Archivo | Ruta | Reemplazado | Hash local | Hash remoto |\n|---|---|---|---|---|\n';
    for (const item of different) {
      md += `| ${item.relPath} | ${item.routeWithinDomain} | ${item.replaced ? 'si' : 'no'} | ${item.localHash} | ${item.remoteHash} |\n`;
    }
    md += '\n';
  }

  if (failed.length) {
    md += '## Errores\n\n';
    md += '| Archivo | Mensaje |\n|---|---|\n';
    for (const item of failed) {
      md += `| ${item.relPath} | ${(item.error || '').replace(/\|/g, '\\|')} |\n`;
    }
    md += '\n';
  }

  md += '## Detalle\n\n';
  for (const item of results) {
    md += `### ${item.relPath}\n\n`;
    md += `- Estado: ${item.status}\n`;
    md += `- Ruta: ${item.routeWithinDomain}\n`;
    md += `- Local: ${item.localUrl}\n`;
    md += `- Remoto: ${item.remoteUrl}\n`;
    if (item.status !== 'error') {
      md += `- URL final local: ${item.localFinalUrl}\n`;
      md += `- URL final remota: ${item.remoteFinalUrl}\n`;
      md += `- Hash local: ${item.localHash}\n`;
      md += `- Hash remoto: ${item.remoteHash}\n`;
      md += `- Logs local: ${JSON.stringify(item.localLogSummary)}\n`;
      md += `- Logs remoto: ${JSON.stringify(item.remoteLogSummary)}\n`;
    }
    if (item.status === 'different' && item.diffSnippets) {
      md += `- Muestra local: \`${item.diffSnippets.local.replace(/`/g, "'")}\`\n`;
      md += `- Muestra remota: \`${item.diffSnippets.remote.replace(/`/g, "'")}\`\n`;
    }
    if (item.error) md += `- Error: ${item.error}\n`;
    md += '\n';
  }

  return md;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const puppeteer = requirePuppeteer();
  const localServer = await ensureLocalServer();
  const localBase = process.env.LOCAL_BASE_URL || localServer.baseUrl || resolveLocalBase();

  const htmlFiles = walk(SITES_ROOT).filter(isHtmlFile);
  const selectedFiles = unique(
    options.paths.length
      ? options.paths.map((item) => path.resolve(process.cwd(), item))
      : htmlFiles
  ).filter((filePath) => filePath.startsWith(SITES_ROOT) && fs.existsSync(filePath));

  let targets = selectedFiles.map((filePath) => buildTargets(filePath, localBase));
  if (options.filter) {
    targets = targets.filter((item) =>
      [item.relPath, item.routeWithinDomain, item.remoteUrl].some((value) => value.toLowerCase().includes(options.filter))
    );
  }
  if (options.limit > 0) targets = targets.slice(0, options.limit);

  if (!targets.length) {
    throw new Error('No hay paginas HTML seleccionadas para comparar.');
  }

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const results = await runPool(targets, CONCURRENCY, async (target) => {
        const localPage = await browser.newPage();
        const remotePage = await browser.newPage();

        try {
          const [localCapture, remoteCapture] = await Promise.all([
            captureRenderedPage(localPage, target.localUrl, options.timeoutMs),
            captureRenderedPage(remotePage, target.remoteUrl, options.timeoutMs)
          ]);

          const status = localCapture.hash === remoteCapture.hash ? 'same' : 'different';
          let replaced = false;

          if (status === 'different' && options.replace) {
            fs.writeFileSync(target.filePath, remoteCapture.html);
            replaced = true;
          }

          return {
            ...target,
            status,
            replaced,
            localFinalUrl: localCapture.finalUrl,
            remoteFinalUrl: remoteCapture.finalUrl,
            localHash: localCapture.hash,
            remoteHash: remoteCapture.hash,
            localLogSummary: summarizeLogs(localCapture.logs),
            remoteLogSummary: summarizeLogs(remoteCapture.logs),
            diffSnippets: status === 'different' ? buildSnippetPair(localCapture.normalized, remoteCapture.normalized) : null
          };
        } catch (error) {
          return {
            ...target,
            status: 'error',
            error: error.message
          };
        } finally {
          await localPage.close();
          await remotePage.close();
        }
      });

      const filteredResults = options.onlyDifferent
        ? results.filter((item) => item.status === 'different' || item.status === 'error')
        : results;

      fs.writeFileSync(JSON_REPORT_PATH, JSON.stringify(filteredResults, null, 2));
      fs.writeFileSync(REPORT_PATH, formatMarkdown(filteredResults, options, localBase));

      const summary = {
        localBaseUrl: localBase,
        localServerStartedByScript: localServer.startedByScript,
        total: filteredResults.length,
        same: filteredResults.filter((item) => item.status === 'same').length,
        different: filteredResults.filter((item) => item.status === 'different').length,
        error: filteredResults.filter((item) => item.status === 'error').length,
        replaced: filteredResults.filter((item) => item.replaced).length,
        report: REPORT_PATH,
        jsonReport: JSON_REPORT_PATH
      };

      console.log(JSON.stringify(summary, null, 2));
    } finally {
      await browser.close();
    }
  } finally {
    await localServer.stop();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
