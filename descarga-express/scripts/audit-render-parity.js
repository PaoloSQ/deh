const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  buildLocalMirrorUrl,
  getLocalBaseUrl,
  requirePuppeteer,
  ensureLocalServer
} = require('./lib/runtime-utils');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const LATEST_REPORT_MD = path.resolve(PROJECT_ROOT, 'PARITY-AUDIT.md');
const LATEST_REPORT_JSON = path.resolve(PROJECT_ROOT, 'PARITY-AUDIT.json');
const ARTIFACTS_ROOT = path.resolve(PROJECT_ROOT, '.parity-audit');
const DEFAULT_TIMEOUT_MS = Number(process.env.PARITY_TIMEOUT_MS || 120000);
const MAX_SETTLE_MS = Number(process.env.PARITY_MAX_SETTLE_MS || 15000);
const STABLE_INTERVAL_MS = Number(process.env.PARITY_STABLE_INTERVAL_MS || 1000);
const STABLE_ROUNDS = Number(process.env.PARITY_STABLE_ROUNDS || 3);
const WAIT_AFTER_STABLE_MS = Number(process.env.PARITY_WAIT_AFTER_STABLE_MS || 1500);

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

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--domain') options.domain = String(argv[++i] || options.domain);
    else if (arg === '--route') options.route = String(argv[++i] || options.route);
    else if (arg === '--viewport') options.viewport = String(argv[++i] || options.viewport);
    else if (arg === '--timeout') options.timeoutMs = Number(argv[++i] || options.timeoutMs);
    else if (arg === '--label') options.label = String(argv[++i] || '');
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
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function trim(value, max = 220) {
  if (!value) return '';
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hash(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function canonicalAssetKey(value) {
  if (!value) return '';
  try {
    const url = new URL(value, 'http://local.test');
    const pathname = decodeURIComponent(url.pathname);
    const mediaMatch =
      pathname.match(/\/(?:assets\/img\/)?media\/([^/]+)\/v1\//i) ||
      pathname.match(/\/media\/([^/]+)\/v1\//i);
    if (mediaMatch) return mediaMatch[1];

    const fileMatch = pathname.match(/\/_files\/ugd\/([^/?#]+)/i);
    if (fileMatch) return fileMatch[1];

    const pieces = pathname.split('/').filter(Boolean);
    return `${url.hostname}:${pieces.slice(-2).join('/') || pathname}`;
  } catch {
    return String(value);
  }
}

function extractBackgroundAssetKeys(backgroundImage) {
  const matches = [];
  const regex = /url\((['"]?)(.*?)\1\)/g;
  let match = regex.exec(backgroundImage || '');
  while (match) {
    matches.push(canonicalAssetKey(match[2]));
    match = regex.exec(backgroundImage || '');
  }
  return unique(matches);
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

function summarizeConsole(logs) {
  return logs.filter((entry) => entry.type === 'console' || entry.type === 'pageerror');
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

    const knownSelectors = [
      '#onetrust-accept-btn-handler',
      '[data-testid="uc-accept-all-button"]',
      '#hs-eu-confirmation-button',
      '.cky-btn-accept'
    ];

    for (const selector of knownSelectors) {
      const node = document.querySelector(selector);
      if (isVisible(node)) {
        node.click();
        return true;
      }
    }

    return false;
  });

  if (clicked) {
    await sleep(800);
  }
}

async function walkPage(page) {
  const viewport = page.viewport();
  const step = Math.max(300, Math.floor((viewport?.height || 900) * 0.8));
  const viewportHeight = viewport?.height || 900;

  let lastHeight = 0;
  for (let iteration = 0; iteration < 40; iteration++) {
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
    await sleep(450);
  }

  await sleep(700);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await sleep(500);
}

async function waitForStableState(page, timeoutMs) {
  await page.waitForFunction(() => document.readyState === 'complete', { timeout: timeoutMs });

  let previousHash = '';
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

    const currentHash = hash(currentSnapshot);
    if (currentHash === previousHash) {
      stableCount += 1;
    } else {
      stableCount = 0;
      previousHash = currentHash;
    }

    if (stableCount >= STABLE_ROUNDS) break;
    await dismissCookieBanner(page);
    await sleep(STABLE_INTERVAL_MS);
  }

  await sleep(WAIT_AFTER_STABLE_MS);
}

function buildArtifactPaths(baseDir, label) {
  return {
    screenshot: path.join(baseDir, `${label}-full.png`),
    summary: path.join(baseDir, `${label}-summary.json`)
  };
}

function sectionClip(section, viewport) {
  const height = Math.max(1, Math.round(section.rect.height));
  const width = Math.max(1, Math.min(Math.round(section.rect.width), viewport.width));
  return {
    x: 0,
    y: Math.max(0, Math.round(section.rect.y)),
    width,
    height
  };
}

async function captureSectionScreenshots(page, sections, prefix, outputDir, viewport, side) {
  const captured = [];
  for (const section of sections) {
    const fileName = `${prefix}-${String(section.local?.index ?? section.remote?.index ?? 0).padStart(2, '0')}-${slugify(section.key || section.local?.id || section.remote?.id || 'section')}.png`;
    const filePath = path.join(outputDir, fileName);
    const target = side === 'local' ? section.local : section.remote;
    if (!target || !target.rect || target.rect.height < 1) continue;
    try {
      await page.screenshot({
        path: filePath,
        clip: sectionClip(target, viewport)
      });
      captured.push(filePath);
    } catch (_error) {
      // Ignora clips invalidos.
    }
  }
  return captured;
}

async function captureState(page, label, url, artifactDir, timeoutMs) {
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

  const paths = buildArtifactPaths(artifactDir, label);
  await page.screenshot({ path: paths.screenshot, fullPage: true });

  const snapshot = await page.evaluate(() => {
    const pageInlineContent =
      document.querySelector('#SITE_PAGES [id^="Container"] > [data-testid="inline-content"][data-mesh-id$="inlineContent"]') ||
      document.querySelector('#SITE_PAGES [data-testid="inline-content"][data-mesh-id$="inlineContent"]') ||
      document.querySelector('[data-testid="inline-content"][data-mesh-id$="inlineContent"]');

    const gridContainer = pageInlineContent
      ? Array.from(pageInlineContent.children).find((node) => {
          const meshId = node.getAttribute && node.getAttribute('data-mesh-id');
          return meshId && meshId.endsWith('inlineContent-gridContainer');
        })
      : null;

    const root = gridContainer || pageInlineContent || document.querySelector('main') || document.body;

    const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const rectData = (rect) => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
      right: rect.right
    });

    const isVisible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
    };

    const getImageNodes = (container) => {
      const nodes = Array.from(container.querySelectorAll('img')).filter((img) => {
        const rect = img.getBoundingClientRect();
        return rect.width >= 24 && rect.height >= 24;
      });

      return nodes.slice(0, 120).map((img, index) => {
        const rect = img.getBoundingClientRect();
        return {
          key: img.id || img.getAttribute('alt') || `${img.currentSrc || img.src || 'img'}#${index}`,
          currentSrc: img.currentSrc || '',
          src: img.getAttribute('src') || '',
          alt: img.getAttribute('alt') || '',
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          visible: isVisible(img),
          rect: rectData(rect)
        };
      });
    };

    const getBackgroundNodes = (container) => {
      const nodes = Array.from(container.querySelectorAll('*')).filter((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.width < 40 || rect.height < 40) return false;
        const style = window.getComputedStyle(node);
        return style.backgroundImage && style.backgroundImage !== 'none';
      });

      return nodes.slice(0, 80).map((node, index) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return {
          key: node.id || `${node.tagName.toLowerCase()}-bg-${index}`,
          backgroundImage: style.backgroundImage,
          visible: isVisible(node),
          rect: rectData(rect)
        };
      });
    };

    const collectButtons = (container) =>
      Array.from(container.querySelectorAll('button, a[role="button"], .wixui-button, [data-semantic-classname="button"] a'))
        .map((node) => normalize(node.innerText))
        .filter(Boolean)
        .slice(0, 20);

    const collectLinks = (container) =>
      Array.from(container.querySelectorAll('a[href]'))
        .map((node) => ({
          href: node.getAttribute('href') || '',
          text: trimText(node.innerText)
        }))
        .filter((item) => item.href)
        .slice(0, 30);

    const trimText = (value) => {
      const normalized = normalize(value);
      return normalized.length <= 180 ? normalized : `${normalized.slice(0, 177)}...`;
    };

    const collectAnimationInfo = (container) => {
      let animatedNodes = 0;
      let transformedNodes = 0;
      for (const node of container.querySelectorAll('*')) {
        const style = window.getComputedStyle(node);
        if (style.animationName && style.animationName !== 'none') animatedNodes += 1;
        if (style.transform && style.transform !== 'none') transformedNodes += 1;
      }
      return { animatedNodes, transformedNodes };
    };

    const sections = Array.from(root.children).map((node, index) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      const text = normalize(node.innerText || '');
      const textSample = text.length <= 220 ? text : `${text.slice(0, 217)}...`;
      const images = getImageNodes(node);
      const backgrounds = getBackgroundNodes(node);
      const buttons = collectButtons(node);
      const animation = collectAnimationInfo(node);
      const visible = isVisible(node);

      return {
        index,
        id: node.id || '',
        tag: node.tagName.toLowerCase(),
        className: typeof node.className === 'string' ? node.className : '',
        visible,
        rect: rectData(rect),
        textLength: text.length,
        textHash: text ? hashString(text) : '',
        textSample,
        imageCount: images.length,
        loadedImageCount: images.filter((img) => img.complete && img.naturalWidth > 1 && img.naturalHeight > 1).length,
        missingImageCount: images.filter((img) => !img.complete || img.naturalWidth <= 1 || img.naturalHeight <= 1).length,
        images,
        backgroundCount: backgrounds.length,
        backgrounds,
        buttons,
        links: collectLinks(node),
        animation,
        style: {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity
        }
      };
    }).filter((section) => section.rect.height > 0.5);

    const pageText = normalize(document.body ? document.body.innerText : '');
    const imageStats = Array.from(document.images).reduce((acc, img) => {
      acc.total += 1;
      if (img.complete && img.naturalWidth > 1 && img.naturalHeight > 1) acc.loaded += 1;
      else acc.missing += 1;
      return acc;
    }, { total: 0, loaded: 0, missing: 0 });

    return {
      title: document.title,
      finalUrl: window.location.href,
      rootDescriptor: {
        id: root.id || '',
        meshId: root.getAttribute('data-mesh-id') || '',
        childCount: root.children.length
      },
      document: {
        scrollHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
        textHash: hashString(pageText),
        textLength: pageText.length,
        imageStats,
        sectionCount: sections.length
      },
      sections
    };

    function hashString(value) {
      let hash = 0;
      for (let i = 0; i < value.length; i++) {
        hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
      }
      return String(hash);
    }
  });

  fs.writeFileSync(paths.summary, JSON.stringify({ snapshot, logs }, null, 2));

  return {
    label,
    url,
    screenshotPath: paths.screenshot,
    summaryPath: paths.summary,
    snapshot,
    logs
  };
}

function buildSectionKey(section, fallbackIndex) {
  return section.id || `${section.tag}-${fallbackIndex}`;
}

function matchSections(localSections, remoteSections) {
  const matches = [];
  const remoteById = new Map(remoteSections.filter((section) => section.id).map((section) => [section.id, section]));
  const matchedRemote = new Set();
  const unmatchedLocal = [];

  for (const local of localSections) {
    if (local.id && remoteById.has(local.id)) {
      const remote = remoteById.get(local.id);
      matchedRemote.add(remote);
      matches.push({
        key: local.id,
        matchType: 'id',
        local,
        remote
      });
    } else {
      unmatchedLocal.push(local);
    }
  }

  const unmatchedRemote = remoteSections.filter((section) => !matchedRemote.has(section));

  while (unmatchedLocal.length && unmatchedRemote.length) {
    const local = unmatchedLocal.shift();
    let bestIndex = unmatchedRemote.findIndex((remote) => remote.index === local.index);
    if (bestIndex === -1) bestIndex = 0;
    const [remote] = unmatchedRemote.splice(bestIndex, 1);
    matches.push({
      key: `${buildSectionKey(remote, remote.index)}::${buildSectionKey(local, local.index)}`,
      matchType: 'order',
      local,
      remote
    });
  }

  for (const local of unmatchedLocal) {
    matches.push({
      key: buildSectionKey(local, local.index),
      matchType: 'local-only',
      local,
      remote: null
    });
  }

  for (const remote of unmatchedRemote) {
    matches.push({
      key: buildSectionKey(remote, remote.index),
      matchType: 'remote-only',
      local: null,
      remote
    });
  }

  return matches.sort((a, b) => {
    const left = a.local?.index ?? a.remote?.index ?? 0;
    const right = b.local?.index ?? b.remote?.index ?? 0;
    return left - right;
  });
}

function compareArrays(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return {
    missingInLocal: [...rightSet].filter((item) => !leftSet.has(item)),
    extraInLocal: [...leftSet].filter((item) => !rightSet.has(item))
  };
}

function compareSection(match) {
  if (!match.local) {
    return {
      ...match,
      status: 'missing-local',
      reasons: ['section-missing-local']
    };
  }

  if (!match.remote) {
    return {
      ...match,
      status: 'extra-local',
      reasons: ['section-missing-remote']
    };
  }

  const reasons = [];
  if (match.matchType === 'order' && match.local.id !== match.remote.id) reasons.push('section-id-mismatch');

  const heightDiff = Math.abs(match.local.rect.height - match.remote.rect.height);
  if (heightDiff > 40) reasons.push('section-height-mismatch');

  const yDiff = Math.abs(match.local.rect.y - match.remote.rect.y);
  if (yDiff > 40) reasons.push('section-position-mismatch');

  if (match.local.textHash !== match.remote.textHash) reasons.push('text-mismatch');

  if (match.local.loadedImageCount !== match.remote.loadedImageCount) reasons.push('loaded-images-mismatch');
  if (match.local.missingImageCount !== match.remote.missingImageCount) reasons.push('missing-images-mismatch');
  if (match.local.backgroundCount !== match.remote.backgroundCount) reasons.push('background-mismatch');

  const buttonDiff = compareArrays(match.local.buttons, match.remote.buttons);
  if (buttonDiff.missingInLocal.length || buttonDiff.extraInLocal.length) reasons.push('button-mismatch');

  const localImageSources = unique(match.local.images.map((item) => canonicalAssetKey(item.currentSrc || item.src)));
  const remoteImageSources = unique(match.remote.images.map((item) => canonicalAssetKey(item.currentSrc || item.src)));
  const imageDiff = compareArrays(localImageSources, remoteImageSources);
  if (imageDiff.missingInLocal.length || imageDiff.extraInLocal.length) reasons.push('image-src-mismatch');

  const localBg = unique(match.local.backgrounds.flatMap((item) => extractBackgroundAssetKeys(item.backgroundImage)));
  const remoteBg = unique(match.remote.backgrounds.flatMap((item) => extractBackgroundAssetKeys(item.backgroundImage)));
  const bgDiff = compareArrays(localBg, remoteBg);
  if (bgDiff.missingInLocal.length || bgDiff.extraInLocal.length) reasons.push('background-src-mismatch');

  const animationDiff = {
    animatedNodesDelta: match.local.animation.animatedNodes - match.remote.animation.animatedNodes,
    transformedNodesDelta: match.local.animation.transformedNodes - match.remote.animation.transformedNodes
  };
  if (animationDiff.animatedNodesDelta !== 0 || animationDiff.transformedNodesDelta !== 0) {
    reasons.push('animation-mismatch');
  }

  return {
    ...match,
    status: reasons.length ? 'different' : 'match',
    reasons,
    metrics: {
      local: {
        y: match.local.rect.y,
        height: match.local.rect.height,
        textLength: match.local.textLength,
        loadedImageCount: match.local.loadedImageCount,
        missingImageCount: match.local.missingImageCount,
        backgroundCount: match.local.backgroundCount,
        buttons: match.local.buttons.length,
        animatedNodes: match.local.animation.animatedNodes
      },
      remote: {
        y: match.remote.rect.y,
        height: match.remote.rect.height,
        textLength: match.remote.textLength,
        loadedImageCount: match.remote.loadedImageCount,
        missingImageCount: match.remote.missingImageCount,
        backgroundCount: match.remote.backgroundCount,
        buttons: match.remote.buttons.length,
        animatedNodes: match.remote.animation.animatedNodes
      }
    },
    diffs: {
      buttons: buttonDiff,
      images: imageDiff,
      backgrounds: bgDiff,
      animation: animationDiff
    }
  };
}

function cropPng(source, rect, PNG) {
  const x = Math.max(0, Math.floor(rect.x || 0));
  const y = Math.max(0, Math.floor(rect.y || 0));
  const width = Math.max(1, Math.min(source.width - x, Math.floor(rect.width || 1)));
  const height = Math.max(1, Math.min(source.height - y, Math.floor(rect.height || 1)));
  const target = new PNG({ width, height });

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const srcIdx = ((source.width * (y + row)) + (x + col)) << 2;
      const dstIdx = ((width * row) + col) << 2;
      target.data[dstIdx] = source.data[srcIdx];
      target.data[dstIdx + 1] = source.data[srcIdx + 1];
      target.data[dstIdx + 2] = source.data[srcIdx + 2];
      target.data[dstIdx + 3] = source.data[srcIdx + 3];
    }
  }

  return target;
}

