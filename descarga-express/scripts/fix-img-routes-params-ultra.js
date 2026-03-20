// fix-img-routes-params-ultra.js
// Limpieza ultra de rutas de imágenes, parámetros, srcset y JSON incrustado en HTML
const fs = require("fs");
const path = require("path");

const cheerio = require("cheerio");

const htmlDir = path.join(__dirname, "../sites/www.dehonline.es");

function cleanImgParams(str) {
  // Elimina parámetros de URLs de imágenes
  return (
    str
      .replace(/(\.(png|jpg|jpeg|gif|webp|avif|svg))(\?[^"'\s>]*)/gi, "$1")
      // Elimina fragmentos de srcset
      .replace(/srcset="([^"]+)"/gi, (m, val) => {
        const cleaned = val
          .split(",")
          .map((v) =>
            v.replace(/(\.(png|jpg|jpeg|gif|webp|avif|svg))(\?[^\s]*)/gi, "$1"),
          )
          .join(",");
        return `srcset="${cleaned}"`;
      })
      // Elimina parámetros en data-image-info JSON
      .replace(/("uri":\s*"[^"?]+)(\?[^"\s]*)"/gi, '$1"')
      // Elimina parámetros en URLs de wow-image
      .replace(/(<wow-image[^>]*data-image-info="[^"]+)/gi, (m) =>
        m.replace(/(\.(png|jpg|jpeg|gif|webp|avif|svg))(\?[^"\s]*)/gi, "$1"),
      )
  );
}

function processFile(filePath) {
  let html = fs.readFileSync(filePath, "utf8");
  let $ = cheerio.load(html, { decodeEntities: false });

  // Limpia todos los atributos src, srcset, data-image-info, style con imágenes
  $("img, source, wow-image").each(function () {
    const el = $(this);
    ["src", "srcset", "data-image-info", "style"].forEach((attr) => {
      let val = el.attr(attr);
      if (val) {
        el.attr(attr, cleanImgParams(val));
      }
    });
  });

  // Limpia fragmentos JSON incrustados
  html = cleanImgParams($.html());

  // Elimina parámetros de URLs en todo el HTML
  html = html.replace(
    /(\.(png|jpg|jpeg|gif|webp|avif|svg))(\?[^"'\s>]*)/gi,
    "$1",
  );

  // Elimina parámetros en srcset
  html = html.replace(/srcset="([^"]+)"/gi, (m, val) => {
    const cleaned = val
      .split(",")
      .map((v) =>
        v.replace(/(\.(png|jpg|jpeg|gif|webp|avif|svg))(\?[^\s]*)/gi, "$1"),
      )
      .join(",");
    return `srcset="${cleaned}"`;
  });

  // Elimina parámetros en JSON de data-image-info
  html = html.replace(/("uri":\s*"[^"?]+)(\?[^"\s]*)"/gi, '$1"');

  fs.writeFileSync(filePath, html, "utf8");
}

function walk(dir) {
  fs.readdirSync(dir).forEach((file) => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (file.endsWith(".html")) {
      processFile(fullPath);
      console.log("Limpio:", fullPath);
    }
  });
}

walk(htmlDir);
console.log("Limpieza ultra terminada.");
