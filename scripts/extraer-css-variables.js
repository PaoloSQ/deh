/**
 * Script para extraer variables CSS del sitio original
 * Genera automáticamente un archivo de variables CSS
 */

const fs = require("fs");
const path = require("path");

const indexPath = path.join(
  __dirname,
  "../descarga/www.dehonline.es/index.html",
);
const outputPath = path.join(
  __dirname,
  "../simplified/public/css/variables-auto.css",
);

/**
 * Extrae colores únicos y sus usos
 */
function extraerColores(contenido) {
  const colores = new Map();

  // Patrones de colores
  const patterns = [
    /color:\s*(#[0-9a-fA-F]{3,6})/g,
    /background(?:-color)?:\s*(#[0-9a-fA-F]{3,6})/g,
    /border(?:-color)?:\s*[^;]*(#[0-9a-fA-F]{3,6})/g,
    /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/g,
  ];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(contenido)) !== null) {
      let color = match[1];
      if (match[2] && match[3]) {
        // Es rgb/rgba
        color = `rgb(${match[1]}, ${match[2]}, ${match[3]})`;
      }
      colores.set(color, (colores.get(color) || 0) + 1);
    }
  });

  return Array.from(colores.entries())
    .sort((a, b) => b[1] - a[1]) // Ordenar por frecuencia
    .map(([color]) => color);
}

/**
 * Extrae fuentes y sus pesos
 */
function extraerFuentes(contenido) {
  const fuentes = new Set();

  const fontFamilyRegex = /font-family:\s*["']?([^;"']+)["']?/g;
  let match;

  while ((match = fontFamilyRegex.exec(contenido)) !== null) {
    const font = match[1].trim().split(",")[0].replace(/['"]/g, "");
    fuentes.add(font);
  }

  return Array.from(fuentes);
}

/**
 * Extrae tamaños de fuente comunes
 */
function extraerFontSizes(contenido) {
  const sizes = new Map();

  const fontSizeRegex = /font-size:\s*(\d+(?:\.\d+)?(?:px|rem|em))/g;
  let match;

  while ((match = fontSizeRegex.exec(contenido)) !== null) {
    const size = match[1];
    sizes.set(size, (sizes.get(size) || 0) + 1);
  }

  return Array.from(sizes.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([size]) => size)
    .slice(0, 10); // Top 10 tamaños
}

/**
 * Extrae espaciados comunes (padding, margin)
 */
function extraerEspaciados(contenido) {
  const espaciados = new Set();

  const patterns = [
    /(?:padding|margin):\s*(\d+(?:px|rem|em))/g,
    /(?:padding|margin)-(?:top|bottom|left|right):\s*(\d+(?:px|rem|em))/g,
  ];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(contenido)) !== null) {
      espaciados.add(match[1]);
    }
  });

  return Array.from(espaciados)
    .sort((a, b) => parseInt(a) - parseInt(b))
    .slice(0, 15);
}

/**
 * Genera el archivo CSS de variables
 */
function generarCSSVariables() {
  console.log("🎨 Extrayendo variables CSS del sitio original...\n");

  const contenido = fs.readFileSync(indexPath, "utf-8");

  const colores = extraerColores(contenido);
  const fuentes = extraerFuentes(contenido);
  const fontSizes = extraerFontSizes(contenido);
  const espaciados = extraerEspaciados(contenido);

  console.log(`✓ ${colores.length} colores encontrados`);
  console.log(`✓ ${fuentes.length} fuentes encontradas`);
  console.log(`✓ ${fontSizes.length} tamaños de fuente`);
  console.log(`✓ ${espaciados.length} valores de espaciado\n`);

  // Generar CSS
  let css = `/**
 * Variables CSS extraídas automáticamente del sitio original
 * Generado: ${new Date().toISOString()}
 */

:root {
  /* === COLORES === */
`;

  // Asignar nombres a colores principales
  const colorMap = {
    0: "primary",
    1: "secondary",
    2: "accent",
    3: "dark",
    4: "light",
    5: "text-primary",
    6: "text-secondary",
    7: "border",
    8: "background",
  };

  colores.slice(0, 15).forEach((color, i) => {
    const nombre = colorMap[i] || `color-${i + 1}`;
    css += `  --${nombre}: ${color};\n`;
  });

  // Fuentes
  css += `\n  /* === FUENTES === */\n`;
  fuentes.forEach((fuente, i) => {
    const nombre = fuente
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    css += `  --font-${nombre}: '${fuente}', sans-serif;\n`;
  });

  // Tamaños de fuente
  css += `\n  /* === TAMAÑOS DE FUENTE === */\n`;
  fontSizes.forEach((size, i) => {
    css += `  --font-size-${i + 1}: ${size};\n`;
  });

  // Espaciados
  css += `\n  /* === ESPACIADOS === */\n`;
  espaciados.forEach((spacing, i) => {
    css += `  --spacing-${i + 1}: ${spacing};\n`;
  });

  css += "}\n";

  // Guardar archivo
  fs.writeFileSync(outputPath, css, "utf-8");

  console.log(`✅ Variables CSS generadas`);
  console.log(`📄 Archivo: ${outputPath}`);

  return {
    colores,
    fuentes,
    fontSizes,
    espaciados,
  };
}

// Ejecutar
const variables = generarCSSVariables();

// Mostrar resumen
console.log("\n📊 RESUMEN DE VARIABLES:");
console.log("\nColores principales:");
variables.colores
  .slice(0, 5)
  .forEach((c, i) => console.log(`  ${i + 1}. ${c}`));

console.log("\nFuentes:");
variables.fuentes.forEach((f) => console.log(`  - ${f}`));
