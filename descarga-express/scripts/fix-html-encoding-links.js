// fix-html-encoding-links.js
// Corrige codificación de enlaces y entidades HTML en todos los archivos .html y .handlebars
const fs = require("fs");
const path = require("path");

const htmlDirs = [
  path.join(__dirname, "../sites/www.dehonline.es"),
  path.join(__dirname, "../../../dehonline repo/views"),
];

function getAllFiles(dir, extFilter) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  fs.readdirSync(dir).forEach((file) => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      files = files.concat(getAllFiles(fullPath, extFilter));
    } else if (!extFilter || file.endsWith(extFilter)) {
      files.push(fullPath);
    }
  });
  return files;
}

function fixEncoding(content) {
  // Corrige entidades HTML mal codificadas
  content = content.replace(/&amp;/g, "&");
  content = content.replace(/&quot;/g, '"');
  content = content.replace(/&#39;/g, "'");
  content = content.replace(/&lt;/g, "<");
  content = content.replace(/&gt;/g, ">");

  // Corrige codificación de enlaces
  content = content.replace(/href="([^"]+)"/gi, (m, href) => {
    // Decodifica %xx en href
    try {
      return `href="${decodeURIComponent(href)}"`;
    } catch {
      return m;
    }
  });
  content = content.replace(/src="([^"]+)"/gi, (m, src) => {
    try {
      return `src="${decodeURIComponent(src)}"`;
    } catch {
      return m;
    }
  });
  return content;
}

function main() {
  for (const dir of htmlDirs) {
    const htmlFiles = getAllFiles(dir, ".html").concat(
      getAllFiles(dir, ".handlebars"),
    );
    htmlFiles.forEach((file) => {
      let content = fs.readFileSync(file, "utf8");
      const fixed = fixEncoding(content);
      if (fixed !== content) {
        fs.writeFileSync(file, fixed, "utf8");
        console.log("Codificación corregida:", file);
      }
    });
  }
}

main();
