# Project Context

Fecha de actualizacion: 2026-03-19

## Objetivo operativo

Mantener `descarga-express` como un espejo local y mantenible de `dehonline.es`, reduciendo dependencia real de Wix sin perder el look del dominio original.

La estrategia valida a dia de hoy es:

- conservar el render visible
- limpiar tracking y residuos de terceros
- mantener runtime Wix solo donde todavia haga falta
- mover complejidad fuera del HTML cuando sea seguro
- validar siempre contra remoto con auditorias renderizadas e interactivas

## Punto real del proyecto

### Estado de rutas y paginas

- El lote de `missing_pages_remote.txt` se dio por cerrado operativamente.
- Se verifico que las rutas de los `.txt` de `reports/` existen dentro del proyecto.
- La fuente de verdad de paginas es `sites/`.

Documentos clave:

- `AI_PAGE_CLOSURE_RUNBOOK.md`
- `MISSING-PAGES-CLOSEOUT.md`
- `HTML-ROUTES.md`
- `PAGE-GROUPS.md`

### Estado de imagenes

La simplificacion de imagenes ya se aplico.

- La capa publica actual de imagenes es `public/img/`.
- Los HTML ya usan rutas limpias bajo `/img/...`.
- La estructura antigua `public/assets/img/` ya no es la fuente publica de runtime.

Documentos clave:

- `IMAGE-CANONICALIZATION.md`
- `SIMPLE-IMAGE-LIBRARY-REPORT.md`

### Estado de HTML

Se hizo una auditoria global sobre `sites/` y el estado real es este:

- HTML auditados: `201`
- Paginas con `staticized:`: `172`
- Paginas runtime-heavy con `viewerModel` real: `28`

La conclusion importante es:

- la mayoria de paginas ya estan en modo snapshot o semiestatico
- el trabajo de limpieza mas rentable esta en esas paginas staticizadas
- solo un conjunto pequeno sigue siendo mini app Wix y no conviene podarlo a ciegas

Documentos clave:

- `HTML-CLEANUP-AUDIT.md`
- `HTML-CLEANUP-AUTOMATION-PLAN.md`

## Sistema montado

### Servidor

Archivo principal:

- `server.js`

Capacidades ya montadas:

- sirve `sites/`, `public/img`, `public/css`, `public/js`, `public/assets` y `public/docs`
- fallback automatico de puerto si `8080` esta ocupado
- guarda el puerto activo en `.server-port.json`
- `GET /health` devuelve estado del servidor
- soporte para servir por `Host` y por prefijo de ruta
- fallbacks para assets locales rotos
- redirecciones/fallbacks a `static.parastorage.com` para parte del runtime y assets de Wix

Nota importante:

- `/css` y `/js` se exponen ya como rutas publicas de primer nivel para la nueva fase de limpieza HTML

### Scripts clave

Scripts de mutacion:

- `scripts/clean-third-party.js`
- `scripts/staticize-legal-pages.js`
- `scripts/build-simple-image-library.js`
- `scripts/extract-inline-page-assets.js`

Scripts de validacion:

- `scripts/verify-pages.js`
- `scripts/compare-rendered-pages.js`
- `scripts/audit-render-parity.js`
- `scripts/audit-interactions.js`
- `scripts/audit-visible-mismatches.js`
- `scripts/verify-all-routes.js`

Helper compartido:

- `scripts/lib/runtime-utils.js`

## Lo que ya no hay que redescubrir

### 1. No usar reemplazo completo desde remoto

Se probo el enfoque de reemplazar paginas locales por HTML renderizado remoto.

Resultado:

- reintroducia workers
- reintroducia cookies y tracking
- reintroducia dependencias de backend
- rompia el control local del proyecto

Conclusion:

- no usar `compare-rendered-pages --replace` como estrategia base de migracion

### 2. No limpiar todo igual

Hay dos clases de paginas:

1. Paginas staticizadas o semiestaticas
   - buen terreno para limpieza masiva
   - mejor retorno con poco riesgo

2. Paginas runtime-heavy
   - booking calendar
   - profiles
   - `partners/gigas.html`
   - `partners/eevidence.html`
   - `partners/xeoris.html`
   - soporte avanzado
   - `search.html`
   - `carpetas-financieras.html`
   - `www.connectbox.es.html`
   - `www.consola.dehonline.es/email-certificado.html`

Estas ultimas no son "HTML sucio"; son mini migraciones.

### 3. La home sigue siendo especial

La home local sigue acumulando diferencias historicas frente a remoto, sobre todo por imagenes y algunas zonas ya conocidas de esa pagina.

Importante para futuras IAs:

- no asumir que cualquier diff de la home viene de la ultima limpieza aplicada
- usar la home solo como muestra controlada, no como unico criterio global

## Limpieza HTML: estado exacto

### Auditoria

El mapa de limpieza quedo documentado en `HTML-CLEANUP-AUDIT.md`.

Hallazgos utiles:

- mucho comentario residual de Wix
- mucho CSS inline repetido
- fuentes remotas repetidas
- enlaces absolutos al propio dominio
- `span.wixui-rich-text__text` muy repetidos

### Estrategia aprobada