async function writePng(png, filePath) {
  await new Promise((resolve, reject) => {
    png.pack().pipe(fs.createWriteStream(filePath)).on('finish', resolve).on('error', reject);
  });
}

function loadPng(filePath, PNG) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(new PNG())
      .on('parsed', function parsed() {
        resolve(this);
      })
      .on('error', reject);
  });
}

function padPng(source, width, height, PNG) {
  const target = new PNG({ width, height });
  target.data.fill(255);

  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const srcIdx = (source.width * y + x) << 2;
      const destIdx = (width * y + x) << 2;
      target.data[destIdx] = source.data[srcIdx];
      target.data[destIdx + 1] = source.data[srcIdx + 1];
      target.data[destIdx + 2] = source.data[srcIdx + 2];
      target.data[destIdx + 3] = source.data[srcIdx + 3];
    }
  }

  return target;
}

async function compareScreenshots(leftPath, rightPath, diffPath) {
  const PNG = requirePng();
  const pixelmatch = requirePixelmatch();
  const left = await loadPng(leftPath, PNG);
  const right = await loadPng(rightPath, PNG);
  const width = Math.max(left.width, right.width);
  const height = Math.max(left.height, right.height);
  const normalizedLeft = left.width === width && left.height === height ? left : padPng(left, width, height, PNG);
  const normalizedRight = right.width === width && right.height === height ? right : padPng(right, width, height, PNG);
  const diff = new PNG({ width, height });
  const mismatchedPixels = pixelmatch(
    normalizedLeft.data,
    normalizedRight.data,
    diff.data,
    width,
    height,
    { threshold: 0.12 }
  );

  await new Promise((resolve, reject) => {
    diff.pack().pipe(fs.createWriteStream(diffPath)).on('finish', resolve).on('error', reject);
  });

  return {
    width,
    height,
    mismatchedPixels,
    mismatchRatio: Number((mismatchedPixels / (width * height)).toFixed(6))
  };
}

