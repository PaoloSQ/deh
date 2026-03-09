/**
 * Script para descargar las imágenes catalogadas
 * Lee el catálogo y descarga todas las imágenes con reintentos
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const catalogoPath = path.join(__dirname, "catalogo-imagenes.json");
const resultadosPath = path.join(__dirname, "descarga-imagenes-resultado.json");

/**
 * Descarga una imagen con reintentos
 */
function descargarImagen(url, destino, reintentos = 3) {
  return new Promise((resolve, reject) => {
    // Normalizar URL
    let urlCompleta = url;
    if (url.startsWith("//")) {
      urlCompleta = "https:" + url;
    } else if (!url.startsWith("http")) {
      urlCompleta = "https://" + url;
    }

    const protocolo = urlCompleta.startsWith("https") ? https : http;

    // Asegurar que el directorio existe
    const dir = path.dirname(destino);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

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
        // Seguir redirecciones
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
            console.log(`   ⚠️  Error ${response.statusCode}, reintentando...`);
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

          // Verificar que se descargó algo
          const stats = fs.statSync(destino);
          if (stats.size === 0) {
            fs.unlinkSync(destino);
            reject(new Error("Empty file"));
          } else {
            resolve({
              path: destino,
              size: stats.size,
            });
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
        console.log(`   ⚠️  Error de red, reintentando...`);
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
 * Descarga todas las imágenes del catálogo
 */
async function descargarTodasLasImagenes() {
  console.log("⬇️  DESCARGADOR DE IMÁGENES\n");

  // Leer catálogo
  if (!fs.existsSync(catalogoPath)) {
    console.error("❌ Error: Ejecuta primero extraer-imagenes.js");
    process.exit(1);
  }

  const catalogo = JSON.parse(fs.readFileSync(catalogoPath, "utf-8"));

  console.log(`📦 Catálogo cargado: ${catalogo.totalImagenes} imágenes\n`);

  const resultados = {
    timestamp: new Date().toISOString(),
    total: catalogo.totalImagenes,
    exitosas: 0,
    fallidas: 0,
    imagenes: [],
  };

  // Descargar por categoría
  for (const [categoria, cantidad] of Object.entries(catalogo.porCategoria)) {
    console.log(`\n📁 Categoría: ${categoria} (${cantidad} imágenes)`);
    console.log("─".repeat(50));

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

        // Pequeña pausa para no sobrecargar el servidor
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
  }

  // Guardar resultados
  fs.writeFileSync(resultadosPath, JSON.stringify(resultados, null, 2));

  // Resumen final
  console.log("\n" + "═".repeat(50));
  console.log("📊 RESUMEN DE DESCARGA");
  console.log("═".repeat(50));
  console.log(
    `✅ Exitosas: ${resultados.exitosas} (${((resultados.exitosas / resultados.total) * 100).toFixed(1)}%)`,
  );
  console.log(
    `❌ Fallidas:  ${resultados.fallidas} (${((resultados.fallidas / resultados.total) * 100).toFixed(1)}%)`,
  );

  if (resultados.fallidas > 0) {
    console.log("\n⚠️  Imágenes fallidas:");
    resultados.imagenes
      .filter((i) => !i.descargada)
      .forEach((i) => {
        console.log(`   - ${i.nuevoNombre}: ${i.error}`);
      });
  }

  console.log(`\n💾 Resultados guardados en: ${resultadosPath}`);

  // Estadísticas de tamaño
  const tamanioTotal = resultados.imagenes
    .filter((i) => i.descargada)
    .reduce((sum, i) => sum + i.tamanio, 0);

  console.log(
    `📦 Tamaño total descargado: ${(tamanioTotal / 1024 / 1024).toFixed(2)} MB`,
  );

  console.log("\n✅ Proceso completado!");
}

// Ejecutar
descargarTodasLasImagenes().catch(console.error);
