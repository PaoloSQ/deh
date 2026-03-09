/**
 * Script para extraer y catalogar todas las imágenes del sitio original
 * Identifica imágenes, sus contextos y genera un plan de organización
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// Configuración
const baseDir = path.join(__dirname, "../descarga/www.dehonline.es");
const outputDir = path.join(__dirname, "../simplified/public/img");
const catalogoPath = path.join(__dirname, "catalogo-imagenes.json");

// Crear estructura de carpetas
const carpetas = {
  logos: outputDir + "/logos",
  partners: outputDir + "/partners",
  hero: outputDir + "/hero",
  servicios: outputDir + "/servicios",
  blog: outputDir + "/blog",
  icons: outputDir + "/icons",
  backgrounds: outputDir + "/backgrounds",
  ui: outputDir + "/ui",
  common: outputDir + "/common",
};

/**
 * Extrae URLs de imágenes de un HTML
 */
function extraerImagenesDeHTML(contenido, nombreArchivo) {
  const imagenes = new Set();

  // Patrones para encontrar imágenes
  const patterns = [
    // img src
    /<img[^>]+src=["']([^"']+)["']/gi,
    // background-image
    /background-image:\s*url\(["']?([^"')]+)["']?\)/gi,
    // srcset
    /srcset=["']([^"']+)["']/gi,
    // data-src (lazy loading)
    /data-src=["']([^"']+)["']/gi,
    // Wix specific
    /image:\(["']?([^"')]+)["']?\)/gi,
    // Static URLs
    /https?:\/\/static\.wixstatic\.com\/[^\s"'<>)]+/gi,
    /https?:\/\/static\.parastorage\.com\/[^\s"'<>)]+/gi,
  ];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(contenido)) !== null) {
      // Usar match[1] si existe (grupo capturado), sino match[0] (match completo)
      let url = match[1] || match[0];

      // Verificar que url existe y es string
      if (!url || typeof url !== "string") continue;

      // Limpiar URLs de srcset (pueden tener múltiples URLs)
      if (url.includes(",")) {
        url.split(",").forEach((u) => {
          const cleanUrl = u.trim().split(" ")[0];
          if (cleanUrl.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)/i)) {
            imagenes.add(cleanUrl);
          }
        });
      } else if (url.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)/i)) {
        imagenes.add(url);
      }
    }
  });

  return Array.from(imagenes);
}

/**
 * Determina el contexto/categoría de una imagen
 */
function determinarCategoria(url, nombreArchivo, contenidoHTML) {
  const urlLower = url.toLowerCase();
  const archivo = nombreArchivo.toLowerCase();

  // Logos
  if (urlLower.includes("logo") || urlLower.includes("brand")) {
    return "logos";
  }

  // Partners
  if (
    urlLower.includes("partner") ||
    urlLower.includes("thales") ||
    urlLower.includes("azure") ||
    urlLower.includes("aws") ||
    urlLower.includes("uanataca") ||
    urlLower.includes("camerfirma")
  ) {
    return "partners";
  }

  // Íconos
  if (
    urlLower.includes("icon") ||
    urlLower.includes("ico") ||
    urlLower.match(/\d+x\d+/) ||
    urlLower.includes("favicon")
  ) {
    return "icons";
  }

  // Blog
  if (
    archivo.includes("blog") ||
    urlLower.includes("blog") ||
    urlLower.includes("post")
  ) {
    return "blog";
  }

  // Hero/mockups
  if (
    urlLower.includes("hero") ||
    urlLower.includes("mockup") ||
    urlLower.includes("laptop") ||
    urlLower.includes("banner")
  ) {
    return "hero";
  }

  // Backgrounds
  if (
    urlLower.includes("background") ||
    urlLower.includes("bg-") ||
    urlLower.includes("pattern")
  ) {
    return "backgrounds";
  }

  // Servicios
  if (
    archivo.includes("servicio") ||
    archivo.includes("certibox") ||
    archivo.includes("documbox")
  ) {
    return "servicios";
  }

  // Por página específica
  if (archivo === "index.html") return "hero";
  if (archivo.includes("contacto")) return "ui";

  // Default
  return "common";
}

/**
 * Genera un nombre descriptivo para la imagen
 */
function generarNombreDescriptivo(url, categoria, index) {
  const extension = path.extname(url).split("?")[0] || ".jpg";
  const urlParts = url.split("/");
  const fileName = urlParts[urlParts.length - 1].split("?")[0];

  // Si el nombre ya es descriptivo, usarlo
  const palabrasDescriptivas = [
    "logo",
    "icon",
    "hero",
    "banner",
    "mockup",
    "partner",
    "thales",
    "azure",
    "aws",
    "laptop",
    "mobile",
    "background",
  ];

  const nombreActual = fileName.toLowerCase().replace(extension, "");
  const esDescriptivo = palabrasDescriptivas.some((p) =>
    nombreActual.includes(p),
  );

  if (esDescriptivo && nombreActual.length < 30) {
    return fileName.split("?")[0]; // Mantener nombre original si es corto y descriptivo
  }

  // Generar nombre basado en contexto
  let nuevoNombre = "";

  switch (categoria) {
    case "logos":
      nuevoNombre = `logo-${index}${extension}`;
      break;
    case "partners":
      // Intentar detectar el partner
      if (url.includes("thales")) nuevoNombre = `partner-thales${extension}`;
      else if (url.includes("azure") || url.includes("microsoft"))
        nuevoNombre = `partner-azure${extension}`;
      else if (url.includes("aws") || url.includes("amazon"))
        nuevoNombre = `partner-aws${extension}`;
      else nuevoNombre = `partner-${index}${extension}`;
      break;
    case "hero":
      nuevoNombre = `hero-image-${index}${extension}`;
      break;
    case "blog":
      nuevoNombre = `blog-post-${index}${extension}`;
      break;
    case "icons":
      if (url.includes("favicon")) nuevoNombre = `favicon${extension}`;
      else nuevoNombre = `icon-${index}${extension}`;
      break;
    default:
      nuevoNombre = `${categoria}-${index}${extension}`;
  }

  return nuevoNombre;
}

