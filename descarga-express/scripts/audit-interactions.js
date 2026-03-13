const fs = require('fs');
const path = require('path');

const {
  buildLocalMirrorUrl,
  ensureLocalServer,
  requirePuppeteer
} = require('./lib/runtime-utils');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const LATEST_REPORT_MD = path.resolve(PROJECT_ROOT, 'INTERACTION-AUDIT.md');
const LATEST_REPORT_JSON = path.resolve(PROJECT_ROOT, 'INTERACTION-AUDIT.json');
const ARTIFACTS_ROOT = path.resolve(PROJECT_ROOT, '.interaction-audit');
const DEFAULT_TIMEOUT_MS = Number(process.env.INTERACTION_TIMEOUT_MS || 120000);
const MAX_SETTLE_MS = Number(process.env.INTERACTION_MAX_SETTLE_MS || 15000);
const STABLE_INTERVAL_MS = Number(process.env.INTERACTION_STABLE_INTERVAL_MS || 1000);
const STABLE_ROUNDS = Number(process.env.INTERACTION_STABLE_ROUNDS || 3);
const WAIT_AFTER_STABLE_MS = Number(process.env.INTERACTION_WAIT_AFTER_STABLE_MS || 1200);
const HOVER_DELAY_MS = Number(process.env.INTERACTION_HOVER_DELAY_MS || 450);
const SCROLL_REVEAL_DELAY_MS = Number(process.env.INTERACTION_SCROLL_REVEAL_DELAY_MS || 1100);
const MAX_HOVER_CANDIDATES = Number(process.env.INTERACTION_MAX_HOVER_CANDIDATES || 14);
const DEBUG = process.env.INTERACTION_DEBUG === '1';

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
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function trim(value, max = 220) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function debug(...args) {
  if (DEBUG) {
    console.error('[interaction-audit]', ...args);
  }
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
  debug('dismiss-cookie:start');
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
  debug('dismiss-cookie:end', clicked ? 'clicked' : 'noop');
}

async function waitForStableState(page, timeoutMs) {
  debug('wait-stable:start');
  await page.waitForFunction(
    () => document.body && document.readyState !== 'loading',
    { timeout: Math.min(timeoutMs, 5000) }
  ).catch(() => {});
  debug('wait-stable:ready', 'dom-usable');

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

    if (currentSnapshot === previousHash) {
      stableCount += 1;
    } else {
      stableCount = 0;
      previousHash = currentSnapshot;
    }

    if (stableCount >= STABLE_ROUNDS) break;
    await dismissCookieBanner(page);
    await sleep(STABLE_INTERVAL_MS);
  }

  await sleep(WAIT_AFTER_STABLE_MS);
  debug('wait-stable:end');
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

