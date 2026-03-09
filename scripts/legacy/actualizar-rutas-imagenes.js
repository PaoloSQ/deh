/**
 * Script para actualizar las rutas de imágenes en los archivos Handlebars
 * Reemplaza las URLs de Wix por las rutas locales
 */

const fs = require("fs");
const path = require("path");

const catalogoPath = path.join(__dirname, "catalogo-imagenes.json");
const resultadosPath = path.join(__dirname, "descarga-imagenes-resultado.json");
const simplifiedDir = path.join(__dirname, "../simplified/src/pages");
const reportePath = path.join(__dirname, "actualizacion-rutas-reporte.md");

/**
 * Genera el mapa de reemplazos
 */
function generarMapaReemplazos() {
  if (!fs.existsSync(resultadosPath)) {
    console.error("❌ Error: Ejecuta primero descargar-imagenes.js");
    process.exit(1);
  }

  const resultados = JSON.parse(fs.readFileSync(resultadosPath, "utf-8"));
  const mapa = new Map();

  resultados.imagenes
    .filter((i) => i.descargada)
    .forEach((img) => {
      // Convertir ruta absoluta a relativa desde /public
      const rutaRelativa = img.rutaDestino
        .replace(/.*\/public/, "")
        .replace(/\\/g, "/");

      mapa.set(img.urlOriginal, rutaRelativa);
    });

  return mapa;
}

/**
 * Actualiza las rutas en un archivo
 */
function actualizarArchivo(rutaArchivo, mapaReemplazos) {
  let contenido = fs.readFileSync(rutaArchivo, "utf-8");
  let cambios = 0;
  const reemplazos = [];

  mapaReemplazos.forEach((nuevaRuta, urlOriginal) => {
    // Escapar caracteres especiales para regex
    const urlEscapada = urlOriginal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(urlEscapada, "g");

    if (regex.test(contenido)) {
      contenido = contenido.replace(regex, nuevaRuta);
      cambios++;
      reemplazos.push({ original: urlOriginal, nueva: nuevaRuta });
    }
  });

  if (cambios > 0) {
    fs.writeFileSync(rutaArchivo, contenido, "utf-8");
  }

  return { cambios, reemplazos };
}

/**
 * Genera reporte de actualización
 */
function generarReporte(resultados) {
  let reporte = `# Reporte de Actualización de Rutas de Imágenes

**Fecha:** ${new Date().toISOString()}

---

## 📊 Resumen

- **Archivos actualizados:** ${resultados.archivosActualizados}
- **Total de reemplazos:** ${resultados.totalReemplazos}
- **Imágenes vinculadas:** ${resultados.imagenesVinculadas}

---

## 📝 Detalles por Archivo

${resultados.detalles
  .map(
    (d) => `
### ${d.archivo}

**Cambios:** ${d.cambios}

${d.reemplazos
  .map(
    (r) => `- \`${r.original}\`  
  → \`${r.nueva}\``,
  )
  .join("\n")}
`,
  )
  .join("\n")}

---

## ✅ Próximos Pasos

1. Verificar que las imágenes se muestran correctamente
2. Optimizar imágenes si es necesario (comprimir, webp, etc.)
3. Añadir atributos alt descriptivos
4. Implementar lazy loading si corresponde
`;

  return reporte;
}

/**
 * Proceso principal
 */
function actualizarRutasImagenes() {
  console.log("🔄 ACTUALIZADOR DE RUTAS DE IMÁGENES\n");

  const mapaReemplazos = generarMapaReemplazos();
  console.log(
    `📋 Mapa de reemplazos generado: ${mapaReemplazos.size} imágenes\n`,
  );

  // Buscar archivos Handlebars
  const archivos = fs
    .readdirSync(simplifiedDir)
    .filter((f) => f.endsWith(".handlebars"))
    .map((f) => path.join(simplifiedDir, f));

  console.log(`📁 Archivos a procesar: ${archivos.length}\n`);

  const resultados = {
    archivosActualizados: 0,
    totalReemplazos: 0,
    imagenesVinculadas: 0,
    detalles: [],
  };

  archivos.forEach((archivo) => {
    const nombre = path.basename(archivo);
    process.stdout.write(`Procesando ${nombre}... `);

    const resultado = actualizarArchivo(archivo, mapaReemplazos);

    if (resultado.cambios > 0) {
      console.log(`✓ ${resultado.cambios} cambios`);
      resultados.archivosActualizados++;
      resultados.totalReemplazos += resultado.cambios;
      resultados.imagenesVinculadas += resultado.reemplazos.length;

      resultados.detalles.push({
        archivo: nombre,
        cambios: resultado.cambios,
        reemplazos: resultado.reemplazos,
      });
    } else {
      console.log("○ sin cambios");
    }
  });

  // Generar reporte
  const reporte = generarReporte(resultados);
  fs.writeFileSync(reportePath, reporte);

  console.log("\n" + "═".repeat(50));
  console.log("📊 RESUMEN");
  console.log("═".repeat(50));
  console.log(`✅ Archivos actualizados: ${resultados.archivosActualizados}`);
  console.log(`🔄 Total de reemplazos: ${resultados.totalReemplazos}`);
  console.log(`🖼️  Imágenes vinculadas: ${resultados.imagenesVinculadas}`);
  console.log(`\n📄 Reporte: ${reportePath}`);
}

// Ejecutar
actualizarRutasImagenes();
