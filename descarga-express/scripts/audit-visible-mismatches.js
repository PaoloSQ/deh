const fs = require('fs');
const path = require('path');

const {
  buildLocalMirrorUrl,
  ensureLocalServer,
  requirePuppeteer
} = require('./lib/runtime-utils');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const LATEST_REPORT_MD = path.resolve(PROJECT_ROOT, 'VISIBLE-MISMATCH-AUDIT.md');
const LATEST_REPORT_JSON = path.resolve(PROJECT_ROOT, 'VISIBLE-MISMATCH-AUDIT.json');
const ARTIFACTS_ROOT = path.resolve(PROJECT_ROOT, '.visible-mismatch-audit');
const DEFAULT_TIMEOUT_MS = Number(process.env.VISIBLE_MISMATCH_TIMEOUT_MS || 120000);
const MAX_SETTLE_MS = Number(process.env.VISIBLE_MISMATCH_MAX_SETTLE_MS || 15000);
const STABLE_INTERVAL_MS = Number(process.env.VISIBLE_MISMATCH_STABLE_INTERVAL_MS || 1000);
const STABLE_ROUNDS = Number(process.env.VISIBLE_MISMATCH_STABLE_ROUNDS || 3);
const WAIT_AFTER_STABLE_MS = Number(process.env.VISIBLE_MISMATCH_WAIT_AFTER_STABLE_MS || 1200);
const MAX_ITEMS = Number(process.env.VISIBLE_MISMATCH_MAX_ITEMS || 500);
const VISUAL_MARGIN_PX = Number(process.env.VISIBLE_MISMATCH_VISUAL_MARGIN_PX || 16);

const VIEWPORTS = {
  desktop: { name: 'desktop', width: 1600, height: 1200 },
  tablet: { name: 'tablet', width: 768, height: 1024 },
  mobile: { name: 'mobile', width: 390, height: 844 }
};

const TRACKING_HOSTS = [
  'frog.wix.com',
  'panorama.wixapps.net',
  'px.ads.linkedin.com',
  'snap.licdn.com',
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'facebook.net',
  'analytics.tiktok.com'
];

function parseArgs(argv) {
  const options = {
    domain: 'www.dehonline.es',
    route: '/',
    viewport: 'desktop',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    label: '',
    keepArtifacts: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--domain') options.domain = String(argv[index + 1] || options.domain);
    else if (arg === '--route') options.route = String(argv[index + 1] || options.route);
    else if (arg === '--viewport') options.viewport = String(argv[index + 1] || options.viewport);
    else if (arg === '--timeout') options.timeoutMs = Number(argv[index + 1] || options.timeoutMs);
    else if (arg === '--label') options.label = String(argv[index + 1] || '');
    else if (arg === '--no-artifacts') options.keepArtifacts = false;
  }

  if (!VIEWPORTS[options.viewport]) {
    throw new Error(`Viewport no soportado: ${options.viewport}`);
  }

  if (!options.route.startsWith('/')) {
    options.route = `/${options.route}`;
  }

  return options;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function trim(value, max = 160) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function requireVisualModule(moduleName) {
  const candidates = [
    path.resolve(__dirname, '..', 'node_modules', moduleName),
    path.resolve(__dirname, '..', '..', 'simplified', 'node_modules', moduleName),
    moduleName
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (_error) {
      // Sigue con el siguiente candidato.
    }
  }

  throw new Error(`No se encontro el modulo ${moduleName}.`);
}

function requirePixelmatch() {
  const pixelmatch = requireVisualModule('pixelmatch');
  return pixelmatch.default || pixelmatch;
}

function requirePng() {
  return requireVisualModule('pngjs').PNG;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function configurePage(page) {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    if (TRACKING_HOSTS.some((host) => url.includes(host))) {
      request.abort();
      return;
    }
    request.continue();
  });
}

