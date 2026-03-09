# DEH Migration Workspace

Migracion del sitio `dehonline.es` desde Wix a una version simplificada con HTML/CSS/JS + Handlebars.

## Estructura

- `descarga/`: snapshot del sitio original descargado de Wix.
- `simplified/`: sitio nuevo (Express + Handlebars).
- `scripts/`: automatizacion de extraccion, analisis e imagenes.
- `scripts/legacy/`: scripts antiguos archivados (no usar en flujo actual).

## Flujo Unificado

Desde la raiz del repo:

```bash
# Analisis global (una vez)
node scripts/workflow.js setup

# Flujo de imagenes para home
node scripts/workflow.js home

# Reporte de avance
node scripts/workflow.js report

# Todo en orden (setup + home + report)
node scripts/workflow.js all
```

## Scripts Activos

- `scripts/analizar-estructura.js`
- `scripts/extraer-contenido.js`
- `scripts/extraer-css-variables.js`
- `scripts/extraer-y-descargar-imagenes.js`
- `scripts/renombrar-imagenes-descriptivo.js`
- `scripts/generar-reporte-diferencias.js`
- `scripts/workflow.js` (entrypoint unificado)

## Comparacion Visual

Desde `simplified/`:

```bash
npm install
npm run dev
npm run visual -- --help
npm run visual:compare
```

Scripts disponibles en `simplified/scripts/`:

- `visual.js` entrypoint unificado
- `capturar-origen.js`
- `comparar.js`
- `batch.js`
- `reporte.js`
- `inspect-header.js`

Comandos recomendados:

```bash
# Capturar referencia
npm run visual:capture -- -p index -v desktop

# Comparar una pagina
npm run visual:compare -- -p index -v desktop -t 5

# Comparacion masiva
npm run visual:batch -- --viewport mobile

# Reporte HTML
npm run visual:report -- -p index

# Inspeccion especifica del header
npm run visual:header -- --mode hover
```

## Convencion de Imagenes (Home)

- Carpeta final: `simplified/public/img/home/`
- Rutas en plantilla: `/img/home/<archivo>`
- Archivo de plantilla: `simplified/src/pages/index.handlebars`

## Documentacion Relacionada

- `CONTEXT.md`: contexto corto del proyecto y comandos principales.
- `scripts/README-AUTOMATION.md`: referencia rapida de scripts.
- `scripts/legacy/README-LEGACY.md`: historial de scripts archivados.
