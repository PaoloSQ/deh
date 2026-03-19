const fs = require('fs');
const path = require('path');

const { walk, isHtmlFile, toPosix } = require('./lib/runtime-utils');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SITES_ROOT = path.join(PROJECT_ROOT, 'sites');
const PUBLIC_ROOT = path.join(PROJECT_ROOT, 'public');
const CSS_ROOT = path.join(PUBLIC_ROOT, 'css', 'pages');
const JS_ROOT = path.join(PUBLIC_ROOT, 'js', 'pages');
const REPORT_JSON = path.join(PROJECT_ROOT, 'INLINE-ASSET-EXTRACTION-REPORT.json');
const REPORT_MD = path.join(PROJECT_ROOT, 'INLINE-ASSET-EXTRACTION-REPORT.md');

function parseArgs(argv) {
  const options = {
    write: false,
    filter: '',
    limit: 0,
    styles: true,
    scripts: true,
    onlyStaticized: false,
    skipRuntimeHeavy: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') options.write = true;
    else if (arg === '--dry-run') options.write = false;
    else if (arg === '--filter') options.filter = String(argv[index + 1] || '').toLowerCase();
    else if (arg === '--limit') options.limit = Number(argv[index + 1] || 0);
    else if (arg === '--styles-only') {
      options.styles = true;
      options.scripts = false;
    } else if (arg === '--scripts-only') {
      options.styles = false;
      options.scripts = true;
    } else if (arg === '--only-staticized') {
      options.onlyStaticized = true;
    } else if (arg === '--skip-runtime-heavy') {
      options.skipRuntimeHeavy = true;
    }
  }

  return options;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function collectHtmlFiles(options) {
  let files = walk(SITES_ROOT).filter(isHtmlFile);

  files = files.filter((filePath) => {
    const relPath = toPosix(path.relative(PROJECT_ROOT, filePath)).toLowerCase();
    return !options.filter || relPath.includes(options.filter);
  });

  if (options.limit > 0) {
    files = files.slice(0, options.limit);
  }

  return files;
}

function isRuntimeHeavy(html) {
  return /<script type="application\/json" id="wix-essential-viewer-model">|<script type="application\/json" id="wix-viewer-model">|window\.viewerModel/i.test(html);
}

function isStaticized(html) {
  return /staticized:/i.test(html);
}

function routeFromFilePath(filePath) {
  const relPath = toPosix(path.relative(SITES_ROOT, filePath));
  const segments = relPath.split('/');
  const domain = segments.shift();
  const rest = segments.join('/');
  const route = ('/' + rest)
    .replace(/\/index\.html?$/i, '/')
    .replace(/\.html?$/i, '')
    .replace(/\/\/+/g, '/');

  return {
    domain,
    route: route || '/'
  };
}

function buildAssetSegments(filePath) {
  const { domain, route } = routeFromFilePath(filePath);
  const routeSegments = route === '/'
    ? ['home']
    : route.replace(/^\/+|\/+$/g, '').split('/').map(slugify).filter(Boolean);

  return [slugify(domain) || 'site', ...(routeSegments.length ? routeSegments : ['home'])];
}

function buildWebAssetUrl(kind, filePath, assetName) {
  const segments = buildAssetSegments(filePath);
  return `/${kind}/${['pages', ...segments, assetName].join('/')}`;
}

function buildDiskAssetPath(kind, filePath, assetName) {
  const root = kind === 'css' ? CSS_ROOT : JS_ROOT;
  return path.join(root, ...buildAssetSegments(filePath), assetName);
}

function pageBaseUrl(filePath) {
  const { domain, route } = routeFromFilePath(filePath);
  return new URL(route || '/', `https://${domain}`).toString();
}

function parseAttributes(attrsText) {
  const attrs = [];
  const regex = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match = regex.exec(attrsText || '');

  while (match) {
    attrs.push({
      name: match[1],
      value: match[2] ?? match[3] ?? match[4] ?? null
    });
    match = regex.exec(attrsText || '');
  }

  return attrs;
}

function serializeAttributes(attrs) {
  return attrs
    .map((attr) => (
      attr.value === null
        ? attr.name
        : `${attr.name}="${String(attr.value).replace(/"/g, '&quot;')}"`
    ))
    .join(' ');
}

function pickPreservedStyleAttributes(attrs) {
  return attrs.filter((attr) => {
    const name = attr.name.toLowerCase();
    return (
      name === 'id' ||
      name === 'media' ||
      name === 'disabled' ||
      name === 'crossorigin' ||
      name === 'referrerpolicy' ||
      name === 'fetchpriority' ||
      name.startsWith('data-') ||
      name.startsWith('aria-')
    );
  });
}

function pickPreservedScriptAttributes(attrs) {
  return attrs.filter((attr) => {
    const name = attr.name.toLowerCase();
    return name !== 'src';
  });
}

function rewriteRelativeAssetUrl(rawUrl, baseUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return value;
  if (/^(data:|blob:|about:|javascript:|#|https?:|\/\/|\/)/i.test(value)) return value;

  try {
    const base = new URL(baseUrl);
    const resolved = new URL(value, base);
    if (resolved.origin === base.origin) {
      return `${resolved.pathname}${resolved.search}${resolved.hash}`;
    }
    return resolved.toString();
  } catch {
    return value;
  }
}

function rewriteCssUrls(css, baseUrl) {
  let next = css.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi, (match, quote, assetUrl) => {
    const rewritten = rewriteRelativeAssetUrl(assetUrl, baseUrl);
    if (rewritten === assetUrl) return match;
    const nextQuote = quote || '';
    return `url(${nextQuote}${rewritten}${nextQuote})`;
  });

  next = next.replace(/@import\s+(url\()?['"]([^'"]+)['"]\)?/gi, (match, urlWrapper, assetUrl) => {
    const rewritten = rewriteRelativeAssetUrl(assetUrl, baseUrl);
    if (rewritten === assetUrl) return match;
    return urlWrapper ? `@import url("${rewritten}")` : `@import "${rewritten}"`;
  });

  return next;
}

function shouldSkipInlineScript(attrs, content) {
  const attrsList = parseAttributes(attrs);
  const srcAttr = attrsList.find((attr) => attr.name.toLowerCase() === 'src');
  if (srcAttr) return true;

  const typeAttr = attrsList.find((attr) => attr.name.toLowerCase() === 'type');
  const typeValue = String(typeAttr && typeAttr.value || '').toLowerCase();

  if (typeValue === 'application/json' || typeValue === 'application/ld+json' || typeValue === 'importmap') {
    return true;
  }

  return !String(content || '').trim();
}

function buildStyleTag(attrsText, href) {
  const attrs = pickPreservedStyleAttributes(parseAttributes(attrsText));
  const merged = [{ name: 'rel', value: 'stylesheet' }, { name: 'href', value: href }, ...attrs];
  return `<link ${serializeAttributes(merged)}>`;
}

function buildScriptTag(attrsText, src) {
  const attrs = pickPreservedScriptAttributes(parseAttributes(attrsText));
  const merged = [...attrs, { name: 'src', value: src }];
  return `<script ${serializeAttributes(merged)}></script>`;
}

function extractInlineAssets(filePath, html, options) {
  const baseUrl = pageBaseUrl(filePath);
  const result = {
    html,
    styleCount: 0,
    scriptCount: 0,
    extractedFiles: []
  };

  let styleIndex = 0;
  let scriptIndex = 0;

  if (options.styles) {
    result.html = result.html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_match, attrsText, cssText) => {
      const content = String(cssText || '');
      if (!content.trim()) return _match;

      styleIndex += 1;
      const fileName = `style-${String(styleIndex).padStart(3, '0')}.css`;
      const webPath = buildWebAssetUrl('css', filePath, fileName);
      const diskPath = buildDiskAssetPath('css', filePath, fileName);
      const nextCss = rewriteCssUrls(content, baseUrl);

      result.styleCount += 1;
      result.extractedFiles.push({ kind: 'css', webPath, diskPath });

      if (options.write) {
        ensureDir(path.dirname(diskPath));
        fs.writeFileSync(diskPath, nextCss, 'utf8');
      }

      return buildStyleTag(attrsText, webPath);
    });
  }

  if (options.scripts) {
    result.html = result.html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_match, attrsText, scriptText) => {
      if (shouldSkipInlineScript(attrsText, scriptText)) return _match;

      scriptIndex += 1;
      const fileName = `script-${String(scriptIndex).padStart(3, '0')}.js`;
      const webPath = buildWebAssetUrl('js', filePath, fileName);
      const diskPath = buildDiskAssetPath('js', filePath, fileName);

      result.scriptCount += 1;
      result.extractedFiles.push({ kind: 'js', webPath, diskPath });

      if (options.write) {
        ensureDir(path.dirname(diskPath));
        fs.writeFileSync(diskPath, String(scriptText || ''), 'utf8');
      }

      return buildScriptTag(attrsText, webPath);
    });
  }

  return result;
}

