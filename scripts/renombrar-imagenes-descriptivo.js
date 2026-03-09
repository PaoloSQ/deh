const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const IMG_DIR = path.join(ROOT, "simplified", "public", "img", "home");
const CATALOG_PATH = path.join(__dirname, "catalogo-imagenes-home.json");
const SOURCE_HTML_PATH = path.join(
  ROOT,
  "descarga",
  "www.dehonline.es",
  "index.html",
);
const TARGET_PAGE_PATH = path.join(
  ROOT,
  "simplified",
  "src",
  "pages",
  "index.handlebars",
);
const REPORT_JSON_PATH = path.join(__dirname, "renombrado-imagenes-home.json");
const REPORT_MD_PATH = path.join(ROOT, "IMAGENES-RENOMBRADO.md");

function normalizeUrl(url) {
  if (!url) return "";
  return url.replace(/\\\//g, "/").replace(/%7E/gi, "~");
}

function extractMediaId(url) {
  const normalized = normalizeUrl(url);
  const match = normalized.match(/\/media\/([^/?#]+)/i);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

function decodeEntities(text) {
  if (!text) return "";
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&iacute;/gi, "i")
    .replace(/&eacute;/gi, "e")
    .replace(/&aacute;/gi, "a")
    .replace(/&oacute;/gi, "o")
    .replace(/&uacute;/gi, "u")
    .replace(/&ntilde;/gi, "n")
    .replace(/&uuml;/gi, "u")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripExt(name) {
  return name.replace(/\.[a-z0-9]+$/i, "");
}

function tokenFromUrl(url) {
  const normalized = normalizeUrl(url);
  const lastSegment = normalized.split("/").filter(Boolean).pop() || "";
  return decodeURIComponent(lastSegment.split("?")[0]);
}

function isGenericLabel(value) {
  const v = stripExt((value || "").trim().toLowerCase());
  if (!v) return true;
  if (v === "image" || v === "img") return true;
  if (/^(image_edited|diseno-sin-titulo|captura-de-pantalla)/.test(v))
    return false;
  if (/^[a-f0-9]{6,}_[a-f0-9]{12,}~mv2$/i.test(v)) return true;
  if (/^[0-9a-f]{16,}$/i.test(v)) return true;
  return false;
}

function scoreLabel(label, source) {
  if (!label || !label.trim()) return 0;
  if (isGenericLabel(label)) return source === "id" ? 0 : 1;
  if (source === "alt") return 4;
  if (source === "filename") return 3;
  return 2;
}

function slugify(text) {
  const cleaned = decodeEntities(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return cleaned.slice(0, 64) || "imagen";
}

function getAttr(tag, attr) {
  const re = new RegExp(`${attr}="([^"]*)"`, "i");
  const match = tag.match(re);
  return match ? match[1] : "";
}

function parseSrcSet(srcSetValue) {
  if (!srcSetValue) return [];
  return srcSetValue
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function buildLabelMapFromSourceHtml(html) {
  const bestById = new Map();
  const imgTagRegex = /<img\b[^>]*>/gi;
  let tagMatch;

  while ((tagMatch = imgTagRegex.exec(html)) !== null) {
    const tag = tagMatch[0];
    const alt = decodeEntities(getAttr(tag, "alt")).trim();
    const src = getAttr(tag, "src");
    const srcSet = getAttr(tag, "srcSet") || getAttr(tag, "srcset");
    const urls = [src, ...parseSrcSet(srcSet)].filter(Boolean);

    for (const url of urls) {
      const mediaId = extractMediaId(url);
      if (!mediaId) continue;

      const filenameToken = tokenFromUrl(url);
      const candidates = [
        { label: alt, source: "alt" },
        { label: filenameToken, source: "filename" },
        { label: mediaId, source: "id" },
      ];

      for (const candidate of candidates) {
        const score = scoreLabel(candidate.label, candidate.source);
        const existing = bestById.get(mediaId);

        if (!existing || score > existing.score) {
          bestById.set(mediaId, {
            label: candidate.label,
            score,
            source: candidate.source,
          });
        }
      }
    }
  }

  return bestById;
}

function ensureUniqueFileName(targetDir, desiredName, reservedNames) {
  const ext = path.extname(desiredName);
  const base = desiredName.slice(0, -ext.length);

  let candidate = desiredName;
  let n = 2;

  while (
    reservedNames.has(candidate.toLowerCase()) ||
    fs.existsSync(path.join(targetDir, candidate))
  ) {
    candidate = `${base}-${n}${ext}`;
    n += 1;
  }

  reservedNames.add(candidate.toLowerCase());
  return candidate;
}

function main() {
  if (!fs.existsSync(IMG_DIR)) {
    fs.mkdirSync(IMG_DIR, { recursive: true });
  }

  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error(`No existe el catalogo: ${CATALOG_PATH}`);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const sourceHtml = fs.readFileSync(SOURCE_HTML_PATH, "utf8");
  const pageHtml = fs.readFileSync(TARGET_PAGE_PATH, "utf8");

  const labelsById = buildLabelMapFromSourceHtml(sourceHtml);
  const reserved = new Set();
  const renames = [];
  let updatedPage = pageHtml;

  for (const [category, items] of Object.entries(catalog.imagenes || {})) {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const ext = item.extension || path.extname(item.url) || ".jpg";
      const oldName = `${category}-${i + 1}${ext}`;
      const oldPath = path.join(IMG_DIR, oldName);

      if (!fs.existsSync(oldPath)) continue;

      const mediaId = extractMediaId(item.url) || oldName;
      const best = labelsById.get(mediaId);
      const rawLabel = best?.label || mediaId;
      const semanticSlug = slugify(rawLabel);

      // Keep final filenames semantic and clean (no category prefixes).
      const desiredName = `${semanticSlug}${ext.toLowerCase()}`;
      const newName = ensureUniqueFileName(IMG_DIR, desiredName, reserved);
      const newPath = path.join(IMG_DIR, newName);

      if (oldName !== newName) {
        fs.renameSync(oldPath, newPath);
      }

      const oldRef = `/img/home/${oldName}`;
      const legacyRef = `/img/${oldName}`;
      const newRef = `/img/home/${newName}`;
      updatedPage = updatedPage.split(oldRef).join(newRef);
      updatedPage = updatedPage.split(legacyRef).join(newRef);

      renames.push({
        category,
        mediaId,
        oldName,
        newName,
        label: decodeEntities(rawLabel),
        source: best?.source || "id",
      });
    }
  }

  // Fix partner placeholders if legacy placeholders still exist.
  const partnerGuess = {
    "/img/partners/aws.png": "aws",
    "/img/partners/uanataca.png": "uanataca",
    "/img/partners/camerfirma.png": "camerfirma",
    "/img/partners/bilky.png": "bilky",
    "/img/aws.png": "aws",
    "/img/uanataca.png": "uanataca",
    "/img/camerfirma.png": "camerfirma",
    "/img/bilky.png": "bilky",
  };

  for (const [placeholderRef, keyword] of Object.entries(partnerGuess)) {
    const match = renames.find((r) => r.newName.includes(keyword));
    if (match) {
      updatedPage = updatedPage
        .split(placeholderRef)
        .join(`/img/home/${match.newName}`);
    }
  }

  fs.writeFileSync(TARGET_PAGE_PATH, updatedPage);

  const byCategory = {};
  for (const row of renames) {
    byCategory[row.category] = (byCategory[row.category] || 0) + 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalRenamed: renames.length,
    byCategory,
    renames,
  };

  fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2));

  const mdLines = [
    "# Renombrado de Imagenes",
    "",
    `Total renombradas: **${renames.length}**`,
    "",
    "## Por categoria",
    ...Object.entries(byCategory).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## Cambios",
    ...renames.map(
      (r) => `- \`${r.oldName}\` -> \`${r.newName}\` (${r.label})`,
    ),
    "",
  ];

  fs.writeFileSync(REPORT_MD_PATH, mdLines.join("\n"));

  console.log(`Renombradas: ${renames.length}`);
  console.log(`Reporte JSON: ${path.relative(ROOT, REPORT_JSON_PATH)}`);
  console.log(`Reporte MD: ${path.relative(ROOT, REPORT_MD_PATH)}`);
}

main();
