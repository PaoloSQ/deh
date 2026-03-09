# Scripts de Automatizacion

Referencia corta de scripts activos para migracion DEH.

## Uso recomendado (unico comando)

Desde la raiz del repo:

```bash
node scripts/workflow.js setup
node scripts/workflow.js home
node scripts/workflow.js report
node scripts/workflow.js all
```

## Scripts activos

- `workflow.js`: orquestador de flujo.
- `analizar-estructura.js`: analiza estructura del HTML original.
- `extraer-contenido.js`: extrae contenido textual de paginas.
- `extraer-css-variables.js`: genera variables CSS base.
- `extraer-y-descargar-imagenes.js`: extrae y descarga imagenes de home.
- `renombrar-imagenes-descriptivo.js`: renombra semantico y actualiza rutas en `index.handlebars`.
- `generar-reporte-diferencias.js`: genera `reporte-diferencias.md`.

## Salidas clave

- `estructura-analizada.json`
- `contenido-extraido.json`
- `catalogo-imagenes-home.json`
- `renombrado-imagenes-home.json`
- `reporte-diferencias.md`

## Convenciones de imagenes

- Carpeta final: `simplified/public/img/home/`
- Rutas de plantilla: `/img/home/<archivo>`
- Archivo de plantilla: `simplified/src/pages/index.handlebars`

## Legacy

Scripts antiguos y experimentales:

- `scripts/legacy/README-LEGACY.md`
