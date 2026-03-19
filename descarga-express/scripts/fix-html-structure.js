const fs = require('fs');
const path = require('path');

const { walk, isHtmlFile, toPosix } = require('./lib/runtime-utils');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SITES_ROOT = path.resolve(PROJECT_ROOT, 'sites');
const REPORT_JSON = path.resolve(PROJECT_ROOT, 'HTML-STRUCTURE-FIX-REPORT.json');
const REPORT_MD = path.resolve(PROJECT_ROOT, 'HTML-STRUCTURE-FIX-REPORT.md');

const NESTED_DOCUMENT_FRAGMENT =
  /(?:\s*<!DOCTYPE html>\s*<html\b[^>]*>\s*<body\b[^>]*>\s*<\/body>\s*<\/html>\s*)/i;

function formatMd(report) {
  const lines = [
    '# HTML Structure Fix Report',
    '',
    `- HTML checked: ${report.checked}`,
    `- Files fixed: ${report.fixed}`,
    `- Nested document fragments removed: ${report.fragmentsRemoved}`,
    ''
  ];

  if (report.files.length) {
    lines.push('| File | Fragments removed |');
    lines.push('| --- | ---: |');
    for (const entry of report.files) {
      lines.push(`| ${entry.file} | ${entry.fragmentsRemoved} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function fixFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  let fragmentsRemoved = 0;
  const output = source.replace(NESTED_DOCUMENT_FRAGMENT, (match) => {
    fragmentsRemoved += 1;
    const hasIndentedNewline = /\n\s*$/.test(match);
    return hasIndentedNewline ? '\n' : '';
  });

  return {
    changed: output !== source,
    fragmentsRemoved,
    output
  };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const write = args.has('--write');
  const files = walk(SITES_ROOT).filter(isHtmlFile);
  const report = {
    checked: files.length,
    fixed: 0,
    fragmentsRemoved: 0,
    files: []
  };

  for (const filePath of files) {
    const result = fixFile(filePath);
    if (!result.changed) continue;

    report.fixed += 1;
    report.fragmentsRemoved += result.fragmentsRemoved;
    report.files.push({
      file: toPosix(path.relative(PROJECT_ROOT, filePath)),
      fragmentsRemoved: result.fragmentsRemoved
    });

    if (write) {
      fs.writeFileSync(filePath, result.output, 'utf8');
    }
  }

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(REPORT_MD, formatMd(report) + '\n', 'utf8');
  console.log(
    JSON.stringify(
      {
        checked: report.checked,
        fixed: report.fixed,
        fragmentsRemoved: report.fragmentsRemoved,
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
