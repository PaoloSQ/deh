# Migración y limpieza: 360homeservice

Objetivo: dejar la página `360homeservice` en `descarga-express/sites/www.dehonline.es/360homeservice/index.html` funcionando con todos los recursos locales (imágenes, js, css, pdfs), sin peticiones a CDNs/trackers no deseados, y verificable con `verify-pages.js`.

Checklist general
- [ ] HTML original respaldado (`index.html.bak`).
- [ ] Ejecutar limpieza de terceros (`clean-third-party.js`) en modo dry-run y revisar reporte.
- [ ] Aplicar `clean-third-party.js` (modo escritura) si OK.
- [ ] Descargar recursos externos (bundles, CSS, imágenes) y reescribir referencias locales (script: `download-external-assets.js`).
- [ ] Descargar imágenes específicas con `scripts/extraer-y-descargar-imagenes.js` si procede.
- [ ] Ejecutar `verify-pages.js` y arreglar incidencias locales (local-file, local-api, runtime).
- [ ] Ajustes al `viewerModel` si hay `pageerror` por claves faltantes (parche no destructivo).

Scripts añadidos / uso
- `node scripts/download-external-assets.js --filter 360homeservice`
  - Busca URLs externas (siteassets.parastorage.com, static.parastorage.com, static.wixstatic.com, unpkg, viewer-apps, filesusr), las descarga a `public/assets/external/<host>/...` y reescribe el HTML apuntando a `/assets/...`.
  - Genera `DOWNLOAD-EXTERNAL-ASSETS-REPORT.json` con resumen.

Flujo recomendado (paso a paso)
1. Backup:
   - Asegurar `index.html.bak` existe.

2. Limpieza inicial (dry-run):
   - cd `descarga-express`
   - node scripts/clean-third-party.js --dry-run --filter 360homeservice
   - Revisar `THIRD-PARTY-CLEAN-REPORT.json`

3. Aplicar limpieza:
   - node scripts/clean-third-party.js --filter 360homeservice

4. Descargar y reescribir activos externos:
   - node scripts/download-external-assets.js --filter 360homeservice
   - Revisar `public/assets/external/` y `DOWNLOAD-EXTERNAL-ASSETS-REPORT.json`

5. Descargar imágenes Wix (opcional complementario):
   - Ajustar `scripts/extraer-y-descargar-imagenes.js` `config.htmlPath` si necesario y ejecutar.

6. Verificar página:
   - node scripts/verify-pages.js --filter 360homeservice --limit 1
   - Revisar `VERIFY-PAGES-REPORT.json`/`.md`.

7. Arreglos finos:
   - Si hay `local-file` issues: localizar y colocar archivos en la ruta esperada.
   - Si hay `local-api` issues: decidir si mockear o aceptar la ausencia.
   - Si hay `runtime`/`pageerror`: inspeccionar consola reportada y ajustar `wix-viewer-model` JSON (asegurar keys mínimas) o volver a traer bundles faltantes.

Notas técnicas y convenciones
- Rutas locales: el script escribe bajo `descarga-express/public/assets/external/<host>/...` y reescribe referencias en el HTML a `/assets/external/<host>/...`. Esto respeta la convención de servir assets desde `public/assets`.
- Para Wix/Thunderbolt puede ser necesario traer paquetes `siteassets.parastorage.com/pages/pages/thunderbolt?...`. El script los descarga (nombra archivos con la query sanetizada) pero algunos paquetes esperan rutas concretas; en ese caso el enfoque es servirlos tal cual bajo `/assets/` y dejar que `clean-third-party`/`viewerModel` apunten a la base local.

Mejoras propuestas y script de soporte
- `download-external-assets.js` (añadido) automatiza la descarga y reescritura.
- Si procesas muchas páginas, se puede mejorar para:
  - detectar dependencias requeridas por thunderbolt y copiar la estructura exacta `wix-thunderbolt/dist/...` en `/assets/js/wix-thunderbolt/...`.
  - paralelizar descargas y reintentos.

Resultados esperados por página
- `VERIFY-PAGES-REPORT.json` sin `third-party` y con `local-file: 0` y `local-api` aceptable o documentado. `runtime` idealmente 0.

Si quieres, ejecuto ahora la importación final y la descarga de activos para `360homeservice`, aplico ajustes y vuelvo con el reporte completo.
