// fix-img-routes-params-advanced.js
// Limpia parámetros de rutas de imágenes en HTML, .handlebars y atributos JSON embebidos
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

function cleanImgParams(filePath) {
  let html = fs.readFileSync(filePath, "utf8");
  const $ = cheerio.load(html, { decodeEntities: false });

  // Limpia parámetros en src de <img>
  $("img").each((_, el) => {
    let src = $(el).attr("src");
    if (src) {
      src = src.replace(
        /([.](png|jpg|jpeg|gif|webp|avif|svg))(,[^/]+)?(\/[^\s"'>]+)?/gi,
        "$1",
      );
      $(el).attr("src", src);
    }
  });

  // Limpia parámetros en srcset de <source>
  $("source").each((_, el) => {
    let srcset = $(el).attr("srcset");
    if (srcset) {
      srcset = srcset.replace(
        /([.](png|jpg|jpeg|gif|webp|avif|svg))(,[^/]+)?(\/[^\s"'>]+)?/gi,
        "$1",
      );
      $(el).attr("srcset", srcset);
    }
  });

  // Limpia parámetros en data-image-info de wow-image
  $("[data-image-info]").each((_, el) => {
    let info = $(el).attr("data-image-info");
    if (info) {
      // Intenta parsear JSON
      try {
        let decoded = info.replace(/&quot;/g, '"');
        let json = JSON.parse(decoded);
        if (json.imageData && json.imageData.uri) {
          json.imageData.uri = json.imageData.uri.replace(
            /([.](png|jpg|jpeg|gif|webp|avif|svg))(,[^/]+)?(\/[^\s"'>]+)?/gi,
            "$1",
          );
        }
        // Vuelve a codificar
        let encoded = JSON.stringify(json).replace(/"/g, "&quot;");
        $(el).attr("data-image-info", encoded);
      } catch (e) {
        // Si falla, limpieza por regex
        info = info.replace(
          /([.](png|jpg|jpeg|gif|webp|avif|svg))(,[^/]+)?(\/[^\s"'>]+)?/gi,
          "$1",
        );
        $(el).attr("data-image-info", info);
      }
    }
  });

  // Limpia rutas de imágenes en todo el HTML
  html = $.html();
  html = html.replace(
    /([\/][^\s"'>]+[.](png|jpg|jpeg|gif|webp|avif|svg))(,[^/]+)?(\/[^\s"'>]+)?/gi,
    "$1",
  );

  // Limpia parámetros en srcset de picture/source
  html = html.replace(
    /([.](png|jpg|jpeg|gif|webp|avif|svg))(,[^/]+)?(\/[^\s"'>]+)?/gi,
    "$1",
  );

  fs.writeFileSync(filePath, html, "utf8");
  console.log("Rutas de imagen limpiadas:", filePath);
}

for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  const files = walk(root);
  for (const file of files) {
    try {
      cleanImgParams(file);
    } catch (e) {
      console.error("Error limpiando", file, e);
    }
  }
}

console.log("Limpieza avanzada de rutas de imagen terminada.");
