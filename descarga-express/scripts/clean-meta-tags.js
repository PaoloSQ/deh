const fs = require('fs');
const path = require('path');

const { walk, isHtmlFile, toPosix } = require('./lib/runtime-utils');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SITES_ROOT = path.join(PROJECT_ROOT, 'sites');
const REPORT_JSON = path.join(PROJECT_ROOT, 'META-CLEAN-REPORT.json');
const REPORT_MD = path.join(PROJECT_ROOT, 'META-CLEAN-REPORT.md');

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

function shouldRemoveMetaTag(tag) {
  const lower = tag.toLowerCase();

  if (/\bcharset\s*=/.test(lower)) return false;

  const nameMatch = tag.match(/\bname=["']([^"']+)["']/i);
  const propertyMatch = tag.match(/\bproperty=["']([^"']+)["']/i);
  const httpEquivMatch = tag.match(/\bhttp-equiv=["']([^"']+)["']/i);

  const name = (nameMatch && nameMatch[1].toLowerCase()) || '';
  const property = (propertyMatch && propertyMatch[1].toLowerCase()) || '';
  const httpEquiv = (httpEquivMatch && httpEquivMatch[1].toLowerCase()) || '';

  if (name === 'viewport' || name === 'description' || name === 'robots' || name === 'refresh') {
    return false;
  }

  if (
    name === 'generator' ||
    name === 'format-detection' ||
    name === 'skype_toolbar' ||
    name === 'facebook-domain-verification' ||
    name === 'google-site-verification' ||
    name === 'fb_admins_meta_tag'
  ) {
    return true;
  }

  if (name.startsWith('twitter:')) return true;
  if (property.startsWith('og:')) return true;
  if (property.startsWith('article:')) return true;
  if (property === 'fb:admins') return true;

  if (
    httpEquiv === 'x-ua-compatible' ||
    httpEquiv === 'etag' ||
    httpEquiv.startsWith('x-wix-')
  ) {
    return true;
  }

  if (name === 'content-type') return true;

  return false;
}

function cleanMetaTags(html) {
  let removed = 0;
  const cleaned = html.replace(/<meta\b[^>]*>\s*/gi, (tag) => {
    if (!shouldRemoveMetaTag(tag)) return tag;
    removed += 1;
    return '';
  });

  return {
    html: cleaned.replace(/\n{3,}/g, '\n\n'),
    removed
  };
}

function toMarkdown(report) {
  const lines = [
    '# Meta Clean Report',
    '',
    `- Files checked: ${report.filesChecked}`,
    `- Files changed: ${report.filesChanged}`,
    `- Meta tags removed: ${report.metaTagsRemoved}`,
    '',
    '| File | Meta tags removed |',
    '| --- | ---: |'
  ];

  for (const entry of report.entries) {
    lines.push(`| ${entry.file} | ${entry.metaTagsRemoved} |`);
  }

  return lines.join('\n') + '\n';
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = collectHtmlFiles(options);
  const report = {
    filesChecked: files.length,
    filesChanged: 0,
    metaTagsRemoved: 0,
    entries: []
  };

  for (const filePath of files) {
    const original = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
    const result = cleanMetaTags(original);
    const changed = result.html !== original;

    if (changed) {
      report.filesChanged += 1;
      report.metaTagsRemoved += result.removed;
      if (options.write) {
        fs.writeFileSync(filePath, result.html, 'utf8');
      }
    }

    report.entries.push({
      file: toPosix(path.relative(PROJECT_ROOT, filePath)),
      metaTagsRemoved: result.removed
    });
  }

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(REPORT_MD, toMarkdown(report), 'utf8');

  console.log(
    JSON.stringify(
      {
        filesChecked: report.filesChecked,
        filesChanged: report.filesChanged,
        metaTagsRemoved: report.metaTagsRemoved,
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