async function compareImages(leftPath, rightPath, diffPath) {
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

async function screenshotClip(page, clip, filePath) {
  await page.screenshot({
    path: filePath,
    clip,
    captureBeyondViewport: true
  });
}

async function collectCandidates(page) {
  return page.evaluate((maxHoverCandidates) => {
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
    const cssEscape = (value) => {
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
      return String(value).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
    };
    const isVisible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      const horizontallyVisible = rect.right > 0 && rect.left < window.innerWidth;
      const verticallyVisible = rect.bottom > 0 && rect.top < window.innerHeight;
      return rect.width >= 24 &&
        rect.height >= 18 &&
        horizontallyVisible &&
        verticallyVisible &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || '1') > 0;
    };
    const buildSelector = (node) => {
      const parts = [];
      let current = node;
      while (current && current !== document.body) {
        if (current.id) {
          parts.unshift(`#${cssEscape(current.id)}`);
          break;
        }
        let part = current.tagName.toLowerCase();
        const testId = current.getAttribute('data-testid');
        if (testId) {
          part += `[data-testid="${testId}"]`;
        } else {
          const siblings = Array.from(current.parentElement ? current.parentElement.children : []).filter((child) => child.tagName === current.tagName);
          if (siblings.length > 1) {
            part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
          }
        }
        parts.unshift(part);
        current = current.parentElement;
      }
      return parts.join(' > ');
    };
    const normalizeHref = (value) => {
      const href = String(value || '')
        .replace(/^https?:\/\/[^/]+/i, '')
        .replace(/^\/(?:[a-z0-9-]+\.)*dehonline\.es(?=\/|$)/i, '');
      return href || '/';
    };
    const signatureFor = (node, index) => {
      const section = node.closest('section[id], div[id^="comp-"]');
      const href = normalizeHref(node.getAttribute('href') || '');
      const text = normalize(node.innerText || node.getAttribute('aria-label') || node.getAttribute('title') || '');
      return [
        section ? section.id : '',
        node.id || '',
        node.tagName.toLowerCase(),
        href,
        text.slice(0, 80)
      ].join('|');
    };

    const seen = new Set();
    const hoverCandidates = [];
    const allInteractive = Array.from(root.querySelectorAll('a[href], button, [role="button"]'));

    allInteractive.forEach((node, index) => {
      if (!isVisible(node)) return;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      const href = normalizeHref(node.getAttribute('href') || '');
      const text = normalize(node.innerText || node.getAttribute('aria-label') || node.getAttribute('title') || '');
      const isButton = node.tagName === 'BUTTON' || node.getAttribute('role') === 'button';
      if (!isButton && !href) return;
      if (!text && !href) return;
      const signature = signatureFor(node, index);
      if (seen.has(signature)) return;
      seen.add(signature);

      hoverCandidates.push({
        signature,
        selector: buildSelector(node),
        id: node.id || '',
        tag: node.tagName.toLowerCase(),
        sectionId: node.closest('section[id], div[id^="comp-"]')?.id || '',
        text: text.slice(0, 120),
        href,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        },
        cursor: style.cursor,
        transitionDuration: style.transitionDuration,
        animationName: style.animationName
      });
    });

    const sections = Array.from(root.children)
      .map((node, index) => {
        const rect = node.getBoundingClientRect();
        if (rect.height < 30) return null;
        return {
          index,
          id: node.id || `section-${index}`,
          selector: node.id ? `#${cssEscape(node.id)}` : buildSelector(node),
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          }
        };
      })
      .filter(Boolean);

    hoverCandidates.sort((left, right) => {
      if (Math.abs(left.rect.y - right.rect.y) > 8) return left.rect.y - right.rect.y;
      return left.rect.x - right.rect.x;
    });

    return {
      hoverCandidates: hoverCandidates.slice(0, maxHoverCandidates),
      sections
    };
  }, MAX_HOVER_CANDIDATES);
}

async function readElementState(page, selector) {
  return page.$eval(selector, (node) => {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    const descendantNodes = Array.from(node.querySelectorAll('*'));
    const descendantAnimated = descendantNodes.filter((child) => {
      const childStyle = window.getComputedStyle(child);
      return childStyle.animationName && childStyle.animationName !== 'none';
    }).length;
    const descendantTransformed = descendantNodes.filter((child) => {
      const childStyle = window.getComputedStyle(child);
      return childStyle.transform && childStyle.transform !== 'none';
    }).length;

    return {
      className: typeof node.className === 'string' ? node.className : '',
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      },
      styles: {
        opacity: style.opacity,
        transform: style.transform,
        color: style.color,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        filter: style.filter,
        textDecorationLine: style.textDecorationLine,
        animationName: style.animationName,
        transitionDuration: style.transitionDuration,
        transitionProperty: style.transitionProperty,
        cursor: style.cursor
      },
      descendants: {
        animatedNodes: descendantAnimated,
        transformedNodes: descendantTransformed
      }
    };
  });
}

function diffState(before, after) {
  const changedStyles = [];
  for (const key of Object.keys(before.styles)) {
    if (before.styles[key] !== after.styles[key]) changedStyles.push(key);
  }
  if (before.className !== after.className) changedStyles.push('className');
  if (before.descendants.animatedNodes !== after.descendants.animatedNodes) changedStyles.push('descendants.animatedNodes');
  if (before.descendants.transformedNodes !== after.descendants.transformedNodes) changedStyles.push('descendants.transformedNodes');
  return unique(changedStyles);
}

function expandedClip(box, viewport) {
  const padding = 18;
  const x = Math.max(0, Math.floor(box.x - padding));
  const y = Math.max(0, Math.floor(box.y - padding));
  const maxWidth = viewport.width - x;
  const width = Math.max(1, Math.min(Math.ceil(box.width + padding * 2), maxWidth));
  const height = Math.max(1, Math.ceil(box.height + padding * 2));
  return { x, y, width, height };
}

