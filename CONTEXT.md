# Contexto Rapido - DEH

## Objetivo

Migrar `dehonline.es` (Wix) a una version simplificada mantenible en HTML/CSS/JS + Handlebars.

## Estructura principal

- `descarga/`: fuente original descargada.
- `simplified/`: sitio nuevo y comparacion visual.
- `scripts/`: automatizacion activa.
- `scripts/legacy/`: scripts archivados.

## Scripts activos

- `scripts/workflow.js`
- `scripts/analizar-estructura.js`
- `scripts/extraer-contenido.js`
- `scripts/extraer-css-variables.js`
- `scripts/extraer-y-descargar-imagenes.js`
- `scripts/renombrar-imagenes-descriptivo.js`
- `scripts/generar-reporte-diferencias.js`

## Flujo recomendado

Desde la raiz:

```bash
# Analisis inicial (una sola vez)
node scripts/workflow.js setup

# Flujo de imagenes para home
node scripts/workflow.js home

# Reporte
node scripts/workflow.js report

# Todo
node scripts/workflow.js all
```

## Flujo visual (simplified)

```bash
cd simplified
npm install
npm run dev
npm run compare
npm run batch
npm run report
```

## Convencion de imagenes home

- Carpeta: `simplified/public/img/home/`
- Rutas: `/img/home/<archivo>`
- Plantilla: `simplified/src/pages/index.handlebars`

## Archivos de salida importantes

- `scripts/estructura-analizada.json`
- `scripts/contenido-extraido.json`
- `scripts/catalogo-imagenes-home.json`
- `scripts/renombrado-imagenes-home.json`
- `scripts/reporte-diferencias.md`

## Referencias

- `README.md`
- `scripts/README-AUTOMATION.md`
- `scripts/legacy/README-LEGACY.md`
