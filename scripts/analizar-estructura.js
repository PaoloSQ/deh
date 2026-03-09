/**
 * Script para analizar la estructura HTML del sitio original
 * Genera un reporte detallado de secciones, clases y estructura
 */

const fs = require("fs");
const path = require("path");

// Configuración
const baseDir = path.join(__dirname, "../descarga/www.dehonline.es");
const outputFile = path.join(__dirname, "estructura-analizada.json");

/**
 * Analiza un archivo HTML y extrae su estructura
 */
function analizarHTML(contenido, nombreArchivo) {
  const estructura = {
    archivo: nombreArchivo,
    secciones: [],
    clases: new Set(),
    ids: new Set(),
    tags: {},
  };

  // Extraer secciones principales (divs con ID o clases principales)
  const seccionesRegex =
    /<(section|div|header|footer|nav|article|aside)[^>]*(?:id|class)="([^"]+)"[^>]*>/g;
  let match;

  while ((match = seccionesRegex.exec(contenido)) !== null) {
    const tag = match[1];
    const atributo = match[2];

    estructura.secciones.push({
      tag,
      atributo,
      posicion: match.index,
    });
  }

  // Extraer todas las clases únicas
  const clasesRegex = /class="([^"]+)"/g;
  while ((match = clasesRegex.exec(contenido)) !== null) {
    const clases = match[1].split(" ").filter((c) => c.trim());
    clases.forEach((c) => estructura.clases.add(c));
  }

  // Extraer todos los IDs únicos
  const idsRegex = /id="([^"]+)"/g;
  while ((match = idsRegex.exec(contenido)) !== null) {
    estructura.ids.add(match[1]);
  }

  // Contar tags
  const tagsRegex = /<(\w+)[\s>]/g;
  while ((match = tagsRegex.exec(contenido)) !== null) {
    const tag = match[1].toLowerCase();
    estructura.tags[tag] = (estructura.tags[tag] || 0) + 1;
  }

  // Convertir Sets a Arrays para JSON
  estructura.clases = Array.from(estructura.clases);
  estructura.ids = Array.from(estructura.ids);

  return estructura;
}

/**
 * Analiza estilos inline y extrae valores comunes
 */
function extraerEstilosComunes(contenido) {
  const estilos = {
    colores: new Set(),
    fontSizes: new Set(),
    fontFamilies: new Set(),
    backgrounds: new Set(),
  };

  // Extraer colores (hex, rgb, rgba)
  const coloresRegex = /(#[0-9a-fA-F]{3,6}|rgba?\([^)]+\))/g;
  let match;
  while ((match = coloresRegex.exec(contenido)) !== null) {
    estilos.colores.add(match[1]);
  }

  // Extraer font-size
  const fontSizeRegex = /font-size:\s*([^;}"']+)/g;
  while ((match = fontSizeRegex.exec(contenido)) !== null) {
    estilos.fontSizes.add(match[1].trim());
  }

  // Extraer font-family
  const fontFamilyRegex = /font-family:\s*([^;}"']+)/g;
  while ((match = fontFamilyRegex.exec(contenido)) !== null) {
    estilos.fontFamilies.add(match[1].trim());
  }

  // Extraer backgrounds
  const backgroundRegex = /background(?:-color)?:\s*([^;}"']+)/g;
  while ((match = backgroundRegex.exec(contenido)) !== null) {
    estilos.backgrounds.add(match[1].trim());
  }

  return {
    colores: Array.from(estilos.colores).slice(0, 20), // Top 20
    fontSizes: Array.from(estilos.fontSizes).slice(0, 15),
    fontFamilies: Array.from(estilos.fontFamilies),
    backgrounds: Array.from(estilos.backgrounds).slice(0, 15),
  };
}

/**
 * Analiza todas las páginas HTML
 */
function analizarTodasLasPaginas() {
  const archivos = fs.readdirSync(baseDir).filter((f) => f.endsWith(".html"));

  const resultados = {
    timestamp: new Date().toISOString(),
    totalPaginas: archivos.length,
    paginas: {},
    estilosGlobales: null,
  };

  console.log(`📊 Analizando ${archivos.length} páginas HTML...\n`);

  archivos.forEach((archivo, index) => {
    const rutaCompleta = path.join(baseDir, archivo);
    const contenido = fs.readFileSync(rutaCompleta, "utf-8");

    console.log(`[${index + 1}/${archivos.length}] ${archivo}`);

    const estructura = analizarHTML(contenido, archivo);
    const estilos = extraerEstilosComunes(contenido);

    resultados.paginas[archivo] = {
      estructura,
      estilos,
      tamanio: contenido.length,
    };
  });

  // Extraer estilos del index como referencia global
  const indexPath = path.join(baseDir, "index.html");
  if (fs.existsSync(indexPath)) {
    const contenidoIndex = fs.readFileSync(indexPath, "utf-8");
    resultados.estilosGlobales = extraerEstilosComunes(contenidoIndex);
  }

  // Guardar resultados
  fs.writeFileSync(outputFile, JSON.stringify(resultados, null, 2), "utf-8");

  console.log(`\n✅ Análisis completado`);
  console.log(`📄 Reporte guardado en: ${outputFile}`);
  console.log(`\n📈 Estadísticas:`);
  console.log(`   - Páginas analizadas: ${archivos.length}`);
  console.log(
    `   - Clases únicas (index): ${resultados.paginas["index.html"]?.estructura.clases.length || 0}`,
  );
  console.log(
    `   - IDs únicos (index): ${resultados.paginas["index.html"]?.estructura.ids.length || 0}`,
  );
  console.log(
    `   - Colores detectados: ${resultados.estilosGlobales?.colores.length || 0}`,
  );
}

// Ejecutar
analizarTodasLasPaginas();
