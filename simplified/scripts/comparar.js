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
  getNewUrl,
  buildScreenshotPath,
  buildDiffPath,
  capturePageScreenshot,
  comparePngFiles,
  openPath,
} = require("./lib/visual-tools");

function parseThreshold(value) {
  const threshold = Number.parseFloat(value);

  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new Error(`Threshold invalido: ${value}`);
  }

  return threshold;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    page: "index",
    viewports: parseViewportSelection("all"),
    threshold: 1,
    open: false,
    live: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "-p":
      case "--page":
        options.page = args[++i];
        break;
      case "-t":
      case "--threshold":
        options.threshold = parseThreshold(args[++i]);
        break;
      case "-v":
      case "--viewport":
        options.viewports = parseViewportSelection(args[++i]);
        break;
      case "-o":
      case "--open":
        options.open = true;
        break;
      case "-l":
      case "--live":
        options.live = true;
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
COMPARADOR VISUAL DE PÁGINAS

Usage: node comparar.js [options]

Options:
  -p, --page <name>    Página a comparar (default: index)
  -t, --threshold %   Threshold de diferencia (default: 1)
  -v, --viewport      Viewport: desktop, tablet, mobile, all (default: all)
  -l, --live          Usar https://www.dehonline.es como origen
  -o, --open          Abrir screenshots después de comparar
  -h, --help          Mostrar esta ayuda

Ejemplos:
  node comparar.js                         # Comparar index en todos los viewports
  node comparar.js -p contacto             # Comparar contacto.html
  node comparar.js -p blog -v mobile       # Comparar blog solo en mobile
  node comparar.js -t 5 -o                 # Comparar con threshold 5% y abrir
  `);
}

async function run() {
  const options = parseArgs();

  log(COLORS.cyan, "\n=== COMPARADOR VISUAL DEH ONLINE ===\n");
  log(COLORS.reset, `Página: ${options.page}`);
  log(COLORS.reset, `Threshold: ${options.threshold}%\n`);

  ensureDir(OUTPUT_DIR);

  const originUrl = getOriginUrl(options.page, { live: options.live });
  const newUrl = getNewUrl(options.page);

  if (!originUrl) {
    log(COLORS.red, `✗ No se encontró la página original: ${options.page}.html`);
    process.exit(1);
  }

  log(COLORS.reset, `Origen: ${originUrl}`);
  if (options.live) {
    log(COLORS.yellow, `  (usando URL live)`);
  }
  log(COLORS.reset, `Nuevo: ${newUrl}\n`);

  const browser = await launchBrowser();

  const page = await browser.newPage();

  const results = [];

  for (const vp of options.viewports) {
    console.log(
      `\n${COLORS.cyan}📱 Viewport: ${vp.name} (${vp.width}x${vp.height})${COLORS.reset}`
    );

    const originalPath = buildScreenshotPath("original", vp.name, options.page);
    const newPath = buildScreenshotPath("new", vp.name, options.page);
    const diffPath = buildDiffPath(vp.name, options.page);

    try {
      log(COLORS.cyan, `📸 Capturando original (${vp.name})...`);
      await capturePageScreenshot(page, {
        url: originUrl,
        outputPath: originalPath,
        viewport: vp,
      });
      log(COLORS.green, `   ✓ ${path.basename(originalPath)}`);

      await sleep(500);

      log(COLORS.cyan, `📸 Capturando nuevo (${vp.name})...`);
      await capturePageScreenshot(page, {
        url: newUrl,
        outputPath: newPath,
        viewport: vp,
      });
      log(COLORS.green, `   ✓ ${path.basename(newPath)}`);

      log(COLORS.cyan, `🔍 Comparando ${vp.name}...`);
      const result = comparePngFiles(originalPath, newPath, {
        writeDiffPath: diffPath,
      });
      const status =
        result.percentDiff < options.threshold
          ? `${COLORS.green}✅`
          : result.percentDiff < options.threshold * 3
            ? `${COLORS.yellow}⚠️`
            : `${COLORS.red}❌`;

      log(
        COLORS.reset,
        `   ${status} Diferencias: ${result.diffPixels} pixeles (${result.percentDiff.toFixed(2)}%)`
      );

      results.push({
        ...result,
        name: vp.name,
        diffPath,
      });
    } catch (err) {
      log(COLORS.red, `   ✗ Error: ${err.message}`);
    }
  }

  await browser.close();

  console.log("\n" + COLORS.cyan + "=== RESULTADOS ===" + COLORS.reset + "\n");

  let totalDiff = 0;
  let passed = 0;

  results.forEach((r) => {
    const status =
      r.percentDiff < options.threshold
        ? COLORS.green + "✅"
        : r.percentDiff < options.threshold * 3
          ? COLORS.yellow + "⚠️"
          : COLORS.red + "❌";

    console.log(`${status} ${r.name}: ${r.percentDiff.toFixed(2)}% diferente`);

    if (r.percentDiff < options.threshold) passed++;
    totalDiff += r.percentDiff;
  });

  const avgDiff = results.length > 0 ? totalDiff / results.length : 0;

  console.log(`\n📊 Diferencia promedio: ${avgDiff.toFixed(2)}%`);
  console.log(`📈 Passed: ${passed}/${results.length}`);

  if (avgDiff < options.threshold) {
    log(COLORS.green, "\n🎉 ¡Excelente! Las páginas son casi idénticas.\n");
  } else if (avgDiff < options.threshold * 3) {
    log(COLORS.yellow, "\n⚠️ Hay diferencias moderadas. Revisa las imágenes en /comparacion/\n");
  } else {
    log(COLORS.red, "\n❌ Hay diferencias significativas. Necesita ajustes.\n");
  }

  if (options.open) {
    openPath(OUTPUT_DIR);
  }

  return { results, avgDiff, passed, total: results.length };
}

run().catch(console.error);
