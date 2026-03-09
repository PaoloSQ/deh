const path = require("path");
const fs = require("fs");
const {
  COLORS,
  OUTPUT_DIR,
  log,
  ensureDir,
  parseViewportSelection,
  getAllPages,
  buildScreenshotPath,
  buildDiffPath,
  comparePngFiles,
  openPath,
} = require("./lib/visual-tools");

const REPORT_FILE = path.join(OUTPUT_DIR, "reporte.html");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    page: null,
    viewports: parseViewportSelection("all"),
    open: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "-p":
      case "--page":
        options.page = args[index + 1];
        index += 1;
        break;
      case "-v":
      case "--viewport":
        options.viewports = parseViewportSelection(args[index + 1]);
        index += 1;
        break;
      case "-o":
      case "--open":
        options.open = true;
        break;
      case "-h":
      case "--help":
        console.log(`
GENERAR REPORTE

Usage: node reporte.js [options]

Options:
  -p, --page <name>    Limitar el reporte a una página
  -v, --viewport      Viewport: desktop, tablet, mobile, all (default: all)
  -o, --open          Abrir el reporte al terminar
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

async function generateReport() {
  const options = parseArgs();
  log(COLORS.cyan, "\n=== GENERANDO REPORTE DE COMPARACIÓN ===\n");

  ensureDir(OUTPUT_DIR);

  const pages = options.page ? [options.page] : getAllPages();
  const results = [];

  for (const page of pages) {
    const pageResults = [];

    for (const vp of options.viewports) {
      const originalPath = buildScreenshotPath("original", vp.name, page);
      const newPath = buildScreenshotPath("new", vp.name, page);
      const diffPath = buildDiffPath(vp.name, page);

      if (fs.existsSync(originalPath) && fs.existsSync(newPath)) {
        const comparison = comparePngFiles(originalPath, newPath, {
          writeDiffPath: diffPath,
        });

        pageResults.push({
          viewport: vp.name,
          diffPath: `diff-${vp.name}-${page}.png`,
          percentDiff: comparison.percentDiff,
          numDiffPixels: comparison.diffPixels,
        });
      }
    }

    if (pageResults.length > 0) {
      const avgDiff = pageResults.reduce((sum, r) => sum + r.percentDiff, 0) / pageResults.length;

      results.push({
        page,
        viewports: pageResults,
        avgDiff,
      });
    }
  }

  if (results.length === 0) {
    log(COLORS.yellow, "No se encontraron capturas suficientes para generar el reporte.");
    log(COLORS.yellow, "Ejecuta primero `npm run visual:compare` o `npm run visual:batch`.");
    return;
  }

  const averageDiff = results.reduce((sum, r) => sum + r.avgDiff, 0) / results.length;
  const nearIdentical = results.filter((r) => r.avgDiff < 1).length;
  const needsFixes = results.filter((r) => r.avgDiff >= 5).length;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte de Comparación - DEH Online</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.6;
      padding: 20px;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    
    h1 {
      text-align: center;
      margin-bottom: 30px;
      color: #116dff;
    }
    
    .summary {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .summary h2 { margin-bottom: 15px; }
    
    .stats {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }
    
    .stat {
      flex: 1;
      min-width: 150px;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 6px;
      text-align: center;
    }
    
    .stat-value {
      font-size: 2em;
      font-weight: bold;
      color: #116dff;
    }
    
    .stat-label { color: #666; font-size: 0.9em; }
    
    .pages { display: flex; flex-direction: column; gap: 20px; }
    
    .page-card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    
    .page-header {
      padding: 15px 20px;
      background: #116dff;
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .page-header h3 { font-size: 1.2em; }
    
    .page-diff {
      padding: 5px 12px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 0.9em;
    }
    
    .diff-low { background: #28a745; color: white; }
    .diff-medium { background: #ffc107; color: #333; }
    .diff-high { background: #dc3545; color: white; }
    
    .viewports { display: flex; flex-wrap: wrap; }
    
    .viewport {
      flex: 1;
      min-width: 300px;
      padding: 15px;
      border-right: 1px solid #eee;
    }
    
    .viewport:last-child { border-right: none; }
    
    .viewport h4 {
      margin-bottom: 10px;
      color: #666;
    }
    
    .images {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    
    .images img {
      max-width: 100%;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    
    .image-label {
      font-size: 0.8em;
      color: #666;
      margin-bottom: 3px;
    }
    
    .legend {
      display: flex;
      gap: 20px;
      justify-content: center;
      margin-top: 20px;
    }
    
    .legend-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    
    .legend-color {
      width: 20px;
      height: 20px;
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Reporte de Comparación Visual</h1>
    
    <div class="summary">
      <h2>Resumen</h2>
      <div class="stats">
        <div class="stat">
          <div class="stat-value">${results.length}</div>
          <div class="stat-label">Páginas comparadas</div>
        </div>
        <div class="stat">
          <div class="stat-value">${averageDiff.toFixed(2)}%</div>
          <div class="stat-label">Diferencia promedio</div>
        </div>
        <div class="stat">
          <div class="stat-value">${nearIdentical}</div>
          <div class="stat-label">Páginas casi idénticas</div>
        </div>
        <div class="stat">
          <div class="stat-value">${needsFixes}</div>
          <div class="stat-label">Necesitan ajustes</div>
        </div>
      </div>
    </div>
    
    <div class="legend">
      <div class="legend-item">
        <div class="legend-color" style="background: #28a745;"></div>
        <span>&lt; 1% diferencia</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #ffc107;"></div>
        <span>1-5% diferencia</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #dc3545;"></div>
        <span>&gt; 5% diferencia</span>
      </div>
    </div>
    
    <div class="pages">
      ${results
        .map(
          (r) => `
        <div class="page-card">
          <div class="page-header">
            <h3>${r.page === "index" ? "🏠 Home" : "📄 " + r.page}</h3>
            <span class="page-diff ${r.avgDiff < 1 ? "diff-low" : r.avgDiff < 5 ? "diff-medium" : "diff-high"}">
              ${r.avgDiff.toFixed(2)}%
            </span>
          </div>
          <div class="viewports">
            ${r.viewports
              .map(
                (v) => `
              <div class="viewport">
                <h4>${v.viewport} (${v.percentDiff.toFixed(2)}%)</h4>
                <div class="images">
                  <div>
                    <div class="image-label">Original</div>
                    <img src="screenshot-${v.viewport}-original-${r.page}.png" alt="Original">
                  </div>
                  <div>
                    <div class="image-label">Nuevo</div>
                    <img src="screenshot-${v.viewport}-new-${r.page}.png" alt="Nuevo">
                  </div>
                  <div>
                    <div class="image-label">Diferencias</div>
                    <img src="${v.diffPath}" alt="Diferencias">
                  </div>
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      `
        )
        .join("")}
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(REPORT_FILE, html);

  log(COLORS.green, `✅ Reporte generado: ${REPORT_FILE}\n`);

  const totalDiff = averageDiff;
  const passed = nearIdentical;

  log(COLORS.cyan, "=== RESUMEN ===");
  log(COLORS.reset, `Páginas: ${results.length}`);
  log(COLORS.reset, `Diferencia promedio: ${totalDiff.toFixed(2)}%`);
  log(COLORS.green, `✅ Passed (<1%): ${passed}`);
  log(
    COLORS.yellow,
    `⚠️ Medium (1-5%): ${results.filter((r) => r.avgDiff >= 1 && r.avgDiff < 5).length}`
  );
  log(COLORS.red, `❌ Need fixes (>5%): ${results.filter((r) => r.avgDiff >= 5).length}`);

  if (options.open) {
    openPath(REPORT_FILE);
  }
}

generateReport().catch(console.error);
