const path = require("path");
const { spawnSync } = require("child_process");

const COMMANDS = {
  capture: "capturar-origen.js",
  compare: "comparar.js",
  batch: "batch.js",
  report: "reporte.js",
  header: "inspect-header.js",
};

const ALIASES = {
  inspect: "header",
  "inspect-header": "header",
};

function showHelp() {
  console.log(`
VISUAL TOOLING

Usage:
  node scripts/visual.js <command> [args]
  npm run visual:<command> -- [args]

Commands:
  capture    Captura paginas de referencia
  compare    Compara origen vs local
  batch      Ejecuta comparacion masiva
  report     Genera el reporte HTML
  header     Inspecciona el header live/local

Examples:
  node scripts/visual.js compare -p index -v desktop
  node scripts/visual.js report -p index
  node scripts/visual.js header --mode hover
  npm run visual:batch -- --viewport mobile
`);
}

function resolveCommand(rawCommand) {
  return ALIASES[rawCommand] || rawCommand;
}

function main() {
  const [, , rawCommand, ...args] = process.argv;

  if (!rawCommand || rawCommand === "help" || rawCommand === "--help" || rawCommand === "-h") {
    showHelp();
    process.exit(0);
  }

  const command = resolveCommand(rawCommand.toLowerCase());
  const scriptFile = COMMANDS[command];

  if (!scriptFile) {
    console.error(`Comando visual no reconocido: ${rawCommand}`);
    showHelp();
    process.exit(1);
  }

  const scriptPath = path.join(__dirname, scriptFile);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}

main();
