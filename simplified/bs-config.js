module.exports = {
  proxy: "localhost:3001",
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
};
