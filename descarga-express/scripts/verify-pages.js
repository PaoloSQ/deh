const fs = require('fs');
const path = require('path');

const {
  buildHostBasedUrl,
  buildLocalMirrorUrl,
  getLocalBaseUrl,
  isLocalUrlCandidate,
  requirePuppeteer,
  ensureLocalServer,
  walk,
  isHtmlFile,
  toPosix
} = require('./lib/runtime-utils');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const REPORT_MD = path.resolve(__dirname, '..', 'VERIFY-PAGES-REPORT.md');
const REPORT_JSON = path.resolve(__dirname, '..', 'VERIFY-PAGES-REPORT.json');
const WAIT_MS = Number(process.env.VERIFY_WAIT_MS || 4000);
const CONCURRENCY = Number(process.env.VERIFY_CONCURRENCY || 2);
const VERIFY_USE_HOSTS = process.env.VERIFY_USE_HOSTS !== '0';

function parseArgs(argv) {
  const options = {
    filter: '',
    limit: 0,
    timeoutMs: Number(process.env.VERIFY_TIMEOUT_MS || 120000),
    paths: []
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--filter') options.filter = String(argv[++i] || '').toLowerCase();
    else if (arg === '--limit') options.limit = Number(argv[++i] || 0);
    else if (arg === '--timeout') options.timeoutMs = Number(argv[++i] || options.timeoutMs);
    else options.paths.push(path.resolve(process.cwd(), arg));
  }

  return options;
}

