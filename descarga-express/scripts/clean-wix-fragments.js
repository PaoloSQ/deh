// clean-wix-fragments.js
// Limpia fragmentos de Wix, scripts de error y fuentes externas de todos los HTML y .handlebars
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const ROOTS = [
  path.join(__dirname, "../sites"),
  path.join(__dirname, "../views"),
  path.join(__dirname, "../public"),
];

const exts = [".html", ".handlebars"];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs, out);
    else if (exts.includes(path.extname(ent.name))) out.push(abs);
  }
  return out;
}

function cleanHtml(filePath) {
  let html = fs.readFileSync(filePath, "utf8");
  const $ = cheerio.load(html, { decodeEntities: false });

  // Eliminar scripts de error y runtime Wix
  $("script").each((_, el) => {
    const src = $(el).attr("src") || "";
    const htmlContent = $(el).html() || "";
    if (
      /wix|parastorage|error-pages|viewerModel|thunderbolt|classic-error-pages/i.test(
        src + htmlContent,
      )
    ) {
      $(el).remove();
    }
    if (/window\.__ERROR_DATA__/i.test(htmlContent)) {
      $(el).remove();
    }
  });

  // Eliminar links a fuentes externas Wix
  $("link").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (
      /wix-fonts|parastorage|wixstatic|fonts\.googleapis|fonts\.gstatic/i.test(
        href,
      )
    ) {
      $(el).remove();
    }
  });

  // Eliminar fragmentos inline de error
  html = $.html();
  html = html.replace(/window\.__ERROR_DATA__\s*=\s*\{[^}]+\};?/gi, "");

  // Eliminar comentarios de Wix
  html = html.replace(/<!--.*?wix.*?-->/gis, "");

  fs.writeFileSync(filePath, html, "utf8");
  console.log("Limpio:", filePath);
}

for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  const files = walk(root);
  for (const file of files) {
    try {
      cleanHtml(file);
    } catch (e) {
      console.error("Error limpiando", file, e);
    }
  }
}

console.log("Limpieza Wix terminada.");
