const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const REPO_ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(REPO_ROOT, "..");
const SITE_ROOT = path.join(REPO_ROOT, "sites", "www.dehonline.es");
const PUBLIC_ROOT = path.join(REPO_ROOT, "public");
const DEPLOY_ROOT = path.join(PROJECT_ROOT, "despliegue");
const BETA_ORIGIN = process.env.DEPLOY_ORIGIN || "https://beta.dehonline.es";
const PAGE_TEMPLATE_EXTENSION = ".handlebars";

const BLOCKED_EXTERNAL_HOSTS = [
  "frog.wix.com",
  "panorama.wixapps.net",
  "sentry-next.wixpress.com",
  "sentry.wixpress.com",
  "browser.sentry-cdn.com",
  "px.ads.linkedin.com",
  "snap.licdn.com",
  "visitor-analytics.io",
  "statcounter.va-endpoint.com",
  "siteassets.parastorage.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdn.jsdelivr.net",
  "auto.srv791713.hstgr.cloud",
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function walk(dirPath, out = []) {
  if (!fs.existsSync(dirPath)) return out;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) walk(fullPath, out);
    else out.push(fullPath);
  }
  return out;
}

function isHtmlFile(filePath) {
  return /\.html?$/i.test(filePath);
}

function normalizeSlash(value) {
  return String(value).replace(/\\/g, "/");
}

function toDeployPageOutput(relPath) {
  const posixRel = normalizeSlash(relPath);
  if (posixRel === "index.html")
    return path.join(DEPLOY_ROOT, `index${PAGE_TEMPLATE_EXTENSION}`);
  if (/\/index\.html$/i.test(posixRel)) {
    return path.join(
      DEPLOY_ROOT,
      posixRel.replace(/index\.html$/i, `index${PAGE_TEMPLATE_EXTENSION}`),
    );
  }
  const route = posixRel.replace(/\.html$/i, "");
  return path.join(DEPLOY_ROOT, route, `index${PAGE_TEMPLATE_EXTENSION}`);
}

function routeFromRelPath(relPath) {
  const posixRel = normalizeSlash(relPath);
  if (posixRel === "index.html") return "/";
  if (/\/index\.html$/i.test(posixRel)) {
    return `/${posixRel.replace(/\/index\.html$/i, "")}`.replace(/\/+/g, "/");
  }
  return `/${posixRel.replace(/\.html$/i, "")}`.replace(/\/+/g, "/");
}

function toSourceFileFromLocalUrl(urlPath) {
  const cleanPath = String(urlPath || "")
    .split("?")[0]
    .split("#")[0];
  if (cleanPath.startsWith("/img/"))
    return path.join(PUBLIC_ROOT, cleanPath.slice(1));
  if (cleanPath.startsWith("/css/"))
    return path.join(PUBLIC_ROOT, cleanPath.slice(1));
  if (cleanPath.startsWith("/js/"))
    return path.join(PUBLIC_ROOT, cleanPath.slice(1));
  if (cleanPath.startsWith("/assets/"))
    return path.join(PUBLIC_ROOT, cleanPath.slice(1));
  if (cleanPath.startsWith("/media/"))
    return path.join(PUBLIC_ROOT, cleanPath.slice(1));
  if (cleanPath.startsWith("/docs/"))
    return path.join(PUBLIC_ROOT, cleanPath.slice(1));
  if (cleanPath.startsWith("/_partials/wix-thunderbolt/dist/")) {
    return path.join(
      PUBLIC_ROOT,
      "assets",
      "js",
      "services",
      "wix-thunderbolt",
      "dist",
      cleanPath.split("/").pop(),
    );
  }
  return null;
}

function toDeployFilePathFromLocalUrl(urlPath) {
  const cleanPath = String(urlPath || "")
    .split("?")[0]
    .split("#")[0];
  return path.join(DEPLOY_ROOT, cleanPath.replace(/^\/+/, ""));
}

function shouldBlockExternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl, BETA_ORIGIN);
    return BLOCKED_EXTERNAL_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

function rewriteStaticParastorageUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "static.parastorage.com") return url;
    const rel = parsed.pathname.replace(/^\/+/, "");
    const ext = path.extname(rel).toLowerCase();
    if (ext === ".css") return `${BETA_ORIGIN}/assets/css/${rel}`;
    if (ext === ".js" || ext === ".map" || !ext)
      return `${BETA_ORIGIN}/assets/js/${rel}`;
    return `${BETA_ORIGIN}/assets/misc/${rel}`;
  } catch {
    return url;
  }
}

