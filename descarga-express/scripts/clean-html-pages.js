const fs = require('fs');
const path = require('path');
const prettier = require('prettier');

const { walk, isHtmlFile, toPosix } = require('./lib/runtime-utils');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SITES_ROOT = path.join(PROJECT_ROOT, 'sites');
const REPORT_JSON = path.join(PROJECT_ROOT, 'HTML-CLEAN-REPORT.json');
const REPORT_MD = path.join(PROJECT_ROOT, 'HTML-CLEAN-REPORT.md');

function parseArgs(argv) {
  const options = {
    write: false,
    filter: '',
    limit: 0,
    includeRuntimeHeavyFormatting: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') options.write = true;
    else if (arg === '--dry-run') options.write = false;
    else if (arg === '--filter') options.filter = String(argv[index + 1] || '').toLowerCase();
    else if (arg === '--limit') options.limit = Number(argv[index + 1] || 0);
    else if (arg === '--include-runtime-heavy-formatting') options.includeRuntimeHeavyFormatting = true;
  }

  return options;
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

function trimTrailingSpaces(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n');
}

function normalizeBlankLines(text) {
  return text.replace(/\n{3,}/g, '\n\n');
}

function conservativeFormatHtml(text) {
  const protectedBlocks = [];
  const next = text.replace(
    /<(script|style|pre|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi,
    (block) => {
      const token = `__DEH_HTML_BLOCK_${protectedBlocks.length}__`;
      protectedBlocks.push(block);
      return token;
    }
  );

  const withLineBreaks = next
    .replace(/>\s+</g, '>\n<')
    .replace(/\n{3,}/g, '\n\n');

  return protectedBlocks.reduce((current, block, index) => {
    return current.replace(`__DEH_HTML_BLOCK_${index}__`, block);
  }, withLineBreaks);
}

function removeHtmlComments(text) {
  let removed = 0;
  const next = text.replace(/<!--([\s\S]*?)-->/g, (match, inner) => {
    if (/\[if\s|\[endif/i.test(inner)) {
      return match;
    }
    removed += 1;
    return '';
  });
  return { text: next, removed };
}

function removeSafeMetaTags(text) {
  const patterns = [
    /<meta\b[^>]*name=["']generator["'][^>]*content=["']Wix\.com Website Builder["'][^>]*>\s*/gi,
    /<meta\b[^>]*http-equiv=["']X-UA-Compatible["'][^>]*>\s*/gi,
    /<meta\b[^>]*name=["']format-detection["'][^>]*telephone=no[^>]*>\s*/gi,
    /<meta\b[^>]*name=["']skype_toolbar["'][^>]*>\s*/gi,
    /<meta\b[^>]*http-equiv=["']X-Wix-[^"']+["'][^>]*>\s*/gi,
    /<meta\b[^>]*http-equiv=["']etag["'][^>]*>\s*/gi,
    /<meta\b[^>]*name=["']facebook-domain-verification["'][^>]*>\s*/gi,
    /<meta\b[^>]*name=["']google-site-verification["'][^>]*>\s*/gi,
    /<meta\b[^>]*name=["']fb_admins_meta_tag["'][^>]*>\s*/gi,
    /<meta\b[^>]*property=["']fb:admins["'][^>]*>\s*/gi
  ];

  let removed = 0;
  let next = text;

  for (const pattern of patterns) {
    next = next.replace(pattern, (match) => {
      removed += 1;
      return '';
    });
  }

  return { text: next, removed };
}

function removeEmptyBlocks(text) {
  let removedScripts = 0;
  let removedStyles = 0;

  let next = text.replace(/<script\b([^>]*)>\s*<\/script>\s*/gi, (match, attrs) => {
    if (/type=["']application\/json["']/i.test(attrs || '')) {
      return match;
    }
    removedScripts += 1;
    return '';
  });

  next = next.replace(/<style\b[^>]*>\s*<\/style>\s*/gi, () => {
    removedStyles += 1;
    return '';
  });

  return { text: next, removedScripts, removedStyles };
}

function removeInvalidVoidEndTags(text) {
  let removed = 0;
  const next = text.replace(/<\/(?:link|meta|img|br|hr|input|source|area|base|col|embed|param|track|wbr)>/gi, () => {
    removed += 1;
    return '';
  });
  return { text: next, removed };
}

function removeXmlDeclarations(text) {
  let removed = 0;
  const next = text.replace(/<\?xml[\s\S]*?\?>\s*/gi, () => {
    removed += 1;
    return '';
  });
  return { text: next, removed };
}

async function formatHtml(text, allowFullFormatting) {
  if (!allowFullFormatting) {
    return {
      text: normalizeBlankLines(trimTrailingSpaces(conservativeFormatHtml(text))).trim() + '\n',
      usedFullFormat: false,
      parseError: false
    };
  }

  try {
    const formatted = await prettier.format(text, {
      parser: 'html',
      htmlWhitespaceSensitivity: 'ignore',
      printWidth: 120,
      tabWidth: 2,
      useTabs: false
    });

    return {
      text: normalizeBlankLines(trimTrailingSpaces(formatted)).trim() + '\n',
      usedFullFormat: true,
      parseError: false
    };
  } catch (_error) {
    return {
      text: normalizeBlankLines(trimTrailingSpaces(conservativeFormatHtml(text))).trim() + '\n',
      usedFullFormat: false,
      parseError: true
    };
  }
}

function rel(filePath) {
  return toPosix(path.relative(PROJECT_ROOT, filePath));
}

function toMarkdown(report) {
  const lines = [
    '# HTML Clean Report',
    '',
    `- Files checked: ${report.filesChecked}`,
    `- Files changed: ${report.filesChanged}`,
    `- Runtime-heavy files: ${report.runtimeHeavyFiles}`,
    `- Fully formatted files: ${report.fullyFormattedFiles}`,
    `- Full-format fallbacks: ${report.fullFormatFallbacks}`,
    `- Comments removed: ${report.commentsRemoved}`,
    `- Meta tags removed: ${report.metaTagsRemoved}`,
    `- Empty script blocks removed: ${report.emptyScriptsRemoved}`,
    `- Empty style blocks removed: ${report.emptyStylesRemoved}`,
    `- Invalid void end tags removed: ${report.invalidVoidEndTagsRemoved}`,
    `- XML declarations removed: ${report.xmlDeclarationsRemoved}`,
    '',
    '| File | Runtime-heavy | Full format | Parse fallback | Comments | Meta | Empty scripts | Empty styles | Void tags | XML decls |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |'
  ];

  for (const entry of report.entries) {
    lines.push(
      `| ${entry.file} | ${entry.runtimeHeavy ? 'yes' : 'no'} | ${entry.fullFormat ? 'yes' : 'no'} | ${entry.parseFallback ? 'yes' : 'no'} | ${entry.commentsRemoved} | ${entry.metaTagsRemoved} | ${entry.emptyScriptsRemoved} | ${entry.emptyStylesRemoved} | ${entry.invalidVoidEndTagsRemoved} | ${entry.xmlDeclarationsRemoved} |`
    );
  }

  return lines.join('\n') + '\n';
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = collectHtmlFiles(options);
  const report = {
    filesChecked: files.length,
    filesChanged: 0,
    runtimeHeavyFiles: 0,
    fullyFormattedFiles: 0,
    fullFormatFallbacks: 0,
    commentsRemoved: 0,
    metaTagsRemoved: 0,
    emptyScriptsRemoved: 0,
    emptyStylesRemoved: 0,
    invalidVoidEndTagsRemoved: 0,
    xmlDeclarationsRemoved: 0,
    entries: []
  };

  for (const filePath of files) {
    const original = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
    const runtimeHeavy = isRuntimeHeavy(original);
    const allowFullFormatting = !runtimeHeavy || options.includeRuntimeHeavyFormatting;

    if (runtimeHeavy) report.runtimeHeavyFiles += 1;
    const commentsResult = removeHtmlComments(original);
    const metaResult = removeSafeMetaTags(commentsResult.text);
    const emptyResult = removeEmptyBlocks(metaResult.text);
    const invalidVoidEndTagsResult = removeInvalidVoidEndTags(emptyResult.text);
    const xmlDeclarationsResult = removeXmlDeclarations(invalidVoidEndTagsResult.text);
    const formatted = await formatHtml(xmlDeclarationsResult.text, allowFullFormatting);
    if (formatted.usedFullFormat) report.fullyFormattedFiles += 1;
    if (formatted.parseError) report.fullFormatFallbacks += 1;

    const changed = formatted.text !== original;

    if (changed) {
      report.filesChanged += 1;
      if (options.write) {
        fs.writeFileSync(filePath, formatted.text, 'utf8');
      }
    }

    report.commentsRemoved += commentsResult.removed;
    report.metaTagsRemoved += metaResult.removed;
    report.emptyScriptsRemoved += emptyResult.removedScripts;
    report.emptyStylesRemoved += emptyResult.removedStyles;
    report.invalidVoidEndTagsRemoved += invalidVoidEndTagsResult.removed;
    report.xmlDeclarationsRemoved += xmlDeclarationsResult.removed;
    report.entries.push({
      file: rel(filePath),
      runtimeHeavy,
      fullFormat: formatted.usedFullFormat,
      parseFallback: formatted.parseError,
      commentsRemoved: commentsResult.removed,
      metaTagsRemoved: metaResult.removed,
      emptyScriptsRemoved: emptyResult.removedScripts,
      emptyStylesRemoved: emptyResult.removedStyles,
      invalidVoidEndTagsRemoved: invalidVoidEndTagsResult.removed,
      xmlDeclarationsRemoved: xmlDeclarationsResult.removed,
      changed
    });
  }

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(REPORT_MD, toMarkdown(report), 'utf8');

  console.log(
    JSON.stringify(
      {
        filesChecked: report.filesChecked,
        filesChanged: report.filesChanged,
        runtimeHeavyFiles: report.runtimeHeavyFiles,
        fullyFormattedFiles: report.fullyFormattedFiles,
        fullFormatFallbacks: report.fullFormatFallbacks,
        commentsRemoved: report.commentsRemoved,
        metaTagsRemoved: report.metaTagsRemoved,
        emptyScriptsRemoved: report.emptyScriptsRemoved,
        emptyStylesRemoved: report.emptyStylesRemoved,
        invalidVoidEndTagsRemoved: report.invalidVoidEndTagsRemoved,
        xmlDeclarationsRemoved: report.xmlDeclarationsRemoved,
        write: options.write
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
