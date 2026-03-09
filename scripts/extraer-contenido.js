/**
 * Script para extraer contenido del HTML original de Wix
 * y generar una estructura JSON limpia para usar en la versión simplificada
 */

const fs = require("fs");
const path = require("path");

const ORIGIN_DIR = path.join(__dirname, "../descarga/www.dehonline.es");
const OUTPUT_FILE = path.join(__dirname, "contenido-extraido.json");

// Función simple para extraer texto de tags HTML
function extraerTextoDeTags(html, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, "gi");
  const matches = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    const texto = match[1]
      .trim()
      .replace(/&nbsp;/g, " ")
      .replace(/&aacute;/g, "á")
      .replace(/&eacute;/g, "é")
      .replace(/&iacute;/g, "í")
      .replace(/&oacute;/g, "ó")
      .replace(/&uacute;/g, "ú")
      .replace(/&ntilde;/g, "ñ");
    if (texto.length > 0) {
      matches.push(texto);
    }
  }
  return matches;
}

async function extraerContenidoPagina(htmlPath, pageName) {
  try {
    const html = fs.readFileSync(htmlPath, "utf-8");

    // Extraer título
    const tituloMatch = html.match(/<title>([^<]*)<\/title>/i);
    const titulo = tituloMatch ? tituloMatch[1].trim() : "";

    // Extraer contenido de tags
    const contenido = {
      titulo,
      h1: extraerTextoDeTags(html, "h1"),
      h2: extraerTextoDeTags(html, "h2"),
      h3: extraerTextoDeTags(html, "h3"),
      parrafos: extraerTextoDeTags(html, "p")
        .filter((p) => p.length > 10)
        .slice(0, 30),
    };

    return contenido;
  } catch (error) {
    console.error(`Error procesando ${pageName}:`, error.message);
    return null;
  }
}

async function main() {
  console.log("🔍 Extrayendo contenido del sitio original...\n");

  const paginas = {};
  const archivos = fs
    .readdirSync(ORIGIN_DIR)
    .filter((f) => f.endsWith(".html"));

  for (const archivo of archivos) {
    const pageName = archivo.replace(".html", "");
    const htmlPath = path.join(ORIGIN_DIR, archivo);

    console.log(`📄 Procesando: ${pageName}`);

    const contenido = await extraerContenidoPagina(htmlPath, pageName);

    if (contenido) {
      paginas[pageName] = contenido;
      console.log(
        `   ✓ ${contenido.h1.length} títulos H1, ${contenido.h2.length} títulos H2`,
      );
    }
  }

  // Guardar resultados
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(paginas, null, 2), "utf-8");

  console.log(`\n✅ Contenido extraído y guardado en: ${OUTPUT_FILE}`);
  console.log(`📊 Total de páginas procesadas: ${Object.keys(paginas).length}`);
}

main().catch(console.error);
