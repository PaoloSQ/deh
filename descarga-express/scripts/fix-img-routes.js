// Script para limpiar rutas de imágenes con parámetros en HTML
// Corrige rutas tipo /img/.../image-XXX.jpg,h_150,q_90,enc_avif,quality_auto/... y las deja en la ruta base si el archivo existe

const fs = require("fs");
const path = require("path");

const htmlDir = path.join(__dirname, "../sites/www.dehonline.es");
const publicImgDir = path.join(__dirname, "../../dehonline repo/public/img");

function getAllHtmlFiles(dir) {
  let files = [];
  fs.readdirSync(dir).forEach((file) => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      files = files.concat(getAllHtmlFiles(fullPath));
    } else if (file.endsWith(".html")) {
      files.push(fullPath);
    }
  });
  return files;
}

function getExistingImages() {
  const images = new Set();
  function walk(dir, prefix) {
    fs.readdirSync(dir).forEach((file) => {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        walk(fullPath, prefix + "/" + file);
      } else if (file.match(/\.(png|jpg|jpeg|gif|webp)$/i)) {
        images.add("/img" + prefix + "/" + file);
      }
    });
  }
  if (fs.existsSync(publicImgDir)) {
    walk(publicImgDir, "");
  }
  return images;
}

function fixHtmlFile(file, images) {
  let content = fs.readFileSync(file, "utf8");
  // Busca rutas tipo /img/.../image-XXX.jpg,h_150,q_90,enc_avif,quality_auto/... y las limpia
  content = content.replace(
    /(\/img\/[^"',\s]+?\.(png|jpg|jpeg|gif|webp))[^"',\s]*/g,
    (match, base) => {
      // Si existe la imagen base, reemplaza
      return images.has(base) ? base : match;
    },
  );
  fs.writeFileSync(file, content, "utf8");
}

function main() {
  const htmlFiles = getAllHtmlFiles(htmlDir);
  const images = getExistingImages();
  htmlFiles.forEach((file) => {
    fixHtmlFile(file, images);
    console.log("Corregido:", file);
  });
}

main();
