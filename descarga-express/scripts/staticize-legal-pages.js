const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_TARGETS = [
  'sites/www.dehonline.es/condiciones-de-uso.html',
  'sites/www.dehonline.es/politica-de-compliance.html',
  'sites/www.dehonline.es/politica-de-cookies.html',
  'sites/www.dehonline.es/politica-de-privacidad.html',
  'sites/www.dehonline.es/politica-de-privacidad-para-redes-sociales.html',
  'sites/www.dehonline.es/política-de-privacidad-para-redes-sociales.html',
  'sites/www.dehonline.es/pol%C3%ADtica-de-privacidad-para-redes-sociales'
];
const REPORT_MD = path.resolve(PROJECT_ROOT, 'STATICIZE-PAGES-REPORT.md');
const REPORT_JSON = path.resolve(PROJECT_ROOT, 'STATICIZE-PAGES-REPORT.json');
const LOCAL_IMAGE_FALLBACK_TAG = '<script defer src="/assets/js/local/image-fallback.js"></script>';

function parseArgs(argv) {
  const options = {
    write: true,
    filter: '',
    limit: 0,
    targetDir: '',
    extension: null,
    paths: []
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') options.write = false;
    else if (arg === '--filter') options.filter = String(argv[++i] || '').toLowerCase();
    else if (arg === '--limit') options.limit = Number(argv[++i] || 0);
    else if (arg === '--target-dir') options.targetDir = String(argv[++i] || '');
    else if (arg === '--extension') options.extension = String(argv[++i] || '');
    else options.paths.push(path.resolve(process.cwd(), arg));
  }

  return options;
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function unique(items) {
  return Array.from(new Set(items));
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripTags(text) {
  return decodeEntities(text.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function deriveTitle(text) {
  const postTitleMatch = text.match(/<h1\b[^>]*data-hook=["']post-title["'][^>]*>([\s\S]*?)<\/h1>/i);
  if (postTitleMatch) {
    return stripTags(postTitleMatch[1]);
  }

  const h1Match = text.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    return stripTags(h1Match[1]);
  }

  return '';
}

function ensureTitle(text, changes) {
  const derivedTitle = deriveTitle(text);
  if (!derivedTitle) return text;

  let next = text;

  next = next.replace(/<title>\s*<\/title>/i, () => {
    changes.removed.push('empty title fixed');
    return `<title>${derivedTitle} | DEH Online</title>`;
  });

  next = next.replace(/<meta\s+property=["']og:title["']\s+content=["']\s*["']\s*\/?>/i, () => {
    changes.removed.push('empty og:title fixed');
    return `<meta property="og:title" content="${derivedTitle} | DEH Online"/>`;
  });

  next = next.replace(/<meta\s+name=["']twitter:title["']\s+content=["']\s*["']\s*\/?>/i, () => {
    changes.removed.push('empty twitter:title fixed');
    return `<meta name="twitter:title" content="${derivedTitle} | DEH Online"/>`;
  });

  return next;
}

function injectLocalImageFallback(text, changes) {
  if (text.includes('/assets/js/local/image-fallback.js')) return text;

  changes.removed.push('local image fallback injected');

  if (/<\/head>/i.test(text)) {
    return text.replace(/<\/head>/i, `${LOCAL_IMAGE_FALLBACK_TAG}\n</head>`);
  }

  if (/<\/body>/i.test(text)) {
    return text.replace(/<\/body>/i, `${LOCAL_IMAGE_FALLBACK_TAG}\n</body>`);
  }

  return `${LOCAL_IMAGE_FALLBACK_TAG}\n${text}`;
}

function normalizeTargets(options) {
  const explicit = options.paths
    .filter((filePath) => filePath.startsWith(PROJECT_ROOT) && fs.existsSync(filePath))
    .map((filePath) => path.resolve(filePath));

  const defaults = DEFAULT_TARGETS
    .map((relPath) => path.resolve(PROJECT_ROOT, relPath))
    .filter((filePath) => fs.existsSync(filePath));

  let targets = explicit.length ? explicit : defaults;

  if (!explicit.length && options.targetDir) {
    const absoluteDir = path.resolve(PROJECT_ROOT, options.targetDir);
    if (fs.existsSync(absoluteDir) && fs.statSync(absoluteDir).isDirectory()) {
      targets = fs.readdirSync(absoluteDir)
        .map((entry) => path.resolve(absoluteDir, entry))
        .filter((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile());
    }
  }

  if (options.extension !== null) {
    targets = targets.filter((filePath) => path.extname(filePath) === options.extension);
  }

  if (options.filter) {
    targets = targets.filter((filePath) => toPosix(path.relative(PROJECT_ROOT, filePath)).toLowerCase().includes(options.filter));
  }
  if (options.limit > 0) {
    targets = targets.slice(0, options.limit);
  }

  return unique(targets);
}

function staticizeHtml(text, changes) {
  let next = ensureTitle(text, changes);

  next = next.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (block) => {
    if (/type=["']application\/ld\+json["']/i.test(block)) {
      return block;
    }
    changes.removed.push('script');
    return '';
  });

  next = next.replace(/<link\b[^>]*rel=["']preload["'][^>]*>/gi, (block) => {
    if (/\bas=["'](?:script|fetch)["']/i.test(block) || /pages\/thunderbolt|wix-thunderbolt|browser-deprecation|siteTags\.bundle/i.test(block)) {
      changes.removed.push('preload link');
      return '';
    }
    return block;
  });

  next = next.replace(/<!--\s*scriptTagsToPreload\s*-->/gi, '');
  next = next.replace(/<!--\s*warmup data start\s*-->|<!--\s*warmup data end\s*-->/gi, '');

  next = next.replace(/<body([^>]*)>/i, (match, attrs) => {
    if (/data-js-loaded=/i.test(attrs)) return match;
    return `<body${attrs} data-js-loaded="true">`;
  });

  next = next.replace(/\n{3,}/g, '\n\n');

  if (!/staticized: legal page/i.test(next)) {
    next = next.replace(/<body([^>]*)>/i, `<body$1><!-- staticized: legal page -->`);
  }

  next = injectLocalImageFallback(next, changes);

  return next;
}

function summarizeRemovals(changes) {
  return changes.removed.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {});
}

function formatReport(results, options) {
  let md = '# Staticizado de paginas\n\n';
  md += `- Fecha: ${new Date().toISOString()}\n`;
  md += `- Escritura activada: ${options.write ? 'si' : 'no'}\n`;
  md += `- Paginas procesadas: ${results.length}\n\n`;
  md += '| Archivo | Modificado | Scripts eliminados | Preloads eliminados |\n|---|---|---:|---:|\n';

  for (const item of results) {
    md += `| ${item.relPath} | ${item.modified ? 'si' : 'no'} | ${item.counts.script || 0} | ${item.counts['preload link'] || 0} |\n`;
  }

  md += '\n';

  for (const item of results) {
    md += `## ${item.relPath}\n\n`;
    md += `- Modificado: ${item.modified ? 'si' : 'no'}\n`;
    md += `- Conteo: ${JSON.stringify(item.counts)}\n\n`;
  }

  return md;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = normalizeTargets(options);

  if (!files.length) {
    throw new Error('No hay paginas seleccionadas para staticizar.');
  }

  const results = [];

  for (const filePath of files) {
    const original = fs.readFileSync(filePath, 'utf8');
    const changes = { removed: [] };
    const staticized = staticizeHtml(original, changes);
    const modified = staticized !== original;

    if (modified && options.write) {
      fs.writeFileSync(filePath, staticized);
    }

    results.push({
      filePath,
      relPath: toPosix(path.relative(PROJECT_ROOT, filePath)),
      modified,
      counts: summarizeRemovals(changes)
    });
  }

  fs.writeFileSync(REPORT_JSON, JSON.stringify(results, null, 2));
  fs.writeFileSync(REPORT_MD, formatReport(results, options));

  console.log(JSON.stringify({
    processed: results.length,
    modified: results.filter((item) => item.modified).length,
    report: REPORT_MD,
    jsonReport: REPORT_JSON
  }, null, 2));
}

main();
