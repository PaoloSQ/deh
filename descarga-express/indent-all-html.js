// Script para indentar todos los archivos HTML en descarga-express usando js-beautify
const fs = require("fs");
const path = require("path");
const beautify = require("js-beautify").html;

const rootDir = path.resolve(__dirname);

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

const htmlFiles = getAllHtmlFiles(rootDir);

const beautifyOptions = {
  indent_size: 2,
  preserve_newlines: true,
  max_preserve_newlines: 2,
  wrap_line_length: 0,
  end_with_newline: true,
  unformatted: [],
};

htmlFiles.forEach((file) => {
  const original = fs.readFileSync(file, "utf8");
  const formatted = beautify(original, beautifyOptions);
  fs.writeFileSync(file, formatted, "utf8");
  console.log("Indented:", file);
});

console.log("Indentation complete for all HTML files.");