async function auditHoverSide(page, side, hoverCandidates, artifactsDir, viewport) {
  const hoverDir = path.join(artifactsDir, side, 'hover');
  ensureDir(hoverDir);
  const results = [];

  await page.bringToFront();
  debug(side, 'hover candidates', hoverCandidates.length);
  await page.mouse.move(5, 5);
  await sleep(150);

  for (let index = 0; index < hoverCandidates.length; index++) {
    const candidate = hoverCandidates[index];
    debug(side, 'hover start', index, candidate.selector);
    const handle = await page.$(candidate.selector);
    if (!handle) {
      results.push({
        ...candidate,
        status: 'missing',
        reason: 'selector-not-found'
      });
      continue;
    }

    const box = await handle.boundingBox();
    if (!box || box.width < 2 || box.height < 2) {
      results.push({
        ...candidate,
        status: 'missing',
        reason: 'bounding-box-missing'
      });
      await handle.dispose();
      continue;
    }

    await handle.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
    await sleep(250);
    await page.mouse.move(5, 5);
    await sleep(120);

    const before = await readElementState(page, candidate.selector);
    const clip = expandedClip(await handle.boundingBox(), viewport);
    const prefix = `${String(index).padStart(2, '0')}-${slugify(candidate.sectionId || candidate.id || candidate.text || 'target')}`;
    const beforePath = path.join(hoverDir, `${prefix}-before.png`);
    await screenshotClip(page, clip, beforePath);
    debug(side, 'hover before screenshot', index, beforePath);

    debug(side, 'hover move start', index);
    await handle.hover();
    debug(side, 'hover move end', index);
    await sleep(HOVER_DELAY_MS);

    debug(side, 'hover after state start', index);
    const after = await readElementState(page, candidate.selector);
    debug(side, 'hover after state end', index);
    const afterPath = path.join(hoverDir, `${prefix}-after.png`);
    const diffPath = path.join(hoverDir, `${prefix}-diff.png`);
    debug(side, 'hover after screenshot start', index);
    await screenshotClip(page, clip, afterPath);
    debug(side, 'hover after screenshot end', index);
    debug(side, 'hover compare start', index);
    const visual = await compareImages(beforePath, afterPath, diffPath);
    debug(side, 'hover compared', index, visual.mismatchRatio);
    const changedStyles = diffState(before, after);
    const effectDetected = visual.mismatchRatio > 0.003 || changedStyles.length > 0;

    results.push({
      ...candidate,
      status: 'ok',
      before,
      after,
      changedStyles,
      effectDetected,
      visual: {
        ...visual,
        artifacts: {
          before: beforePath,
          after: afterPath,
          diff: diffPath
        }
      }
    });

    await page.mouse.move(5, 5);
    await sleep(120);
    await handle.dispose();
  }

  return results;
}

async function readSectionRevealState(page, selector) {
  return page.$eval(selector, (node) => {
    const rect = node.getBoundingClientRect();
    const nodes = [node, ...Array.from(node.querySelectorAll('*'))];
    let pendingMotionNodes = 0;
    let animatedNodes = 0;
    let transformedNodes = 0;
    let fadedNodes = 0;

    for (const current of nodes) {
      const style = window.getComputedStyle(current);
      const motion = current.getAttribute('data-motion-enter');
      if (motion && motion !== 'done') pendingMotionNodes += 1;
      if (style.animationName && style.animationName !== 'none') animatedNodes += 1;
      if (style.transform && style.transform !== 'none') transformedNodes += 1;
      if (Number(style.opacity || '1') < 0.99) fadedNodes += 1;
    }

    return {
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      },
      pendingMotionNodes,
      animatedNodes,
      transformedNodes,
      fadedNodes
    };
  });
}