function rewriteStaticMediaUrl(url) {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname === "static.wixstatic.com" &&
      parsed.pathname.startsWith("/media/")
    ) {
      return `${BETA_ORIGIN}/assets/img${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return url;
  }
  return url;
}

function rewriteAbsoluteUrl(value) {
  if (!value) return value;
  const raw = String(value).trim();
  if (!raw) return raw;

  if (raw.startsWith("/www.dehonline.es/")) {
    return `${BETA_ORIGIN}${raw.slice("/www.dehonline.es".length)}`;
  }

  if (/^\/(?:img|css|js|assets|media|docs|_partials)\//i.test(raw)) {
    return `${BETA_ORIGIN}${raw}`;
  }

  try {
    const url = new URL(raw);
    if (url.hostname === "www.dehonline.es") {
      return `${BETA_ORIGIN}${url.pathname}${url.search}${url.hash}`;
    }
    if (
      /^127\.0\.0\.1$/i.test(url.hostname) &&
      /^\/www\.dehonline\.es(?:\/|$)/i.test(url.pathname)
    ) {
      return `${BETA_ORIGIN}${url.pathname.replace(/^\/www\.dehonline\.es/i, "")}${url.search}${url.hash}`;
    }
    if (url.hostname === "static.parastorage.com") {
      return rewriteStaticParastorageUrl(raw);
    }
    if (url.hostname === "static.wixstatic.com") {
      return rewriteStaticMediaUrl(raw);
    }
    if (url.hostname === "siteassets.parastorage.com") {
      return "";
    }
  } catch {
    return raw;
  }

  return raw;
}

function rewriteTextUrls(text) {
  let next = text;

  next = next.replace(
    /https?:\/\/www\.dehonline\.es(\/[^"'`\s<)]*)?/gi,
    (_match, suffix = "") => `${BETA_ORIGIN}${suffix || ""}`,
  );
  next = next.replace(
    /https?:\/\/127\.0\.0\.1:\d+\/www\.dehonline\.es(\/[^"'`\s<)]*)?/gi,
    (_match, suffix = "") => `${BETA_ORIGIN}${suffix || ""}`,
  );
  next = next.replace(
    /https?:\/\/www\.dehonline\.es\/_partials\/wix-thunderbolt\/dist\/([^"'`\s<)]+)/gi,
    (_match, file) => `${BETA_ORIGIN}/_partials/wix-thunderbolt/dist/${file}`,
  );
  next = next.replace(
    /https?:\/\/static\.parastorage\.com\/([^"'`\s<)]+)/gi,
    (match) => rewriteStaticParastorageUrl(match),
  );
  next = next.replace(
    /https?:\/\/static\.wixstatic\.com\/media\/([^"'`\s<)]+)/gi,
    (_match, suffix) => `${BETA_ORIGIN}/assets/img/media/${suffix}`,
  );

  return next;
}

function walkObject(node) {
  if (Array.isArray(node)) {
    return node
      .map((item) => walkObject(item))
      .filter((item) => item !== undefined);
  }

  if (!node || typeof node !== "object") {
    if (typeof node === "string")
      return rewriteAbsoluteUrl(rewriteTextUrls(node));
    return node;
  }

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "sentryDsn") continue;

    if (key === "htmlEmbeds" && Array.isArray(value)) {
      out[key] = value
        .filter((embed) => {
          const html = (embed && embed.content && embed.content.html) || "";
          return !/cdn\.jsdelivr\.net|auto\.srv791713\.hstgr\.cloud|fonts\.googleapis\.com|fonts\.gstatic\.com|visitor-analytics\.io|linkedin|sentry/i.test(
            html,
          );
        })
        .map((embed) => walkObject(embed));
      continue;
    }

    const nextValue = walkObject(value);
    if (typeof nextValue === "string" && shouldBlockExternalUrl(nextValue)) {
      continue;
    }
    out[key] = nextValue;
  }
  return out;
}

function transformViewerModelJson(jsonText) {
  try {
    const parsed = JSON.parse(jsonText);
    const cleaned = walkObject(parsed);
    return JSON.stringify(cleaned)
      .replace(/</g, "\\u003c")
      .replace(/-->/g, "--\\u003e");
  } catch {
    return rewriteTextUrls(jsonText);
  }
}

function injectHeadScript($, scriptUrl) {
  const head = $("head");
  if (!head.length) return;
  if (head.find(`script[src="${scriptUrl}"]`).length) return;
  head.prepend(`<script src="${scriptUrl}"></script>`);
}

function transformHtml(html) {
  let nextHtml = rewriteTextUrls(html);
  const $ = cheerio.load(nextHtml, { decodeEntities: false });

  // Limpieza Wix: scripts de telemetría, meta viewport, clases y atributos Wix, comentarios, SVGs de scroll
  // Eliminar scripts de telemetría y protección Wix
  $("script").each((_i, el) => {
    const scriptId = $(el).attr("id") || "";
    const scriptHtml = $(el).html() || "";
    if (
      /wix|telemetry|sentry|parastorage|visitor-analytics|linkedin|auto\.srv791713/i.test(
        scriptId,
      ) ||
      /wix|telemetry|sentry|parastorage|visitor-analytics|linkedin|auto\.srv791713/i.test(
        scriptHtml,
      )
    ) {
      $(el).remove();
    }
  });

  // Eliminar meta viewport Wix
  $("meta#wixDesktopViewport").remove();

  // Eliminar comentarios HTML Wix
  $.root()
    .contents()
    .each(function () {
      if (
        this.type === "comment" &&
        /wix|telemetry|sentry|parastorage|visitor-analytics|linkedin|auto\.srv791713/i.test(
          this.data,
        )
      ) {
        $(this).remove();
      }
    });

  // Eliminar clases y atributos Wix
  $(
    "[class], [data-mesh-id], [data-testid], [data-motion-part], [data-hook]",
  ).each((_i, el) => {
    const cls = $(el).attr("class") || "";
    if (
      /wixui-|Stylable|itemDepth|comp-|ScrollButton|mesh-layout|login-social-bar|site-root|masterPage|BACKGROUND_GROUP|SITE_HEADER|SITE_FOOTER|pageBackground|Vd6aQZ|tcsOnZ|CohWsy|YzqVVZ|if7Vw2|MW5IWV|LWbAav|Kv1aVt|VgO9Yg|tcElKx|i1tH8h|wG8dni|BI8PVQ|Tj01hh|NZHLsZ|mfxFLH|bkIuWA|pGZMn2|eUGVn8|V8gwZj|b2cSkJ|aBATL4|VDJedC|l4CAhn|MazNVa|rYiAuL|ScrollControls|ScrollButton|itemShared|itemDepth|itemDepth02233374943|itemDepth02233374943__itemWrapper|itemDepth02233374943__root|itemDepth02233374943__container|itemDepth02233374943__label|itemDepth02233374943--isCurrentPage/i.test(
        cls,
      )
    ) {
      $(el).removeAttr("class");
    }
    $(el).removeAttr("data-mesh-id");
    $(el).removeAttr("data-testid");
    $(el).removeAttr("data-motion-part");
    $(el).removeAttr("data-hook");
  });

  // Eliminar SVGs de scroll y controles Wix
  $("svg").each((_i, el) => {
    const svgHtml = $(el).html() || "";
    if (
      /ScrollButton|ScrollControls|wixui-|Stylable|itemDepth|comp-|mesh-layout/i.test(
        svgHtml,
      )
    ) {
      $(el).remove();
    }
  });

  // Mantener la transformación de URLs y recursos
  $(
    "link[href], script[src], iframe[src], img[src], source[src], source[srcset], form[action], a[href], meta[content]",
  ).each((_index, element) => {
    const attribs = ["href", "src", "srcset", "action", "content"];
    for (const attrib of attribs) {
      const value = $(element).attr(attrib);
      if (!value) continue;
      const rewritten = rewriteAbsoluteUrl(rewriteTextUrls(value));
      if (!rewritten || shouldBlockExternalUrl(rewritten)) {
        if (attrib === "content") {
          $(element).removeAttr(attrib);
        } else {
          $(element).remove();
        }
      } else {
        $(element).attr(attrib, rewritten);
      }
    }
  });

  $(
    'link[rel="preconnect"], link[rel="preload"], link[rel="dns-prefetch"]',
  ).each((_index, element) => {
    const href = $(element).attr("href") || "";
    if (
      shouldBlockExternalUrl(href) ||
      /siteassets\.parastorage\.com/i.test(href)
    ) {
      $(element).remove();
    }
  });

  $(
    'script[type="application/json"]#wix-essential-viewer-model, script[type="application/json"]#wix-viewer-model',
  ).each((_index, element) => {
    const text = $(element).html() || "";
    $(element).html(transformViewerModelJson(text));
  });

  injectHeadScript($, `${BETA_ORIGIN}/assets/js/local/telemetry-guard.js`);
  injectHeadScript($, `${BETA_ORIGIN}/assets/js/local/popup-restore.js`);

  return $.html({ decodeEntities: false });
}

function collectLocalRefsFromText(text, kind) {
  const refs = new Set();
  if (kind === "css") {
    const cssRe = /url\((['"]?)(.*?)\1\)/gi;
    let match;
    while ((match = cssRe.exec(text))) {
      const raw = match[2];
      if (!raw) continue;
      const rewritten = rewriteAbsoluteUrl(rewriteTextUrls(raw));
      if (rewritten.startsWith(BETA_ORIGIN))
        refs.add(new URL(rewritten).pathname);
    }
    return refs;
  }

  if (kind === "js") {
    const jsRe = /(["'`])((?:\\.|(?!\1).){1,400})\1/g;
    let match;
    while ((match = jsRe.exec(text))) {
      const raw = match[2];
      if (!raw) continue;
      const rewritten = rewriteAbsoluteUrl(rewriteTextUrls(raw));
      if (rewritten.startsWith(BETA_ORIGIN))
        refs.add(new URL(rewritten).pathname);
    }
    return refs;
  }

  const $ = cheerio.load(text, { decodeEntities: false });
  $("[href], [src], [srcset], [action], meta[content]").each(
    (_index, element) => {
      for (const attrib of ["href", "src", "srcset", "action", "content"]) {
        const value = $(element).attr(attrib);
        if (!value) continue;
        const parts =
          attrib === "srcset"
            ? value.split(",").map((item) => item.trim().split(/\s+/)[0])
            : [value];
        for (const raw of parts) {
          const rewritten = rewriteAbsoluteUrl(rewriteTextUrls(raw));
          if (rewritten && rewritten.startsWith(BETA_ORIGIN)) {
            refs.add(new URL(rewritten).pathname);
          }
        }
      }
    },
  );
  return refs;
}

function copyFile(sourcePath, targetPath) {
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function build() {
  fs.rmSync(DEPLOY_ROOT, { recursive: true, force: true });
  ensureDir(DEPLOY_ROOT);

  const pageFiles = walk(SITE_ROOT).filter(isHtmlFile);
  const assetQueue = new Set([
    "/assets/js/local/image-fallback.js",
    "/assets/js/local/popup-restore.js",
    "/assets/js/local/telemetry-guard.js",
  ]);
  const seenAssets = new Set();
  const missing = [];
  const pageManifest = [];

  for (const pageFile of pageFiles) {
    const rel = normalizeSlash(path.relative(SITE_ROOT, pageFile));
    const sourceHtml = fs.readFileSync(pageFile, "utf8");
    const html = transformHtml(sourceHtml);
    const outPath = toDeployPageOutput(rel);
    const route = routeFromRelPath(rel);
    ensureDir(path.dirname(outPath));
    fs.writeFileSync(outPath, html);
    pageManifest.push({
      route,
      source: rel,
      output: normalizeSlash(path.relative(DEPLOY_ROOT, outPath)),
    });

    for (const ref of collectLocalRefsFromText(html, "html")) {
      assetQueue.add(ref);
    }
  }

  while (assetQueue.size > 0) {
    const current = assetQueue.values().next().value;
    assetQueue.delete(current);
    if (seenAssets.has(current)) continue;
    seenAssets.add(current);

    const sourcePath = toSourceFileFromLocalUrl(current);
    if (
      !sourcePath ||
      !fs.existsSync(sourcePath) ||
      !fs.statSync(sourcePath).isFile()
    ) {
      missing.push(current);
      continue;
    }

    const targetPath = toDeployFilePathFromLocalUrl(current);
    const ext = path.extname(sourcePath).toLowerCase();

    if (ext === ".css" || ext === ".js") {
      const raw = fs.readFileSync(sourcePath, "utf8");
      const transformed = rewriteTextUrls(raw);
      ensureDir(path.dirname(targetPath));
      fs.writeFileSync(targetPath, transformed);
      for (const ref of collectLocalRefsFromText(
        transformed,
        ext === ".css" ? "css" : "js",
      )) {
        assetQueue.add(ref);
      }
      continue;
    }

    copyFile(sourcePath, targetPath);
  }

  const report = {
    betaOrigin: BETA_ORIGIN,
    pageTemplateExtension: PAGE_TEMPLATE_EXTENSION,
    pages: pageFiles.length,
    assetsCopied: seenAssets.size - missing.length,
    missing,
  };

  fs.writeFileSync(
    path.join(DEPLOY_ROOT, "PAGE-MANIFEST.json"),
    JSON.stringify(pageManifest, null, 2),
  );
  fs.writeFileSync(
    path.join(DEPLOY_ROOT, "DEPLOY-REPORT.json"),
    JSON.stringify(report, null, 2),
  );
  fs.writeFileSync(
    path.join(DEPLOY_ROOT, "DEPLOY-REPORT.md"),
    [
      "# Despliegue www.dehonline.es",
      "",
      `- Dominio beta: ${BETA_ORIGIN}`,
      `- Extension de plantilla: ${PAGE_TEMPLATE_EXTENSION}`,
      `- Plantillas generadas: ${pageFiles.length}`,
      `- Recursos copiados: ${report.assetsCopied}`,
      `- Recursos faltantes: ${missing.length}`,
      "",
      "## Manifiesto de paginas",
      "",
      "- Archivo: `PAGE-MANIFEST.json`",
      "",
      missing.length ? "## Recursos faltantes" : "Sin recursos faltantes.",
      "",
      ...missing.map((item) => `- ${item}`),
    ].join("\n"),
  );

  console.log(JSON.stringify(report, null, 2));
}

build();
