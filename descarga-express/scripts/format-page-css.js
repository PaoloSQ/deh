const fs = require('fs');
const path = require('path');
const prettier = require('prettier');

const { walk, toPosix } = require('./lib/runtime-utils');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CSS_ROOT = path.join(PROJECT_ROOT, 'public', 'css', 'pages');
const REPORT_JSON = path.join(PROJECT_ROOT, 'PAGE-CSS-FORMAT-REPORT.json');
const REPORT_MD = path.join(PROJECT_ROOT, 'PAGE-CSS-FORMAT-REPORT.md');

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

function collectCssFiles(options) {
  let files = walk(CSS_ROOT).filter((filePath) => path.extname(filePath).toLowerCase() === '.css');

  files = files.filter((filePath) => {
    const relPath = toPosix(path.relative(PROJECT_ROOT, filePath)).toLowerCase();
    return !options.filter || relPath.includes(options.filter);
  });

  if (options.limit > 0) {
    files = files.slice(0, options.limit);
  }

  return files;
}

function rel(filePath) {
  return toPosix(path.relative(PROJECT_ROOT, filePath));
}

function conservativeNormalizeCss(text) {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

function toMarkdown(report) {
  const lines = [
    '# Page CSS Format Report',
    '',
    `- Files checked: ${report.filesChecked}`,
    `- Files changed: ${report.filesChanged}`,
    `- Prettier formatted: ${report.prettierFormatted}`,
    `- Fallback normalized: ${report.fallbackNormalized}`,
    '',
    '| File | Changed | Prettier | Fallback |',
    '| --- | --- | --- | --- |'
  ];

  for (const entry of report.entries) {
    lines.push(`| ${entry.file} | ${entry.changed ? 'yes' : 'no'} | ${entry.prettier ? 'yes' : 'no'} | ${entry.fallback ? 'yes' : 'no'} |`);
  }

  return lines.join('\n') + '\n';
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = collectCssFiles(options);
  const report = {
    filesChecked: files.length,
    filesChanged: 0,
    prettierFormatted: 0,
    fallbackNormalized: 0,
    entries: []
  };

  for (const filePath of files) {
    const original = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
    let formatted = '';
    let prettierUsed = false;
    let fallbackUsed = false;

    try {
      formatted = (await prettier.format(original, {
        parser: 'css',
        printWidth: 120,
        tabWidth: 2,
        useTabs: false
      }))
        .replace(/\r\n/g, '\n')
        .trim() + '\n';
      prettierUsed = true;
      report.prettierFormatted += 1;
    } catch (_error) {
      formatted = conservativeNormalizeCss(original);
      fallbackUsed = true;
      report.fallbackNormalized += 1;
    }

    const changed = formatted !== original;
    if (changed) {
      report.filesChanged += 1;
      if (options.write) {
        fs.writeFileSync(filePath, formatted, 'utf8');
      }
    }

    report.entries.push({
      file: rel(filePath),
      changed,
      prettier: prettierUsed,
      fallback: fallbackUsed
    });
  }

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(REPORT_MD, toMarkdown(report), 'utf8');

  console.log(
    JSON.stringify(
      {
        filesChecked: report.filesChecked,
        filesChanged: report.filesChanged,
        prettierFormatted: report.prettierFormatted,
        fallbackNormalized: report.fallbackNormalized,
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
