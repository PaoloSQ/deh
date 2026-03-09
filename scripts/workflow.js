const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

const groups = {
  setup: [
    "analizar-estructura.js",
    "extraer-css-variables.js",
    "extraer-contenido.js",
  ],
  home: [
    "extraer-y-descargar-imagenes.js",
    "renombrar-imagenes-descriptivo.js",
  ],
  report: ["generar-reporte-diferencias.js"],
};

groups.all = [...groups.setup, ...groups.home, ...groups.report];

function runScript(fileName) {
  const fullPath = path.join(__dirname, fileName);
  const result = spawnSync(process.execPath, [fullPath], {
    cwd: ROOT,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`Fallo ${fileName} (exit ${result.status})`);
  }
}

function printHelp() {
  console.log("Uso: node scripts/workflow.js <comando>");
  console.log("");
  console.log("Comandos:");
  console.log("  setup   Ejecuta analisis global inicial");
  console.log("  home    Ejecuta flujo de imagenes de home");
  console.log("  report  Genera reporte de diferencias");
  console.log("  all     Ejecuta setup + home + report");
}

function main() {
  const command = (process.argv[2] || "").toLowerCase();

  if (!groups[command]) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  console.log(`\nWorkflow: ${command}\n`);

  for (const scriptName of groups[command]) {
    console.log(`> ${scriptName}`);
    runScript(scriptName);
  }

  console.log("\nWorkflow completado.\n");
}

main();
