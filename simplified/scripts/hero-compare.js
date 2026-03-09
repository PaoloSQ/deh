const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const pixelmatch = require("pixelmatch").default || require("pixelmatch");
const { PNG } = require("pngjs");

function cropTo(png, width, height) {
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = (y * png.width + x) * 4;
      const targetIndex = (y * width + x) * 4;
      out.data[targetIndex] = png.data[sourceIndex];
      out.data[targetIndex + 1] = png.data[sourceIndex + 1];
      out.data[targetIndex + 2] = png.data[sourceIndex + 2];
      out.data[targetIndex + 3] = png.data[sourceIndex + 3];
    }
  }
  return out;
}

async function hideFloatingUi(page) {
  await page
    .addStyleTag({
      content:
        ".cookie-bar,.ch2-container,.ch2-dialog,.help-strip,.chat-window-wrapper,[data-help-modal-layer]{display:none!important;visibility:hidden!important}",
    })
    .catch(() => {});
}

async function captureHero(page, target) {
  await page.goto(target.url, { waitUntil: "networkidle2", timeout: 60000 });
  await hideFloatingUi(page);
  await page
    .evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        try {
          await document.fonts.ready;
        } catch {
          // Ignore font readiness failures.
        }
      }
    })
    .catch(() => {});

  await new Promise((resolve) => setTimeout(resolve, 600));

  let hero = null;
  if (target.name === "live") {
    hero =
      (await page.$("#comp-lmyz9cin")) ||
      (await page.$("main section")) ||
      (await page.$("section"));
  } else {
    hero = await page.$(".home-hero");
  }

  if (!hero) {
    throw new Error(`No se encontro hero para target: ${target.name}`);
  }

  const box = await hero.boundingBox();
  const outPath = path.join(target.outputDir, `hero-${target.name}.png`);
  await hero.screenshot({ path: outPath });

  return { outPath, box };
}

async function main() {
  const outDir = path.join(__dirname, "..", "comparacion");
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

  const targets = [
    { name: "live", url: "https://www.dehonline.es/", outputDir: outDir },
    { name: "local", url: "http://localhost:3001/", outputDir: outDir },
  ];

  const captures = {};

  for (const target of targets) {
    const result = await captureHero(page, target);
    captures[target.name] = result;
    console.log(`${target.name} hero box:`, result.box);
  }

  await browser.close();

  const livePng = PNG.sync.read(fs.readFileSync(captures.live.outPath));
  const localPng = PNG.sync.read(fs.readFileSync(captures.local.outPath));

  const width = Math.min(livePng.width, localPng.width);
  const height = Math.min(livePng.height, localPng.height);

  const liveCrop = cropTo(livePng, width, height);
  const localCrop = cropTo(localPng, width, height);
  const diffPng = new PNG({ width, height });

  const diffPixels = pixelmatch(liveCrop.data, localCrop.data, diffPng.data, width, height, {
    threshold: 0.1,
    includeAA: true,
  });

  const diffPercent = (diffPixels / (width * height)) * 100;
  const diffPath = path.join(outDir, "hero-diff.png");
  fs.writeFileSync(diffPath, PNG.sync.write(diffPng));

  console.log(`hero size compared: ${width}x${height}`);
  console.log(`hero diff: ${diffPercent.toFixed(2)}%`);
  console.log(`diff path: ${diffPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
