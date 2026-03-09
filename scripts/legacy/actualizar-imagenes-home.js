/**
 * ACTUALIZADOR DE IMÁGENES - HOME PAGE
 *
 * Reemplaza los placeholders CSS por <img> tags reales
 * usando las imágenes descargadas
 */

const fs = require("fs");
const path = require("path");

const config = {
  handlebarsPath: path.join(
    __dirname,
    "../simplified/src/pages/index.handlebars",
  ),
  backupPath: path.join(
    __dirname,
    "../simplified/src/pages/index.handlebars.backup",
  ),
};

// Mapeo de imágenes conocidas
const imagenes = {
  stats: {
    administradores: "stats-1.png", // +1.956 Administradores
    comunidades: "stats-2.png", // +84.034 Comunidades
    autonomos: "stats-3.png", // +209.597 Autónomos
    pymes: "stats-4.png", // +79.659 PYMEs
  },
  partners: {
    thales: "partners-1.png",
    azure: "partners-2.png",
    // Los otros 4 están en "otros", necesitamos buscarlos manualmente
  },
  servicios: {
    certibox: "servicios-1.png",
    lexbox: "servicios-2.png",
    documbox: "servicios-3.jpg",
  },
  integraciones: {
    dehu: "integraciones-1.jpg",
    dgt: "integraciones-2.jpg",
    agencia: "integraciones-3.jpg",
  },
  hero: {
    // Las imágenes del hero probablemente están en "otros"
    mockup: "otros-7.jpg", // Hay que identificarlas manualmente
  },
};

function actualizarHTML() {
  console.log("\n🔄 ACTUALIZADOR DE IMÁGENES\n");

  // Hacer backup
  let html = fs.readFileSync(config.handlebarsPath, "utf-8");
  fs.writeFileSync(config.backupPath, html);
  console.log("✓ Backup creado");

  let cambios = 0;

  // 1. Hero section - reemplazar mockup placeholders
  html = html.replace(/<div class="laptop-mockup"><\/div>/g, (match) => {
    cambios++;
    return '<img src="/img/home/hero/laptop-screen.jpg" alt="DEH Online Platform" class="laptop-mockup">';
  });

  // 2. Stats icons - agregar imágenes a los iconos
  const statsReemplazos = [
    {
      buscar: '<div class="stat-card">',
      reemplazar: (match, offset) => {
        // Detectar cuál stat es por el contenido siguiente
        const siguiente = html.substring(offset, offset + 300);
        let icon = "";

        if (
          siguiente.includes("1.956") ||
          siguiente.includes("Administradores")
        ) {
          icon = imagenes.stats.administradores;
        } else if (
          siguiente.includes("84.034") ||
          siguiente.includes("Comunidades")
        ) {
          icon = imagenes.stats.comunidades;
        } else if (
          siguiente.includes("209.597") ||
          siguiente.includes("Autónomos")
        ) {
          icon = imagenes.stats.autonomos;
        } else if (
          siguiente.includes("79.659") ||
          siguiente.includes("PYMEs")
        ) {
          icon = imagenes.stats.pymes;
        }

        if (icon) {
          cambios++;
          return `<div class="stat-card"><img src="/img/home/${icon}" alt="Icon" class="stat-icon">`;
        }
        return match;
      },
    },
  ];

  // 3. Partners - reemplazar divs con texto por imágenes
  const partnersMap = {
    Thales: { img: "partners-1.png", alt: "Thales" },
    "Microsoft Azure": { img: "partners-2.png", alt: "Microsoft Azure" },
    AWS: { img: "partners/aws.png", alt: "AWS" }, // Buscar en otros
    Uanataca: { img: "partners/uanataca.png", alt: "Uanataca" },
    Camerfirma: { img: "partners/camerfirma.png", alt: "Camerfirma" },
    Bilky: { img: "partners/bilky.png", alt: "Bilky" },
  };

  Object.entries(partnersMap).forEach(([nombre, data]) => {
    const pattern = new RegExp(
      `<div class="partner-logo">${nombre}</div>`,
      "g",
    );
    html = html.replace(pattern, (match) => {
      cambios++;
      return `<img src="/img/home/${data.img}" alt="${data.alt}" class="partner-logo">`;
    });
  });

  // 4. Servicios - buscar y reemplazar imágenes de servicios
  const serviciosReemplazos = {
    certibox: "servicios-1.png",
    lexbox: "servicios-2.png",
    documbox: "servicios-3.jpg",
  };

  // Guardar
  fs.writeFileSync(config.handlebarsPath, html);
  console.log(`✓ ${cambios} cambios realizados`);
  console.log(`✓ HTML actualizado: ${path.basename(config.handlebarsPath)}`);
  console.log(`\n💡 Nota: Algunas imágenes en "otros-*.jpg" necesitan ser:`);
  console.log("   - Identificadas manualmente");
  console.log("   - Renombradas apropiadamente");
  console.log("   - Movidas a subdirectorios (partners/, hero/, etc.)");
}

actualizarHTML();
