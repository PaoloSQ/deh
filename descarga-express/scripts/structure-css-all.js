const fs = require('fs');
const path = require('path');

const { walk, isHtmlFile, toPosix } = require('./lib/runtime-utils');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SITE_ROOT = path.join(PROJECT_ROOT, 'sites', 'www.dehonline.es');
const STRUCTURED_ROOT = path.join(PROJECT_ROOT, 'public', 'css', 'structured', 'pages');
const REPORT_JSON = path.join(PROJECT_ROOT, 'CSS-STRUCTURE-REPORT.json');
const REPORT_MD = path.join(PROJECT_ROOT, 'CSS-STRUCTURE-REPORT.md');

const HEAD_RE = /<head[^>]*>([\s\S]*?)<\/head>/i;
const STYLESHEET_LINK_RE = /([ \t]*)<link\b(?=[^>]*rel=["']stylesheet["'])(?![^>]*\bid=)[^>]*\shref=["']([^"']+)["'][^>]*>\s*\n?/gi;

function parseArgs(argv) {
  const options = {
    write: false,
    filter: '',
    limit: 0
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') options.write = true;
    else if (arg === '--dry-run') options.write = false;
    else if (arg === '--filter') options.filter = String(argv[index + 1] || '').toLowerCase();
    else if (arg === '--limit') options.limit = Number(argv[index + 1] || 0);
  }

  return options;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function collectHtmlFiles(options) {
  let files = walk(SITE_ROOT).filter(isHtmlFile);

  files = files.filter((filePath) => {
    const relPath = toPosix(path.relative(PROJECT_ROOT, filePath)).toLowerCase();
    return !options.filter || relPath.includes(options.filter);
  });

  if (options.limit > 0) {
    files = files.slice(0, options.limit);
  }

  return files;
}

function routeLabelFromFile(filePath) {
  const rel = toPosix(path.relative(SITE_ROOT, filePath));
  if (rel === 'index.html') return 'home';
  if (/\/index\.html$/i.test(rel)) {
    return rel.replace(/\/index\.html$/i, '');
  }
  return rel.replace(/\.html$/i, '');
}

function buildWrapperHref(routeLabel) {
  return `/css/structured/pages/${routeLabel}/head.css`;
}

function buildWrapperDiskPath(routeLabel) {
  return path.join(STRUCTURED_ROOT, ...routeLabel.split('/'), 'head.css');
}

function buildWrapperCss(label, hrefs) {
  const lines = [
    `/* Structured entrypoint for ${label}.`,
    '   Imports preserve the original order to avoid visual drift. */',
    ''
  ];

  for (const href of hrefs) {
    lines.push(`@import url("${href}");`);
  }

  return lines.join('\n') + '\n';
}

function processFile(filePath, write) {
  const original = fs.readFileSync(filePath, 'utf8');
  const headMatch = original.match(HEAD_RE);
  if (!headMatch) {
    return null;
  }

  const routeLabel = routeLabelFromFile(filePath);
  const wrapperHref = buildWrapperHref(routeLabel);
  const wrapperDiskPath = buildWrapperDiskPath(routeLabel);
  const headInner = headMatch[1];

  if (headInner.includes(wrapperHref)) {
    return {
      file: toPosix(path.relative(PROJECT_ROOT, filePath)),
      wrapper: toPosix(path.relative(PROJECT_ROOT, wrapperDiskPath)),
      changed: false,
      skipped: true,
      hrefs: 0
    };
  }

  const hrefs = [];
  let firstIndent = '    ';
  let inserted = false;

  const rewrittenHeadInner = headInner.replace(STYLESHEET_LINK_RE, (_match, indent, href) => {
    hrefs.push(href);
    if (!inserted) {
      inserted = true;
      firstIndent = indent || firstIndent;
      return `${firstIndent}<link rel="stylesheet" href="${wrapperHref}" />\n`;
    }
    return '';
  });

  if (!hrefs.length) {
    return {
      file: toPosix(path.relative(PROJECT_ROOT, filePath)),
      wrapper: toPosix(path.relative(PROJECT_ROOT, wrapperDiskPath)),
      changed: false,
      skipped: true,
      hrefs: 0
    };
  }

  const wrapperCss = buildWrapperCss(routeLabel, hrefs);
  const rewritten = original.replace(HEAD_RE, (fullMatch) => fullMatch.replace(headInner, rewrittenHeadInner));

  if (write) {
    ensureDir(path.dirname(wrapperDiskPath));
    fs.writeFileSync(wrapperDiskPath, wrapperCss, 'utf8');
    fs.writeFileSync(filePath, rewritten, 'utf8');
  }

  return {
    file: toPosix(path.relative(PROJECT_ROOT, filePath)),
    wrapper: toPosix(path.relative(PROJECT_ROOT, wrapperDiskPath)),
    changed: rewritten !== original,
    skipped: false,
    hrefs: hrefs.length
  };
}

function toMarkdown(report) {
  const lines = [
    '# CSS Structure Report',
    '',
    `- HTML checked: ${report.htmlChecked}`,
    `- Files changed: ${report.filesChanged}`,
    `- Files skipped: ${report.filesSkipped}`,
    `- Wrapper files written: ${report.wrapperFilesWritten}`,
    `- Stylesheet links consolidated: ${report.stylesheetLinksConsolidated}`,
    '',
    '| HTML | Wrapper | Consolidated links | Status |',
    '| --- | --- | ---: | --- |'
  ];

  for (const entry of report.entries) {
    lines.push(
      `| ${entry.file} | ${entry.wrapper} | ${entry.hrefs} | ${entry.skipped ? 'skipped' : 'structured'} |`
    );
  }

  return lines.join('\n') + '\n';
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = collectHtmlFiles(options);
  const entries = files.map((filePath) => processFile(filePath, options.write)).filter(Boolean);

  const report = {
    htmlChecked: files.length,
    filesChanged: entries.filter((entry) => entry.changed).length,
    filesSkipped: entries.filter((entry) => entry.skipped).length,
    wrapperFilesWritten: entries.filter((entry) => !entry.skipped && entry.hrefs > 0).length,
    stylesheetLinksConsolidated: entries.reduce((sum, entry) => sum + entry.hrefs, 0),
    entries
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(REPORT_MD, toMarkdown(report), 'utf8');

  console.log(
    JSON.stringify(
      {
        ...report,
        report: REPORT_MD,
        jsonReport: REPORT_JSON,
        write: options.write
      },
      null,
      2
    )
  );
}

main();
