#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { resolveGeneratedPaths, resolveTemplateFiles } = require("../lib/page-migrations");

function parseArgs(argv) {
  const args = {
    page: "documbox-info",
    write: false,
    check: false,
    all: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--page" && argv[i + 1]) {
      args.page = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--write") {
      args.write = true;
      continue;
    }
    if (token === "--check") {
      args.check = true;
      continue;
    }
    if (token === "--all") {
      args.all = true;
      continue;
    }
  }

  return args;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeText(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function cleanupHtml(input) {
  let text = input;
  let removedXmlDeclarations = 0;
  let removedExtraBlankLines = 0;

  const xmlMatches = text.match(/<\?xml[^>]*\?>\s*/g);
  if (xmlMatches) {
    removedXmlDeclarations = xmlMatches.length;
    text = text.replace(/<\?xml[^>]*\?>\s*/g, "");
  }

  const beforeBlankNormalization = text;
  text = text.replace(/\n{3,}/g, "\n\n");
  if (beforeBlankNormalization !== text) {
    removedExtraBlankLines = (beforeBlankNormalization.match(/\n{3,}/g) || []).length;
  }

  return {
    output: text,
    metrics: {
      removedXmlDeclarations,
      removedExtraBlankLines,
    },
  };
}

function dedupeCssBlocks(input) {
  const out = [];
  const seen = new Set();
  let i = 0;
  let duplicatesRemoved = 0;
  const n = input.length;

  while (i < n) {
    if (/\s/.test(input[i])) {
      let j = i + 1;
      while (j < n && /\s/.test(input[j])) {
        j += 1;
      }
      out.push(input.slice(i, j));
      i = j;
      continue;
    }

    if (input[i] === "/" && input[i + 1] === "*") {
      const end = input.indexOf("*/", i + 2);
      const j = end === -1 ? n : end + 2;
      out.push(input.slice(i, j));
      i = j;
      continue;
    }

    const braceIdx = input.indexOf("{", i);
    const semiIdx = input.indexOf(";", i);

    if (semiIdx !== -1 && (braceIdx === -1 || semiIdx < braceIdx)) {
      out.push(input.slice(i, semiIdx + 1));
      i = semiIdx + 1;
      continue;
    }

    if (braceIdx === -1) {
      out.push(input.slice(i));
      break;
    }

    const start = i;
    let depth = 0;
    let j = braceIdx;

    while (j < n) {
      const ch = input[j];

      if (ch === '"' || ch === "'") {
        const quote = ch;
        j += 1;
        while (j < n) {
          if (input[j] === "\\") {
            j += 2;
            continue;
          }
          if (input[j] === quote) {
            j += 1;
            break;
          }
          j += 1;
        }
        continue;
      }

      if (ch === "/" && input[j + 1] === "*") {
        const end = input.indexOf("*/", j + 2);
        j = end === -1 ? n : end + 2;
        continue;
      }

      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }

      j += 1;
    }

    const block = input.slice(start, j);
    const key = block.replace(/\s+/g, " ").trim();
    if (seen.has(key)) {
      duplicatesRemoved += 1;
    } else {
      seen.add(key);
      out.push(block);
    }

    i = j;
  }

  return {
    output: out.join(""),
    duplicatesRemoved,
  };
}

function cleanupCss(input) {
  let text = input;

  const deduped = dedupeCssBlocks(text);
  text = deduped.output;

  const beforeTrailingSpace = text;
  text = text
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/g, ""))
    .join("\n");
  const trimmedTrailingWhitespace = beforeTrailingSpace !== text;

  text = text.replace(/\n{3,}/g, "\n\n");

  return {
    output: text,
    metrics: {
      duplicateBlocksRemoved: deduped.duplicatesRemoved,
      trimmedTrailingWhitespace,
    },
  };
}

function resolvePageFiles(rootDir, page) {
  const generatedPaths = resolveGeneratedPaths(rootDir, page);

  return {
    templatePaths: resolveTemplateFiles(rootDir, page),
    cssPath: generatedPaths.cssPath,
  };
}

function getAllPages(rootDir) {
  const pagesDir = path.join(rootDir, "src", "pages");
  const entries = fs.readdirSync(pagesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".handlebars"))
    .map((entry) => entry.name.replace(/\.handlebars$/i, ""))
    .sort();
}

function cleanPage(rootDir, page, write) {
  const files = resolvePageFiles(rootDir, page);
  const result = {
    page,
    templates: [],
    css: null,
    changed: false,
    missing: [],
  };

  files.templatePaths.forEach((templatePath) => {
    if (!fs.existsSync(templatePath)) {
      result.missing.push(templatePath);
    }
  });

  if (files.templatePaths.length === 0) {
    result.missing.push(`templates:${page}`);
  }
  if (!fs.existsSync(files.cssPath)) {
    result.missing.push(files.cssPath);
  }
  if (result.missing.length > 0) {
    return result;
  }

  let templatesChanged = false;
  files.templatePaths.forEach((templatePath) => {
    const templateBefore = readText(templatePath);
    const templateClean = cleanupHtml(templateBefore);
    const templateChanged = templateBefore !== templateClean.output;

    if (write && templateChanged) {
      writeText(templatePath, templateClean.output);
    }

    if (templateChanged) {
      templatesChanged = true;
    }

    result.templates.push({
      file: templatePath,
      changed: templateChanged,
      beforeSize: templateBefore.length,
      afterSize: templateClean.output.length,
      metrics: templateClean.metrics,
    });
  });

  const cssBefore = readText(files.cssPath);
  const cssClean = cleanupCss(cssBefore);
  const cssChanged = cssBefore !== cssClean.output;

  if (write && cssChanged) {
    writeText(files.cssPath, cssClean.output);
  }

  result.changed = templatesChanged || cssChanged;
  result.css = {
    file: files.cssPath,
    changed: cssChanged,
    beforeSize: cssBefore.length,
    afterSize: cssClean.output.length,
    metrics: cssClean.metrics,
  };

  return result;
}

function printSummary(results, mode) {
  const payload = {
    mode,
    pages: results,
    changedPages: results.filter((r) => r.changed).length,
    missingPages: results.filter((r) => r.missing && r.missing.length > 0).length,
  };
  console.log(JSON.stringify(payload, null, 2));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(__dirname, "..");
  const pages = args.all ? getAllPages(rootDir) : [args.page];
  const mode = args.write ? "write" : args.check ? "check" : "dry-run";

  const results = pages.map((page) => cleanPage(rootDir, page, args.write));
  printSummary(results, mode);

  if (args.check) {
    const hasMissing = results.some((r) => (r.missing || []).length > 0);
    const hasChangesPending = results.some((r) => r.changed);
    if (hasMissing || hasChangesPending) {
      process.exitCode = 1;
    }
  }
}

main();
