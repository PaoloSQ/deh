const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const TARGETS = [
  {
    html: path.join(PROJECT_ROOT, 'sites', 'www.dehonline.es', 'index.html'),
    wrapperHref: '/css/structured/pages/home/head.css',
    wrapperDiskPath: path.join(PROJECT_ROOT, 'public', 'css', 'structured', 'pages', 'home', 'head.css'),
    label: 'home'
  },
  {
    html: path.join(PROJECT_ROOT, 'sites', 'www.dehonline.es', '360homeservice.html'),
    wrapperHref: '/css/structured/pages/360homeservice/head.css',
    wrapperDiskPath: path.join(PROJECT_ROOT, 'public', 'css', 'structured', 'pages', '360homeservice', 'head.css'),
    label: '360homeservice'
  },
  {
    html: path.join(PROJECT_ROOT, 'sites', 'www.dehonline.es', 'acuerdo-ecpj.html'),
    wrapperHref: '/css/structured/pages/acuerdo-ecpj/head.css',
    wrapperDiskPath: path.join(PROJECT_ROOT, 'public', 'css', 'structured', 'pages', 'acuerdo-ecpj', 'head.css'),
    label: 'acuerdo-ecpj'
  }
];

const REPORT_JSON = path.join(PROJECT_ROOT, 'CSS-STRUCTURE-PILOT-REPORT.json');
const REPORT_MD = path.join(PROJECT_ROOT, 'CSS-STRUCTURE-PILOT-REPORT.md');

const HEAD_RE = /<head[^>]*>([\s\S]*?)<\/head>/i;
const STYLESHEET_LINK_RE = /([ \t]*)<link\b(?=[^>]*rel=["']stylesheet["'])(?![^>]*\bid=)[^>]*\shref=["']([^"']+)["'][^>]*>\s*\n?/gi;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
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

function processTarget(target, write) {
  const original = fs.readFileSync(target.html, 'utf8');
  const headMatch = original.match(HEAD_RE);
  if (!headMatch) {
    return { file: target.html, changed: false, hrefs: 0 };
  }

  const headInner = headMatch[1];
  const hrefs = [];
  let firstIndent = '    ';
  let inserted = false;

  const rewrittenHeadInner = headInner.replace(STYLESHEET_LINK_RE, (match, indent, href) => {
    hrefs.push(href);
    if (!inserted) {
      inserted = true;
      firstIndent = indent || firstIndent;
      return `${firstIndent}<link rel="stylesheet" href="${target.wrapperHref}" />\n`;
    }
    return '';
  });

  if (!hrefs.length) {
    return { file: target.html, changed: false, hrefs: 0 };
  }

  const wrapperCss = buildWrapperCss(target.label, hrefs);
  const rewritten = original.replace(HEAD_RE, (fullMatch) => fullMatch.replace(headInner, rewrittenHeadInner));

  if (write) {
    ensureDir(path.dirname(target.wrapperDiskPath));
    fs.writeFileSync(target.wrapperDiskPath, wrapperCss, 'utf8');
    fs.writeFileSync(target.html, rewritten, 'utf8');
  }

  return {
    file: path.relative(PROJECT_ROOT, target.html).replace(/\\/g, '/'),
    wrapper: path.relative(PROJECT_ROOT, target.wrapperDiskPath).replace(/\\/g, '/'),
    changed: rewritten !== original,
    hrefs: hrefs.length
  };
}

function toMarkdown(report) {
  const lines = [
    '# CSS Structure Pilot Report',
    '',
    `- Targets: ${report.targets}`,
    `- Files changed: ${report.filesChanged}`,
    `- Wrapper files written: ${report.wrapperFilesWritten}`,
    `- Stylesheet links consolidated: ${report.stylesheetLinksConsolidated}`,
    '',
    '| HTML | Wrapper | Consolidated links |',
    '| --- | --- | ---: |'
  ];

  for (const entry of report.entries) {
    lines.push(`| ${entry.file} | ${entry.wrapper} | ${entry.hrefs} |`);
  }

  return lines.join('\n') + '\n';
}

function main() {
  const write = process.argv.includes('--write');
  const entries = TARGETS.map((target) => processTarget(target, write));
  const report = {
    targets: TARGETS.length,
    filesChanged: entries.filter((entry) => entry.changed).length,
    wrapperFilesWritten: entries.filter((entry) => entry.hrefs > 0).length,
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
        write
      },
      null,
      2
    )
  );
}

main();