async function auditScrollSide(page, side, sections, viewport, artifactsDir) {
  const scrollDir = path.join(artifactsDir, side, 'scroll');
  ensureDir(scrollDir);
  const results = [];

  await page.bringToFront();
  debug(side, 'scroll sections', sections.length);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await sleep(350);

  for (let index = 0; index < sections.length; index++) {
    const section = sections[index];
    debug(side, 'scroll start', index, section.id);
    const handle = await page.$(section.selector);
    if (!handle) {
      results.push({
        ...section,
        status: 'missing',
        reason: 'selector-not-found'
      });
      continue;
    }

    const initialBox = await handle.boundingBox();
    if (!initialBox) {
      results.push({
        ...section,
        status: 'missing',
        reason: 'bounding-box-missing'
      });
      await handle.dispose();
      continue;
    }

    const preRevealTop = Math.max(0, initialBox.y - viewport.height * 0.9);
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), preRevealTop);
    await sleep(260);
    const before = await readSectionRevealState(page, section.selector);

    await handle.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
    await sleep(SCROLL_REVEAL_DELAY_MS);
    const after = await readSectionRevealState(page, section.selector);

    const delta = {
      pendingMotionNodes: after.pendingMotionNodes - before.pendingMotionNodes,
      animatedNodes: after.animatedNodes - before.animatedNodes,
      transformedNodes: after.transformedNodes - before.transformedNodes,
      fadedNodes: after.fadedNodes - before.fadedNodes
    };
    const revealDetected = (
      before.pendingMotionNodes !== after.pendingMotionNodes ||
      before.fadedNodes !== after.fadedNodes ||
      before.transformedNodes !== after.transformedNodes
    );

    const sectionPath = path.join(scrollDir, `${String(index).padStart(2, '0')}-${slugify(section.id)}-revealed.png`);
    const finalBox = await handle.boundingBox();
    if (finalBox) {
      await screenshotClip(page, expandedClip(finalBox, viewport), sectionPath);
    }
    debug(side, 'scroll done', index, section.id, revealDetected);

    results.push({
      ...section,
      status: 'ok',
      before,
      after,
      delta,
      revealDetected,
      artifacts: finalBox ? { revealed: sectionPath } : {}
    });

    await handle.dispose();
  }

  return results;
}

function matchBySignature(localItems, remoteItems, keyField = 'signature') {
  const remoteByKey = new Map(remoteItems.map((item) => [item[keyField], item]));
  const matches = [];
  const unmatchedRemote = new Set(remoteItems.map((item) => item[keyField]));

  for (const local of localItems) {
    const key = local[keyField];
    const remote = remoteByKey.get(key) || null;
    if (remote) unmatchedRemote.delete(key);
    matches.push({ key, local, remote });
  }

  for (const key of unmatchedRemote) {
    matches.push({ key, local: null, remote: remoteByKey.get(key) });
  }

  return matches;
}

function compareHover(localResults, remoteResults) {
  const matches = matchBySignature(localResults, remoteResults);
  return matches.map((entry) => {
    if (!entry.local) {
      return {
        ...entry,
        status: 'missing-local',
        reasons: ['target-missing-local']
      };
    }
    if (!entry.remote) {
      return {
        ...entry,
        status: 'extra-local',
        reasons: ['target-missing-remote']
      };
    }

    const reasons = [];
    if (entry.remote.effectDetected && !entry.local.effectDetected) reasons.push('hover-effect-missing-local');
    if (!entry.remote.effectDetected && entry.local.effectDetected) reasons.push('hover-effect-extra-local');

    const localChanged = unique(entry.local.changedStyles || []);
    const remoteChanged = unique(entry.remote.changedStyles || []);
    const changedDiff = {
      missingInLocal: remoteChanged.filter((item) => !localChanged.includes(item)),
      extraInLocal: localChanged.filter((item) => !remoteChanged.includes(item))
    };
    if (changedDiff.missingInLocal.length || changedDiff.extraInLocal.length) reasons.push('hover-style-mismatch');

    const ratioGap = Math.abs((entry.local.visual?.mismatchRatio || 0) - (entry.remote.visual?.mismatchRatio || 0));
    if (ratioGap > 0.02) reasons.push('hover-visual-gap');

    return {
      ...entry,
      status: reasons.length ? 'different' : 'match',
      reasons,
      diffs: {
        changedStyles: changedDiff,
        ratioGap: Number(ratioGap.toFixed(6))
      }
    };
  });
}

function compareScroll(localResults, remoteResults) {
  const matches = matchBySignature(
    localResults.map((item) => ({ ...item, signature: item.id })),
    remoteResults.map((item) => ({ ...item, signature: item.id }))
  );

  return matches.map((entry) => {
    if (!entry.local) {
      return {
        ...entry,
        status: 'missing-local',
        reasons: ['section-missing-local']
      };
    }
    if (!entry.remote) {
      return {
        ...entry,
        status: 'extra-local',
        reasons: ['section-missing-remote']
      };
    }

    const reasons = [];
    if (entry.remote.revealDetected && !entry.local.revealDetected) reasons.push('scroll-reveal-missing-local');
    if (!entry.remote.revealDetected && entry.local.revealDetected) reasons.push('scroll-reveal-extra-local');

    const deltaKeys = ['pendingMotionNodes', 'animatedNodes', 'transformedNodes', 'fadedNodes'];
    const deltaDiffs = {};
    for (const key of deltaKeys) {
      deltaDiffs[key] = entry.local.delta[key] - entry.remote.delta[key];
      if (Math.abs(deltaDiffs[key]) >= 2) reasons.push(`scroll-${key}-mismatch`);
    }

    return {
      ...entry,
      status: reasons.length ? 'different' : 'match',
      reasons: unique(reasons),
      diffs: deltaDiffs
    };
  });
}

