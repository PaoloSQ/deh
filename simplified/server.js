const express = require("express");
const { engine } = require("express-handlebars");
const path = require("path");
const browserSync = require("browser-sync");

const app = express();
const PORT = 3001;

app.engine(
  "handlebars",
  engine({
    defaultLayout: "main",
    layoutsDir: path.join(__dirname, "src/layouts"),
    partialsDir: path.join(__dirname, "src/partials"),
    helpers: {
      section: function (name, options) {
        if (!this._sections) this._sections = {};
        this._sections[name] = options.fn(this);
        return null;
      },
    },
  }),
);

app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "src/pages"));

app.use(express.static(path.join(__dirname, "public")));
app.use("/css", express.static(path.join(__dirname, "public/css")));
app.use("/js", express.static(path.join(__dirname, "public/js")));
app.use("/images", express.static(path.join(__dirname, "public/images")));

const routesDir = path.join(__dirname, "src/pages");
const pages = {};

function getPageName(routePath) {
  if (routePath === "/") return "home";
  return routePath.replace(/^\//, "").replace(/\/$/, "");
}

function loadRoutes() {
  const fs = require("fs");

  function scanDir(dir) {
    const items = fs.readdirSync(dir);
    items.forEach((item) => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (item.endsWith(".handlebars")) {
        const relativePath = path.relative(
          path.join(__dirname, "src/pages"),
          fullPath,
        );
        let routePath =
          "/" + relativePath.replace(".handlebars", "").replace(/\\/g, "/");

        if (routePath.endsWith("/index")) {
          routePath = routePath.replace("/index", "");
        }

        const pageName = getPageName(routePath);

        if (routePath === "/" || routePath === "/index") {
          const name = "home";
          console.log("Route: / -> pageCSS:", name);
          app.get("/", (req, res) => {
            const renderOptions = {
              layout: "main",
              pageCSS: name,
              pageJS: name,
            };
            console.log("Rendering index with:", JSON.stringify(renderOptions));
            res.render("index", renderOptions);
          });
        } else {
          const viewPath = relativePath
            .replace(/\\/g, "/")
            .replace(".handlebars", "");

          app.get(routePath + ".html", (req, res) => {
            res.render(viewPath, {
              layout: "main",
              pageCSS: pageName,
              pageJS: pageName,
            });
          });

          app.get(routePath, (req, res) => {
            res.render(viewPath, {
              layout: "main",
              pageCSS: pageName,
              pageJS: pageName,
            });
          });
        }
      }
    });
  }

  scanDir(routesDir);
}

loadRoutes();

app.use((req, res) => {
  res.status(404).render("404", { layout: "main" });
});

const server = app.listen(PORT, () => {
  console.log(`\n✅ Servidor Express en http://localhost:${PORT}`);

  if (process.env.NODE_ENV === "development") {
    console.log("🔄 Iniciando Browser-Sync...");

    const bs = browserSync.create();
    bs.init(
      {
        proxy: `localhost:${PORT}`,
        files: [
          "public/**/*.css",
          "public/**/*.js",
          "public/**/*.{jpg,png,svg,gif,webp}",
          "src/**/*.handlebars",
        ],
        port: 3000,
        open: false,
        notify: false,
        ui: false,
        reloadDelay: 200,
        injectChanges: true,
        minify: false,
      },
      () => {
        console.log("🎨 Browser-Sync proxy en http://localhost:3000");
        console.log("📝 Nodemon vigilando cambios del servidor...");
        console.log("🔄 Browser-Sync recargará el navegador automáticamente\n");
      },
    );
  }
});

module.exports = server;
