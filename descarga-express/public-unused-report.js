// Script para generar un reporte de archivos no usados en public
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const publicDir = path.resolve(__dirname, "public");
const sitesDir = path.resolve(__dirname, "sites");
const scriptsDir = path.resolve(__dirname, "scripts");

function getAllFiles(dir, exts = []) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(filePath, exts));
    } else if (
      exts.length === 0 ||
      exts.includes(path.extname(filePath).toLowerCase())
    ) {
      results.push(filePath);
    }
  });
  return results;
}

function extractReferencesFromHtml(html) {
  const $ = cheerio.load(html);
  const refs = new Set();
  $("img,link,script,source").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("href");
    if (src && typeof src === "string") refs.add(src);
  });
  return refs;
}

function extractReferencesFromJs(js) {
  const regex =
    /['"](\/img\/|\/css\/|\/js\/|\/assets\/|\/media\/|\/docs\/)[^'"]+['"]/g;
  const refs = new Set();
  let match;
  while ((match = regex.exec(js))) {
    refs.add(match[0].replace(/['"]/g, ""));
  }
  return refs;
}

function extractReferencesFromCss(css) {
  const regex =
    /url\(['"]?(\/img\/|\/css\/|\/js\/|\/assets\/|\/media\/|\/docs\/)[^'")]+['"]?\)/g;
  const refs = new Set();
  let match;
  while ((match = regex.exec(css))) {
    refs.add(match[0].replace(/url\(['"]?|['"]?\)/g, ""));
  }
  return refs;
}

function getAllReferences() {
  const refs = new Set();
  // HTML
  getAllFiles(sitesDir, [".html"]).forEach((file) => {
    const html = fs.readFileSync(file, "utf8");
    extractReferencesFromHtml(html).forEach((ref) => refs.add(ref));
  });
  // JS
  getAllFiles(scriptsDir, [".js"]).forEach((file) => {
    const js = fs.readFileSync(file, "utf8");
    extractReferencesFromJs(js).forEach((ref) => refs.add(ref));
  });
  // CSS
  getAllFiles(publicDir, [".css"]).forEach((file) => {
    const css = fs.readFileSync(file, "utf8");
    extractReferencesFromCss(css).forEach((ref) => refs.add(ref));
  });
  return refs;
}

function normalizeRef(ref) {
  return ref.replace(/[?#].*$/, "").replace(/\/+/g, "/");
}

function getRelativePublicPath(filePath) {
  return "/" + path.relative(publicDir, filePath).replace(/\\/g, "/");
}

function main() {
  const allPublicFiles = getAllFiles(publicDir);
  const allReferences = getAllReferences();
  const normalizedRefs = new Set([...allReferences].map(normalizeRef));

  const unusedFiles = [];
  allPublicFiles.forEach((file) => {
    const relPath = getRelativePublicPath(file);
    if (!normalizedRefs.has(relPath)) {
      unusedFiles.push(relPath);
    }
  });

  const report = {
    generatedAt: new Date().toISOString(),
    totalPublicFiles: allPublicFiles.length,
    totalUnused: unusedFiles.length,
    unusedFiles,
  };

  fs.writeFileSync(
    path.resolve(__dirname, "public-unused-report.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  console.log("Reporte generado: public-unused-report.json");
  console.log("Archivos no usados:", unusedFiles.length);
}

main();
