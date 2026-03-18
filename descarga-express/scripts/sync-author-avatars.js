const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SITES_ROOT = path.resolve(PROJECT_ROOT, 'sites');
const AVATARS_DIR = path.resolve(PROJECT_ROOT, 'public/assets/img/avatars');
const MANIFEST_DIR = path.resolve(PROJECT_ROOT, 'public/assets/data');
const MANIFEST_PATH = path.resolve(MANIFEST_DIR, 'avatar-manifest.json');

function decodeHtml(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function walkFiles(dirPath, result = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const absolutePath = path.resolve(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absolutePath, result);
      continue;
    }

    result.push(absolutePath);
  }

  return result;
}

function normalizeUrl(value) {
  if (!value) return '';

  try {
    return new URL(String(value).trim()).toString();
  } catch (_error) {
    return String(value).trim();
  }
}

function normalizeProfileHref(value) {
  if (!value) return '';

  var href = decodeHtml(value).trim();
  if (!href) return '';

  href = href.replace(/^https?:\/\/www\.dehonline\.es/i, '');
  href = href.replace(/^\/?www\.dehonline\.es/i, '/www.dehonline.es');

  if (!href.startsWith('/')) href = '/' + href;

  return href;
}

function normalizeAuthorName(value) {
  return decodeHtml(value || '')
    .replace(/^Foto del escritor:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isExternalAvatarUrl(value) {
  return /^https?:\/\//i.test(value)
    && !/static\.wixstatic\.com\/media\//i.test(value)
    && !/\/assets\/img\//i.test(value);
}

function guessExtensionFromUrl(value) {
  try {
    const pathname = new URL(value).pathname;
    const ext = path.extname(pathname);
    return ext && ext.length <= 5 ? ext.toLowerCase() : '';
  } catch (_error) {
    return '';
  }
}

function extensionFromContentType(contentType) {
  const normalized = String(contentType || '').toLowerCase().split(';')[0].trim();
  if (normalized === 'image/jpeg') return '.jpg';
  if (normalized === 'image/png') return '.png';
  if (normalized === 'image/webp') return '.webp';
  if (normalized === 'image/gif') return '.gif';
  if (normalized === 'image/svg+xml') return '.svg';
  return '';
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function extractAvatarRecords(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const records = [];
  const wowImagePattern = /<wow-image\b[^>]*data-image-info="([^"]*)"[^>]*>[\s\S]*?<img\b[^>]*alt="([^"]*)"[^>]*>/gi;
  let match;

  while ((match = wowImagePattern.exec(html))) {
    const infoText = decodeHtml(match[1]);
    const altText = decodeHtml(match[2]);
    let imageInfo = null;

    try {
      imageInfo = JSON.parse(infoText);
    } catch (_error) {
      continue;
    }

    const sourceUrl = normalizeUrl(imageInfo && imageInfo.imageData && imageInfo.imageData.uri);
    if (!isExternalAvatarUrl(sourceUrl)) continue;

    const lookaroundStart = Math.max(0, match.index - 400);
    const lookaroundEnd = Math.min(html.length, match.index + match[0].length + 400);
    const surroundingHtml = html.slice(lookaroundStart, lookaroundEnd);
    const profileMatch = surroundingHtml.match(/href="([^"]*\/profile\/[^"]+)"/i);
    const userNameMatch = surroundingHtml.match(/data-hook="user-name"[^>]*>([^<]+)</i);
    const authorName = normalizeAuthorName(userNameMatch ? userNameMatch[1] : altText);
    const profileHref = normalizeProfileHref(profileMatch ? profileMatch[1] : '');

    records.push({
      filePath,
      sourceUrl,
      authorName,
      profileHref
    });
  }

  return records;
}

async function downloadAvatar(sourceUrl, destinationPath) {
  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; DEH-Local-Mirror/1.0)'
    }
  });

  if (!response.ok) {
    throw new Error(`No se pudo descargar ${sourceUrl}: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destinationPath, buffer);
  return response.headers.get('content-type') || '';
}

async function main() {
  ensureDir(AVATARS_DIR);
  ensureDir(MANIFEST_DIR);

  const allFiles = walkFiles(SITES_ROOT);
  const collectedRecords = allFiles.flatMap(extractAvatarRecords);
  const avatarMap = new Map();

  for (const record of collectedRecords) {
    if (!avatarMap.has(record.sourceUrl)) {
      avatarMap.set(record.sourceUrl, {
        sourceUrl: record.sourceUrl,
        authorNames: new Set(),
        profileHrefs: new Set(),
        pages: new Set()
      });
    }

    const entry = avatarMap.get(record.sourceUrl);
    if (record.authorName) entry.authorNames.add(record.authorName);
    if (record.profileHref) entry.profileHrefs.add(record.profileHref);
    entry.pages.add(path.relative(PROJECT_ROOT, record.filePath).split(path.sep).join('/'));
  }

  const byUrl = {};
  const byAuthorName = {};
  const byProfileHref = {};
  const avatars = [];
  let downloaded = 0;

  for (const [sourceUrl, entry] of avatarMap.entries()) {
    const hash = crypto.createHash('sha1').update(sourceUrl).digest('hex');
    let ext = guessExtensionFromUrl(sourceUrl);
    let destinationPath = path.resolve(AVATARS_DIR, `${hash}${ext || '.img'}`);
    let localUrl = `/assets/img/avatars/${path.basename(destinationPath)}`;

    if (!fs.existsSync(destinationPath)) {
      const contentType = await downloadAvatar(sourceUrl, destinationPath);
      const preferredExt = extensionFromContentType(contentType);

      if (preferredExt && preferredExt !== path.extname(destinationPath)) {
        const renamedPath = path.resolve(AVATARS_DIR, `${hash}${preferredExt}`);
        fs.renameSync(destinationPath, renamedPath);
        destinationPath = renamedPath;
        localUrl = `/assets/img/avatars/${path.basename(destinationPath)}`;
      }

      downloaded += 1;
    }

    byUrl[sourceUrl] = localUrl;

    for (const authorName of entry.authorNames) {
      byAuthorName[authorName] = localUrl;
    }

    for (const profileHref of entry.profileHrefs) {
      byProfileHref[profileHref] = localUrl;
    }

    avatars.push({
      sourceUrl,
      localUrl,
      authorNames: Array.from(entry.authorNames).sort(),
      profileHrefs: Array.from(entry.profileHrefs).sort(),
      pages: Array.from(entry.pages).sort()
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    totalAvatars: avatars.length,
    byUrl,
    byAuthorName,
    byProfileHref,
    avatars: avatars.sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl))
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  console.log(JSON.stringify({
    extracted: collectedRecords.length,
    uniqueAvatars: avatars.length,
    downloaded,
    manifest: path.relative(PROJECT_ROOT, MANIFEST_PATH).split(path.sep).join('/')
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
