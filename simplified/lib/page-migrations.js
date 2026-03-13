const fs = require("fs");
const path = require("path");

const PAGE_MIGRATIONS = {
  "documbox-info": {
    standalone: true,
    singleTemplate: true,
    wrapperClass: "documbox-wix",
    download: {
      host: "www.dehonline.es",
      file: "documbox-info.html",
    },
    partialsDir: path.join("src", "partials", "documbox-info"),
    sectionPartials: [
      { id: "comp-miiub1ci", name: "hero" },
      { id: "comp-mi4ha2e14", name: "benefits" },
      { id: "comp-miiru33x", name: "comparison" },
      { id: "comp-mi4ha2f3", name: "form" },
      { id: "comp-mi8oosiy", name: "footer" },
    ],
  },
  certibox: {
    standalone: true,
    wrapperClass: "certibox-wix",
    download: {
      host: "www.dehonline.es",
      file: "certibox.html",
    },
    partialsDir: path.join("src", "partials", "certibox"),
  },
};

function getPageMigration(pageName) {
  return PAGE_MIGRATIONS[pageName] || null;
}

function listStandalonePages() {
  return Object.entries(PAGE_MIGRATIONS)
    .filter(([, config]) => config.standalone)
    .map(([pageName]) => pageName);
}

function resolveDownloadedHtmlPath(rootDir, pageName) {
  const config = getPageMigration(pageName);
  if (!config || !config.download) {
    throw new Error(`No hay configuracion de descarga para la pagina: ${pageName}`);
  }

  return path.join(rootDir, "..", "descarga", config.download.host, config.download.file);
}

function resolveGeneratedPaths(rootDir, pageName) {
  const config = getPageMigration(pageName);
  const partialDir = config?.partialsDir
    ? path.join(rootDir, config.partialsDir)
    : path.join(rootDir, "src", "partials", pageName);

  return {
    sourceCopyPath: path.join(rootDir, "migration", pageName, "source", `${pageName}.source.html`),
    prettySourcePath: path.join(
      rootDir,
      "migration",
      pageName,
      "source",
      `${pageName}.source.pretty.html`
    ),
    handlebarsPath: path.join(rootDir, "src", "pages", `${pageName}.handlebars`),
    partialDir,
    cssPath: path.join(rootDir, "public", "css", `${pageName}.css`),
    jsExtractPath: path.join(rootDir, "public", "js", `${pageName}.extracted.js`),
    manifestPath: path.join(rootDir, "migration", pageName, "source", "manifest.json"),
  };
}

function resolveTemplateFiles(rootDir, pageName) {
  const paths = resolveGeneratedPaths(rootDir, pageName);
  const files = [paths.handlebarsPath];

  if (!fs.existsSync(paths.partialDir)) {
    return files;
  }

  const partialEntries = fs.readdirSync(paths.partialDir, { withFileTypes: true });
  partialEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".handlebars"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((entry) => {
      files.push(path.join(paths.partialDir, entry.name));
    });

  return files;
}

module.exports = {
  PAGE_MIGRATIONS,
  getPageMigration,
  listStandalonePages,
  resolveDownloadedHtmlPath,
  resolveGeneratedPaths,
  resolveTemplateFiles,
};
