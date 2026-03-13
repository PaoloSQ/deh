# Project Context

## Objetivo operativo

Mantener `descarga-express` como un espejo estatico y mantenible de `dehonline.es`, evitando depender del runtime completo de Wix mas de lo necesario.

La estrategia que se ha ido consolidando es esta:

- corregir rutas de assets y errores de carga locales
- eliminar tracking y monitorizacion de terceros
- mantener `Thunderbolt` solo como transicion
- comparar `local` vs `original` en estado renderizado real
- congelar o corregir bloques visibles concretos, no reemplazar paginas completas a ciegas

## Sistema montado

### Servidor

Archivo principal:

- [server.js](/workspaces/deh/descarga-express/server.js)

Capacidades ya montadas:

- sirve `sites/` y `public/`
- fallback automatico de puerto si `8080` esta ocupado
- guarda el puerto activo en [.server-port.json](/workspaces/deh/descarga-express/.server-port.json)
- `GET /health` devuelve estado del servidor
- fallbacks para assets locales rotos
- redirecciones/fallbacks a `static.parastorage.com` para parte del runtime y assets de Wix
- soporte para servir por `Host` y por prefijo de ruta

### Scripts de limpieza y verificacion

Scripts relevantes:

- [clean-third-party.js](/workspaces/deh/descarga-express/scripts/clean-third-party.js)
- [verify-pages.js](/workspaces/deh/descarga-express/scripts/verify-pages.js)
- [compare-rendered-pages.js](/workspaces/deh/descarga-express/scripts/compare-rendered-pages.js)
- [audit-render-parity.js](/workspaces/deh/descarga-express/scripts/audit-render-parity.js)
- [audit-interactions.js](/workspaces/deh/descarga-express/scripts/audit-interactions.js)
- [audit-visible-mismatches.js](/workspaces/deh/descarga-express/scripts/audit-visible-mismatches.js)
- [runtime-utils.js](/workspaces/deh/descarga-express/scripts/lib/runtime-utils.js)

Informes generados:

- [THIRD-PARTY-CLEAN-REPORT.md](/workspaces/deh/descarga-express/THIRD-PARTY-CLEAN-REPORT.md)
- [VERIFY-PAGES-REPORT.md](/workspaces/deh/descarga-express/VERIFY-PAGES-REPORT.md)
- [RENDER-COMPARE-REPORT.md](/workspaces/deh/descarga-express/RENDER-COMPARE-REPORT.md)
- [PARITY-AUDIT.md](/workspaces/deh/descarga-express/PARITY-AUDIT.md)
- [INTERACTION-AUDIT.md](/workspaces/deh/descarga-express/INTERACTION-AUDIT.md)
- [VISIBLE-MISMATCH-AUDIT.md](/workspaces/deh/descarga-express/VISIBLE-MISMATCH-AUDIT.md)
- [PAGE-GROUPS.md](/workspaces/deh/descarga-express/PAGE-GROUPS.md)
- [HTML-ROUTES.md](/workspaces/deh/descarga-express/HTML-ROUTES.md)
- [ROUTES-CHECK-REPORT.md](/workspaces/deh/descarga-express/ROUTES-CHECK-REPORT.md)

## Resumen de la conversacion y del trabajo hecho

### Inventario inicial

- Se hizo un inventario de los HTML reales del proyecto y se documento en [HTML-ROUTES.md](/workspaces/deh/descarga-express/HTML-ROUTES.md).
- Se confirmo que hay `50` HTML reales en `descarga-express`.

### Consola y errores de carga

- Se monto revision automatizada de consola con `Puppeteer`.
- Se corrigieron errores de rutas de assets y recursos locales.
- El resultado importante fue dejar `0` errores de `local-file` en la verificacion global.

### Limpieza de terceros

Se identificaron y se trato de neutralizar:

- LinkedIn Insight
- Sentry
- TWIPLA / Visitor Analytics
- telemetria tipo `frog.wix.com` y `panorama`

Se decidio no desmontar `Thunderbolt` de golpe.

### Comparacion con la web real

- Se probo el enfoque de reemplazar paginas completas por HTML renderizado remoto.
- Esa prueba salio mal en paginas Wix complejas: reintroducia workers, cookies, tracking, blobs, dependencias de backend y roturas funcionales.
- Conclusion: no usar reemplazo completo de paginas como estrategia principal.

### Cambio de estrategia

Se adopto este enfoque:

- auditar `local` vs `original` en render real
- identificar diferencias por seccion
- corregir o congelar bloques concretos
- volver a verificar

### Home

La home se tomo como pagina piloto.

Se han hecho ya varias correcciones sobre [index.html](/workspaces/deh/descarga-express/sites/www.dehonline.es/index.html):

- recuperacion/correccion del hero visible
- ajuste de wrappers que quedaban en estado inicial de animacion
- restauracion del movimiento de los dos carruseles horizontales mediante `deh-home-gallery-marquee`
- auditorias de paridad visual y de interacciones sobre la home