async function dismissCookieBanner(page) {
  const clicked = await page.evaluate(() => {
    const texts = [
      'aceptar',
      'aceptar todo',
      'aceptar todas',
      'permitir',
      'allow all',
      'accept all',
      'accept',
      'ok'
    ];

    const isVisible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };

    const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]'));
    const target = candidates.find((node) => {
      const text = (node.innerText || node.value || '').trim().toLowerCase();
      return isVisible(node) && texts.includes(text);
    });

    if (target) {
      target.click();
      return true;
    }

    return false;
  });

  if (clicked) {
    await sleep(800);
  }
}

async function waitForStableState(page, timeoutMs) {
  await page.waitForFunction(
    () => document.body && document.readyState !== 'loading',
    { timeout: Math.min(timeoutMs, 5000) }
  ).catch(() => {});

  let previousSnapshot = '';
  let stableCount = 0;
  const deadline = Date.now() + Math.min(timeoutMs, MAX_SETTLE_MS);

  while (Date.now() < deadline) {
    const currentSnapshot = await page.evaluate(() => {
      const text = document.body ? document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 6000) : '';
      const images = Array.from(document.images)
        .map((img) => `${img.currentSrc || img.src}|${img.complete}|${img.naturalWidth}x${img.naturalHeight}`)
        .join(';');
      const media = Array.from(document.querySelectorAll('[style*="background-image"], wow-image'))
        .slice(0, 200)
        .map((node) => {
          const style = window.getComputedStyle(node);
          return `${node.id || node.tagName}|${style.backgroundImage}|${style.opacity}|${style.visibility}`;
        })
        .join(';');
      return JSON.stringify({
        text,
        images,
        media,
        scrollHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
      });
    });

    if (currentSnapshot === previousSnapshot) stableCount += 1;
    else {
      stableCount = 0;
      previousSnapshot = currentSnapshot;
    }

    if (stableCount >= STABLE_ROUNDS) break;
    await dismissCookieBanner(page);
    await sleep(STABLE_INTERVAL_MS);
  }

  await sleep(WAIT_AFTER_STABLE_MS);
}

async function walkPage(page) {
  const viewport = page.viewport();
  const step = Math.max(300, Math.floor((viewport?.height || 900) * 0.8));
  const viewportHeight = viewport?.height || 900;

  let lastHeight = 0;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const metrics = await page.evaluate(() => ({
      scrollHeight: Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight
      ),
      scrollY: window.scrollY
    }));

    if (metrics.scrollHeight === lastHeight && metrics.scrollY + viewportHeight >= metrics.scrollHeight) {
      break;
    }

    lastHeight = metrics.scrollHeight;
    const nextY = Math.min(metrics.scrollY + step, Math.max(0, metrics.scrollHeight - (viewport?.height || 900)));
    await page.evaluate((scrollY) => window.scrollTo({ top: scrollY, behavior: 'instant' }), nextY);
    await sleep(400);
  }

  await sleep(600);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await sleep(500);
}

