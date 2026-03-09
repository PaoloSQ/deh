/**
 * Script simplificado para extraer y catalogar imágenes de UNA página
 * Solo ANALIZA, no descarga. Te mostrará qué imágenes hay para que decidas.
 */

const fs = require("fs");
const path = require("path");

// Obtener nombre de página de argumentos
const nombrePagina = process.argv[2] || "index";
const archivoHTML = nombrePagina.endsWith(".html")
  ? nombrePagina
  : `${nombrePagina}.html`;

// Configuración
const baseDir = path.join(__dirname, "../descarga/www.dehonline.es");
const catalogoPath = path.join(__dirname, `imagenes-${nombrePagina}.json`);

// Estructura de carpetas
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

  const patterns = [
    /<img[^>]+src=["']([^"']+)["']/gi,
    /background-image:\s*url\(["']?([^"')]+)["']?\)/gi,
    /srcset=["']([^"']+)["']/gi,
    /data-src=["']([^"']+)["']/gi,
    /image:\(["']?([^"')]+)["']?\)/gi,
    /https?:\/\/static\.wixstatic\.com\/[^\s"'<>)]+/gi,
    /https?:\/\/static\.parastorage\.com\/[^\s"'<>)]+/gi,
  ];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(contenido)) !== null) {
      let url = match[1] || match[0];
      if (!url || typeof url !== "string") continue;

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
 * Determina categoría de la imagen
 */
function determinarCategoria(url, nombreArchivo) {
  const urlLower = url.toLowerCase();
  const archivo = nombreArchivo.toLowerCase();

  if (urlLower.includes("logo") || urlLower.includes("brand")) return "logos";
  if (
    urlLower.includes("partner") ||
    urlLower.includes("thales") ||
    urlLower.includes("azure") ||
    urlLower.includes("aws") ||
    urlLower.includes("uanataca") ||
    urlLower.includes("camerfirma")
  )
    return "partners";
  if (
    urlLower.includes("icon") ||
    urlLower.includes("ico") ||
    urlLower.match(/\d+x\d+/) ||
    urlLower.includes("favicon")
  )
    return "icons";
  if (
    archivo.includes("blog") ||
    urlLower.includes("blog") ||
    urlLower.includes("post")
  )
    return "blog";
  if (
    urlLower.includes("hero") ||
    urlLower.includes("mockup") ||
    urlLower.includes("laptop") ||
    urlLower.includes("banner")
  )
    return "hero";
  if (
    urlLower.includes("background") ||
    urlLower.includes("bg-") ||
    urlLower.includes("pattern")
  )
    return "backgrounds";
  if (
    archivo.includes("servicio") ||
    archivo.includes("certibox") ||
    archivo.includes("documbox") ||
    archivo.includes("lexbox") ||
    archivo.includes("tsa")
  )
    return "servicios";
  if (archivo === "index.html") return "hero";
  if (archivo.includes("contacto")) return "ui";

  return "common";
}

/**
 * Genera nombre descriptivo
 */
function generarNombreDescriptivo(url, categoria, index) {
  const extension = path.extname(url).split("?")[0] || ".jpg";
  const urlParts = url.split("/");
  const fileName = urlParts[urlParts.length - 1].split("?")[0];

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
    return fileName.split("?")[0];
  }

  let nuevoNombre = "";

  switch (categoria) {
    case "logos":
      nuevoNombre = `logo-${index}${extension}`;
      break;
    case "partners":
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
function descargarImagen(url, destino, reintentos = 3) {
  return new Promise((resolve, reject) => {
    let urlCompleta = url;
    if (url.startsWith("//")) urlCompleta = "https:" + url;
    else if (!url.startsWith("http")) urlCompleta = "https://" + url;

    const protocolo = urlCompleta.startsWith("https") ? https : http;
    const dir = path.dirname(destino);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const file = fs.createWriteStream(destino);

    const request = protocolo.get(
      urlCompleta,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      },
      (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          file.close();
          fs.unlinkSync(destino);
          return descargarImagen(response.headers.location, destino, reintentos)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          if (fs.existsSync(destino)) fs.unlinkSync(destino);
          if (reintentos > 0) {
            setTimeout(() => {
              descargarImagen(url, destino, reintentos - 1)
                .then(resolve)
                .catch(reject);
            }, 1000);
          } else {
            reject(new Error(`Failed: ${response.statusCode}`));
          }
          return;
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          const stats = fs.statSync(destino);
          if (stats.size === 0) {
            fs.unlinkSync(destino);
            reject(new Error("Empty file"));
          } else {
            resolve({ path: destino, size: stats.size });
          }
        });

        file.on("error", (err) => {
          file.close();
          if (fs.existsSync(destino)) fs.unlinkSync(destino);
          reject(err);
        });
      },
    );

    request.on("error", (err) => {
      file.close();
      if (fs.existsSync(destino)) fs.unlinkSync(destino);
      if (reintentos > 0) {
        setTimeout(() => {
          descargarImagen(url, destino, reintentos - 1)
            .then(resolve)
            .catch(reject);
        }, 1000);
      } else {
        reject(err);
      }
    });

    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error("Timeout"));
    });
  });
}

