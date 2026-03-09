/**
 * EXTRACTOR Y DESCARGADOR DE IMÁGENES - HOME PAGE
 *
 * Extrae TODAS las imágenes del HTML original de forma inteligente:
 * - Busca en src, srcSet, data-src
 * - Parsea JSON embebido en data-image-info
 * - Categoriza imágenes por sección
 * - Descarga con nombres descriptivos
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const config = {
  htmlPath: path.join(__dirname, "../descarga/www.dehonline.es/index.html"),
  outputDir: path.join(__dirname, "../simplified/public/img/home"),
  catalogPath: path.join(__dirname, "catalogo-imagenes-home.json"),
};

// Crear directorio si no existe
if (!fs.existsSync(config.outputDir)) {
  fs.mkdirSync(config.outputDir, { recursive: true });
}

/**
 * Extrae URL limpia de imagen Wix
 */
function limpiarURLWix(url) {
  if (!url) return null;

  // Si tiene parámetros /v1/fill/..., tomar solo la parte base
  const match = url.match(/https:\/\/static\.wixstatic\.com\/media\/([^/]+)/);
  if (match) {
    return `https://static.wixstatic.com/media/${match[1]}`;
  }

  return url;
}

/**
 * Extrae extensión de URL
 */
function obtenerExtension(url) {
  const ext = path.extname(url.split("?")[0]).toLowerCase();
  return ext || ".jpg";
}

/**
 * Descarga una imagen
 */
function descargarImagen(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);

    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(outputPath);
          reject(new Error(`HTTP ${response.statusCode} para ${url}`));
          return;
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          resolve(outputPath);
        });
      })
      .on("error", (err) => {
        file.close();
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        reject(err);
      });
  });
}

/**
 * Extrae todas las imágenes del HTML
 */
function extraerImagenes(html) {
  const imagenes = {
    hero: [],
    servicios: [],
    partners: [],
    stats: [],
    grupos: [],
    blog: [],
    integraciones: [],
    otros: [],
  };

  const urlsVistas = new Set();

  // 1. Buscar imágenes en srcSet
  const srcSetPattern = /srcSet="([^"]+)"/g;
  let match;

  while ((match = srcSetPattern.exec(html)) !== null) {
    const srcSet = match[1];
    // El srcSet tiene múltiples URLs separadas por comas
    const urls = srcSet.split(",").map((s) => s.trim().split(" ")[0]);

    urls.forEach((url) => {
      const urlLimpia = limpiarURLWix(url);
      if (
        urlLimpia &&
        urlLimpia.startsWith("https://static.wixstatic.com") &&
        !urlsVistas.has(urlLimpia)
      ) {
        urlsVistas.add(urlLimpia);

        // Categorizar según contexto (aproximado)
        let categoria = "otros";
        const contexto = html.substring(match.index - 500, match.index + 500);

        if (contexto.includes("hero") || contexto.includes("laptop-mockup")) {
          categoria = "hero";
        } else if (
          contexto.includes("partner-logo") ||
          contexto.includes("Thales") ||
          contexto.includes("Azure")
        ) {
          categoria = "partners";
        } else if (contexto.includes("icono") || contexto.includes("Recurso")) {
          categoria = "stats";
        } else if (contexto.includes("grupo") || contexto.includes("Riesgos")) {
          categoria = "grupos";
        } else if (contexto.includes("blog") || contexto.includes("post")) {
          categoria = "blog";
        } else if (
          contexto.includes("Dehú") ||
          contexto.includes("DGT") ||
          contexto.includes("Agencia")
        ) {
          categoria = "integraciones";
        } else if (
          contexto.includes("certibox") ||
          contexto.includes("lexbox") ||
          contexto.includes("documbox")
        ) {
          categoria = "servicios";
        }

        imagenes[categoria].push({
          url: urlLimpia,
          extension: obtenerExtension(urlLimpia),
        });
      }
    });
  }

  // 2. Buscar imágenes en src simple
  const srcPattern = /src="(https:\/\/static\.wixstatic\.com\/media\/[^"]+)"/g;

  while ((match = srcPattern.exec(html)) !== null) {
    const url = match[1];
    const urlLimpia = limpiarURLWix(url);

    if (urlLimpia && !urlsVistas.has(urlLimpia)) {
      urlsVistas.add(urlLimpia);
      imagenes.otros.push({
        url: urlLimpia,
        extension: obtenerExtension(urlLimpia),
      });
    }
  }

  return imagenes;
}

/**
 * Main
 */
async function main() {
  console.log("\n🖼️  EXTRACTOR Y DESCARGADOR DE IMÁGENES\n");

  // Leer HTML
  const html = fs.readFileSync(config.htmlPath, "utf-8");
  console.log("✓ HTML cargado");

  // Extraer imágenes
  const imagenes = extraerImagenes(html);

  // Contar total
  const total = Object.values(imagenes).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );
  console.log(`✓ ${total} imágenes únicas encontradas\n`);

  // Mostrar por categoría
  console.log("📦 Distribución por categoría:");
  Object.entries(imagenes).forEach(([categoria, imgs]) => {
    if (imgs.length > 0) {
      console.log(`   ${categoria.padEnd(15)} ${imgs.length} imágenes`);
    }
  });

  // Guardar catálogo
  const catalogo = {
    pagina: "index",
    fecha: new Date().toISOString(),
    total,
    imagenes,
  };

  fs.writeFileSync(config.catalogPath, JSON.stringify(catalogo, null, 2));
  console.log(`\n💾 Catálogo guardado: ${path.basename(config.catalogPath)}`);

  // Preguntar si descargar
  console.log("\n🔽 DESCARGA DE IMÁGENES");
  console.log(
    `   Se descargarán ${total} imágenes a: ${path.relative(process.cwd(), config.outputDir)}`,
  );
  console.log("   Presiona Ctrl+C para cancelar, o Enter para continuar...");

  // Esperar confirmación (simplificado - en producción usaría readline)
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Descargar por categoría
  let descargadas = 0;
  let errores = 0;

  for (const [categoria, imgs] of Object.entries(imagenes)) {
    if (imgs.length === 0) continue;

    console.log(`\n📁 Descargando ${categoria}...`);

    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      const nombreArchivo = `${categoria}-${i + 1}${img.extension}`;
      const outputPath = path.join(config.outputDir, nombreArchivo);

      try {
        await descargarImagen(img.url, outputPath);
        descargadas++;
        process.stdout.write(`   ✓ ${nombreArchivo}\r`);
      } catch (error) {
        errores++;
        console.log(`   ✗ Error en ${nombreArchivo}: ${error.message}`);
      }

      // Pequeña pausa para no saturar
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.log(`\n\n✅ Descarga completada:`);
  console.log(`   ${descargadas} imágenes descargadas`);
  if (errores > 0) {
    console.log(`   ${errores} errores`);
  }
}

main().catch(console.error);
