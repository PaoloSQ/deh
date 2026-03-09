#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { resolveGeneratedPaths, resolveTemplateFiles } = require("../lib/page-migrations");

function parseArgs(argv) {
  const args = {
    page: "documbox-info",
    write: false,
    check: false,
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
  }

  return args;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeText(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function collectHtmlSymbols(html) {
  const classSet = new Set();
  const idSet = new Set();

  for (const match of html.matchAll(/class\s*=\s*"([^"]*)"/gi)) {
    match[1]
      .split(/\s+/)
      .filter(Boolean)
      .forEach((cls) => classSet.add(cls));
  }

  for (const match of html.matchAll(/id\s*=\s*"([^"]+)"/gi)) {
    idSet.add(match[1]);
  }

  return { classSet, idSet };
}

function splitTopLevelSelectors(selectorText) {
  const out = [];
  let current = "";
  let round = 0;
  let square = 0;
  let quote = null;

  for (let i = 0; i < selectorText.length; i += 1) {
    const ch = selectorText[i];

    if (quote) {
      current += ch;
      if (ch === "\\") {
        i += 1;
        if (i < selectorText.length) {
          current += selectorText[i];
        }
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }

    if (ch === "(") {
      round += 1;
      current += ch;
      continue;
    }
    if (ch === ")") {
      round = Math.max(0, round - 1);
      current += ch;
      continue;
    }
    if (ch === "[") {
      square += 1;
      current += ch;
      continue;
    }
    if (ch === "]") {
      square = Math.max(0, square - 1);
      current += ch;
      continue;
    }

    if (ch === "," && round === 0 && square === 0) {
      if (current.trim()) {
        out.push(current.trim());
      }
      current = "";
      continue;
    }

    current += ch;
  }

  if (current.trim()) {
    out.push(current.trim());
  }

  return out;
}

function normalizeSimpleSelector(selector) {
  let s = selector.trim();
  // Quita pseudo-clases/elementos para poder comparar base simple (.foo, #bar).
  s = s.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "").trim();
  return s;
}

function shouldKeepSelector(selector, classSet, idSet) {
  const normalized = normalizeSimpleSelector(selector);

  if (/^\.[A-Za-z0-9_-]+$/.test(normalized)) {
    const cls = normalized.slice(1);
    return classSet.has(cls);
  }

  if (/^#[A-Za-z0-9_-]+$/.test(normalized)) {
    const id = normalized.slice(1);
    return idSet.has(id);
  }

  // Conservador: los selectores no triviales se mantienen.
  return true;
}

function parseBlocks(css) {
  const blocks = [];
  let i = 0;
  const n = css.length;

  while (i < n) {
    if (/\s/.test(css[i])) {
      let j = i + 1;
      while (j < n && /\s/.test(css[j])) {
        j += 1;
      }
      blocks.push({ type: "raw", text: css.slice(i, j) });
      i = j;
      continue;
    }

    if (css[i] === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      const j = end === -1 ? n : end + 2;
      blocks.push({ type: "raw", text: css.slice(i, j) });
      i = j;
      continue;
    }

    const braceIdx = css.indexOf("{", i);
    const semiIdx = css.indexOf(";", i);

    if (semiIdx !== -1 && (braceIdx === -1 || semiIdx < braceIdx)) {
      blocks.push({ type: "raw", text: css.slice(i, semiIdx + 1) });
      i = semiIdx + 1;
      continue;
    }

    if (braceIdx === -1) {
      blocks.push({ type: "raw", text: css.slice(i) });
      break;
    }

    const prelude = css.slice(i, braceIdx);
    let j = braceIdx;
    let depth = 0;

    while (j < n) {
      const ch = css[j];

      if (ch === '"' || ch === "'") {
        const quote = ch;
        j += 1;
        while (j < n) {
          if (css[j] === "\\") {
            j += 2;
            continue;
          }
          if (css[j] === quote) {
            j += 1;
            break;
          }
          j += 1;
        }
        continue;
      }

      if (ch === "/" && css[j + 1] === "*") {
        const end = css.indexOf("*/", j + 2);
        j = end === -1 ? n : end + 2;
        continue;
      }

      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const body = css.slice(braceIdx + 1, j);
          blocks.push({ type: "block", prelude, body });
          j += 1;
          i = j;
          break;
        }
      }

      j += 1;
    }

    if (j >= n) {
      break;
    }
  }

  return blocks;
}

function pruneCss(css, classSet, idSet, metrics) {
  const blocks = parseBlocks(css);
  let out = "";

  for (const block of blocks) {
    if (block.type === "raw") {
      out += block.text;
      continue;
    }

    const preludeTrim = block.prelude.trim();

    if (preludeTrim.startsWith("@")) {
      const nested = pruneCss(block.body, classSet, idSet, metrics);
      out += `${block.prelude}{${nested}}`;
      continue;
    }

    const selectors = splitTopLevelSelectors(block.prelude);
    if (selectors.length === 0) {
      out += `${block.prelude}{${block.body}}`;
      continue;
    }

    metrics.totalSelectors += selectors.length;

    const kept = [];
    for (const selector of selectors) {
      const normalized = normalizeSimpleSelector(selector);
      const isSimpleClass = /^\.[A-Za-z0-9_-]+$/.test(normalized);
      const isSimpleId = /^#[A-Za-z0-9_-]+$/.test(normalized);

      if (isSimpleClass || isSimpleId) {
        metrics.simpleSelectors += 1;
      }

      if (shouldKeepSelector(selector, classSet, idSet)) {
        kept.push(selector);
      } else {
        metrics.removedSelectors += 1;
      }
    }

    if (kept.length === 0) {
      metrics.removedRules += 1;
      continue;
    }

    out += `${kept.join(", ")}{${block.body}}`;
  }

  return out;
}

function resolveFiles(rootDir, page) {
  const generatedPaths = resolveGeneratedPaths(rootDir, page);

  return {
    htmlPaths: resolveTemplateFiles(rootDir, page),
    cssPath: generatedPaths.cssPath,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(__dirname, "..");
  const files = resolveFiles(rootDir, args.page);

  if (
    files.htmlPaths.length === 0 ||
    files.htmlPaths.some((filePath) => !fs.existsSync(filePath)) ||
    !fs.existsSync(files.cssPath)
  ) {
    console.error(
      JSON.stringify(
        {
          error: "missing-files",
          htmlPaths: files.htmlPaths,
          cssPath: files.cssPath,
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const html = files.htmlPaths.map((filePath) => readText(filePath)).join("\n");
  const cssBefore = readText(files.cssPath);
  const symbols = collectHtmlSymbols(html);

  const metrics = {
    totalSelectors: 0,
    simpleSelectors: 0,
    removedSelectors: 0,
    removedRules: 0,
  };

  const cssAfter = pruneCss(cssBefore, symbols.classSet, symbols.idSet, metrics);
  const changed = cssAfter !== cssBefore;

  if (args.write && changed) {
    writeText(files.cssPath, cssAfter);
  }

  const payload = {
    mode: args.write ? "write" : args.check ? "check" : "dry-run",
    page: args.page,
    html: {
      files: files.htmlPaths,
      classCount: symbols.classSet.size,
      idCount: symbols.idSet.size,
    },
    css: {
      file: files.cssPath,
      beforeSize: cssBefore.length,
      afterSize: cssAfter.length,
      changed,
      metrics,
    },
  };

  console.log(JSON.stringify(payload, null, 2));

  if (args.check && changed) {
    process.exitCode = 1;
  }
}

main();
