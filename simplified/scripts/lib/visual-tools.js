const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const puppeteer = require("puppeteer");
const { PNG } = require("pngjs");
const pixelmatch = require("pixelmatch").default || require("pixelmatch");

const SIMPLIFIED_DIR = path.join(__dirname, "../..");
const WORKSPACE_DIR = path.join(SIMPLIFIED_DIR, "..");
const ORIGIN_DIR = path.join(WORKSPACE_DIR, "descarga", "www.dehonline.es");
const OUTPUT_DIR = path.join(SIMPLIFIED_DIR, "comparacion");
const LIVE_URL = "https://www.dehonline.es";
const NEW_BASE_URL = "http://localhost:3001";

const DEFAULT_VIEWPORTS = [
  { width: 1920, height: 1080, name: "desktop" },
  { width: 768, height: 1024, name: "tablet" },
  { width: 375, height: 667, name: "mobile" },
];

const COLORS = {
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  reset: "\x1b[0m",
};

function log(color, message) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function launchBrowser() {
  return puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}

function parseViewportSelection(selection) {
  switch (selection) {
    case "desktop":
      return [DEFAULT_VIEWPORTS[0]];
    case "tablet":
      return [DEFAULT_VIEWPORTS[1]];
    case "mobile":
      return [DEFAULT_VIEWPORTS[2]];
    case "all":
    case undefined:
    case null:
      return DEFAULT_VIEWPORTS;
    default:
      throw new Error(`Viewport invalido: ${selection}`);
  }
}

function getOriginUrl(pageName, options = {}) {
  const { live = false } = options;

  if (live) {
    if (pageName === "index") {
      return `${LIVE_URL}/`;
    }
    return `${LIVE_URL}/${pageName}.html`;
  }

  const htmlFile = path.join(ORIGIN_DIR, `${pageName}.html`);
  if (fs.existsSync(htmlFile)) {
    return `file://${htmlFile}`;
  }

  const indexFile = path.join(ORIGIN_DIR, pageName, "index.html");
  if (fs.existsSync(indexFile)) {
    return `file://${indexFile}`;
  }

  return null;
}

function getNewUrl(pageName) {
  if (pageName === "index") {
    return `${NEW_BASE_URL}/`;
  }
  return `${NEW_BASE_URL}/${pageName}`;
}

function getAllPages() {
  if (!fs.existsSync(ORIGIN_DIR)) {
    return [];
  }

  const pages = fs
    .readdirSync(ORIGIN_DIR)
    .filter((entry) => entry.endsWith(".html"))
    .map((entry) => entry.replace(/\.html$/i, ""))
    .filter((pageName) => pageName !== "index")
    .sort();

  return ["index", ...pages];
}

function buildScreenshotPath(kind, viewportName, pageName) {
  return path.join(OUTPUT_DIR, `screenshot-${viewportName}-${kind}-${pageName}.png`);
}

function buildDiffPath(viewportName, pageName) {
  return path.join(OUTPUT_DIR, `diff-${viewportName}-${pageName}.png`);
}

async function navigateWithFallback(page, url, timeout) {
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout });
    return "networkidle2";
  } catch (error) {
    if (!/Navigation timeout/i.test(error.message)) {
      throw error;
    }

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: Math.min(timeout, 15000),
    });
    return "domcontentloaded";
  }
}

async function waitForPageToSettle(page, waitMs) {
  await page
    .evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        try {
          await document.fonts.ready;
        } catch {
          // Ignore font readiness failures and continue with the screenshot.
        }
      }
    })
    .catch(() => {});

  if (waitMs > 0) {
    await sleep(waitMs);
    return;
  }

  await sleep(400);
}

async function capturePageScreenshot(page, options) {
  const { url, outputPath, viewport, fullPage = true, waitMs = 0, timeout = 30000 } = options;

  if (viewport) {
    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
    });
  }

  await navigateWithFallback(page, url, timeout);
  await page
    .addStyleTag({
      content: `
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
          scroll-behavior: auto !important;
        }

        .ch2-container,
        .ch2-dialog,
        .cookie-bar,
        .chat-window-wrapper,
        .help-strip,
        [data-help-modal-layer] {
          display: none !important;
          visibility: hidden !important;
        }
      `,
    })
    .catch(() => {});
  await waitForPageToSettle(page, waitMs);

  ensureDir(path.dirname(outputPath));
  await page.screenshot({ path: outputPath, fullPage, type: "png" });
  return outputPath;
}

function copyComparableArea(png, width, height) {
  const data = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = (y * png.width + x) * 4;
      const targetIndex = (y * width + x) * 4;

      data[targetIndex] = png.data[sourceIndex];
      data[targetIndex + 1] = png.data[sourceIndex + 1];
      data[targetIndex + 2] = png.data[sourceIndex + 2];
      data[targetIndex + 3] = png.data[sourceIndex + 3];
    }
  }

  return data;
}

function comparePngFiles(firstPath, secondPath, options = {}) {
  const { pixelThreshold = 0.1, writeDiffPath = null, includeAA = true, alpha = 0.1 } = options;

  const firstPng = PNG.sync.read(fs.readFileSync(firstPath));
  const secondPng = PNG.sync.read(fs.readFileSync(secondPath));

  const width = Math.min(firstPng.width, secondPng.width);
  const height = Math.min(firstPng.height, secondPng.height);

  const diffPng = new PNG({ width, height });
  const diffPixels = pixelmatch(
    copyComparableArea(firstPng, width, height),
    copyComparableArea(secondPng, width, height),
    diffPng.data,
    width,
    height,
    {
      threshold: pixelThreshold,
      includeAA,
      alpha,
    }
  );

  if (writeDiffPath) {
    ensureDir(path.dirname(writeDiffPath));
    fs.writeFileSync(writeDiffPath, PNG.sync.write(diffPng));
  }

  return {
    diffPixels,
    percentDiff: (diffPixels / (width * height)) * 100,
    width,
    height,
    firstSize: { width: firstPng.width, height: firstPng.height },
    secondSize: { width: secondPng.width, height: secondPng.height },
  };
}

function openPath(targetPath) {
  exec(`start "" "${targetPath}"`);
}

module.exports = {
  COLORS,
  DEFAULT_VIEWPORTS,
  LIVE_URL,
  NEW_BASE_URL,
  ORIGIN_DIR,
  OUTPUT_DIR,
  log,
  ensureDir,
  sleep,
  launchBrowser,
  parseViewportSelection,
  getOriginUrl,
  getNewUrl,
  getAllPages,
  buildScreenshotPath,
  buildDiffPath,
  capturePageScreenshot,
  comparePngFiles,
  openPath,
};
