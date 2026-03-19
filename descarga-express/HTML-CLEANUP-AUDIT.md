# HTML Cleanup Audit

Fecha: 2026-03-19

## Objetivo

Dejar un mapa operativo de los HTML de `descarga-express` antes de hacer una limpieza en lote.

Este documento distingue entre:

- limpieza segura de HTML ya staticizado
- normalizacion transversal de enlaces, fuentes y ruido repetido
- paginas que siguen dependiendo del runtime de Wix y no conviene "podar" a ciegas

## Alcance

- HTML auditados: `201`
- Carpeta auditada: `sites/`
- Tamano total aproximado: `132,898,320` bytes
- Lineas totales aproximadas: `324,897`

## Foto global

- Paginas con comentario `staticized:`: `172`
- Paginas con `window.viewerModel` o `wix-essential-viewer-model`: `28`
- Paginas con menciones a `thunderbolt`: `190`
- Paginas con `/assets/js/local/image-fallback.js`: `164`
- `script` totales: `1,869`
- `script` inline: `1,402`
- `script` externos: `303`
- `link rel="stylesheet"`: `125`
- `style` blocks: `4,383`
- `img`: `4,680`
- `iframe`: `46`
- Formularios: `47`
- Enlaces: `10,014`

## Familias reales

La estructura no son `201` paginas distintas. Son pocas familias repetidas:

| Familia | Paginas | Perfil tecnico |
| --- | ---: | --- |
| `root` | 74 | Mayoritariamente paginas staticizadas, con CSS inline de Thunderbolt y poco JS real |
| `post` | 46 | Posts staticizados, sin runtime remoto fuerte, pero con mucho CSS inline y algunos pixels |
| `partners` | 26 | Mezcla de 23 paginas staticizadas y 3 paginas runtime-heavy (`gigas`, `eevidence`, `xeoris`) |
| `blog` | 14 | Listados y taxonomias staticizadas, con fuentes externas y pixels |
| `grupos` | 13 | 6 paginas visibles staticizadas y 7 snapshots de `discussion/` |
| `profile` | 12 | Runtime completo, alto riesgo de rotura si se limpia a ciegas |
| `soporte` | 6 | 1 pagina simple y 5 paginas con runtime pesado |
| `booking` | 4 | Runtime completo de reservas |
| `consola` | 2 | 1 simple y 1 runtime-heavy |
| Otros | 4 | `documbox`, `panel`, `www.soporte`, `www.connectbox.es.html` |

## Hallazgos clave

### 1. El grueso ya no necesita un "runtime real"

Las `172` paginas con comentario `staticized:` ya estan en modo snapshot o pagina congelada, pero siguen arrastrando mucha grasa de Wix:

- comentario `Sentry Loader Script` en `189` paginas
- comentario `Add the rest of the ViewerModel` en `190` paginas
- `style[data-url]` en `190` paginas, `380` ocurrencias
- `wixui-rich-text__text` en `166` paginas, `1,762` ocurrencias

Esto significa que hay una fase de limpieza HTML que si merece la pena, pero tiene que apuntar a residuos de build y no a estructuras visibles.

### 2. Hay solo `28` paginas realmente delicadas

Las paginas con `viewerModel` de verdad son las que mas riesgo tienen si se "limpian" sin migrarlas:

- `www.dehonline.es/booking-calendar/*`
- `www.dehonline.es/partners/gigas.html`
- `www.dehonline.es/partners/eevidence.html`
- `www.dehonline.es/partners/xeoris.html`
- `www.dehonline.es/profile/*/profile.html`
- `soporte.dehonline.es/certificados-digitales.html`
- `soporte.dehonline.es/mi-panel-certibox.html`
- `soporte.dehonline.es/notificaciones-electronicas.html`
- `soporte.dehonline.es/otras-consultas.html`
- `soporte.dehonline.es/signbox.html`
- `www.connectbox.es.html`
- `www.consola.dehonline.es/email-certificado.html`
- `www.dehonline.es/search.html`
- `www.dehonline.es/carpetas-financieras.html`

Estas paginas concentran casi todo el JS externo, `frog`, `panorama`, `jsdelivr`, perfiles, reservas y widgets de Wix.

### 3. La mayor parte del ruido transversal si es normalizable

Dependencias y patrones repetidos:

- `fonts.googleapis.com`: `111` referencias en `100` paginas
- preconnects a `fonts.googleapis.com` y `fonts.gstatic.com`: `298` ocurrencias en `180` paginas
- URLs absolutas al propio dominio: `8,460` ocurrencias en `145` paginas
- `sentry` y derivados Wix: `3,837` ocurrencias concentradas en las paginas runtime-heavy
- `frog.wix.com` y `panorama.wixapps.net`: `104` ocurrencias en `26` paginas
- LinkedIn Insight: `112` ocurrencias en `55` paginas
- `cdn.jsdelivr.net`: `50` ocurrencias en `27` paginas

## Candidatos de limpieza

### Limpieza segura en lote

Estas tareas son razonables sobre la familia staticizada:

1. Eliminar comentarios residuales de Wix
   - `Sentry Loader Script`
   - `Add the rest of the ViewerModel`
   - bloques vacios `BEGIN/END` que ya no tienen payload util

2. Normalizar URLs absolutas al propio dominio
   - pasar `https://www.dehonline.es/...` a rutas raiz o relativas coherentes
   - mantener URLs absolutas solo en SEO/OG/JSON-LD si se decide explicitamente

