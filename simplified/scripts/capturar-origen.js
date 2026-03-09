const path = require("path");
const {
  COLORS,
  OUTPUT_DIR,
  log,
  ensureDir,
  sleep,
  launchBrowser,
  parseViewportSelection,
  getOriginUrl,
  getAllPages,
  buildScreenshotPath,
  capturePageScreenshot,
  openPath,
} = require("./lib/visual-tools");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    page: "index",
    viewports: parseViewportSelection("all"),
    live: false,
    open: false,
    all: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "-p":
      case "--page":
        options.page = args[++i];
        break;
      case "-v":
      case "--viewport":
        options.viewports = parseViewportSelection(args[++i]);
        break;
      case "-l":
      case "--live":
        options.live = true;
        break;
      case "-o":
      case "--open":
        options.open = true;
        break;
      case "-a":
      case "--all":
        options.all = true;
        break;
      case "-h":
      case "--help":
        showHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Argumento no reconocido: ${arg}`);
    }
  }

  return options;
}

function showHelp() {
  console.log(`
CAPTURAR PÁGINA ORIGINAL

Usage: node capturar-origen.js [options]

Options:
  -p, --page <name>    Página a capturar (default: index)
  -v, --viewport      Viewport: desktop, tablet, mobile, all (default: all)
  -l, --live          Capturar desde URL live (no desde archivo local)
  -o, --open          Abrir screenshot después de capturar
  -a, --all           Capturar todas las páginas disponibles
  -h, --help          Mostrar esta ayuda

Ejemplos:
  node capturar-origen.js                    # Capturar index desde archivo local
  node capturar-origen.js -p contacto       # Capturar contacto.html
  node capturar-origen.js -l -p blog         # Capturar blog desde URL live
  node capturar-origen.js -a                # Capturar todas las páginas
  `);
}

async function run() {
  const options = parseArgs();

  log(COLORS.cyan, "\n=== CAPTURAR PÁGINA ORIGINAL ===\n");

  ensureDir(OUTPUT_DIR);

  let pages = [];

  if (options.all) {
    pages = getAllPages();
    log(COLORS.yellow, `📋 Capturando todas las páginas (${pages.length})\n`);
  } else {
    pages = [options.page];
  }

  const browser = await launchBrowser();

  const page = await browser.newPage();

  let captured = 0;
  let failed = 0;

  for (const pageName of pages) {
    const url = getOriginUrl(pageName, { live: options.live });

    if (!url) {
      log(COLORS.red, `✗ Página no encontrada: ${pageName}`);
      failed++;
      continue;
    }

    log(COLORS.yellow, `\n📄 Página: ${pageName}`);
    log(COLORS.reset, `   URL: ${url}`);

    for (const vp of options.viewports) {
      const outputPath = buildScreenshotPath("original", vp.name, pageName);
      log(COLORS.cyan, `📸 Capturando ${pageName} (${vp.name})...`);

      try {
        await capturePageScreenshot(page, {
          url,
          outputPath,
          viewport: vp,
        });
        log(COLORS.green, `   ✓ ${path.basename(outputPath)}`);
        captured++;
      } catch (err) {
        log(COLORS.red, `   ✗ Error: ${err.message}`);
        failed++;
      }

      await sleep(300);
    }
  }

  await browser.close();

  console.log("\n" + COLORS.cyan + "=== RESUMEN ===" + COLORS.reset);
  console.log(`✅ Capturadas: ${captured}`);
  console.log(`❌ Fallidas: ${failed}`);
  console.log(`📁 Guardadas en: ${OUTPUT_DIR}\n`);

  if (options.open && captured > 0) {
    openPath(OUTPUT_DIR);
  }
}

run().catch(console.error);