async function enrichSectionVisualDiffs(sectionDiffs, remoteScreenshotPath, localScreenshotPath, sectionsDir) {
  const PNG = requirePng();
  const pixelmatch = requirePixelmatch();
  const remotePng = await loadPng(remoteScreenshotPath, PNG);
  const localPng = await loadPng(localScreenshotPath, PNG);

  for (const section of sectionDiffs) {
    if (!section.local || !section.remote) continue;

    const remoteCrop = cropPng(remotePng, section.remote.rect, PNG);
    const localCrop = cropPng(localPng, section.local.rect, PNG);
    const width = Math.max(remoteCrop.width, localCrop.width);
    const height = Math.max(remoteCrop.height, localCrop.height);
    const normalizedRemote = remoteCrop.width === width && remoteCrop.height === height ? remoteCrop : padPng(remoteCrop, width, height, PNG);
    const normalizedLocal = localCrop.width === width && localCrop.height === height ? localCrop : padPng(localCrop, width, height, PNG);
    const diff = new PNG({ width, height });
    const mismatchedPixels = pixelmatch(
      normalizedRemote.data,
      normalizedLocal.data,
      diff.data,
      width,
      height,
      { threshold: 0.12 }
    );
    const mismatchRatio = Number((mismatchedPixels / (width * height)).toFixed(6));

    section.visual = {
      width,
      height,
      mismatchedPixels,
      mismatchRatio
    };

    if (mismatchRatio > 0.01) {
      section.reasons = unique([...section.reasons, 'visual-mismatch']);
      section.status = 'different';
    }

    if (section.reasons.length) {
      const prefix = `${String(section.local.index).padStart(2, '0')}-${slugify(section.local.id || section.remote.id || section.key)}`;
      const remotePath = path.join(sectionsDir, `${prefix}-remote.png`);
      const localPath = path.join(sectionsDir, `${prefix}-local.png`);
      const diffPath = path.join(sectionsDir, `${prefix}-diff.png`);
      await writePng(normalizedRemote, remotePath);
      await writePng(normalizedLocal, localPath);
      await writePng(diff, diffPath);
      section.visual.artifacts = {
        remote: remotePath,
        local: localPath,
        diff: diffPath
      };
    }
  }

  return sectionDiffs;
}

