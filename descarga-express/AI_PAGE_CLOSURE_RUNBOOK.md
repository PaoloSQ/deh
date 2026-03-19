# AI Page Closure Runbook

Lee este archivo antes de tocar una pagina de `descarga-express`.

## Objetivo

Dejar cada pagina del bloque pendiente con el mismo nivel de cierre que `360homeservice`:

- HTML local estable
- sin dependencia de red externa en navegacion normal
- sin runtime errors locales
- sin third-party pendiente
- con UX razonable y sin romper scroll/hover/formularios visibles

## Criterio de salida

Una pagina se considera `cerrada` solo si cumple esto:

1. `verify-pages.js` devuelve `status: ok`
2. `local-file = 0`
3. `local-api = 0`
4. `third-party = 0`
5. `runtime = 0`
6. `clean-third-party.js --dry-run` devuelve `modified: false`
7. La carga local no hace requests fuera de `127.0.0.1:<puerto>`

Criterio blando:

- `audit-interactions.js` sin diferencias importantes
- `audit-render-parity.js` usado como control visual, no como bloqueo absoluto

## Regla de oro

No persigas diffs visuales pequenos si la pagina ya pasa los checks duros.

En especial:

- si la pagina ya sirve la mejor variante local disponible de una imagen
- si no hay red externa
- si `verify-pages` esta limpio
- si `clean-third-party` no propone cambios

entonces no gastes tiempo extra en recortes finos, blur inicial, o pequenas diferencias de paridad de imagen.

## Lo que NO hay que hacer

- No reemplazar paginas completas con HTML renderizado remoto.
- No reintroducir Thunderbolt completo si la pagina visible ya aguanta staticizada.
- No aceptar requests a `static.parastorage.com`, `static.wixstatic.com`, `siteassets.parastorage.com`, `viewer-apps.parastorage.com` o similares al cerrar la pagina.
- No dejar scripts temporales `.tmp-*` tirados en el repo.

## Archivos que hay que conocer

- [server.js](/Users/ben28/Desktop/deh/descarga-express/server.js)
- [scripts/staticize-legal-pages.js](/Users/ben28/Desktop/deh/descarga-express/scripts/staticize-legal-pages.js)
- [scripts/build-simple-image-library.js](/Users/ben28/Desktop/deh/descarga-express/scripts/build-simple-image-library.js)
- [scripts/clean-third-party.js](/Users/ben28/Desktop/deh/descarga-express/scripts/clean-third-party.js)
- [scripts/verify-pages.js](/Users/ben28/Desktop/deh/descarga-express/scripts/verify-pages.js)
- [scripts/audit-render-parity.js](/Users/ben28/Desktop/deh/descarga-express/scripts/audit-render-parity.js)
- [scripts/audit-interactions.js](/Users/ben28/Desktop/deh/descarga-express/scripts/audit-interactions.js)
- [PROJECT-CONTEXT.md](/Users/ben28/Desktop/deh/descarga-express/PROJECT-CONTEXT.md)
- [PAGE_MIGRATION_360HOMESERVICE.md](/Users/ben28/Desktop/deh/descarga-express/PAGE_MIGRATION_360HOMESERVICE.md)

## Flujo obligatorio por pagina

### 1. Levantar el servidor y fijar el puerto real

Desde `descarga-express`:

```powershell
node server.js
Get-Content .server-port.json
```

Usa siempre el puerto real guardado en `.server-port.json`.

Base recomendada para herramientas:

```powershell
$env:LOCAL_BASE_URL='http://127.0.0.1:<puerto>'
```

Ruta local recomendada para comprobar paginas:

```text
http://127.0.0.1:<puerto>/www.dehonline.es/<slug>/
```

### 2. Identificar el HTML real

Ejemplo:

```text
sites/www.dehonline.es/360homeservice/index.html
```

No asumir que la ruta del `missing_pages_remote.txt` ya esta mapeada correctamente. Confirmar siempre el archivo real en `sites/`.

### 3. Medir el baseline

Ejecutar:

```powershell
node scripts/clean-third-party.js --dry-run --filter <slug>
$env:LOCAL_BASE_URL='http://127.0.0.1:<puerto>'; node scripts/verify-pages.js --filter <slug> --limit 1
```

Leer:

- `THIRD-PARTY-CLEAN-REPORT.json`
- `VERIFY-PAGES-REPORT.json`

### 4. Decidir si la pagina puede staticizarse

Si la pagina visible ya se sostiene casi completa con HTML/CSS local y no depende de widgets complejos para el contenido principal, staticizala.

Usa:

```powershell
node scripts/staticize-legal-pages.js --marker "staticized: snapshot page" .\sites\www.dehonline.es\<slug>\index.html
```

Notas:

- El script ya no es solo para legales.
- Tambien localiza fuentes de `tag-bundler`.
- Si la pagina queda staticizada, `clean-third-party` no debe volver a inyectar guardas inutiles.

### 5. Regenerar la libreria publica de imagenes si hubo cambios
Si has tocado HTML o imagenes, reconstruye la capa final `/img`:

```powershell
node scripts/build-simple-image-library.js --write
```

Objetivo:

- dejar el HTML sirviendo `/img/...`
- mantener nombres simples y carpetas por dominio/ruta
- evitar que reaparezcan rutas `assets/img` o variantes Wix en el HTML

### 6. Revalidar

Ejecutar otra vez:

```powershell
node scripts/clean-third-party.js --dry-run --filter <slug>
$env:LOCAL_BASE_URL='http://127.0.0.1:<puerto>'; node scripts/verify-pages.js --filter <slug> --limit 1
```

Objetivo:

- `modified: false` en limpieza
- `status: ok` en verificacion

### 7. Comprobar red externa

La pagina cerrada no debe salir fuera del servidor local.

Regla:

- `remoteCount` debe ser `0`
- cualquier request a CDNs de Wix significa que la pagina no esta cerrada

Se puede comprobar con Puppeteer o con la pestaña de red. Si haces un script temporal para medirlo, borralo al terminar.

### 8. Solo despues hacer checks visuales

Usa:

```powershell
$env:LOCAL_BASE_URL='http://127.0.0.1:<puerto>'; node scripts/audit-render-parity.js --route /<slug> --viewport desktop --label <slug>
$env:LOCAL_BASE_URL='http://127.0.0.1:<puerto>'; node scripts/audit-interactions.js --route /<slug> --viewport desktop --label <slug>
```

Interpretacion:

- `audit-interactions` es importante para detectar scroll/hover rotos
- `audit-render-parity` es una alarma visual, no la condicion unica de cierre

## Cuándo tocar cada archivo

### Tocar solo el HTML de la pagina

Cuando el problema es especifico de una landing o de un bloque visible concreto.

Ejemplos:

- eliminar runtime sobrante
- congelar contenido visible
- apuntar a assets ya locales

### Tocar `staticize-legal-pages.js`

Cuando el patron sirve para mas de una pagina.

Ejemplos:

- localizacion de fonts
- marcador comun de pagina staticizada
- eliminacion repetida de scripts y preloads

### Tocar `clean-third-party.js`

Cuando una pagina ya cerrada sigue saliendo como `modified: true` por un falso positivo o por runtime que ya no aplica.

Ejemplo actual:

- paginas staticizadas sin viewer model ni scripts Thunderbolt no deben recibir `telemetry guard` ni `fedops stub`

### Tocar `server.js`

Solo cuando el problema es transversal y repetible.

Ejemplos:

- resolver variantes locales de media
- elegir la mejor variante disponible bajo arboles `v1/fill/...`
- evitar caer en blur placeholders cuando existe una variante local mejor

No usar `server.js` para hacks de una sola pagina si el HTML puede resolverse directamente.

## Reglas para imagenes

- Prioriza siempre assets locales.
- La pagina final debe servir imagenes desde `/img/...`.
- Usa `public/img/` como capa publica unica y evita reintroducir `public/assets/img/`.
- No gastes tiempo en igualar al pixel el encuadre si la mejor resolucion local ya se esta sirviendo y la pagina pasa el criterio duro.
- Si una imagen sigue dando diferencia menor en paridad, documentalo y continua.

## Patrones ya conocidos

- Algunas paginas arrastran `<link href="https://cdn.jsdelivr.net/gh/SoporteSquads/SquadsChat@main/style.css" ...>`. Si aparece, quitalo del HTML; deja la pagina en verde y elimina la unica fuga remota.
- `missing_pages_remote.txt` puede dar falsos pendientes por diferencias de Unicode en slugs con tildes. Antes de reabrir un caso, confirma el HTML real en `sites/` y valida con `verify-pages` y red.

## Señales de que hay que parar y no seguir afinando

Para la pagina y pasa a la siguiente si ya se cumple esto:

- `verify-pages` limpio
- `clean-third-party --dry-run` limpio
- `remoteCount = 0`
- la pagina es usable
- scroll y hover no estan rotos
- no hay error visible grave

No seguir con:

- hero crop milimetrico
- blur inicial de imagenes si el asset final ya es local y de buena resolucion
- pequenas diferencias de iconos/footer si no rompen la pagina

## Entregable minimo por pagina

Debe quedar:

- HTML final en `sites/...`
- assets locales finales en `public/img/...`
- `VERIFY-PAGES-REPORT.json` con `status: ok`
- `THIRD-PARTY-CLEAN-REPORT.json` con `modified: false`

Opcional pero recomendable:

- una nota corta en el hilo indicando si queda algun diff visual menor tolerado

## Caso de referencia: 360homeservice

Referencia principal:

- [sites/www.dehonline.es/360homeservice/index.html](/Users/ben28/Desktop/deh/descarga-express/sites/www.dehonline.es/360homeservice/index.html)

Estado esperado tomado de ese caso:

- pagina staticizada
- fuentes localizadas
- `verify-pages` en verde
- `clean-third-party` en verde
- `remoteCount = 0`
- sin perseguir paridad fina de imagen una vez servido el mejor asset local