function routeFromRelativeHtml(relPath, localBase) {
  const posixRel = toPosix(relPath);
  if (posixRel.startsWith('sites/')) {
    const segments = posixRel.split('/');
    segments.shift();
    const domain = segments.shift();
    const rest = segments.join('/');
    const route = ('/' + rest).replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '');
    return VERIFY_USE_HOSTS ? buildHostBasedUrl(domain, route, localBase) : buildLocalMirrorUrl(domain, route, localBase);
  }
  if (posixRel.startsWith('public/assets/')) {
    return new URL(
      ('/' + posixRel.replace(/^public\//, '')).replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '').replace(/\/\/+/g, '/'),
      localBase
    ).toString();
  }
  if (posixRel.startsWith('public/docs/')) {
    return new URL(
      ('/' + posixRel.replace(/^public\//, '')).replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '').replace(/\/\/+/g, '/'),
      localBase
    ).toString();
  }
  return null;
}

function classifyIssue(entry, localBase) {
  const url = entry.url || '';
  const text = entry.text || '';

  if (isLocalUrlCandidate(url, localBase)) {
    return url.includes('/_api/') ? 'local-api' : 'local-file';
  }
  if (/frog\.wix\.com|panorama\.wixapps\.net|tag-manager|px\.ads\.linkedin|snap\.licdn\.com|sentry-next\.wixpress\.com|visitor-analytics\.io|statcounter\.va-endpoint\.com/i.test(url + ' ' + text)) {
    return 'third-party';
  }
  if (/clientWorker|thunderbolt|blob:https:\/\/www\.dehonline\.es|SecurityError/i.test(url + ' ' + text)) {
    return 'runtime';
  }
  return 'other';
}

function computeStatus(categorized, counts) {
  if (counts['local-file']) return 'local-file-issues';
  if (categorized.some((issue) => issue.type === 'pageerror')) return 'pageerror';
  if (counts.runtime) return 'runtime-issues';
  if (counts['third-party']) return 'third-party-issues';
  if (counts['local-api']) return 'local-api-issues';
  return 'ok';
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;

  async function next() {
    const index = cursor++;
    if (index >= items.length) return;
    results[index] = await worker(items[index]);
    await next();
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
  return results;
}

function formatReport(results, localBase) {
  let md = '# Verificacion de paginas\n\n';
  md += `- Fecha: ${new Date().toISOString()}\n`;
  md += `- Base local: ${localBase}\n`;
  md += `- Verificacion por host: ${VERIFY_USE_HOSTS ? 'si' : 'no'}\n`;
  md += `- Paginas analizadas: ${results.length}\n\n`;
  md += '| Archivo | Estado | Local files | Local API | Terceros | Runtime |\n|---|---|---:|---:|---:|---:|\n';
  for (const item of results) {
    md += `| ${item.relPath} | ${item.status} | ${item.counts['local-file']} | ${item.counts['local-api']} | ${item.counts['third-party']} | ${item.counts.runtime} |\n`;
  }
  md += '\n';

  for (const item of results) {
    md += `## ${item.relPath}\n\n`;
    md += `- URL: ${item.url}\n`;
    md += `- Estado: ${item.status}\n`;
    md += `- Conteo: ${JSON.stringify(item.counts)}\n`;
    if (item.error) {
      md += `- Error: ${item.error}\n\n`;
      continue;
    }
    for (const issue of item.issues.slice(0, 40)) {
      md += `- [${issue.category}] ${issue.type} ${issue.status || ''} ${issue.url || issue.text || ''}\n`;
    }
    md += '\n';
  }

  return md;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = (options.paths.length ? options.paths : walk(PROJECT_ROOT).filter(isHtmlFile))
    .filter((filePath) => filePath.startsWith(PROJECT_ROOT) && fs.existsSync(filePath))
    .filter((filePath) => !/[/\\](node_modules|scripts)[/\\]/.test(filePath))
    .filter((filePath) => {
      const rel = toPosix(path.relative(PROJECT_ROOT, filePath));
      return rel.startsWith('sites/') || rel.startsWith('public/assets/') || rel.startsWith('public/docs/');
    })
    .filter((filePath) => !options.filter || toPosix(path.relative(PROJECT_ROOT, filePath)).toLowerCase().includes(options.filter))
    .slice(0, options.limit > 0 ? options.limit : undefined);

  if (!files.length) throw new Error('No hay paginas HTML seleccionadas para verificar.');

  const localServer = await ensureLocalServer(getLocalBaseUrl());
  const localBase = process.env.LOCAL_BASE_URL || localServer.baseUrl || getLocalBaseUrl();
  const puppeteer = requirePuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--host-resolver-rules=MAP *.dehonline.es 127.0.0.1, MAP dehonline.es 127.0.0.1, EXCLUDE localhost'
    ]
  });

  try {
    const results = await runPool(
      files.map((filePath) => {
        const relPath = path.relative(PROJECT_ROOT, filePath);
        const route = routeFromRelativeHtml(relPath, localBase);
        return {
          filePath,
          relPath: toPosix(relPath),
          url: route
        };
      }),
      async (target) => {
        const page = await browser.newPage();
        const issues = [];
        page.on('console', (msg) => issues.push({ type: 'console', level: msg.type(), text: msg.text() }));
        page.on('pageerror', (error) => issues.push({ type: 'pageerror', text: error.message }));
        page.on('requestfailed', (request) => issues.push({
          type: 'requestfailed',
          url: request.url(),
          error: request.failure() ? request.failure().errorText : 'unknown'
        }));
        page.on('response', (response) => {
          if (response.status() >= 400) {
            issues.push({ type: 'response', status: response.status(), url: response.url() });
          }
        });

        try {
          await page.goto(target.url, { waitUntil: 'networkidle2', timeout: options.timeoutMs });
          await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
          const categorized = issues.map((issue) => ({ ...issue, category: classifyIssue(issue, localBase) }));
          const counts = categorized.reduce((acc, issue) => {
            acc[issue.category] += 1;
            return acc;
          }, { 'local-file': 0, 'local-api': 0, 'third-party': 0, runtime: 0, other: 0 });
          return {
            ...target,
            status: computeStatus(categorized, counts),
            counts,
            issues: categorized
          };
        } catch (error) {
          return {
            ...target,
            status: 'error',
            error: error.message,
            counts: { 'local-file': 0, 'local-api': 0, 'third-party': 0, runtime: 0, other: 0 },
            issues: []
          };
        } finally {
          await page.close();
        }
      },
      CONCURRENCY
    );

    fs.writeFileSync(REPORT_JSON, JSON.stringify(results, null, 2));
    fs.writeFileSync(REPORT_MD, formatReport(results, localBase));

    const summary = {
      processed: results.length,
      localFileIssues: results.filter((item) => item.counts['local-file'] > 0).length,
      localApiIssues: results.filter((item) => item.counts['local-api'] > 0).length,
      thirdPartyIssues: results.filter((item) => item.counts['third-party'] > 0).length,
      runtimeIssues: results.filter((item) => item.counts.runtime > 0).length,
      report: REPORT_MD,
      jsonReport: REPORT_JSON
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
    await localServer.stop();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