async function captureState(page, url, timeoutMs, screenshotPath) {
  const logs = [];
  page.on('console', (msg) => logs.push({ type: 'console', level: msg.type(), text: msg.text() }));
  page.on('pageerror', (error) => logs.push({ type: 'pageerror', text: error.message }));
  page.on('requestfailed', (request) => logs.push({
    type: 'requestfailed',
    url: request.url(),
    error: request.failure() ? request.failure().errorText : 'unknown'
  }));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      logs.push({ type: 'response', status: response.status(), url: response.url() });
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await dismissCookieBanner(page);
  await waitForStableState(page, timeoutMs);
  await walkPage(page);
  await waitForStableState(page, timeoutMs);

  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }

  const elements = await page.evaluate((limit) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const clipRect = (rect) => ({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    });

    const getFirstLink = (node) => {
      const direct = node.matches('a[href]') ? node : node.querySelector('a[href]');
      return direct ? direct.getAttribute('href') || '' : '';
    };

    const getImages = (node) =>
      Array.from(node.querySelectorAll('img'))
        .filter((img) => {
          const rect = img.getBoundingClientRect();
          return rect.width >= 12 && rect.height >= 12;
        })
        .slice(0, 8)
        .map((img) => ({
          src: img.currentSrc || img.src || '',
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight
        }));

    const getBackgroundImage = (node) => {
      const style = window.getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage !== 'none') return style.backgroundImage;
      const bgNode = node.querySelector('[style*="background-image"], .bgLayers, .K8MSra, wow-image');
      if (!bgNode) return '';
      return window.getComputedStyle(bgNode).backgroundImage || '';
    };

    const isMeaningful = (node, rect, text, images, backgroundImage, href, className) => {
      if (rect.width < 18 || rect.height < 18) return false;
      if (text) return true;
      if (images.length > 0) return true;
      if (backgroundImage && backgroundImage !== 'none') return true;
      if (href) return true;
      if (/\bwixui-vector-image\b/i.test(className || '')) return true;
      return false;
    };

    const nodes = Array.from(document.querySelectorAll('[id]'));
    const results = [];

    for (const node of nodes) {
      const id = node.id || '';
      if (!id || id.startsWith('oldHoverBox-')) continue;

      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      const text = normalize(node.innerText || '');
      const images = getImages(node);
      const backgroundImage = getBackgroundImage(node);
      const href = getFirstLink(node);
      const className = typeof node.className === 'string' ? node.className : '';

      if (!isMeaningful(node, rect, text, images, backgroundImage, href, className)) continue;

      const opacity = Number(style.opacity || '1');
      const rendered =
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        opacity > 0.05;

      results.push({
        id,
        tag: node.tagName.toLowerCase(),
        className,
        text: text.slice(0, 220),
        textLength: text.length,
        href,
        rect: clipRect(rect),
        opacity,
        display: style.display,
        visibility: style.visibility,
        transform: style.transform,
        animationName: style.animationName,
        pointerEvents: style.pointerEvents,
        rendered,
        imageCount: images.length,
        loadedImageCount: images.filter((img) => img.complete && img.naturalWidth > 1 && img.naturalHeight > 1).length,
        missingImageCount: images.filter((img) => !img.complete || img.naturalWidth <= 1 || img.naturalHeight <= 1).length,
        hasBackgroundImage: Boolean(backgroundImage && backgroundImage !== 'none'),
        backgroundImage
      });
    }

    return results.slice(0, limit);
  }, MAX_ITEMS);

  return { elements, logs };
}

function rectDistance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

function normalizeClip(rect, image, margin = 0) {
  const x = Math.max(0, Math.floor((rect?.x || 0) - margin));
  const y = Math.max(0, Math.floor((rect?.y || 0) - margin));
  const width = Math.max(1, Math.min(image.width - x, Math.ceil((rect?.width || 1) + margin * 2)));
  const height = Math.max(1, Math.min(image.height - y, Math.ceil((rect?.height || 1) + margin * 2)));
  return { x, y, width, height };
}

function cropPng(source, rect, PNG) {
  const clip = normalizeClip(rect, source, 0);
  const target = new PNG({ width: clip.width, height: clip.height });

  for (let row = 0; row < clip.height; row += 1) {
    const sourceStart = ((clip.y + row) * source.width + clip.x) * 4;
    const sourceEnd = sourceStart + clip.width * 4;
    source.data.copy(target.data, row * clip.width * 4, sourceStart, sourceEnd);
  }

  return target;
}

function ensureSameSize(a, b, PNG) {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const pad = (source) => {
    if (source.width === width && source.height === height) return source;
    const padded = new PNG({ width, height });
    source.data.copy(padded.data);
    for (let row = 0; row < source.height; row += 1) {
      const sourceStart = row * source.width * 4;
      const sourceEnd = sourceStart + source.width * 4;
      const targetStart = row * width * 4;
      source.data.copy(padded.data, targetStart, sourceStart, sourceEnd);
    }
    return padded;
  };
  return [pad(a), pad(b)];
}

function writePng(filePath, png) {
  fs.writeFileSync(filePath, requirePng().sync.write(png));
}

