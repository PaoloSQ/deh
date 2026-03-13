#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const prettier = require("prettier");
const {
  getPageMigration,
  resolveDownloadedHtmlPath,
  resolveGeneratedPaths,
} = require("../lib/page-migrations");
const { buildPartialReference, resolveSectionPartials } = require("../lib/page-sections");

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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
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

function extractMain(html) {
  const match = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (!match) {
    throw new Error("No se encontro bloque <main> en el HTML de origen");
  }
  return match[1];
}

function extractStyles(html) {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function extractScripts(html) {
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)];
  const external = [];
  const inline = [];

  for (const [, attrs, body] of scripts) {
    const srcMatch = attrs.match(/\ssrc=["']([^"']+)["']/i);
    if (srcMatch) {
      external.push(srcMatch[1]);
      continue;
    }

    const trimmed = body.trim();
    if (trimmed) {
      inline.push(trimmed);
    }
  }

  return { external, inline };
}

function removeScriptTags(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
}

function normalizeAssetPaths(html, pageName) {
  return html.replace(/\/_files\/ugd\//g, `/images/${pageName}/raw/_files/ugd/`);
}

function stripDataTestId(html) {
  return html.replace(/\sdata-testid="[^"]*"/g, "");
}

function indentBlock(text, spaces) {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line ? `${pad}${line}` : line))
    .join("\n");
}

function escapeTemplateLiteral(text) {
  return text.replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

async function formatHtmlSnapshot(html) {
  try {
    return await prettier.format(html, { parser: "html" });
  } catch (error) {
    return {
      __formatError: error.message,
      __rawHtml: html,
    };
  }
}

async function formatCssBlock(block) {
  try {
    const formatted = await prettier.format(block, { parser: "css" });
    return formatted.trim();
  } catch {
    return block.trim();
  }
}

async function formatInlineScript(script) {
  try {
    const formatted = await prettier.format(script, { parser: "babel" });
    return formatted.trim();
  } catch {
    return script.trim();
  }
}

function buildHandlebars(mainInner, config) {
  const cleanedMain = stripDataTestId(mainInner);
  const wrapperClass = config.wrapperClass || "downloaded-page";

  if (config.singleTemplate) {
    return {
      page: `<section class="${wrapperClass}">\n${cleanedMain.trim()}\n</section>\n`,
      partialFiles: {},
    };
  }

  const sectionData = resolveSectionPartials(cleanedMain, config);

  if (sectionData.blocks.length === 0) {
    return {
      page: `<section class="${wrapperClass}">\n${cleanedMain.trim()}\n</section>\n`,
      partialFiles: {},
    };
  }

  const { prefix, suffix, blocks } = sectionData;
  const partialFiles = {};
  const pageLines = [`<section class="${wrapperClass}">`];

  const trimmedPrefix = prefix.trim();
  if (trimmedPrefix) {
    pageLines.push(indentBlock(trimmedPrefix, 2));
  }

  blocks.forEach((block) => {
    partialFiles[block.name] = `${block.html.trim()}\n`;
    pageLines.push(`  {{> ${buildPartialReference(config.partialsDir, block.name)}}}`);
  });

  const trimmedSuffix = suffix.trim();
  if (trimmedSuffix) {
    pageLines.push(indentBlock(trimmedSuffix, 2));
  }

  pageLines.push(`</section>`, "");

  return {
    page: `${pageLines.join("\n")}\n`,
    partialFiles,
  };
}

async function buildCss(pageName, wrapperClass, styles) {
  const formattedBlocks = [];

  for (let index = 0; index < styles.length; index += 1) {
    const formatted = await formatCssBlock(styles[index]);
    formattedBlocks.push(`/* Style block ${index + 1} */\n${formatted}`);
  }

  return [
    `/* Base extraida de Wix (${pageName}) y organizada por bloques originales */`,
    `.${wrapperClass}{min-height:100px;}`,
    ...formattedBlocks,
  ].join("\n\n");
}

async function buildJsExtract(pageName, externalScripts, inlineScripts) {
  const formattedInlineScripts = [];

  for (const script of inlineScripts) {
    formattedInlineScripts.push(await formatInlineScript(script));
  }

  const source = [
    "/*",
    `  JS extraido del HTML original de ${pageName}.`,
    "  Este archivo es de referencia y NO se inyecta automaticamente en la pagina.",
    "  Objetivo: tener el JS organizado para analisis y migracion progresiva.",
    "*/",
    "",
    `const pageName = ${JSON.stringify(pageName)};`,
    `const externalScripts = ${JSON.stringify(externalScripts, null, 2)};`,
    "const inlineScripts = [",
    ...formattedInlineScripts.flatMap((script) => [
      "  String.raw`",
      escapeTemplateLiteral(script),
      "  `,",
    ]),
    "];",
    "",
    "module.exports = { pageName, externalScripts, inlineScripts };",
    "",
  ].join("\n");

  try {
    return await prettier.format(source, { parser: "babel" });
  } catch {
    return source;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, "..");
  const config = getPageMigration(args.page);

  if (!config) {
    throw new Error(`No hay configuracion de migracion para la pagina: ${args.page}`);
  }

  const sourcePath = resolveDownloadedHtmlPath(root, args.page);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`No existe el HTML descargado: ${sourcePath}`);
  }

  const outputPaths = resolveGeneratedPaths(root, args.page);
  const sourceHtml = fs.readFileSync(sourcePath, "utf8");
  const mainInnerRaw = extractMain(sourceHtml);
  const mainInner = normalizeAssetPaths(removeScriptTags(mainInnerRaw), args.page);
  const styles = extractStyles(sourceHtml);
  const scripts = extractScripts(sourceHtml);

  writeFile(outputPaths.sourceCopyPath, sourceHtml);

  const formattedSnapshot = await formatHtmlSnapshot(sourceHtml);
  let prettyFormatError = null;
  if (typeof formattedSnapshot === "string") {
    writeFile(outputPaths.prettySourcePath, formattedSnapshot);
  } else {
    prettyFormatError = formattedSnapshot.__formatError;
    writeFile(outputPaths.prettySourcePath, formattedSnapshot.__rawHtml);
  }

  const handlebars = buildHandlebars(mainInner, config);
  writeFile(outputPaths.handlebarsPath, handlebars.page);
  removeStalePartials(outputPaths.partialDir, Object.keys(handlebars.partialFiles));

  Object.entries(handlebars.partialFiles).forEach(([name, content]) => {
    writeFile(path.join(outputPaths.partialDir, `${name}.handlebars`), content);
  });

  writeFile(
    outputPaths.cssPath,
    await buildCss(args.page, config.wrapperClass || "downloaded-page", styles)
  );
  writeFile(
    outputPaths.jsExtractPath,
    await buildJsExtract(args.page, scripts.external, scripts.inline)
  );

  const manifest = {
    page: args.page,
    sourcePath,
    generatedAt: new Date().toISOString(),
    outputs: outputPaths,
    stats: {
      mainChars: mainInner.length,
      styleBlocks: styles.length,
      externalScripts: scripts.external.length,
      inlineScripts: scripts.inline.length,
      partials: Object.keys(handlebars.partialFiles),
    },
    warnings: {
      prettyFormatError,
    },
  };

  writeFile(outputPaths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
