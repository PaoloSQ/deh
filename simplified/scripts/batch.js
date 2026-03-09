const {
  COLORS,
  OUTPUT_DIR,
  log,
  ensureDir,
  sleep,
  launchBrowser,
  parseViewportSelection,
  getAllPages,
  getOriginUrl,
  getNewUrl,
  buildScreenshotPath,
  buildDiffPath,
  capturePageScreenshot,
  comparePngFiles,
  openPath,
} = require("./lib/visual-tools");

const DEFAULT_THRESHOLD = 1;

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
    live: false,
    open: false,
    threshold: DEFAULT_THRESHOLD,
    viewports: parseViewportSelection("all"),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "-l":
      case "--live":
        options.live = true;
        break;
      case "-o":
      case "--open":
        options.open = true;
        break;
      case "-t":
      case "--threshold":
        options.threshold = parseThreshold(args[index + 1]);
        index += 1;
        break;
      case "-v":
      case "--viewport":
        options.viewports = parseViewportSelection(args[index + 1]);
        index += 1;
        break;
      case "-h":
      case "--help":
        console.log(`
COMPARADOR BATCH

Usage: node batch.js [options]

Options:
  -l, --live          Usar https://www.dehonline.es como origen
  -t, --threshold     Diferencia maxima aceptada en % (default: 1)
  -v, --viewport      Viewport: desktop, tablet, mobile, all (default: all)
  -o, --open          Abrir la carpeta de salida al terminar
  -h, --help          Mostrar esta ayuda
`);
        process.exit(0);
        break;
      default:
        throw new Error(`Argumento no reconocido: ${arg}`);
    }
  }

  return options;
}

async function run() {
  const options = parseArgs();
  log(COLORS.cyan, "\n=== COMPARADOR BATCH - TODAS LAS PÁGINAS ===\n");

  ensureDir(OUTPUT_DIR);

  const pages = getAllPages();
  log(COLORS.yellow, `📋 Páginas a comparar: ${pages.length}\n`);

  const browser = await launchBrowser();

  const page = await browser.newPage();

  const results = [];

  for (let i = 0; i < pages.length; i++) {
    const pageName = pages[i];
    const originUrl = getOriginUrl(pageName, { live: options.live });
    const newUrl = getNewUrl(pageName);

    if (!originUrl) {
      log(COLORS.red, `❌ ${pageName}: No encontrado en origen`);
      continue;
    }

    log(COLORS.cyan, `[${i + 1}/${pages.length}] 📄 ${pageName}`);

    let pageResults = { page: pageName, viewports: [] };

    for (const vp of options.viewports) {
      log(COLORS.reset, `   📱 ${vp.name}...`);

      const originalPath = buildScreenshotPath("original", vp.name, pageName);
      const newPath = buildScreenshotPath("new", vp.name, pageName);
      const diffPath = buildDiffPath(vp.name, pageName);

      try {
        await capturePageScreenshot(page, {
          url: originUrl,
          outputPath: originalPath,
          viewport: vp,
        });
        await sleep(300);

        await capturePageScreenshot(page, {
          url: newUrl,
          outputPath: newPath,
          viewport: vp,
        });
        await sleep(300);

        const compResult = comparePngFiles(originalPath, newPath, {
          writeDiffPath: diffPath,
        });

        const status =
          compResult.percentDiff < options.threshold
            ? COLORS.green + "✅"
            : compResult.percentDiff < 5
              ? COLORS.yellow + "⚠️"
              : COLORS.red + "❌";

        log(
          COLORS.reset,
          `      ${status} ${compResult.percentDiff.toFixed(2)}%`,
        );

        pageResults.viewports.push({
          viewport: vp.name,
          percentDiff: compResult.percentDiff,
        });
      } catch (err) {
        log(COLORS.red, `      ✗ Error: ${err.message}`);
      }

      await sleep(200);
    }

    if (pageResults.viewports.length > 0) {
      const avgDiff =
        pageResults.viewports.reduce((sum, v) => sum + v.percentDiff, 0) /
        pageResults.viewports.length;
      pageResults.avgDiff = avgDiff;
      results.push(pageResults);
    }

    log(COLORS.reset, "");
  }

  await browser.close();

  console.log(
    "\n" + COLORS.cyan + "=== RESULTADOS FINALES ===" + COLORS.reset + "\n",
  );

  results.sort((a, b) => a.avgDiff - b.avgDiff);

  results.forEach((r) => {
    const status =
      r.avgDiff < options.threshold
        ? COLORS.green + "✅"
        : r.avgDiff < 5
          ? COLORS.yellow + "⚠️"
          : COLORS.red + "❌";

    console.log(`${status} ${r.page}: ${r.avgDiff.toFixed(2)}%`);
  });

  const avgDiff =
    results.reduce((sum, r) => sum + r.avgDiff, 0) / results.length;
  const passed = results.filter((r) => r.avgDiff < options.threshold).length;

  console.log("\n" + COLORS.cyan + "=== RESUMEN ===" + COLORS.reset);
  console.log(`📊 Diferencia promedio: ${avgDiff.toFixed(2)}%`);
  console.log(`✅ Passed: ${passed}/${results.length}`);

  if (passed === results.length) {
    log(COLORS.green, "\n🎉 ¡Todas las páginas son casi idénticas!\n");
  } else if (passed > results.length / 2) {
    log(
      COLORS.yellow,
      "\n⚠️ La mayoría de páginas están bien. Revisa las que fallan.\n",
    );
  } else {
    log(COLORS.red, "\n❌ Muchas páginas necesitan ajustes.\n");
  }

  log(
    COLORS.cyan,
    "💡 Ejecuta `npm run visual:report` para generar el HTML con capturas y diffs.",
  );

  if (options.open) {
    openPath(OUTPUT_DIR);
  }
}

run().catch(console.error);