/**
 * Actualiza rutas en archivo Handlebars
 */
function actualizarRutasEnHandlebars(nombrePagina, mapaReemplazos) {
  const handlebarsFile = path.join(
    __dirname,
    `../simplified/src/pages/${nombrePagina}.handlebars`,
  );

  if (!fs.existsSync(handlebarsFile)) {
    console.log(
      `⚠️  Archivo ${nombrePagina}.handlebars no existe, saltando actualización...`,
    );
    return { cambios: 0, reemplazos: [] };
  }

  let contenido = fs.readFileSync(handlebarsFile, "utf-8");
  let cambios = 0;
  const reemplazos = [];

  mapaReemplazos.forEach((nuevaRuta, urlOriginal) => {
    const urlEscapada = urlOriginal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(urlEscapada, "g");

    if (regex.test(contenido)) {
      contenido = contenido.replace(regex, nuevaRuta);
      cambios++;
      reemplazos.push({ original: urlOriginal, nueva: nuevaRuta });
    }
  });

  if (cambios > 0) {
    fs.writeFileSync(handlebarsFile, contenido, "utf-8");
  }

  return { cambios, reemplazos };
}

/**
 * Proceso principal
 */
async function procesarPagina() {
  console.log(`🖼️  EXTRACTOR DE IMÁGENES - ${nombrePagina.toUpperCase()}\n`);

  // Verificar que existe el archivo
  const rutaArchivo = path.join(baseDir, archivoHTML);
  if (!fs.existsSync(rutaArchivo)) {
    console.error(`❌ Error: No se encuentra ${archivoHTML}`);
    console.log(`\nArchivos disponibles:`);
    fs.readdirSync(baseDir)
      .filter((f) => f.endsWith(".html"))
      .forEach((f) => console.log(`   - ${f}`));
    process.exit(1);
  }

  // Crear carpetas
  console.log("📁 Creando estructura de carpetas...");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  Object.values(carpetas).forEach((carpeta) => {
    if (!fs.existsSync(carpeta)) fs.mkdirSync(carpeta, { recursive: true });
  });
  console.log("✓ Carpetas creadas\n");

  // FASE 1: Extraer y catalogar
  console.log("📋 FASE 1: Extrayendo imágenes...\n");
  const contenido = fs.readFileSync(rutaArchivo, "utf-8");
  const imagenesURL = extraerImagenesDeHTML(contenido, archivoHTML);

  console.log(`✓ ${imagenesURL.length} imágenes encontradas\n`);

  // Agrupar por categoría
  const porCategoria = {};
  const catalogo = {
    timestamp: new Date().toISOString(),
    pagina: nombrePagina,
    archivo: archivoHTML,
    totalImagenes: imagenesURL.length,
    porCategoria: {},
    imagenes: [],
  };

  imagenesURL.forEach((url) => {
    const categoria = determinarCategoria(url, archivoHTML);
    if (!porCategoria[categoria]) porCategoria[categoria] = [];
    porCategoria[categoria].push(url);
  });

  console.log("📦 Distribución por categoría:");
  Object.entries(porCategoria).forEach(([cat, imgs]) => {
    console.log(`   ${cat}: ${imgs.length} imágenes`);
    catalogo.porCategoria[cat] = imgs.length;
  });

  // Generar catálogo
  Object.entries(porCategoria).forEach(([categoria, imagenes]) => {
    imagenes.forEach((url, index) => {
      const nuevoNombre = generarNombreDescriptivo(url, categoria, index + 1);
      const rutaDestino = path.join(carpetas[categoria], nuevoNombre);

      catalogo.imagenes.push({
        urlOriginal: url,
        categoria,
        nuevoNombre,
        rutaDestino: rutaDestino.replace(/\\/g, "/"),
      });
    });
  });

  fs.writeFileSync(catalogoPath, JSON.stringify(catalogo, null, 2));
  console.log(`\n💾 Catálogo guardado: ${path.basename(catalogoPath)}\n`);

  // FASE 2: Descargar
  console.log("⬇️  FASE 2: Descargando imágenes...\n");

  const resultados = {
    timestamp: new Date().toISOString(),
    pagina: nombrePagina,
    total: catalogo.totalImagenes,
    exitosas: 0,
    fallidas: 0,
    imagenes: [],
  };

  for (const [categoria, cantidad] of Object.entries(catalogo.porCategoria)) {
    console.log(`📁 ${categoria} (${cantidad} imágenes)`);
    const imagenesCategoria = catalogo.imagenes.filter(
      (i) => i.categoria === categoria,
    );

    for (let i = 0; i < imagenesCategoria.length; i++) {
      const img = imagenesCategoria[i];
      const progreso = `[${i + 1}/${imagenesCategoria.length}]`;

      try {
        process.stdout.write(`${progreso} ${img.nuevoNombre}... `);

        const resultado = await descargarImagen(
          img.urlOriginal,
          img.rutaDestino.replace(/\//g, path.sep),
        );

        console.log(`✓ (${(resultado.size / 1024).toFixed(1)} KB)`);

        resultados.exitosas++;
        resultados.imagenes.push({
          ...img,
          descargada: true,
          tamanio: resultado.size,
          error: null,
        });

        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.log(`✗ ${error.message}`);
        resultados.fallidas++;
        resultados.imagenes.push({
          ...img,
          descargada: false,
          tamanio: 0,
          error: error.message,
        });
      }
    }
    console.log("");
  }

  fs.writeFileSync(resultadosPath, JSON.stringify(resultados, null, 2));

  // FASE 3: Actualizar rutas
  console.log("🔄 FASE 3: Actualizando rutas en Handlebars...\n");

  const mapaReemplazos = new Map();
  resultados.imagenes
    .filter((i) => i.descargada)
    .forEach((img) => {
      const rutaRelativa = img.rutaDestino
        .replace(/.*\/public/, "")
        .replace(/\\/g, "/");
      mapaReemplazos.set(img.urlOriginal, rutaRelativa);
    });

  const actualizacion = actualizarRutasEnHandlebars(
    nombrePagina,
    mapaReemplazos,
  );

  if (actualizacion.cambios > 0) {
    console.log(
      `✓ ${actualizacion.cambios} rutas actualizadas en ${nombrePagina}.handlebars`,
    );
  } else {
    console.log(`○ No hay rutas que actualizar en ${nombrePagina}.handlebars`);
  }

  // RESUMEN FINAL
  console.log("\n" + "═".repeat(60));
  console.log("📊 RESUMEN COMPLETO");
  console.log("═".repeat(60));
  console.log(`📄 Página: ${nombrePagina} (${archivoHTML})`);
  console.log(`🖼️  Imágenes totales: ${resultados.total}`);
  console.log(
    `✅ Descargadas: ${resultados.exitosas} (${((resultados.exitosas / resultados.total) * 100).toFixed(1)}%)`,
  );
  console.log(`❌ Fallidas: ${resultados.fallidas}`);
  console.log(`🔄 Rutas actualizadas: ${actualizacion.cambios}`);

  const tamanioTotal = resultados.imagenes
    .filter((i) => i.descargada)
    .reduce((sum, i) => sum + i.tamanio, 0);
  console.log(
    `📦 Tamaño descargado: ${(tamanioTotal / 1024 / 1024).toFixed(2)} MB`,
  );

  console.log(`\n💾 Archivos generados:`);
  console.log(`   - ${path.basename(catalogoPath)}`);
  console.log(`   - ${path.basename(resultadosPath)}`);
  console.log(`   - Imágenes en: simplified/public/img/`);

  if (resultados.fallidas > 0) {
    console.log(`\n⚠️  Imágenes fallidas:`);
    resultados.imagenes
      .filter((i) => !i.descargada)
      .slice(0, 5)
      .forEach((i) => console.log(`   - ${i.nuevoNombre}: ${i.error}`));
    if (resultados.fallidas > 5) {
      console.log(`   ... y ${resultados.fallidas - 5} más`);
    }
  }

  console.log("\n✅ Proceso completado!\n");
  console.log(`💡 Tip: Para procesar otra página usa:`);
  console.log(`   node extraer-imagenes-pagina.js blog`);
  console.log(`   node extraer-imagenes-pagina.js certibox`);
}

// Ejecutar
procesarPagina().catch(console.error);
