// Script para limpiar rutas de imágenes con parámetros y fragmentos Wix/JS en archivos .html y .handlebars
// Recorre todos los archivos en descargas-express/sites/www.dehonline.es y views de dehonline repo

const fs = require("fs");
const path = require("path");
const { parseDocument } = require("htmlparser2");
const { DomUtils } = require("domutils");
const render = require("dom-serializer").default;

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

function isWixScript(node) {
  if (node.type !== "script") return false;
  if (
    !node ||
    (node.type !== "script" && !(node.type === "tag" && node.name === "script"))
  )
    return false;
  let content = "";
  try {
    content = DomUtils.textContent(node)
      ? DomUtils.textContent(node).toLowerCase()
      : "";
  } catch (e) {
    content = "";
  }
  return (
    content.includes("wix") ||
    content.includes("fedops") ||
    content.includes("telemetry") ||
    content.includes("sentry") ||
    content.includes("parastorage") ||
    content.includes("visitor-analytics") ||
    content.includes("linkedin") ||
    content.includes("auto.srv791713")
  );
}

function isWixSvg(node) {
  if (node.type !== "tag" || node.name !== "svg") return false;
  if (!node || node.type !== "tag" || node.name !== "svg") return false;
  let content = "";
  try {
    content = DomUtils.textContent(node)
      ? DomUtils.textContent(node).toLowerCase()
      : "";
  } catch (e) {
    content = "";
  }
  return (
    content.includes("scrollbutton") ||
    content.includes("scrollcontrols") ||
    content.includes("wixui-") ||
    content.includes("stylable") ||
    content.includes("itemdepth") ||
    content.includes("comp-") ||
    content.includes("mesh-layout")
  );
}

function cleanContent(content) {
  const doc = parseDocument(content, { recognizeSelfClosing: true });
  function cleanNodeTree(nodes) {
    if (!Array.isArray(nodes)) return;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      // Eliminar comentarios de Wix/telemetría
      if (
        node.type === "comment" &&
        /wix|fedops|telemetry|sentry|parastorage|visitor-analytics|linkedin/i.test(
          node.data,
        )
      ) {
        nodes.splice(i, 1);
        continue;
      }
      // Eliminar meta tags de Wix
      if (
        node.type === "tag" &&
        node.name === "meta" &&
        node.attribs &&
        node.attribs["id"] === "wixDesktopViewport"
      ) {
        nodes.splice(i, 1);
        continue;
      }
      // Eliminar scripts de tracking/analytics
      if (
        node.type === "tag" &&
        node.name === "script" &&
        node.attribs &&
        ((node.attribs["src"] &&
          /google-analytics|gtag|facebook|pixel|matomo|hotjar|tagmanager/i.test(
            node.attribs["src"],
          )) ||
          (node.attribs["id"] &&
            /google-analytics|gtag|facebook|pixel|matomo|hotjar|tagmanager/i.test(
              node.attribs["id"],
            )))
      ) {
        nodes.splice(i, 1);
        continue;
      }
      // Eliminar atributos de Wix y tracking
      if (node.attribs) {
        delete node.attribs["data-mesh-id"];
        delete node.attribs["data-testid"];
        delete node.attribs["data-motion-part"];
        delete node.attribs["data-hook"];
        delete node.attribs["data-analytics-id"];
        delete node.attribs["data-ga"];
        delete node.attribs["data-facebook-pixel"];
      }
      // Eliminar clases específicas de Wix
      if (node.attribs && node.attribs["class"]) {
        node.attribs["class"] = node.attribs["class"]
          .split(" ")
          .filter((c) => !/^wixui-|^Stylable|mesh-layout/.test(c))
          .join(" ");
      }
      // Eliminar elementos vacíos
      if (
        node.type === "tag" &&
        ["div", "span", "section"].includes(node.name) &&
        (!node.children || node.children.length === 0) &&
        (!node.attribs["class"] || node.attribs["class"].trim() === "")
      ) {
        nodes.splice(i, 1);
        continue;
      }
      // Eliminar SVGs ocultos
      if (
        node.type === "tag" &&
        node.name === "svg" &&
        node.attribs &&
        node.attribs["style"] &&
        /display:\s*none|visibility:\s*hidden/i.test(node.attribs["style"])
      ) {
        nodes.splice(i, 1);
        continue;
      }
      if (isWixScript(node) || isWixSvg(node)) {
        DomUtils.removeElement(node);
        nodes.splice(i, 1);
      } else if (node.children) {
        cleanNodeTree(node.children);
      }
    }
  }
  cleanNodeTree(doc.children);
  return render(doc);
}

function main() {
  // Limpiar todas las páginas .html en sites/www.dehonline.es
  const dir = path.join(__dirname, "../sites/www.dehonline.es");
  const htmlFiles = getAllFiles(dir, ".html");
  htmlFiles.forEach((file) => {
    let content = fs.readFileSync(file, "utf8");
    const cleaned = cleanContent(content);
    if (cleaned !== content) {
      fs.writeFileSync(file, cleaned, "utf8");
      console.log("Limpio:", file);
    }
  });
}

main();
