# Scripts Legacy

Estos scripts se movieron aqui para reducir ruido y evitar que se usen por error en el flujo actual.

## Movidos el 2026-03-08

- `actualizar-imagenes-home.js`: Script puntual de transicion, desactualizado.
- `actualizar-rutas-imagenes.js`: Flujo antiguo basado en `catalogo-imagenes.json` global.
- `analizar-home.js`: Exploratorio inicial.
- `analizar-imagenes.js`: Analizador simplificado previo al flujo actual.
- `analizar.js`: Analizador exploratorio general.
- `descargar-imagenes.js`: Descarga global antigua (no page/home scoped).
- `extraer-imagenes-pagina.js`: Inestable/obsoleto (errores de variables/imports).
- `extraer-imagenes.js`: Extractor global antiguo.
- `fix-mojibake-handlebars.js`: Utilidad de una sola ejecucion.

## Flujo vigente (resumen)

Usar los scripts en `scripts/` (raiz):

1. `analizar-estructura.js`
2. `extraer-contenido.js`
3. `extraer-css-variables.js`
4. `extraer-y-descargar-imagenes.js`
5. `renombrar-imagenes-descriptivo.js`
6. `generar-reporte-diferencias.js`
