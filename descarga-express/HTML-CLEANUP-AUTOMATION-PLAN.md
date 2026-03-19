# HTML Cleanup Automation Plan

Fecha: 2026-03-19

## Objetivo

Limpiar los HTML de `descarga-express` para reducir ruido de Wix sin perder el look del dominio real.

La regla base es esta:

- primero mover codigo inline fuera del HTML sin cambiar su contenido ni su orden
- despues limpiar residuos y terceros
- solo al final deduplicar y adelgazar familias

## Scripts actuales aprovechables

### Ya disponibles

- `scripts/staticize-legal-pages.js`
  - bueno para congelar paginas sencillas
  - no es seguro como limpiador masivo porque elimina `script` inline a saco

- `scripts/clean-third-party.js`
  - util para retirar tracking, Sentry, TWIPLA, LinkedIn y parte de telemetria
  - tambien parchea `viewerModel` y puede dejar stubs seguros

- `scripts/verify-pages.js`
  - gate funcional base
  - detecta errores de consola, pageerror, requests fallidas, runtime y terceros

- `scripts/audit-render-parity.js`
  - gate visual fuerte por viewport

- `scripts/audit-interactions.js`
  - gate de hovers, scroll reveals e interacciones visibles

- `scripts/audit-visible-mismatches.js`
  - ayuda a localizar zonas visuales rotas, no solo un diff bruto

### Nuevo automatismo preparado

- `scripts/extract-inline-page-assets.js`
  - extrae `style` y `script` inline a `public/css/pages/...` y `public/js/pages/...`
  - reescribe `url(...)` relativas dentro del CSS para que no se rompan al moverlo
  - conserva orden de ejecucion y deja el HTML apuntando a ficheros locales
  - por defecto va en `dry-run`

## Cadena recomendada

### Fase 1. Extraccion segura

Objetivo: adelgazar HTML sin tocar logica ni cascada.

1. Extraer CSS inline en paginas staticizadas
   - comando recomendado:
   - `node scripts/extract-inline-page-assets.js --only-staticized --styles-only`

2. Validar una muestra por familia
   - `verify-pages --filter`
   - `audit-render-parity --route ...`

3. Si la muestra sale bien, escribir
   - `node scripts/extract-inline-page-assets.js --write --only-staticized --styles-only`

4. Repetir luego con JS inline ligero
   - `node scripts/extract-inline-page-assets.js --write --only-staticized --scripts-only`

### Fase 2. Limpieza de terceros y residuos

Objetivo: quitar ruido sin afectar diseno.

1. Ejecutar `clean-third-party` por familia o filtro
2. Revalidar con `verify-pages`
3. Hacer parity audit en paginas representativas

### Fase 3. Adelgazamiento por familia

Objetivo: reducir duplicacion real.

1. Identificar CSS/JS extraidos identicos entre paginas
2. Mover esos bloques a ficheros compartidos por familia
3. Dejar overrides minimos por pagina

### Fase 4. Runtime-heavy

Objetivo: tratar las mini apps Wix por separado.

No aplicar limpieza masiva ni dedupe agresiva directamente sobre:

- `booking-calendar/*`
- `profile/*`
- `partners/gigas.html`
- `partners/eevidence.html`
- `partners/xeoris.html`
- soporte avanzado
- `search.html`
- `carpetas-financieras.html`
- `www.connectbox.es.html`
- `www.consola.dehonline.es/email-certificado.html`

En estas, la extraccion debe ir con muestras pequenas y parity audit obligatoria.

## Por que extraer primero

Mover CSS y JS inline fuera del HTML tiene tres ventajas:

1. No cambia el contenido ni la cascada si se mantiene el orden.
2. Permite medir luego que sobra de verdad.
3. Hace posible deduplicar por hashes o por familias en una segunda pasada.

La extraccion es el paso mas seguro para empezar porque limpia estructura sin "reinterpretar" la pagina.

## Reglas del extractor

- no toca `script src=...`
- no toca `application/json`
- no toca `application/ld+json`
- respeta el orden de los bloques
- reescribe URLs relativas de CSS
- escribe bajo:
  - `public/css/pages/<dominio>/<ruta>/style-001.css`
  - `public/js/pages/<dominio>/<ruta>/script-001.js`

## Gates de validacion

### Gate minimo

- `verify-pages`
- `remoteCount` controlado si se audita en navegador
- sin `pageerror`
- sin nuevos `local-file`

### Gate fuerte

- `audit-render-parity`
- `audit-interactions`

### Gate de despliegue por lote

No desplegar una familia si falla cualquiera de estos:

- error visual notorio frente a remoto
- cambio de layout en header, hero, forms o footer
- nuevos errores runtime
- cambio de comportamiento en menus, hover o scroll reveal

## Automatizaciones siguientes recomendadas

Despues del extractor, las dos piezas que mas valor aportan son:

1. `dedupe-extracted-assets.js`
   - agrupar CSS/JS identicos por hash
   - convertirlos en assets compartidos por familia

2. `strip-html-wix-residue.js`
   - eliminar comentarios Wix
   - eliminar bloques vacios
   - normalizar URLs absolutas propias
   - limpiar restos que ya no tengan referencia viva

3. `validate-cleanup-batch.js`
   - wrapper que encadene `verify-pages`, `audit-render-parity` y `audit-interactions`

## Decision practica

El orden correcto no es "borrar Wix" primero.

El orden correcto es:

1. extraer
2. validar
3. limpiar terceros
4. validar
5. deduplicar
6. validar

Asi se conserva mucho mejor el look del dominio real.