3. Unificar carga de fuentes
   - reducir referencias repetidas a Google Fonts
   - priorizar tipografias ya espejadas en `/assets/misc/tag-bundler/...` o `/assets/misc/fonts/...`
   - no eliminar fuentes de golpe en paginas runtime-heavy sin comprobar el fallback

4. Revisar CSS inline repetido de Thunderbolt en paginas staticizadas
   - hoy sigue incrustado aunque muchas paginas ya no usan runtime real
   - es una gran fuente de peso HTML en landings, legales, blog posts y grupos
   - la limpieza aqui debe ser por familias, no global ciega

5. Normalizar `meta`, `link rel=alternate`, `canonical`, `og:url`
   - hoy hay mezcla de rutas locales, absolutas y restos de exportacion Wix

### Limpieza media

Estas tareas son viables, pero requieren muestreo visual:

1. Aplanar `span.wixui-rich-text__text`
   - `166` paginas, `1,762` ocurrencias
   - hay mucho nesting heredado de rich text
   - puede reducir peso, pero conviene no tocarlo en bloque sin diffs visuales

2. Reordenar o extraer CSS inline comun
   - muchas paginas staticizadas repiten bloques grandes de `main` y `main.renderer`
   - si se externaliza mal, se pueden mover prioridades de cascada

3. Normalizar JSON-LD
   - `110` bloques en `80` paginas
   - es buena limpieza SEO, pero no es el primer ahorro de peso

4. Revisar widgets embebidos por `jsdelivr`
   - especialmente `SoporteSquads/SquadsChat`
   - no tocar si el widget sigue siendo funcionalmente requerido

### No limpiar sin migrar antes

Estas paginas siguen siendo runtime-heavy:

- booking calendar
- profiles
- partners `gigas`, `eevidence`, `xeoris`
- soporte avanzado
- `search.html`
- `carpetas-financieras.html`
- `www.connectbox.es.html`
- `www.consola.dehonline.es/email-certificado.html`

En estas paginas la limpieza HTML no es "quitar grasa"; es una mini migracion.

## Ejemplos representativos

### Pagina staticizada con grasa heredada

Archivo: `sites/www.dehonline.es/acuerdo-ecpf.html`

Senales:

- helper local: `image-fallback.js`
- comentario `staticized: snapshot page`
- comentario `Sentry Loader Script`
- comentario `Add the rest of the ViewerModel`
- grandes bloques de CSS inline de Thunderbolt

Lectura: buena candidata para limpieza de residuos y adelgazamiento HTML.

### Pagina runtime-heavy

Archivo: `sites/www.dehonline.es/partners/gigas.html`

Senales:

- `wix-essential-viewer-model`
- `window.viewerModel`
- `frog.wix.com`
- `panorama.wixapps.net`
- Google Fonts remotas
- stack inline de Thunderbolt y bundles remotos

Lectura: no es una pagina para "limpiar comentarios"; requiere decidir si se migra o se mantiene runtime.

### Pagina con residuos locales especiales

Archivo: `sites/www.dehonline.es/search.html`

Senales:

- `window.viewerModel`
- referencias a `127.0.0.1:8080`
- telemetria guard inline
- comentario `Sentry Loader Script`

Lectura: ademas de pesada, tiene residuos de entorno local y debe tratarse como pagina especial.

## Archivos mas grandes

Estos HTML merecen prioridad solo por peso:

1. `www.dehonline.es/index.html` - `2,834,992` bytes
2. `www.dehonline.es/partners/gigas.html` - `1,535,717`
3. `www.dehonline.es/partners/eevidence.html` - `1,534,107`
4. `www.dehonline.es/partners/xeoris.html` - `1,533,908`
5. `www.dehonline.es/booking-calendar/cita-videoconferencia.html` - `1,509,375`
6. `www.dehonline.es/booking-calendar/cita-presencial.html` - `1,509,111`
7. `www.dehonline.es/booking-calendar/reserva-demo.html` - `1,506,170`
8. `www.dehonline.es/booking-calendar/cita-comercial-telefonica.html` - `1,505,148`
9. `www.dehonline.es/search.html` - `1,465,289`
10. `www.dehonline.es/carpetas-financieras.html` - `1,216,745`

## Priorizacion recomendada

### Fase 1. Limpieza segura sobre staticizados

Objetivo: bajar ruido sin tocar funcionalidad.

- eliminar comentarios y bloques vacios heredados de Wix
- normalizar self-links absolutos
- racionalizar fonts repetidas
- preparar una matriz por familia para CSS inline comun

### Fase 2. Adelgazamiento de HTML por familias

Objetivo: reducir peso real.

- root staticizadas
- posts
- blog/tags/categories
- grupos simples
- partners ya staticizados

### Fase 3. Casos especiales

Objetivo: tratar paginas que aun son mini apps Wix.

- booking
- profile
- support runtime-heavy
- search
- carpetas-financieras
- connectbox
- consola/email-certificado

## Decision practica

La conclusion operativa es esta:

- si el objetivo es "limpiar HTML", el mejor retorno esta en las `172` paginas staticizadas
- si el objetivo es "quitar Wix", el trabajo de verdad esta concentrado en solo `28` paginas
- no conviene mezclar ambas cosas en el mismo barrido

## Siguiente paso recomendado

Ejecutar primero una limpieza automatizada sobre la familia staticizada con estos cuatro checks:

1. no tocar paginas con `viewerModel`
2. no tocar paginas con `iframe` funcional salvo regla especifica
3. dejar `verify-pages` listo para spot checks
4. validar visualmente una muestra por familia despues de cada transformacion