function formatReport(results, options) {
  const processed = results.length;
  const modified = results.filter((item) => item.modified).length;
  const skippedRuntime = results.filter((item) => item.skippedReason === 'runtime-heavy').length;
  const skippedNonStaticized = results.filter((item) => item.skippedReason === 'not-staticized').length;
  const styleCount = results.reduce((acc, item) => acc + item.styleCount, 0);
  const scriptCount = results.reduce((acc, item) => acc + item.scriptCount, 0);

  let md = '# Extraccion de assets inline\n\n';
  md += `- Fecha: ${new Date().toISOString()}\n`;
  md += `- Escritura activada: ${options.write ? 'si' : 'no'}\n`;
  md += `- Solo paginas staticizadas: ${options.onlyStaticized ? 'si' : 'no'}\n`;
  md += `- Saltar runtime-heavy: ${options.skipRuntimeHeavy ? 'si' : 'no'}\n`;
  md += `- HTML procesados: ${processed}\n`;
  md += `- HTML modificables: ${modified}\n`;
  md += `- Bloques CSS extraibles: ${styleCount}\n`;
  md += `- Bloques JS extraibles: ${scriptCount}\n`;
  md += `- Saltados por runtime-heavy: ${skippedRuntime}\n`;
  md += `- Saltados por no staticizados: ${skippedNonStaticized}\n\n`;
  md += '| Archivo | Staticized | Runtime heavy | CSS | JS | Estado |\n|---|---|---|---:|---:|---|\n';

  for (const item of results) {
    md += `| ${item.relPath} | ${item.staticized ? 'si' : 'no'} | ${item.runtimeHeavy ? 'si' : 'no'} | ${item.styleCount} | ${item.scriptCount} | ${item.skippedReason || (item.modified ? 'listo' : 'sin cambios')} |\n`;
  }

  md += '\n';

  for (const item of results.filter((entry) => entry.modified).slice(0, 60)) {
    md += `## ${item.relPath}\n\n`;
    md += `- CSS: ${item.styleCount}\n`;
    md += `- JS: ${item.scriptCount}\n`;
    for (const asset of item.extractedFiles) {
      md += `- ${asset.kind}: ${asset.webPath}\n`;
    }
    md += '\n';
  }

  return md;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = collectHtmlFiles(options);

  if (!files.length) {
    throw new Error('No hay HTML seleccionados para extraer assets inline.');
  }

  const results = [];

  for (const filePath of files) {
    const relPath = toPosix(path.relative(PROJECT_ROOT, filePath));
    const original = fs.readFileSync(filePath, 'utf8');
    const runtimeHeavy = isRuntimeHeavy(original);
    const staticized = isStaticized(original);

    let skippedReason = '';
    if (options.onlyStaticized && !staticized) skippedReason = 'not-staticized';
    else if (options.skipRuntimeHeavy && runtimeHeavy) skippedReason = 'runtime-heavy';

    if (skippedReason) {
      results.push({
        relPath,
        staticized,
        runtimeHeavy,
        skippedReason,
        modified: false,
        styleCount: 0,
        scriptCount: 0,
        extractedFiles: []
      });
      continue;
    }

    const extracted = extractInlineAssets(filePath, original, options);
    const modified = extracted.html !== original;

    if (modified && options.write) {
      fs.writeFileSync(filePath, extracted.html, 'utf8');
    }

    results.push({
      relPath,
      staticized,
      runtimeHeavy,
      skippedReason: '',
      modified,
      styleCount: extracted.styleCount,
      scriptCount: extracted.scriptCount,
      extractedFiles: extracted.extractedFiles.map((asset) => ({
        kind: asset.kind,
        webPath: asset.webPath
      }))
    });
  }

  fs.writeFileSync(REPORT_JSON, JSON.stringify(results, null, 2), 'utf8');
  fs.writeFileSync(REPORT_MD, formatReport(results, options), 'utf8');

  const summary = {
    processed: results.length,
    modified: results.filter((item) => item.modified).length,
    styles: results.reduce((acc, item) => acc + item.styleCount, 0),
    scripts: results.reduce((acc, item) => acc + item.scriptCount, 0),
    skippedRuntimeHeavy: results.filter((item) => item.skippedReason === 'runtime-heavy').length,
    skippedNonStaticized: results.filter((item) => item.skippedReason === 'not-staticized').length,
    report: REPORT_MD,
    jsonReport: REPORT_JSON
  };

  console.log(JSON.stringify(summary, null, 2));
}

main();