async function captureSide(page, side, url, artifactsDir, options, viewport) {
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

  debug(side, 'goto', url);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
  } catch (error) {
    if (!/Navigation timeout/i.test(String(error && error.message))) {
      throw error;
    }
    debug(side, 'goto-timeout', 'continuing with current document');
  }
  await page.waitForFunction(() => !!document.body, { timeout: Math.min(options.timeoutMs, 15000) }).catch(() => {});
  await dismissCookieBanner(page);
  await waitForStableState(page, options.timeoutMs);
  debug(side, 'stable');

  const candidates = await collectCandidates(page);
  debug(side, 'collected', candidates.hoverCandidates.length, 'hover targets and', candidates.sections.length, 'sections');
  const hover = await auditHoverSide(page, side, candidates.hoverCandidates, artifactsDir, viewport);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await sleep(250);
  const scroll = await auditScrollSide(page, side, candidates.sections, viewport, artifactsDir);
  debug(side, 'capture complete');

  return {
    url,
    logs,
    hover,
    scroll
  };
}

function buildMdReport(context) {
  const { options, local, remote, hoverDiffs, scrollDiffs, reportPaths } = context;
  const differingHover = hoverDiffs.filter((item) => item.status !== 'match');
  const differingScroll = scrollDiffs.filter((item) => item.status !== 'match');

  let md = '# Auditoria de interacciones\n\n';
  md += `- Fecha: ${new Date().toISOString()}\n`;
  md += `- Dominio: ${options.domain}\n`;
  md += `- Ruta: ${options.route}\n`;
  md += `- Viewport: ${options.viewport} (${VIEWPORTS[options.viewport].width}x${VIEWPORTS[options.viewport].height})\n`;
  md += `- URL local: ${local.url}\n`;
  md += `- URL remota: ${remote.url}\n`;
  md += `- Reporte JSON: ${reportPaths.json}\n\n`;

  md += '## Resumen\n\n';
  md += `- Hover targets locales/remotos: ${local.hover.length} / ${remote.hover.length}\n`;
  md += `- Hover con diferencias: ${differingHover.length}\n`;
  md += `- Secciones de scroll locales/remotas: ${local.scroll.length} / ${remote.scroll.length}\n`;
  md += `- Scroll reveal con diferencias: ${differingScroll.length}\n`;
  md += `- Consola local: ${summarizeConsole(local.logs).length}\n`;
  md += `- Consola remota: ${summarizeConsole(remote.logs).length}\n\n`;

  md += '## Hover\n\n';
  md += '| Target | Seccion | Estado | Motivos | Cambio local/remoto |\n';
  md += '|---|---|---|---|---|\n';
  for (const diff of hoverDiffs) {
    const target = trim(diff.local?.text || diff.remote?.text || diff.local?.id || diff.remote?.id || diff.key, 60) || '-';
    const sectionId = diff.local?.sectionId || diff.remote?.sectionId || '-';
    const localRatio = diff.local?.visual?.mismatchRatio ?? '-';
    const remoteRatio = diff.remote?.visual?.mismatchRatio ?? '-';
    md += `| ${target} | ${sectionId} | ${diff.status} | ${diff.reasons.join(', ') || '-'} | ${localRatio} / ${remoteRatio} |\n`;
  }
  md += '\n';

  for (const diff of differingHover) {
    md += `### Hover: ${trim(diff.local?.text || diff.remote?.text || diff.key, 80)}\n\n`;
    md += `- Seccion: ${diff.local?.sectionId || diff.remote?.sectionId || '-'}\n`;
    md += `- Motivos: ${diff.reasons.join(', ')}\n`;
    md += `- Cambio local: ${diff.local?.effectDetected ? 'si' : 'no'}\n`;
    md += `- Cambio remoto: ${diff.remote?.effectDetected ? 'si' : 'no'}\n`;
    md += `- Props cambiadas local: ${(diff.local?.changedStyles || []).join(', ') || '-'}\n`;
    md += `- Props cambiadas remoto: ${(diff.remote?.changedStyles || []).join(', ') || '-'}\n`;
    if (diff.local?.visual?.artifacts) {
      md += `- Artefactos local: ${diff.local.visual.artifacts.before} | ${diff.local.visual.artifacts.after} | ${diff.local.visual.artifacts.diff}\n`;
    }
    if (diff.remote?.visual?.artifacts) {
      md += `- Artefactos remoto: ${diff.remote.visual.artifacts.before} | ${diff.remote.visual.artifacts.after} | ${diff.remote.visual.artifacts.diff}\n`;
    }
    md += '\n';
  }

  md += '## Scroll Reveal\n\n';
  md += '| Seccion | Estado | Motivos | Reveal local/remoto |\n';
  md += '|---|---|---|---|\n';
  for (const diff of scrollDiffs) {
    md += `| ${diff.local?.id || diff.remote?.id || diff.key} | ${diff.status} | ${diff.reasons.join(', ') || '-'} | ${diff.local?.revealDetected ? 'si' : 'no'} / ${diff.remote?.revealDetected ? 'si' : 'no'} |\n`;
  }
  md += '\n';

  for (const diff of differingScroll) {
    md += `### Scroll: ${diff.local?.id || diff.remote?.id || diff.key}\n\n`;
    md += `- Motivos: ${diff.reasons.join(', ')}\n`;
    md += `- Reveal local: ${diff.local?.revealDetected ? 'si' : 'no'}\n`;
    md += `- Reveal remoto: ${diff.remote?.revealDetected ? 'si' : 'no'}\n`;
    md += `- Delta local: ${JSON.stringify(diff.local?.delta || {})}\n`;
    md += `- Delta remoto: ${JSON.stringify(diff.remote?.delta || {})}\n`;
    if (diff.local?.artifacts?.revealed) {
      md += `- Captura local: ${diff.local.artifacts.revealed}\n`;
    }
    if (diff.remote?.artifacts?.revealed) {
      md += `- Captura remota: ${diff.remote.artifacts.revealed}\n`;
    }
    md += '\n';
  }

  return md;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const viewport = VIEWPORTS[options.viewport];
  const label = options.label || slugify(`${options.domain}${options.route === '/' ? '' : options.route}`) || 'page';
  const artifactsDir = path.join(ARTIFACTS_ROOT, `${label}-${viewport.name}`);
  ensureDir(artifactsDir);

  const server = await ensureLocalServer();
  const localUrl = buildLocalMirrorUrl(options.domain, options.route, server.baseUrl);
  const remoteUrl = `https://${options.domain}${options.route}`;
  const puppeteer = requirePuppeteer();
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox']
  });

  try {
    const localPage = await browser.newPage();
    const remotePage = await browser.newPage();
    await Promise.all([
      localPage.setViewport(viewport),
      remotePage.setViewport(viewport),
      configurePage(localPage),
      configurePage(remotePage)
    ]);

    const local = await captureSide(localPage, 'local', localUrl, artifactsDir, options, viewport);
    const remote = await captureSide(remotePage, 'remote', remoteUrl, artifactsDir, options, viewport);

    const hoverDiffs = compareHover(local.hover, remote.hover);
    const scrollDiffs = compareScroll(local.scroll, remote.scroll);

    const report = {
      generatedAt: new Date().toISOString(),
      options,
      local: {
        url: localUrl,
        console: local.logs,
        hover: local.hover,
        scroll: local.scroll
      },
      remote: {
        url: remoteUrl,
        console: remote.logs,
        hover: remote.hover,
        scroll: remote.scroll
      },
      hoverDiffs,
      scrollDiffs
    };

    const reportJsonPath = path.join(artifactsDir, 'report.json');
    const reportMdPath = path.join(artifactsDir, 'report.md');
    const reportMd = buildMdReport({
      options,
      local,
      remote,
      hoverDiffs,
      scrollDiffs,
      reportPaths: {
        json: reportJsonPath
      }
    });

    fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(reportMdPath, reportMd);
    fs.writeFileSync(LATEST_REPORT_JSON, JSON.stringify(report, null, 2));
    fs.writeFileSync(LATEST_REPORT_MD, reportMd);

    console.log(JSON.stringify({
      reportMd: reportMdPath,
      reportJson: reportJsonPath,
      hoverDifferences: hoverDiffs.filter((item) => item.status !== 'match').length,
      scrollDifferences: scrollDiffs.filter((item) => item.status !== 'match').length
    }, null, 2));
  } finally {
    await browser.close();
    await server.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