function enrichWithVisualDiffs(mismatches, artifactDir, localScreenshotPath, remoteScreenshotPath) {
  if (!fs.existsSync(localScreenshotPath) || !fs.existsSync(remoteScreenshotPath)) return mismatches;

  const PNG = requirePng();
  const pixelmatch = requirePixelmatch();
  const localFull = PNG.sync.read(fs.readFileSync(localScreenshotPath));
  const remoteFull = PNG.sync.read(fs.readFileSync(remoteScreenshotPath));
  const elementDir = path.join(artifactDir, 'elements');
  ensureDir(elementDir);

  return mismatches.map((mismatch, index) => {
    if (!mismatch.local?.rect || !mismatch.remote?.rect) return mismatch;

    const localCrop = cropPng(localFull, normalizeClip(mismatch.local.rect, localFull, VISUAL_MARGIN_PX), PNG);
    const remoteCrop = cropPng(remoteFull, normalizeClip(mismatch.remote.rect, remoteFull, VISUAL_MARGIN_PX), PNG);
    const [localSized, remoteSized] = ensureSameSize(localCrop, remoteCrop, PNG);
    const diff = new PNG({ width: localSized.width, height: localSized.height });
    const changedPixels = pixelmatch(
      localSized.data,
      remoteSized.data,
      diff.data,
      localSized.width,
      localSized.height,
      { threshold: 0.12, includeAA: true }
    );
    const totalPixels = localSized.width * localSized.height;
    const ratio = totalPixels > 0 ? changedPixels / totalPixels : 0;
    const fileBase = `${String(index).padStart(2, '0')}-${slugify(mismatch.id)}`;
    const localPath = path.join(elementDir, `${fileBase}-local.png`);
    const remotePath = path.join(elementDir, `${fileBase}-remote.png`);
    const diffPath = path.join(elementDir, `${fileBase}-diff.png`);
    writePng(localPath, localSized);
    writePng(remotePath, remoteSized);
    writePng(diffPath, diff);

    return {
      ...mismatch,
      visual: {
        changedPixels,
        totalPixels,
        diffRatio: Number(ratio.toFixed(6)),
        localPath,
        remotePath,
        diffPath
      }
    };
  });
}

function compare(localElements, remoteElements) {
  const localById = new Map(localElements.map((item) => [item.id, item]));
  const mismatches = [];

  for (const remote of remoteElements) {
    const local = localById.get(remote.id);
    if (!local) {
      mismatches.push({
        id: remote.id,
        type: 'local-missing',
        reasons: ['missing-local-node'],
        local: null,
        remote
      });
      continue;
    }

    const reasons = [];
    const distance = rectDistance(local.rect, remote.rect);

    if (remote.rendered && !local.rendered) reasons.push('remote-visible-local-hidden');
    if (remote.opacity >= 0.95 && local.opacity <= 0.05) reasons.push('opacity-stuck-at-zero');
    if (remote.animationName === 'none' && local.animationName !== 'none') reasons.push('stale-animation-state');
    if (remote.transform === 'none' && local.transform !== 'none') reasons.push('transform-not-settled');
    if (remote.textLength > 0 && local.textLength === 0) reasons.push('text-missing');
    if (remote.loadedImageCount > 0 && local.loadedImageCount === 0 && local.imageCount > 0) reasons.push('images-not-painted');
    if (remote.hasBackgroundImage && !local.hasBackgroundImage) reasons.push('background-missing');
    if (distance > 24) reasons.push('layout-drift');

    if (reasons.length > 0) {
      mismatches.push({
        id: remote.id,
        type: reasons[0],
        reasons,
        local,
        remote
      });
    }
  }

  return mismatches;
}