function buildMdReport(context) {
  const { options, local, remote, pageDiff, sectionDiffs, reportPaths } = context;
  const differingSections = sectionDiffs.filter((item) => item.status !== 'match');
  let md = '# Auditoria de paridad renderizada\n\n';
  md += `- Fecha: ${new Date().toISOString()}\n`;
  md += `- Dominio: ${options.domain}\n`;
  md += `- Ruta: ${options.route}\n`;
  md += `- Viewport: ${options.viewport} (${VIEWPORTS[options.viewport].width}x${VIEWPORTS[options.viewport].height})\n`;
  md += `- URL local: ${local.url}\n`;
  md += `- URL remota: ${remote.url}\n`;
  md += `- Reporte JSON: ${reportPaths.json}\n`;
  md += `- Screenshot local: ${local.screenshotPath}\n`;
  md += `- Screenshot remoto: ${remote.screenshotPath}\n`;
  md += `- Diff visual: ${reportPaths.diffImage}\n\n`;

  md += '## Resumen\n\n';
  md += `- Diferencia visual global: ${pageDiff.mismatchRatio} (${pageDiff.mismatchedPixels} px)\n`;
  md += `- Secciones locales: ${local.snapshot.document.sectionCount}\n`;
  md += `- Secciones remotas: ${remote.snapshot.document.sectionCount}\n`;
  md += `- Secciones con diferencias: ${differingSections.length}\n`;
  md += `- Texto total local/remoto: ${local.snapshot.document.textLength} / ${remote.snapshot.document.textLength}\n`;
  md += `- Imagenes cargadas local/remoto: ${local.snapshot.document.imageStats.loaded} / ${remote.snapshot.document.imageStats.loaded}\n`;
  md += `- Imagenes faltantes local/remoto: ${local.snapshot.document.imageStats.missing} / ${remote.snapshot.document.imageStats.missing}\n\n`;

  md += '## Consola\n\n';
  md += `- Local: ${summarizeConsole(local.logs).length} eventos de consola/pageerror\n`;
  md += `- Remoto: ${summarizeConsole(remote.logs).length} eventos de consola/pageerror\n\n`;

  md += '## Secciones detectadas\n\n';
  md += '| Orden | Match | Local | Remota | Estado | Motivos |\n';
  md += '|---:|---|---|---|---|---|\n';
  for (const diff of sectionDiffs) {
    md += `| ${diff.local?.index ?? diff.remote?.index ?? '-'} | ${diff.matchType} | ${diff.local?.id || diff.local?.tag || '-'} | ${diff.remote?.id || diff.remote?.tag || '-'} | ${diff.status} | ${diff.reasons.join(', ') || '-'} |\n`;
  }
  md += '\n';

  for (const diff of differingSections) {
    md += `## ${diff.local?.id || diff.remote?.id || diff.key}\n\n`;
    md += `- Match: ${diff.matchType}\n`;
    md += `- Estado: ${diff.status}\n`;
    md += `- Motivos: ${diff.reasons.join(', ')}\n`;
    if (diff.local && diff.remote) {
      md += `- Altura local/remota: ${Math.round(diff.local.rect.height)} / ${Math.round(diff.remote.rect.height)}\n`;
      md += `- Posicion Y local/remota: ${Math.round(diff.local.rect.y)} / ${Math.round(diff.remote.rect.y)}\n`;
      md += `- Texto local/remoto: ${trim(diff.local.textSample)} / ${trim(diff.remote.textSample)}\n`;
      md += `- Imagenes cargadas local/remoto: ${diff.local.loadedImageCount} / ${diff.remote.loadedImageCount}\n`;
      md += `- Imagenes faltantes local/remoto: ${diff.local.missingImageCount} / ${diff.remote.missingImageCount}\n`;
      md += `- Fondos local/remoto: ${diff.local.backgroundCount} / ${diff.remote.backgroundCount}\n`;
      md += `- Botones local/remoto: ${diff.local.buttons.join(' | ') || '-'} / ${diff.remote.buttons.join(' | ') || '-'}\n`;
      if (diff.visual) {
        md += `- Diff visual seccion: ${diff.visual.mismatchRatio} (${diff.visual.mismatchedPixels} px)\n`;
        if (diff.visual.artifacts) {
          md += `- Capturas: ${diff.visual.artifacts.local} | ${diff.visual.artifacts.remote} | ${diff.visual.artifacts.diff}\n`;
        }
      }
      if (diff.diffs.images.missingInLocal.length) {
        md += `- Imagenes presentes en remoto y ausentes en local: ${diff.diffs.images.missingInLocal.slice(0, 8).join(' | ')}\n`;
      }
      if (diff.diffs.backgrounds.missingInLocal.length) {
        md += `- Fondos presentes en remoto y ausentes en local: ${diff.diffs.backgrounds.missingInLocal.slice(0, 6).join(' | ')}\n`;
      }
    }
    md += '\n';
  }

  return md;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const viewport = VIEWPORTS[options.viewport];
  const slug = slugify(`${options.label || `${options.domain}${options.route === '/' ? '-home' : options.route}`}-${options.viewport}`);
  const artifactDir = path.join(ARTIFACTS_ROOT, slug);
  ensureDir(artifactDir);
  ensureDir(path.join(artifactDir, 'sections'));

  const localServer = await ensureLocalServer(getLocalBaseUrl());
  const localBase = process.env.LOCAL_BASE_URL || localServer.baseUrl || getLocalBaseUrl();
  const localUrl = buildLocalMirrorUrl(options.domain, options.route, localBase);
  const remoteUrl = new URL(options.route, `https://${options.domain}`).toString();
  const puppeteer = requirePuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const remotePage = await browser.newPage();
    await remotePage.setViewport(viewport);
    await configurePage(remotePage);
    const remoteState = await captureState(remotePage, 'remote', remoteUrl, artifactDir, options.timeoutMs);
    await remotePage.close();

    const localPage = await browser.newPage();
    await localPage.setViewport(viewport);
    await configurePage(localPage);
    const localState = await captureState(localPage, 'local', localUrl, artifactDir, options.timeoutMs);
    await localPage.close();

    let sectionDiffs = matchSections(localState.snapshot.sections, remoteState.snapshot.sections).map(compareSection);
    const diffImagePath = path.join(artifactDir, 'full-diff.png');
    const pageDiff = await compareScreenshots(remoteState.screenshotPath, localState.screenshotPath, diffImagePath);
    sectionDiffs = await enrichSectionVisualDiffs(
      sectionDiffs,
      remoteState.screenshotPath,
      localState.screenshotPath,
      path.join(artifactDir, 'sections')
    );

    const reportPayload = {
      generatedAt: new Date().toISOString(),
      options,
      local: {
        url: localState.url,
        screenshotPath: localState.screenshotPath,
        summaryPath: localState.summaryPath,
        snapshot: localState.snapshot,
        logs: localState.logs
      },
      remote: {
        url: remoteState.url,
        screenshotPath: remoteState.screenshotPath,
        summaryPath: remoteState.summaryPath,
        snapshot: remoteState.snapshot,
        logs: remoteState.logs
      },
      pageDiff,
      sectionDiffs,
      artifacts: {
        dir: artifactDir,
        diffImage: diffImagePath
      }
    };

    const reportJsonPath = path.join(artifactDir, 'report.json');
    const reportMdPath = path.join(artifactDir, 'report.md');
    fs.writeFileSync(reportJsonPath, JSON.stringify(reportPayload, null, 2));
    fs.writeFileSync(reportMdPath, buildMdReport({
      options,
      local: localState,
      remote: remoteState,
      pageDiff,
      sectionDiffs,
      reportPaths: {
        json: reportJsonPath,
        diffImage: diffImagePath
      }
    }));

    fs.copyFileSync(reportJsonPath, LATEST_REPORT_JSON);
    fs.copyFileSync(reportMdPath, LATEST_REPORT_MD);

    console.log(JSON.stringify({
      reportMd: reportMdPath,
      reportJson: reportJsonPath,
      diffImage: diffImagePath,
      localScreenshot: localState.screenshotPath,
      remoteScreenshot: remoteState.screenshotPath,
      differingSections: sectionDiffs.filter((item) => item.status !== 'match').length,
      mismatchRatio: pageDiff.mismatchRatio
    }, null, 2));
  } finally {
    await browser.close();
    await localServer.stop();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
