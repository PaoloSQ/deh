const fs = require('fs');
const path = require('path');

const { walk, isHtmlFile, toPosix } = require('./lib/runtime-utils');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SITES_ROOT = path.join(PROJECT_ROOT, 'sites');
const PUBLIC_ROOT = path.join(PROJECT_ROOT, 'public');
const SIMPLE_IMG_ROOT = path.join(PUBLIC_ROOT, 'img');
const REPORT_JSON = path.join(PROJECT_ROOT, 'SIMPLE-IMAGE-LIBRARY-REPORT.json');
const REPORT_MD = path.join(PROJECT_ROOT, 'SIMPLE-IMAGE-LIBRARY-REPORT.md');

const IMAGE_REF_REGEX = /\/assets\/img\/(?:canonical\/master\/[^"'&\s<)]+?\.(?:png|jpe?g|webp|gif|svg|ico|avif|bmp)|canonical\/[^"'&\s<)]+?\.(?:png|jpe?g|webp|gif|svg|ico|avif|bmp)|media\/[^"'&\s<)]+?\.(?:png|jpe?g|webp|gif|svg|ico|avif|bmp)|external\/[^"'&\s<)]+?\.(?:png|jpe?g|webp|gif|svg|ico|avif|bmp)|avatars\/[^"'&\s<)]+?\.(?:png|jpe?g|webp|gif|svg|ico|avif|bmp)|client\/[^"'&\s<)]+?\.(?:png|jpe?g|webp|gif|svg|ico|avif|bmp)|images\/[^"'&\s<)]+?\.(?:png|jpe?g|webp|gif|svg|ico|avif|bmp)|cap\/icons\/[^"'&\s<)]+?\.(?:png|jpe?g|webp|gif|svg|ico|avif|bmp))/gi;

function parseArgs(argv) {
  return {
    write: argv.includes('--write'),
    dryRun: argv.includes('--dry-run') || !argv.includes('--write')
  };
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

function pad(num) {
  return String(num).padStart(3, '0');
}

function collectHtmlFiles() {
  return walk(SITES_ROOT).filter(isHtmlFile);
}

function collectRefs() {
  const refs = new Map();

  for (const filePath of collectHtmlFiles()) {
    const relHtmlPath = toPosix(path.relative(PROJECT_ROOT, filePath));
    const html = fs.readFileSync(filePath, 'utf8');
    for (const match of html.matchAll(IMAGE_REF_REGEX)) {
      const ref = String(match[0] || '').trim();
      if (!ref) continue;

      if (!refs.has(ref)) {
        refs.set(ref, {
          ref,
          htmlPaths: new Set()
        });
      }

      refs.get(ref).htmlPaths.add(relHtmlPath);
    }
  }

  return [...refs.values()].map((entry) => ({
    ref: entry.ref,
    htmlPaths: [...entry.htmlPaths].sort()
  }));
}

function classifyRef(entry) {
  const ref = entry.ref;
  const isIcon =
    /\/assets\/img\/(?:client|images|cap\/icons)\//i.test(ref) ||
    /\.(?:ico)$/i.test(ref) ||
    /favicon|apple-touch|pfavico/i.test(ref);

  if (isIcon) return 'icons';
  if (/\/assets\/img\/(?:external|avatars)\//i.test(ref)) return 'avatars';
  if (entry.htmlPaths.length > 1) return 'shared';
  return 'pages';
}

function pageLocationFor(htmlPath) {
  const rel = String(htmlPath || '').replace(/^sites\//, '');
  const segments = rel.split('/').filter(Boolean);
  if (!segments.length) return ['site', 'home'];

  if (segments.length === 1) {
    const host = slugify(segments[0].replace(/\.html?$/i, '')) || 'site';
    return [host, 'home'];
  }

  const host = slugify(segments[0]) || 'site';
  const remainder = [...segments.slice(1)];

  if (remainder.length === 1 && /index\.html?$/i.test(remainder[0])) {
    return [host, 'home'];
  }

  const lastIndex = remainder.length - 1;
  if (lastIndex >= 0) {
    if (/index\.html?$/i.test(remainder[lastIndex])) {
      remainder.pop();
    } else {
      remainder[lastIndex] = remainder[lastIndex].replace(/\.html?$/i, '');
    }
  }

  const cleanSegments = remainder.map(slugify).filter(Boolean);
  return [host, ...(cleanSegments.length ? cleanSegments : ['home'])];
}

function sourcePathFromRef(ref) {
  const primary = path.join(PUBLIC_ROOT, ref.replace(/^\/+/, ''));
  if (fs.existsSync(primary) && fs.statSync(primary).isFile()) {
    return primary;
  }

  const mediaMatch = String(ref || '').match(/^\/assets\/img\/media\/([^"'&\s<)]+)$/i);
  if (mediaMatch) {
    const canonicalMaster = path.join(PUBLIC_ROOT, 'assets', 'img', 'canonical', 'master', mediaMatch[1]);
    if (fs.existsSync(canonicalMaster) && fs.statSync(canonicalMaster).isFile()) {
      return canonicalMaster;
    }
  }

  return primary;
}

function linkOrCopy(src, dest, dryRun) {
  if (dryRun) return;

  ensureDir(path.dirname(dest));
  if (fs.existsSync(dest)) fs.rmSync(dest, { force: true });

  try {
    fs.linkSync(src, dest);
  } catch {
    fs.copyFileSync(src, dest);
  }
}

function buildMapping(entries) {
  const iconNames = new Map();
  const pageCounters = new Map();
  let sharedCount = 0;
  let avatarCount = 0;

  return entries
    .map((entry) => {
      const sourcePath = sourcePathFromRef(entry.ref);
      if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
        return {
          ...entry,
          kind: 'missing',
          sourcePath,
          targetPath: '',
          targetUrl: ''
        };
      }

      const ext = path.extname(sourcePath).toLowerCase() || '.img';
      const kind = classifyRef(entry);

      let relTarget;
      if (kind === 'icons') {
        const rawName = slugify(path.basename(sourcePath, ext)) || 'icon';
        const used = (iconNames.get(rawName) || 0) + 1;
        iconNames.set(rawName, used);
        const fileName = used === 1 ? `${rawName}${ext}` : `${rawName}-${pad(used)}${ext}`;
        relTarget = path.posix.join('img', 'icons', fileName);
      } else if (kind === 'avatars') {
        avatarCount += 1;
        relTarget = path.posix.join('img', 'avatars', `avatar-${pad(avatarCount)}${ext}`);
      } else if (kind === 'shared') {
        sharedCount += 1;
        relTarget = path.posix.join('img', 'shared', `shared-${pad(sharedCount)}${ext}`);
      } else {
        const pageLocation = pageLocationFor(entry.htmlPaths[0]);
        const pageKey = pageLocation.join('/');
        const nextIndex = (pageCounters.get(pageKey) || 0) + 1;
        pageCounters.set(pageKey, nextIndex);
        relTarget = path.posix.join('img', ...pageLocation, `image-${pad(nextIndex)}${ext}`);
      }

      return {
        ...entry,
        kind,
        sourcePath,
        targetPath: path.join(PUBLIC_ROOT, relTarget.replace(/\//g, path.sep)),
        targetUrl: `/${relTarget}`
      };
    })
    .sort((a, b) => a.ref.localeCompare(b.ref));
}

function rewriteHtmlFiles(mapping, dryRun) {
  const replacements = mapping
    .filter((entry) => entry.targetUrl && entry.kind !== 'missing')
    .map((entry) => [entry.ref, entry.targetUrl]);

  let changedFiles = 0;

  for (const filePath of collectHtmlFiles()) {
    const html = fs.readFileSync(filePath, 'utf8');
    let next = html;
    for (const [from, to] of replacements) {
      next = next.split(from).join(to);
    }
    if (next !== html) {
      changedFiles += 1;
      if (!dryRun) {
        fs.writeFileSync(filePath, next, 'utf8');
      }
    }
  }

  return changedFiles;
}

function writeReport(summary) {
  fs.writeFileSync(REPORT_JSON, JSON.stringify(summary, null, 2));

  const lines = [];
  lines.push('# Simple Image Library');
  lines.push('');
  lines.push(`- Fecha: ${summary.generatedAt}`);
  lines.push(`- Dry run: ${summary.dryRun ? 'si' : 'no'}`);
  lines.push(`- Referencias locales unicas: ${summary.uniqueRefs}`);
  lines.push(`- Assets enlazados/copied: ${summary.materialized}`);
  lines.push(`- HTML modificados: ${summary.changedFiles}`);
  lines.push('');
  lines.push('## Categorias');
  lines.push('');
  for (const [key, value] of Object.entries(summary.byKind)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push('');
  lines.push('## Ejemplos');
  lines.push('');
  for (const item of summary.items.slice(0, 40)) {
    lines.push(`- ${item.ref} -> ${item.targetUrl || 'missing'}`);
  }
  lines.push('');

  fs.writeFileSync(REPORT_MD, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const refs = collectRefs();
  const mapping = buildMapping(refs);

  if (!options.dryRun) {
    fs.rmSync(SIMPLE_IMG_ROOT, { recursive: true, force: true });
    ensureDir(SIMPLE_IMG_ROOT);
    for (const entry of mapping) {
      if (!entry.targetPath || entry.kind === 'missing') continue;
      linkOrCopy(entry.sourcePath, entry.targetPath, options.dryRun);
    }
  }

  const changedFiles = rewriteHtmlFiles(mapping, options.dryRun);
  const byKind = {};
  for (const entry of mapping) {
    byKind[entry.kind] = (byKind[entry.kind] || 0) + 1;
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    uniqueRefs: mapping.length,
    materialized: mapping.filter((entry) => entry.targetPath && entry.kind !== 'missing').length,
    changedFiles,
    byKind,
    items: mapping.map((entry) => ({
      ref: entry.ref,
      kind: entry.kind,
      targetUrl: entry.targetUrl,
      htmlPaths: entry.htmlPaths
    }))
  };

  writeReport(summary);
  console.log(JSON.stringify({
    uniqueRefs: summary.uniqueRefs,
    materialized: summary.materialized,
    changedFiles: summary.changedFiles,
    byKind: summary.byKind,
    dryRun: summary.dryRun
  }, null, 2));
}

main();
