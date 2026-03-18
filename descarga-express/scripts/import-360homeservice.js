const fs = require('fs');
const path = require('path');
const https = require('https');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const TMP_HTML = path.join(PROJECT_ROOT, '.tmp-360homeservice-live.html');
const TARGET_DIR = path.join(PROJECT_ROOT, 'sites', 'www.dehonline.es', '360homeservice');
const TARGET_HTML = path.join(TARGET_DIR, 'index.html');
const ASSETS_ROOT = path.join(PROJECT_ROOT, 'public', 'assets');
const SOURCE_URL = 'https://www.dehonline.es/360homeservice';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(download(new URL(res.headers.location, url).toString()));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function getSourceHtml() {
  if (fs.existsSync(TMP_HTML)) {
    return fs.readFileSync(TMP_HTML, 'utf8');
  }
  const buffer = await download(SOURCE_URL);
  const html = buffer.toString('utf8');
  fs.writeFileSync(TMP_HTML, html);
  return html;
}

function normalizeAssetPath(urlText) {
  let url;
  try {
    url = new URL(urlText, SOURCE_URL);
  } catch {
    return null;
  }

  if (url.hostname === 'static.wixstatic.com') {
    if (url.pathname.startsWith('/media/')) {
      const mediaPath = decodeURIComponent(url.pathname.replace(/^\/media\//, ''));
      const rel = mediaPath.split('/')[0];
      return {
        localUrl: `/assets/img/media/${rel}`,
        filePath: path.join(ASSETS_ROOT, 'img', 'media', rel)
      };
    }

    const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    return {
      localUrl: `/assets/misc/static.wixstatic.com/${rel}`,
      filePath: path.join(ASSETS_ROOT, 'misc', 'static.wixstatic.com', rel)
    };
  }

  if (url.hostname === 'static.parastorage.com') {
    const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const ext = path.extname(rel).toLowerCase();
    const bucket = ext === '.css' ? 'css' : ext === '.js' || ext === '.map' ? 'js' : 'misc';
    return {
      localUrl: `/assets/${bucket}/${rel}`,
      filePath: path.join(ASSETS_ROOT, bucket, rel)
    };
  }

  if (url.hostname === 'siteassets.parastorage.com') {
    const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    return {
      localUrl: `/assets/misc/siteassets.parastorage.com/${rel}`,
      filePath: path.join(ASSETS_ROOT, 'misc', 'siteassets.parastorage.com', rel)
    };
  }

  if (url.hostname === 'fonts.gstatic.com') {
    const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    return {
      localUrl: `/assets/fonts/fonts.gstatic.com/${rel}`,
      filePath: path.join(ASSETS_ROOT, 'fonts', 'fonts.gstatic.com', rel)
    };
  }

  return null;
}

function uniqueMatches(text, regex) {
  const values = new Set();
  let match;
  while ((match = regex.exec(text))) {
    if (match[1]) values.add(match[1]);
    else if (match[0]) values.add(match[0]);
  }
  return [...values];
}

function collectRemoteUrls(html) {
  const urls = new Set();
  const attrUrls = uniqueMatches(
    html,
    /<(?:script|img|source|iframe|link)\b[^>]+(?:src|href)=["']([^"']+)["']/gi
  );
  const cssUrls = uniqueMatches(
    html,
    /url\((?:&quot;|["'])?(https:\/\/(?:static\.wixstatic\.com|static\.parastorage\.com|siteassets\.parastorage\.com|fonts\.gstatic\.com)\/[^)"']+)(?:&quot;|["'])?\)/gi
  );
  const bareUrls = uniqueMatches(
    html,
    /https:\/\/(?:static\.wixstatic\.com|static\.parastorage\.com|siteassets\.parastorage\.com|fonts\.gstatic\.com)\/[^"')\s<]+/gi
  );

  for (const value of [...attrUrls, ...cssUrls, ...bareUrls]) {
    if (/browser\.sentry-cdn\.com|snap\.licdn\.com|px\.ads\.linkedin\.com/i.test(value)) continue;
    urls.add(value);
  }

  return [...urls];
}

function rewriteHtml(html, rewrites) {
  let next = html;

  for (const [source, replacement] of rewrites.entries()) {
    next = next.split(source).join(replacement);
  }

  next = next.replace(
    /<link[^>]+href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]+"[^>]*>\s*/gi,
    ''
  );
  next = next.replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com"[^>]*>\s*/gi, '');
  next = next.replace(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com"[^>]*>\s*/gi, '');

  return next;
}

async function downloadAssets(urls) {
  const results = [];
  for (const url of urls) {
    const asset = normalizeAssetPath(url);
    if (!asset) continue;

    if (!fs.existsSync(asset.filePath)) {
      ensureDir(path.dirname(asset.filePath));
      try {
        const buffer = await download(url);
        fs.writeFileSync(asset.filePath, buffer);
        results.push({ url, filePath: asset.filePath, downloaded: true });
      } catch (error) {
        results.push({ url, filePath: asset.filePath, downloaded: false, error: error.message });
      }
    } else {
      results.push({ url, filePath: asset.filePath, downloaded: false, cached: true });
    }
  }

  return results;
}

async function main() {
  ensureDir(TARGET_DIR);
  const sourceHtml = await getSourceHtml();
  const urls = collectRemoteUrls(sourceHtml);
  const rewrites = new Map();

  for (const url of urls) {
    const asset = normalizeAssetPath(url);
    if (asset) rewrites.set(url, asset.localUrl);
  }

  const rewrittenHtml = rewriteHtml(sourceHtml, rewrites);
  fs.writeFileSync(TARGET_HTML, rewrittenHtml);

  const assets = await downloadAssets(urls);
  const report = {
    targetHtml: path.relative(PROJECT_ROOT, TARGET_HTML),
    urlsFound: urls.length,
    urlsMapped: rewrites.size,
    downloaded: assets.filter((item) => item.downloaded).length,
    failed: assets.filter((item) => item.error).length
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
