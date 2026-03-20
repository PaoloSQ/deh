// fix-real-routes.js
// This script restores href/src attributes in HTML files to their real routes (with tildes/ñ) using the filenames and paths found in the workspace.
// Run from the scripts directory.

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const htmlDir = path.resolve(__dirname, "../sites/www.dehonline.es");

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

// Build a map of real routes (filenames/paths with tildes/ñ)
function buildRealRouteMap(dir) {
  let routeMap = {};
  const files = getAllHtmlFiles(dir);
  files.forEach((file) => {
    const rel = path.relative(htmlDir, file).replace(/\\/g, "/");
    routeMap["/" + rel] = "/" + rel;
    // Also map without extension for links
    if (rel.endsWith(".html")) {
      const noExt = rel.slice(0, -5);
      routeMap["/" + noExt] = "/" + rel;
    }
  });
  return routeMap;
}

const realRouteMap = buildRealRouteMap(htmlDir);

function fixLinksInHtml(file) {
  const html = fs.readFileSync(file, "utf8");
  const $ = cheerio.load(html, { decodeEntities: false });

  // Fix href/src attributes
  $("[href], [src]").each(function () {
    const attribs = ["href", "src"];
    attribs.forEach((attr) => {
      let val = $(this).attr(attr);
      if (val && val.startsWith("/")) {
        // Try to match real route
        if (realRouteMap[val]) {
          $(this).attr(attr, realRouteMap[val]);
        } else {
          // Try to match ignoring extension
          let noExt = val.replace(/\.html$/, "");
          if (realRouteMap[noExt]) {
            $(this).attr(attr, realRouteMap[noExt]);
          }
        }
      }
    });
  });

  fs.writeFileSync(file, $.html(), "utf8");
}

const htmlFiles = getAllHtmlFiles(htmlDir);
htmlFiles.forEach(fixLinksInHtml);

console.log("Real routes restored in href/src attributes for all HTML files.");
