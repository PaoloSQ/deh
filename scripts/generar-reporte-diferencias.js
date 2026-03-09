/**
 * Genera un reporte detallado de diferencias sección por sección
 * Compara el HTML original con el simplificado
 */

const fs = require("fs");
const path = require("path");

const originalPath = path.join(
  __dirname,
  "../descarga/www.dehonline.es/index.html",
);
const simplificadoPath = path.join(
  __dirname,
  "../simplified/src/pages/index.handlebars",
);
const outputPath = path.join(__dirname, "reporte-diferencias.md");

/**
 * Identifica secciones en el HTML
 */
function identificarSecciones(contenido) {
  const secciones = [];

  // Patrones para identificar secciones
  const patterns = [
    { regex: /<section[^>]*class="([^"]*)"[^>]*>/g, type: "section" },
    {
      regex:
        /<div[^>]*class="([^"]*(?:hero|features|servicios|admin|partners|grupos|blog|cta)[^"]*)"[^>]*>/gi,
      type: "div-section",
    },
    { regex: /{{!--\s*([^-]+)\s*--}}/g, type: "comment" },
  ];

  patterns.forEach(({ regex, type }) => {
    let match;
    while ((match = regex.exec(contenido)) !== null) {
      secciones.push({
        type,
        nombre: match[1],
        posicion: match.index,
        contenido: match[0],
      });
    }
  });

  return secciones.sort((a, b) => a.posicion - b.posicion);
}

/**
 * Analiza diferencias estructurales
 */
function analizarDiferencias() {
  console.log("🔍 Generando reporte de diferencias...\n");

  const original = fs.readFileSync(originalPath, "utf-8");
  const simplificado = fs.readFileSync(simplificadoPath, "utf-8");

  const seccionesOriginal = identificarSecciones(original);
  const seccionesSimplificado = identificarSecciones(simplificado);

  let reporte = `# Reporte de Diferencias - Migración DEH Online

**Fecha:** ${new Date().toISOString()}  
**Original:** descarga/www.dehonline.es/index.html  
**Simplificado:** simplified/src/pages/index.handlebars

---

## 📊 Resumen Ejecutivo

- **Secciones en original:** ${seccionesOriginal.length}
- **Secciones en simplificado:** ${seccionesSimplificado.length}
- **Líneas en original:** ${original.split("\n").length}
- **Líneas en simplificado:** ${simplificado.split("\n").length}
- **Reducción de tamaño:** ${((1 - simplificado.length / original.length) * 100).toFixed(1)}%

---

## 🎯 Secciones Identificadas

### En el Original:
${seccionesOriginal
  .slice(0, 20)
  .map((s, i) => `${i + 1}. **${s.type}**: ${s.nombre}`)
  .join("\n")}

### En el Simplificado:
${seccionesSimplificado.map((s, i) => `${i + 1}. **${s.type}**: ${s.nombre}`).join("\n")}

---

## ✅ Checklist de Implementación

### Estructura HTML
- [${simplificado.includes("top-bar") ? "x" : " "}] Top Bar (barra naranja)
- [${simplificado.includes("hero") ? "x" : " "}] Hero Section
- [${simplificado.includes("features") ? "x" : " "}] Features Section
- [${simplificado.includes("servicios") ? "x" : " "}] Grid de Servicios
- [${simplificado.includes("admin-vigiladas") ? "x" : " "}] Administraciones Vigiladas
- [${simplificado.includes("partners") ? "x" : " "}] Partners
- [${simplificado.includes("grupos") ? "x" : " "}] Grupos
- [${simplificado.includes("comunidad") ? "x" : " "}] Comunidad & Blog
- [${simplificado.includes("cta") ? "x" : " "}] CTA Final

### Elementos Críticos
- [${original.includes("Certificados Digitales") && simplificado.includes("Certificados Digitales") ? "x" : " "}] Texto del Hero correcto
- [${simplificado.includes("84.034") ? "x" : " "}] Estadísticas reales
- [${simplificado.includes("Thales") ? "x" : " "}] Partners listados
- [${simplificado.includes("HSM") ? "x" : " "}] Posts del blog

---

## 🎨 Análisis de Estilos

### Colores del Original
${extraerColoresMasUsados(original)
  .map((c) => `- \`${c}\``)
  .join("\n")}

### Fuentes Detectadas
${extraerFuentes(original)
  .map((f) => `- **${f}**`)
  .join("\n")}

---

## 🚀 Próximos Pasos Recomendados

1. **Imágenes**: Extraer y optimizar todas las imágenes del original
2. **Íconos**: Identificar e implementar íconos SVG
3. **Animaciones**: Revisar animaciones y transiciones del original
4. **Responsive**: Verificar breakpoints y comportamiento móvil
5. **JavaScript**: Analizar interactividad (menús, modales, etc.)

---

## 📝 Notas

- El sitio original usa Wix, por lo que tiene mucho código generado automáticamente
- La versión simplificada reduce significativamente la complejidad
- Se mantiene la estructura visual y contenido principal
`;

  fs.writeFileSync(outputPath, reporte, "utf-8");

  console.log(`✅ Reporte generado: ${outputPath}`);
  console.log(`\n📄 Vista previa guardada con:`);
  console.log(`   - ${seccionesOriginal.length} secciones en original`);
  console.log(`   - ${seccionesSimplificado.length} secciones en simplificado`);
}

function extraerColoresMasUsados(contenido) {
  const colores = new Map();
  const regex = /#[0-9a-fA-F]{6}/g;
  let match;

  while ((match = regex.exec(contenido)) !== null) {
    colores.set(match[0], (colores.get(match[0]) || 0) + 1);
  }

  return Array.from(colores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([color]) => color);
}

function extraerFuentes(contenido) {
  const fuentes = new Set();
  const regex = /font-family:\s*["']?([^;"']+)["']?/g;
  let match;

  while ((match = regex.exec(contenido)) !== null) {
    const font = match[1].split(",")[0].trim().replace(/['"]/g, "");
    fuentes.add(font);
  }

  return Array.from(fuentes).slice(0, 5);
}

// Ejecutar
analizarDiferencias();
