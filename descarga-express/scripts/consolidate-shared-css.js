const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { walk, isHtmlFile, toPosix } = require('./lib/runtime-utils');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SITE_ROOT = path.join(PROJECT_ROOT, 'sites', 'www.dehonline.es');
const PAGE_CSS_ROOT = path.join(PROJECT_ROOT, 'public', 'css', 'pages', 'www-dehonline-es');
const SHARED_CSS_ROOT = path.join(PROJECT_ROOT, 'public', 'css', 'shared', 'www-dehonline-es');
const REPORT_JSON = path.join(PROJECT_ROOT, 'CSS-CONSOLIDATION-REPORT.json');
const REPORT_MD = path.join(PROJECT_ROOT, 'CSS-CONSOLIDATION-REPORT.md');

function parseArgs(argv) {
  const options = {
    write: false,
    filter: '',
    limit: 0,
    maxStyleNumber: 20
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') options.write = true;
    else if (arg === '--dry-run') options.write = false;
    else if (arg === '--filter') options.filter = String(argv[index + 1] || '').toLowerCase();
    else if (arg === '--limit') options.limit = Number(argv[index + 1] || 0);
    else if (arg === '--max-style-number') options.maxStyleNumber = Number(argv[index + 1] || 20);
  }

  return options;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function rel(filePath) {
  return toPosix(path.relative(PROJECT_ROOT, filePath));
}

function styleNumberFromPath(filePath) {
  const match = path.basename(filePath).match(/^style-(\d{3})\.css$/i);
  return match ? Number(match[1]) : null;
}

function hasRelativeCssUrls(cssText) {
  const urlMatches = cssText.matchAll(/url\((['"]?)(.*?)\1\)/gi);
  for (const match of urlMatches) {
    const value = String(match[2] || '').trim();
    if (!value) continue;
    if (/^(?:data:|blob:|https?:|\/\/|\/|#)/i.test(value)) continue;
    return true;
  }

  const importMatches = cssText.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]\)?/gi);
  for (const match of importMatches) {
    const value = String(match[1] || '').trim();
    if (!value) continue;
    if (/^(?:https?:|\/\/|\/)/i.test(value)) continue;
    return true;
  }

  return false;
}

function collectCssFiles(options) {
  let files = walk(PAGE_CSS_ROOT).filter((filePath) => path.extname(filePath).toLowerCase() === '.css');
  files = files.filter((filePath) => {
    const relPath = rel(filePath).toLowerCase();
    if (options.filter && !relPath.includes(options.filter)) return false;
    const styleNumber = styleNumberFromPath(filePath);
    return Number.isInteger(styleNumber) && styleNumber <= options.maxStyleNumber;
  });

  if (options.limit > 0) {
    files = files.slice(0, options.limit);
  }

  return files;
}

function collectHtmlFiles(options) {
  let files = walk(SITE_ROOT).filter(isHtmlFile);
  files = files.filter((filePath) => {
    const relPath = rel(filePath).toLowerCase();
    return !options.filter || relPath.includes(options.filter);
  });
  return files;
}

function groupDuplicateCss(files) {
  const byHash = new Map();

  for (const filePath of files) {
    const cssText = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
    if (hasRelativeCssUrls(cssText)) continue;

    const hash = crypto.createHash('sha1').update(cssText).digest('hex');
    if (!byHash.has(hash)) {
      byHash.set(hash, []);
    }

    byHash.get(hash).push({
      filePath,
      cssText
    });
  }

  return [...byHash.entries()]
    .map(([hash, entries]) => ({ hash, entries }))
    .filter((group) => group.entries.length > 1)
    .sort((left, right) => right.entries.length - left.entries.length || left.hash.localeCompare(right.hash));
}

function sharedWebPath(index, hash) {
  return `/css/shared/www-dehonline-es/shared-${String(index).padStart(3, '0')}-${hash.slice(0, 8)}.css`;
}

function sharedDiskPath(webPath) {
  return path.join(PROJECT_ROOT, 'public', webPath.replace(/^\/+/, ''));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rewriteHtmlReferences(html, replacements) {
  let next = html;
  let count = 0;

  for (const [originalPath, replacementPath] of replacements) {
    const pattern = new RegExp(escapeRegex(originalPath), 'g');
    next = next.replace(pattern, () => {
      count += 1;
      return replacementPath;
    });
  }

  return { html: next, count };
}

function toMarkdown(report) {
  const lines = [
    '# CSS Consolidation Report',
    '',
    `- CSS checked: ${report.cssChecked}`,
    `- Duplicate groups: ${report.duplicateGroups}`,
    `- Shared files planned: ${report.sharedFiles}`,
    `- HTML changed: ${report.htmlChanged}`,
    `- HTML references rewritten: ${report.htmlRewrites}`,
    '',
    '| Shared file | Members | Sample source |',
    '| --- | ---: | --- |'
  ];

  for (const item of report.sharedEntries) {
    lines.push(`| ${item.sharedPath} | ${item.memberCount} | ${item.sampleSource} |`);
  }

  return lines.join('\n') + '\n';
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const cssFiles = collectCssFiles(options);
  const htmlFiles = collectHtmlFiles(options);
  const duplicateGroups = groupDuplicateCss(cssFiles);
  const replacements = new Map();
  const sharedEntries = [];

  ensureDir(SHARED_CSS_ROOT);

  duplicateGroups.forEach((group, index) => {
    const webPath = sharedWebPath(index + 1, group.hash);
    const diskPath = sharedDiskPath(webPath);
    const canonical = group.entries[0];

    sharedEntries.push({
      sharedPath: webPath,
      diskPath: rel(diskPath),
      memberCount: group.entries.length,
      sampleSource: rel(canonical.filePath)
    });

    if (options.write) {
      ensureDir(path.dirname(diskPath));
      fs.writeFileSync(diskPath, canonical.cssText, 'utf8');
    }

    for (const entry of group.entries) {
      const originalWebPath = `/${rel(entry.filePath).replace(/^public\//, '')}`;
      replacements.set(originalWebPath, webPath);
    }
  });

  let htmlChanged = 0;
  let htmlRewrites = 0;

  for (const htmlFile of htmlFiles) {
    const original = fs.readFileSync(htmlFile, 'utf8').replace(/\r\n/g, '\n');
    const rewritten = rewriteHtmlReferences(original, replacements);
    if (rewritten.html === original) continue;

    htmlChanged += 1;
    htmlRewrites += rewritten.count;

    if (options.write) {
      fs.writeFileSync(htmlFile, rewritten.html, 'utf8');
    }
  }

  const report = {
    cssChecked: cssFiles.length,
    duplicateGroups: duplicateGroups.length,
    sharedFiles: sharedEntries.length,
    htmlChanged,
    htmlRewrites,
    sharedEntries
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(REPORT_MD, toMarkdown(report), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main();