Estado de la home antes del punto actual:

- hero corregido
- hovers y scroll revisados
- carruseles horizontales ya se mueven en local
- seguian faltando piezas en la seccion de imagen central y en el bloque siguiente

## Punto actual exacto

Se estaba investigando la home en estas dos zonas:

1. `comp-m66dcvli`
   - seccion de la imagen de oficina con reseñas superpuestas
   - contiene el `wix-iframe` `comp-mh1ro4f21`
   - ese `iframe` carga [Carousel.f4b92e4d.html](/workspaces/deh/descarga-express/public/assets/misc/services/editor-elements-library/dist/siteAssets/media/Carousel.f4b92e4d.html)

2. `comp-makvwzc5`
   - seccion siguiente
   - el titulo visible esperado es `comp-makvwzcj`

### Resultado del analisis local vs remoto

Se confirmo lo siguiente:

- en remoto, `comp-mh1ro4f21` renderiza un carrusel real con varias imagenes de reseñas
- en local, el `iframe` existe pero el `#sb-slider` queda vacio
- en remoto, `comp-makvwzcj` esta visible
- en local, `comp-makvwzcj` existe pero queda con `opacity: 0`

### Hipotesis tecnica actual

Hay dos problemas distintos:

1. `comp-makvwzcj`
   - no falta contenido
   - falta sacar el nodo del estado inicial de animacion
   - es un caso similar a otros wrappers ya corregidos antes

2. `comp-mh1ro4f21`
   - el `iframe` carga el HTML del carrusel, pero el widget no termina de montar en local
   - el archivo [Carousel.f4b92e4d.html](/workspaces/deh/descarga-express/public/assets/misc/services/editor-elements-library/dist/siteAssets/media/Carousel.f4b92e4d.html) es el foco directo
   - ya se observo que en local el cuerpo del `iframe` se queda sin imagenes montadas, mientras que en remoto el mismo asset muestra varias `img.cloudcarousel`
   - quedo pendiente cerrar la comprobacion final de por que el widget no inicializa del todo en local

## Ultimo paso en el que se estaba trabajando

El ultimo paso activo era este:

- inspeccionar el estado interno del `iframe` `comp-mh1ro4f21` ya cargado en local para distinguir entre:
  - librerias del widget no cargadas
  - `postMessage`/datos del widget no recibidos
  - inicializacion JS incompleta dentro del asset `Carousel.f4b92e4d.html`

Ese analisis se lanzo pero no se cerro en la conversacion antes de esta nota.

## Proximos pasos recomendados

### Inmediatos

1. Corregir `comp-makvwzcj`
   - forzar su estado final visible
   - validar que el titulo vuelve a verse en la home

2. Terminar el diagnostico del `iframe` `comp-mh1ro4f21`
   - confirmar si fallan scripts, datos o inicializacion
   - corregir [Carousel.f4b92e4d.html](/workspaces/deh/descarga-express/public/assets/misc/services/editor-elements-library/dist/siteAssets/media/Carousel.f4b92e4d.html) o el flujo de datos que necesita

3. Verificar la home otra vez con `Puppeteer`
   - screenshot local vs remoto
   - comprobar que aparecen las reseñas
   - comprobar que aparece el titulo inferior

### Despues de cerrar la home

4. endurecer el auditor
   - marcar automaticamente nodos que existen pero quedan en `opacity: 0` o sin `data-motion-enter="done"`

5. aplicar el mismo flujo por familias de pagina
   - landings/home-like
   - paginas estaticas
   - despues listados y paginas con mas runtime

6. seguir reduciendo dependencia de Wix
   - mantener `Thunderbolt` solo donde todavia haga falta
   - congelar contenido visible cuando el original ya lo expone

## Notas de continuidad

- La home es ahora la pagina piloto del flujo de auditoria y correccion.
- No conviene volver al enfoque de reemplazar HTML completo desde la web real.
- El estado actual mas fiable se obtiene con:
  - auditorias renderizadas
  - correccion selectiva de bloques
  - revalidacion en navegador

## Archivos clave para retomar

- [index.html](/workspaces/deh/descarga-express/sites/www.dehonline.es/index.html)
- [Carousel.f4b92e4d.html](/workspaces/deh/descarga-express/public/assets/misc/services/editor-elements-library/dist/siteAssets/media/Carousel.f4b92e4d.html)
- [server.js](/workspaces/deh/descarga-express/server.js)
- [PARITY-AUDIT.md](/workspaces/deh/descarga-express/PARITY-AUDIT.md)
- [INTERACTION-AUDIT.md](/workspaces/deh/descarga-express/INTERACTION-AUDIT.md)
- [VISIBLE-MISMATCH-AUDIT.md](/workspaces/deh/descarga-express/VISIBLE-MISMATCH-AUDIT.md)
