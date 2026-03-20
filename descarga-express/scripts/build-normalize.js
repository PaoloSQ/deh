const fs = require("fs");
const path = require("path");
const normRules = require("./normalization-rules.js");

// Configuración de rutas
const SOURCE_SITES = path.resolve(__dirname, "../sites/www.dehonline.es");
const SOURCE_PUBLIC = path.resolve(__dirname, "../public");
const SOURCE_LAYOUTS = path.resolve(__dirname, "../views/layouts");
const SOURCE_PARTIALS = path.resolve(__dirname, "../views/partials");
const TARGET_VIEWS = path.resolve(__dirname, "../../../dehonline repo/views");
const TARGET_PUBLIC = path.resolve(__dirname, "../../../dehonline repo/public");
const TARGET_LAYOUTS = path.join(TARGET_VIEWS, "layouts");
const TARGET_PARTIALS = path.join(TARGET_VIEWS, "partials");
// Eliminado: reportes y meta

// Utilidades
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function normalizeSlug(slug) {
  return normRules.slugNormalization.decodeSlug(slug);
}

function cleanPath(pathname) {
  return normRules.slugNormalization.cleanPath(pathname);
}

function processHtmlContent(html, expectedPath) {
  let processed = html;

  // Arreglar mojibake
  processed = normRules.htmlCleaning.fixMojibake(processed);

  // Normalizar canonical
  processed = normRules.htmlCleaning.normalizeCanonical(
    processed,
    expectedPath,
  );

  // Normalizar hrefs
  processed = normRules.htmlCleaning.normalizeHrefs(processed);

  // Limpiar markup de Wix innecesario
  processed = normRules.htmlCleaning.cleanWixMarkup(processed);

  return processed;
}

function isEmptyPage(html) {
  // Detectar páginas vacías (solo template Wix sin contenido)
  const contentPatterns = [
    /<h[1-6][^>]*>/, // Headers
    /<p[^>]*>[^<]*<\/p>/, // Paragraphs
    /<article/, // Article tags
    /<section[^>]*>[^<]*/i, // Sections con contenido
    /[a-záéíóúñ]{10,}/i, // Palabras españolas de 10+ caracteres
  ];

  return !contentPatterns.some((pattern) => pattern.test(html));
}

function walkDir(dir, callback, ignorePatterns = []) {
  if (!fs.existsSync(dir)) {
    console.warn(`Directorio no existe: ${dir}`);
    return;
  }

  fs.readdirSync(dir).forEach((file) => {
    // Ignorar directorios/archivos específicos
    if (/^\./.test(file) || ignorePatterns.some((p) => p.test(file))) {
      return;
    }

    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walkDir(fullPath, callback, ignorePatterns);
    } else {
      callback(fullPath);
    }
  });
}

function getTargetFileName(srcPath) {
  const relativePath = path.relative(SOURCE_SITES, srcPath);
  const normalized = normalizeSlug(relativePath);
  const ext = path.extname(normalized);

  // Cambiar .html a .handlebars para vistas
  if (ext === ".html") {
    return normalized.replace(/\.html$/, ".handlebars");
  }

  return normalized;
}

function processFile(srcPath) {
  try {
    const ext = path.extname(srcPath).toLowerCase();
    const fileName = path.basename(srcPath);
    let relativePath;
    let normalized;
    // Detectar si el archivo viene de public o de sites
    if (srcPath.startsWith(SOURCE_PUBLIC)) {
      // Mantener la estructura original de public
      relativePath = path.relative(SOURCE_PUBLIC, srcPath);
      normalized = relativePath.replace(/\\/g, "/");
    } else {
      relativePath = path.relative(SOURCE_SITES, srcPath);
      normalized = normalizeSlug(relativePath);
    }

    // Eliminado: conteo de reportes

    if (ext === ".html") {
      // Procesar HTML y extraer metadatos
      const targetFileName = getTargetFileName(srcPath);
      const targetDir = path.dirname(path.join(TARGET_VIEWS, targetFileName));
      const targetPath = path.join(TARGET_VIEWS, targetFileName);

      let html = fs.readFileSync(srcPath, "utf8");
      const isEmpty = isEmptyPage(html);

      // Eliminado: reporte de páginas vacías

      // --- Extracción de metadatos ---
      const cheerio = require("cheerio");
      const $ = cheerio.load(html);
      const metaTags = {};
      // Title
      metaTags.title = $("title").text().trim();
      // Canonical
      metaTags.canonical = $("link[rel='canonical']").attr("href") || "";
      // Meta
      $("meta").each((_, el) => {
        const name = $(el).attr("name") || $(el).attr("property");
        const content = $(el).attr("content");
        if (name && content) metaTags[name] = content;
      });
      // Links
      metaTags.links = [];
      $("link").each((_, el) => {
        const rel = $(el).attr("rel");
        const href = $(el).attr("href");
        if (rel && href) metaTags.links.push({ rel, href });
      });

      // --- Extraer links de estilos ---
      metaTags.stylesheets = [];
      $("link[rel='stylesheet']").each((_, el) => {
        const href = $(el).attr("href");
        if (href) metaTags.stylesheets.push(href);
      });

      // --- Guardar HTML completo (head + body) ---
      const head = $("head").html() || "";
      const body = $("body").html() || "";
      const fullHtml = `<!DOCTYPE html>\n<html>\n<head>\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>`;

      ensureDir(targetDir);
      fs.writeFileSync(targetPath, fullHtml, "utf8");

      console.log(`✓ HTML procesado: ${relativePath} → ${targetFileName}`);
    } else {
      // Procesar assets
      const targetPath = path.join(TARGET_PUBLIC, normalized);
      const targetDir = path.dirname(targetPath);

      ensureDir(targetDir);
      fs.copyFileSync(srcPath, targetPath);

      // Eliminado: conteo de assets y categorías

      console.log(`✓ Asset copiado: ${relativePath} → ${targetPath}`);
      // Eliminado: error de asset no copiado
    }
  } catch (error) {
    report.summary.errorsFound++;
    report.files.errors.push({
      file: srcPath,
      error: error.message,
    });
    console.error(`✗ Error procesando ${srcPath}: ${error.message}`);
  }
}

function detectDuplicates() {
  // Eliminado: detección de duplicados
}

function generateMarkdownReport() {
  // Eliminado: generación de reporte markdown
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src).forEach((file) => {
    const srcPath = path.join(src, file);
    const destPath = path.join(dest, file);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

function main() {
  // Crear directorios destino
  ensureDir(TARGET_VIEWS);
  ensureDir(TARGET_PUBLIC);
  ensureDir(TARGET_LAYOUTS);
  ensureDir(TARGET_PARTIALS);

  // Copiar layouts y partials
  copyDir(SOURCE_LAYOUTS, TARGET_LAYOUTS);
  copyDir(SOURCE_PARTIALS, TARGET_PARTIALS);

  // Procesar HTML de sites
  walkDir(SOURCE_SITES, processFile, [/^_files$/, /^\./, /\.DS_Store/]);

  // Procesar assets de public, excluyendo misc y carpetas innecesarias
  if (fs.existsSync(SOURCE_PUBLIC)) {
    walkDir(
      SOURCE_PUBLIC,
      processFile,
      [/^misc$/, /^_files$/, /^\./, /\.DS_Store/], // Excluir misc y carpetas ocultas
    );
  }

  // Eliminado: reportes, duplicados, meta y resumen final
}

main();