La estrategia valida para limpiar HTML sin perder diseno es:

1. extraer CSS y JS inline sin reinterpretar la pagina
2. validar
3. limpiar terceros y residuos
4. validar
5. deduplicar por familias
6. validar otra vez

Esto quedo documentado en:

- `HTML-CLEANUP-AUTOMATION-PLAN.md`

### Nuevo automatismo

Se anadio:

- `scripts/extract-inline-page-assets.js`

Que hace:

- extrae `style` y `script` inline a `public/css/pages/...` y `public/js/pages/...`
- respeta el orden
- no toca `application/json`
- no toca `application/ld+json`
- reescribe `url(...)` relativas dentro del CSS

Script npm disponible:

- `npm run extract-inline-assets`

## Limpieza HTML ya aplicada

Se aplico ya la primera fase segura:

- extraccion de CSS inline sobre paginas staticizadas

Resultado:

- HTML procesados: `201`
- HTML reescritos en esta fase: `170`
- bloques CSS extraidos: `3897`
- ruta de salida: `public/css/pages/...`

Informes:

- `INLINE-ASSET-EXTRACTION-REPORT.md`
- `INLINE-ASSET-EXTRACTION-REPORT.json`

### Validacion de esta fase

Se hizo una muestra funcional sobre 8 paginas representativas.

Resultado:

- `0` problemas de runtime
- `0` problemas de terceros
- quedaron `4` paginas con un 404 residual a `/assets/img/media/img`

Esas paginas fueron:

- `sites/www.dehonline.es/index.html`
- `sites/www.dehonline.es/post/administradores-de-fincas-guardianes-de-la-seguridad-y-la-excelencia.html`
- `sites/www.dehonline.es/grupos/energia.html`
- `sites/www.dehonline.es/partners/app_vecinos.html`

Importante:

- ese 404 residual no se encontro ni en los HTML reescritos ni en `public/css/pages/`
- tratarlo de momento como deuda previa o ruido heredado, no como regresion clara del extractor

### Muestra visual tras la extraccion

Paridad visual de muestra:

- `/blog` desktop: `mismatchRatio 0.004709`
- `/grupos/energia` desktop: `mismatchRatio 0.007973`
- `/` desktop: sigue siendo ruidosa, pero el desfase dominante continua concentrado en imagenes y zonas historicamente problematicas de la home

Interacciones en home:

- `0` diferencias de scroll reveal
- `1` hover con pequena brecha visual

Carpetas de artefactos:

- `.parity-audit/cleanup-home-desktop/`
- `.parity-audit/cleanup-blog-desktop/`
- `.parity-audit/cleanup-grupo-energia-desktop/`
- `.interaction-audit/cleanup-home-desktop/`

## Gate recomendado antes de dar por bueno un lote

### Gate minimo

- `verify-pages`
- sin `pageerror`
- sin nuevos `local-file`
- sin nuevos `local-api`

### Gate fuerte

- `audit-render-parity`
- `audit-interactions`

### Criterio practico

No aprobar una limpieza por lote si aparece cualquiera de estos sintomas:

- cambio visible de layout
- degradacion de header, hero, formularios o footer
- nuevo error runtime
- rotura de hover o scroll reveal

## Orden correcto para continuar

Si una IA retoma el proyecto, el orden recomendado ahora es:

1. No tocar runtime-heavy de entrada.
2. Seguir con limpieza segura sobre staticizados.
3. Ejecutar `clean-third-party` por familias cuando convenga.
4. Deduplicar el CSS ya extraido por hashes o por familias.
5. Dejar JS inline para una fase posterior y mucho mas controlada.

## Siguientes automatizaciones recomendadas

Todavia faltan estas piezas:

1. `dedupe-extracted-assets.js`
   - agrupar CSS/JS identicos por hash
   - moverlos a assets compartidos por familia

2. `strip-html-wix-residue.js`
   - eliminar comentarios Wix
   - eliminar bloques vacios
   - normalizar self-links
   - limpiar residuos que ya no tengan referencia viva

3. `validate-cleanup-batch.js`
   - wrapper que encadene `verify-pages`, `audit-render-parity` y `audit-interactions`

## Archivos de continuidad mas importantes

- `server.js`
- `AI_PAGE_CLOSURE_RUNBOOK.md`
- `MISSING-PAGES-CLOSEOUT.md`
- `IMAGE-CANONICALIZATION.md`
- `HTML-CLEANUP-AUDIT.md`
- `HTML-CLEANUP-AUTOMATION-PLAN.md`
- `INLINE-ASSET-EXTRACTION-REPORT.md`
- `scripts/extract-inline-page-assets.js`
- `scripts/clean-third-party.js`
- `scripts/verify-pages.js`
- `scripts/audit-render-parity.js`
- `scripts/audit-interactions.js`

## Nota final para futuras IAs

El proyecto ya no esta en fase de "rescatar paginas faltantes". Esa parte esta practicamente cerrada.

La fase actual es:

- adelgazar HTML
- sacar complejidad fuera de los ficheros
- limpiar Wix sin perder el render del dominio real

La prioridad correcta hoy es el lote staticizado, no las mini apps runtime-heavy.
