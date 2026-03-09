#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { getPageMigration, resolveGeneratedPaths } = require("../lib/page-migrations");
const {
  buildPartialReference,
  resolveSectionPartials,
  stripNoiseAttributes,
} = require("../lib/page-sections");

function parseArgs(argv) {
  const args = {
    page: "documbox-info",
  };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--page" && argv[index + 1]) {
      args.page = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function removeStalePartials(partialDir, nextPartialNames) {
  if (!fs.existsSync(partialDir)) {
    return;
  }

  const allowed = new Set(nextPartialNames.map((name) => `${name}.handlebars`));
  const entries = fs.readdirSync(partialDir, { withFileTypes: true });

  entries.forEach((entry) => {
    if (!entry.isFile() || !entry.name.endsWith(".handlebars")) {
      return;
    }

    if (!allowed.has(entry.name)) {
      fs.unlinkSync(path.join(partialDir, entry.name));
    }
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, "..");
  const config = getPageMigration(args.page);

  if (!config) {
    throw new Error(`La pagina ${args.page} no tiene configuracion de migracion`);
  }

  const outputPaths = resolveGeneratedPaths(root, args.page);
  const pageHtml = readText(outputPaths.handlebarsPath);
  const cleanedHtml = stripNoiseAttributes(pageHtml);
  const sectionData = resolveSectionPartials(cleanedHtml, config);
  const { prefix, suffix, blocks } = sectionData;
  const partials = [];

  removeStalePartials(
    outputPaths.partialDir,
    blocks.map((section) => section.name)
  );

  blocks.forEach((section) => {
    const partialPath = path.join(outputPaths.partialDir, `${section.name}.handlebars`);
    writeText(partialPath, `${section.html.trim()}\n`);
    partials.push({ name: section.name, partialPath, id: section.id });
  });

  const pageLines = [prefix.trimEnd()];
  partials.forEach(({ name }) => {
    pageLines.push(`  {{> ${buildPartialReference(outputPaths.partialDir, name)}}}`);
  });
  pageLines.push(suffix.trimStart(), "");

  writeText(outputPaths.handlebarsPath, `${pageLines.join("\n")}\n`);

  console.log(
    JSON.stringify(
      {
        page: args.page,
        pagePath: outputPaths.handlebarsPath,
        partials,
      },
      null,
      2
    )
  );
}

main();
