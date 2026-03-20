// normalization-rules.js
// Reglas de normalización canónica para migración de Wix a Express

module.exports = {
  // Reglas de decodificación y normalización de slugs
  slugNormalization: {
    // Decodificar URI components
    decodeSlug: (slug) => {
      let decoded = slug;
      // Decodificar URL encoding (%C3...)
      try {
        decoded = decodeURIComponent(decoded);
      } catch (e) {
        console.warn(`Error decodificando slug: ${slug}`);
      }
      // Normalizar Unicode (combinar caracteres)
      decoded = decoded.normalize("NFC");
      return decoded;
    },

    // Limpiar ruta de prefijos y sufijos
    cleanPath: (path) => {
      let clean = path;
      // Quitar prefijo /www.dehonline.es/
      clean = clean.replace(/^\/www\.dehonline\.es\//, "");
      // Quitar protocolo y dominio si está completo
      clean = clean.replace(/^https?:\/\/(www\.)?dehonline\.es\/?/, "");
      // Quitar barra final
      clean = clean.replace(/\/$/, "");
      // Quitar /index si termina así
      clean = clean.replace(/\/index$/, "");
      return clean;
    },

    // Detectar variantes codificadas duplicadas
    isDuplicateCodedVariant: (slug1, slug2) => {
      const norm1 = decodeURIComponent(slug1).normalize("NFC");
      const norm2 = decodeURIComponent(slug2).normalize("NFC");
      return norm1 === norm2;
    },
  },

  // Limpieza de HTML: mojibake, canónicos, rutas
  htmlCleaning: {
    // Reparar mojibake (caracteres corruptos)
    fixMojibake: (html) => {
      // Detectar y fijar patrones comunes de mojibake
      // Ejemplo: Â© -> ©
      let fixed = html;

      // Patrones comunes de mojibake UTF-8
      const mojibakePatterns = [
        { regex: /Â©/g, replacement: "©" },
        { regex: /Â®/g, replacement: "®" },
        { regex: /â€™/g, replacement: "'" },
        { regex: /â€œ/g, replacement: '"' },
        { regex: /â€\u009d/g, replacement: '"' },
        { regex: /â€"'/g, replacement: "–" },
        // Acentos corruptos
        { regex: /C3\s/g, replacement: "Ã©" }, // Ejemplo: 'C3\xA9' -> 'é'
      ];

      mojibakePatterns.forEach(({ regex, replacement }) => {
        fixed = fixed.replace(regex, replacement);
      });

      return fixed;
    },

    // Normalizar canonical href
    normalizeCanonical: (html, expectedPath) => {
      // Reemplazar canonical por ruta normalizada
      const canonicalPattern =
        /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/gi;
      const newCanonical = `<link rel="canonical" href="/${expectedPath.replace(/^\//, "")}" />`;
      return html.replace(canonicalPattern, newCanonical);
    },

    // Normalizar hrefs relativos (convertir a rutas relativas si es necesario)
    normalizeHrefs: (html) => {
      let normalized = html;
      // Reemplazar hrefs con dominio por rutas relativas
      normalized = normalized.replace(
        /href="https?:\/\/(www\.)?dehonline\.es\//g,
        'href="/',
      );
      // Quitar /www.dehonline.es/ de hrefs
      normalized = normalized.replace(
        /href="\/www\.dehonline\.es\//g,
        'href="/',
      );
      return normalized;
    },

    // Limpiar scripts vacíos y markup de Wix innecesario
    cleanWixMarkup: (html) => {
      let cleaned = html;
      // Opcional: eliminar atributos data-* de Wix si lo deseas
      // cleaned = cleaned.replace(/\s+data-[a-z-]+=["'][^"']*["']/gi, '');
      return cleaned;
    },
  },

  // Mapeo de rutas legacy a nuevas rutas
  legacyRoutes: {
    "/politica-seguridad": "/legal/politica-de-privacidad",
    "/clausula-de-privacidad": "/legal/politica-de-privacidad",
    "/terminos": "/legal/terminos-y-condiciones",
    "/condiciones": "/legal/terminos-y-condiciones",
  },

  // Páginas que necesitan atención especial
  specialPages: {
    empty: ["servicios-as", "plataforma-control-exp-notificaciones"],
    needsReconstruction: [],
    needsRedirect: ["servicios-as", "plataforma-control-exp-notificaciones"],
  },

  // Extensiones de archivo a procesar
  fileExtensions: {
    html: [".html"],
    css: [".css"],
    images: [".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp"],
    fonts: [".woff", ".woff2", ".ttf", ".otf"],
    documents: [".pdf", ".doc", ".docx", ".xlsx"],
  },

  // Mapping de nuevas rutas esperadas en dehonline repo
  viewsMapping: {
    // Raíz
    "index.html": "home.handlebars",
    "blog.html": "blog.handlebars",

    // Service pages: service-page/X/index.html -> service-page/X.handlebars
    "service-page/.*/index.html": "service-page/{slug}.handlebars",

    // Posts: post/X.html -> blog/posts/{slug}.handlebars
    "post/.*.html": "blog/posts/{slug}.handlebars",

    // Partners: partners/X.html -> partners/{slug}.handlebars
    "partners/.*.html": "partners/{slug}.handlebars",

    // Grupos: grupos/X.html -> grupos/{slug}.handlebars
    "grupos/.*.html": "grupos/{slug}.handlebars",

    // Otros: X.html -> {slug}.handlebars
    ".*.html": "{slug}.handlebars",
  },
};
