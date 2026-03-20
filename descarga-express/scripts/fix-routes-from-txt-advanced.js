// fix-routes-from-txt-advanced.js
// Reemplaza rutas normalizadas por rutas reales (con tildes/ñ) usando un txt externo.
// Considera variantes absolutas, relativas, codificadas y con/sin extensión.

const fs = require("fs");
const path = require("path");

const htmlDir = path.resolve(__dirname, "../sites/www.dehonline.es");
const txtPath = path.resolve(__dirname, "../../reports/local_pages_list.txt");

function normalize(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/Ñ/g, "N");
}

function encode(str) {
  return encodeURI(str);
}

// Leer rutas reales
const realRoutes = fs
  .readFileSync(txtPath, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

// Crear mapa: normalizada -> real
const routeMap = {};
realRoutes.forEach((route) => {
  const norm = normalize(route);
  routeMap[norm] = route;
});

function getAllHtmlFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllHtmlFiles(filePath));
    } else if (filePath.endsWith(".html")) {
      results.push(filePath);
    }
  });
  return results;
}

function fixLinksInHtml(file) {
  let html = fs.readFileSync(file, "utf8");
  Object.keys(routeMap).forEach((norm) => {
    const real = routeMap[norm];
    // Variantes a reemplazar
    const variants = [
      norm, // normalizada
      norm + ".html",
      norm.replace("https://www.dehonline.es", ""), // relativa
      norm.replace("https://www.dehonline.es", "") + ".html",
      encode(real), // codificada
      encode(norm),
      encode(norm.replace("https://www.dehonline.es", "")),
      encode(norm.replace("https://www.dehonline.es", "")) + ".html",
      real.replace("https://www.dehonline.es", ""),
      real,
      real + ".html",
      encode(real.replace("https://www.dehonline.es", "")),
      encode(real.replace("https://www.dehonline.es", "")) + ".html",
    ];
    variants.forEach((v) => {
      html = html.replace(
        new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
        real,
      );
    });
  });
  fs.writeFileSync(file, html, "utf8");
}

const htmlFiles = getAllHtmlFiles(htmlDir);
htmlFiles.forEach(fixLinksInHtml);

console.log(
  "Rutas normalizadas y variantes reemplazadas por rutas reales en todos los HTML.",
);