/**
 * Descarga una imagen
 */
function descargarImagen(url, destino) {
  return new Promise((resolve, reject) => {
    // Normalizar URL
    let urlCompleta = url;
    if (url.startsWith("//")) {
      urlCompleta = "https:" + url;
    } else if (!url.startsWith("http")) {
      urlCompleta = "https://" + url;
    }

    const protocolo = urlCompleta.startsWith("https") ? https : http;

    const file = fs.createWriteStream(destino);

    protocolo
      .get(urlCompleta, (response) => {
        // Seguir redirecciones
        if (response.statusCode === 301 || response.statusCode === 302) {
          return descargarImagen(response.headers.location, destino)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          resolve(destino);
        });
      })
      .on("error", (err) => {
        fs.unlink(destino, () => {});
        reject(err);
      });
  });
}

/**
 * Proceso principal
 */
async function extraerTodasLasImagenes() {
  console.log("🖼️  EXTRACTOR DE IMÁGENES - DEH Online\n");

  // Crear estructura de carpetas
  console.log("📁 Creando estructura de carpetas...");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  Object.values(carpetas).forEach((carpeta) => {
    if (!fs.existsSync(carpeta)) {
      fs.mkdirSync(carpeta, { recursive: true });
    }
  });
  console.log("✓ Carpetas creadas\n");

  // Analizar archivos HTML
  const archivos = fs.readdirSync(baseDir).filter((f) => f.endsWith(".html"));

  const catalogo = {
    timestamp: new Date().toISOString(),
    totalImagenes: 0,
    porCategoria: {},
    imagenes: [],
  };

  const imagenesGlobales = new Map(); // URL -> metadata

  console.log(`📊 Analizando ${archivos.length} páginas...\n`);

  // Primera pasada: catalogar todas las imágenes
  archivos.forEach((archivo) => {
    const rutaCompleta = path.join(baseDir, archivo);
    const contenido = fs.readFileSync(rutaCompleta, "utf-8");
    const imagenes = extraerImagenesDeHTML(contenido, archivo);

    console.log(`[${archivo}] ${imagenes.length} imágenes encontradas`);

    imagenes.forEach((url) => {
      if (!imagenesGlobales.has(url)) {
        const categoria = determinarCategoria(url, archivo, contenido);
        imagenesGlobales.set(url, {
          url,
          categoria,
          archivos: [archivo],
          descargada: false,
        });
      } else {
        // Imagen usada en múltiples páginas
        imagenesGlobales.get(url).archivos.push(archivo);
      }
    });
  });

  console.log(`\n✓ Total de imágenes únicas: ${imagenesGlobales.size}\n`);

  // Agrupar por categoría
  const porCategoria = {};
  imagenesGlobales.forEach((img) => {
    if (!porCategoria[img.categoria]) {
      porCategoria[img.categoria] = [];
    }
    porCategoria[img.categoria].push(img);
  });

  console.log("📦 Distribución por categoría:");
  Object.entries(porCategoria).forEach(([cat, imgs]) => {
    console.log(`   ${cat}: ${imgs.length} imágenes`);
  });

  // Generar catálogo sin descargar (para revisión)
  console.log("\n💾 Generando catálogo...");

  Object.entries(porCategoria).forEach(([categoria, imagenes]) => {
    catalogo.porCategoria[categoria] = imagenes.length;

    imagenes.forEach((img, index) => {
      const nuevoNombre = generarNombreDescriptivo(
        img.url,
        categoria,
        index + 1,
      );
      const rutaDestino = path.join(carpetas[categoria], nuevoNombre);

      catalogo.imagenes.push({
        urlOriginal: img.url,
        categoria,
        nuevoNombre,
        rutaDestino: rutaDestino.replace(/\\/g, "/"),
        usadaEn: img.archivos,
        usoMultiple: img.archivos.length > 1,
      });
    });
  });

  catalogo.totalImagenes = catalogo.imagenes.length;

  fs.writeFileSync(catalogoPath, JSON.stringify(catalogo, null, 2));

  console.log(`✅ Catálogo generado: ${catalogoPath}`);
  console.log(`\n📋 RESUMEN:`);
  console.log(`   - Imágenes únicas: ${catalogo.totalImagenes}`);
  console.log(`   - Categorías: ${Object.keys(catalogo.porCategoria).length}`);
  console.log(
    `   - Imágenes reutilizadas: ${catalogo.imagenes.filter((i) => i.usoMultiple).length}`,
  );
  console.log(`\n💡 Siguiente paso: Ejecuta el descargador`);
  console.log(`   node descargar-imagenes.js`);
}

// Ejecutar
extraerTodasLasImagenes().catch(console.error);
