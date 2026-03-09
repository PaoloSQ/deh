/**
 * Script para analizar imágenes de una página específica
 * Solo CATALOGA las imágenes encontradas, sin descargar
 */

const fs = require("fs");
const path = require("path");

// Obtener nombre de página
const nombrePagina = process.argv[2] || "index";
const archivoHTML = nombrePagina.endsWith(".html")
  ? nombrePagina
  : `${nombrePagina}.html`;

// Configuración
const baseDir = path.join(__dirname, "../descarga/www.dehonline.es");
const outputJson = path.join(__dirname, `imagenes-${nombrePagina}.json`);

console.log(`\n🔍 ANALIZADOR DE IMÁGENES - ${nombrePagina.toUpperCase()}\n`);

// Verificar archivo
const rutaArchivo = path.join(baseDir, archivoHTML);
if (!fs.existsSync(rutaArchivo)) {
  console.error(`❌ No se encuentra: ${archivoHTML}`);
  process.exit(1);
}

// Leer HTML
const contenido = fs.readFileSync(rutaArchivo, "utf-8");

// Extraer URLs de imágenes
const imagenes = new Set();

// Patrones para encontrar imágenes
const patterns = [
  /<img[^>]+src=["']([^"']+)["']/gi,
  /background(?:-image)?:\s*url\(["']?([^"')]+)["']?\)/gi,
  /srcset=["']([^"']+)["']/gi,
  /data-src=["']([^"']+)["']/gi,
  /https?:\/\/static\.wixstatic\.com\/media\/[^\s"'<>)]+\.(?:jpg|jpeg|png|gif|svg|webp)/gi,
];

patterns.forEach((pattern) => {
  let match;
  const regex = new RegExp(pattern);
  const content = contenido;

  while ((match = regex.exec(content)) !== null) {
    let url = match[1] || match[0];
    if (!url) continue;

    // Limpiar URL
    url = url.split(" ")[0].split(",")[0].trim();

    // Solo imágenes válidas
    if (url.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)($|\?)/i)) {
      // Normalizar URL
      if (url.startsWith("//")) url = "https:" + url;
      else if (url.startsWith("/")) url = "https://www.dehonline.es" + url;

      imagenes.add(url);
    }
  }
});

console.log(`✓ ${imagenes.length} imágenes encontradas\n`);

// Agrupar por tipo
const porTipo = {
  wixstatic: [],
  parastorage: [],
  local: [],
  otro: [],
};

Array.from(imagenes).forEach((url) => {
  if (url.includes("static.wixstatic.com")) {
    porTipo.wixstatic.push(url);
  } else if (url.includes("parastorage.com")) {
    porTipo.parastorage.push(url);
  } else if (
    url.startsWith("https://www.dehonline.es") ||
    url.startsWith("/")
  ) {
    porTipo.local.push(url);
  } else {
    porTipo.otro.push(url);
  }
});

// Mostrar distribución
console.log("📦 Distribución por fuente:");
Object.entries(porTipo).forEach(([tipo, urls]) => {
  if (urls.length > 0) {
    console.log(`   ${tipo}: ${urls.length} imágenes`);
  }
});

// Generar catálogo
const catalogo = {
  pagina: nombrePagina,
  archivo: archivoHTML,
  timestamp: new Date().toISOString(),
  total: imagenes.size,
  imagenes: Array.from(imagenes).map((url, idx) => ({
    id: idx + 1,
    url,
    extension: path.extname(url.split("?")[0]),
  })),
};

// Guardar
fs.writeFileSync(outputJson, JSON.stringify(catalogo, null, 2));

console.log(`\n💾 Catálogo guardado: ${path.basename(outputJson)}`);
console.log("\n📋 Primeras 10 imágenes:");
catalogo.imagenes.slice(0, 10).forEach((img) => {
  console.log(`   [${img.id}] ${img.url.substring(0, 80)}...`);
});

if (catalogo.total > 10) {
  console.log(`   ... y ${catalogo.total - 10} más`);
}

console.log("\n✅ Análisis completado");
console.log(
  `\n💡 Revisa ${path.basename(outputJson)} para ver todas las imágenes`,
);