function writeReports(report) {
  fs.writeFileSync(LATEST_REPORT_JSON, JSON.stringify(report, null, 2));

  const typeRows = countBy(report.mismatches, (item) => item.type);
  const lines = [
    '# Auditoria de mismatches visibles',
    '',
    `- Fecha: ${report.generatedAt}`,
    `- Dominio: ${report.domain}`,
    `- Ruta: ${report.route}`,
    `- Viewport: ${report.viewport.name} (${report.viewport.width}x${report.viewport.height})`,
    `- URL local: ${report.localUrl}`,
    `- URL remota: ${report.remoteUrl}`,
    `- Reporte JSON: ${LATEST_REPORT_JSON}`,
    '',
    '## Resumen',
    '',
    `- Elementos locales: ${report.localElementCount}`,
    `- Elementos remotos: ${report.remoteElementCount}`,
    `- Mismatches detectados: ${report.mismatches.length}`,
    `- Mismatches con diff visual > 1%: ${report.mismatches.filter((item) => (item.visual?.diffRatio || 0) > 0.01).length}`,
    '',
    '## Tipos',
    ''
  ];

  if (typeRows.length > 0) {
    lines.push('| Tipo | Conteo |');
    lines.push('|---|---:|');
    for (const [type, count] of typeRows) {
      lines.push(`| ${type} | ${count} |`);
    }
  } else {
    lines.push('Sin mismatches visibles.');
  }

  lines.push('', '## Detalle', '');

  if (report.mismatches.length > 0) {
    lines.push('| ID | Tipo | Motivos | Diff visual | Local | Remota |');
    lines.push('|---|---|---|---:|---|---|');
    for (const mismatch of report.mismatches) {
      const localState = mismatch.local
        ? `op=${mismatch.local.opacity}; anim=${trim(mismatch.local.animationName, 40)}; text=${trim(mismatch.local.text, 60)}`
        : '-';
      const remoteState = mismatch.remote
        ? `op=${mismatch.remote.opacity}; anim=${trim(mismatch.remote.animationName, 40)}; text=${trim(mismatch.remote.text, 60)}`
        : '-';
      const visual = mismatch.visual ? `${(mismatch.visual.diffRatio * 100).toFixed(2)}%` : '-';
      lines.push(`| ${mismatch.id} | ${mismatch.type} | ${mismatch.reasons.join(', ')} | ${visual} | ${localState} | ${remoteState} |`);
    }
  } else {
    lines.push('Sin diferencias detectadas.');
  }

  lines.push('');
  fs.writeFileSync(LATEST_REPORT_MD, `${lines.join('\n')}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const viewport = VIEWPORTS[options.viewport];
  const label = options.label || `${slugify(options.domain)}-${slugify(options.route || 'home')}`;
  const artifactDir = path.join(ARTIFACTS_ROOT, `${label}-${viewport.name}`);
  ensureDir(artifactDir);
  const localScreenshotPath = options.keepArtifacts ? path.join(artifactDir, 'local-full.png') : null;
  const remoteScreenshotPath = options.keepArtifacts ? path.join(artifactDir, 'remote-full.png') : null;

  const localUrl = buildLocalMirrorUrl(options.domain, options.route);
  const remoteUrl = `https://${options.domain}${options.route}`;

  const server = await ensureLocalServer();
  const puppeteer = requirePuppeteer();
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  try {
    const localPage = await browser.newPage();
    const remotePage = await browser.newPage();
    await localPage.setViewport(viewport);
    await remotePage.setViewport(viewport);
    await configurePage(localPage);
    await configurePage(remotePage);

    const [localState, remoteState] = await Promise.all([
      captureState(localPage, localUrl, options.timeoutMs, localScreenshotPath),
      captureState(remotePage, remoteUrl, options.timeoutMs, remoteScreenshotPath)
    ]);

    const mismatches = enrichWithVisualDiffs(
      compare(localState.elements, remoteState.elements),
      artifactDir,
      localScreenshotPath,
      remoteScreenshotPath
    );
    const report = {
      generatedAt: new Date().toISOString(),
      domain: options.domain,
      route: options.route,
      viewport,
      localUrl,
      remoteUrl,
      localElementCount: localState.elements.length,
      remoteElementCount: remoteState.elements.length,
      mismatches
    };

    writeReports(report);
    console.log(JSON.stringify({
      localElementCount: report.localElementCount,
      remoteElementCount: report.remoteElementCount,
      mismatchCount: report.mismatches.length,
      visualMismatchCount: report.mismatches.filter((item) => (item.visual?.diffRatio || 0) > 0.01).length,
      topTypes: countBy(report.mismatches, (item) => item.type).slice(0, 8)
    }, null, 2));
  } finally {
    await browser.close().catch(() => {});
    await server.stop().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
