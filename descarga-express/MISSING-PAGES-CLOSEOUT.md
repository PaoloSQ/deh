# Missing Pages Closeout

## Estado

La tanda de paginas listadas en `../reports/missing_pages_remote.txt` queda cerrada operativamente en `descarga-express`.

Checks usados para cerrar lotes:

- `node scripts/clean-third-party.js --dry-run ...` con `modified: 0`
- `node scripts/build-simple-image-library.js --write`
- `$env:LOCAL_BASE_URL='http://127.0.0.1:<puerto>'; node scripts/verify-pages.js ...` con todo a `0`
- auditoria Puppeteer de red con `remoteCount = 0`

## Scripts nuevos/actualizados que forman parte del flujo

- `scripts/build-simple-image-library.js`
- `scripts/staticize-legal-pages.js`
- `scripts/clean-third-party.js`
- `server.js`
- `public/assets/js/local/image-fallback.js`

## Nota importante sobre el TXT de missing

`missing_pages_remote.txt` puede seguir mostrando algunos slugs de `post/*` o rutas con tildes aunque ya esten cerradas.

Motivo:

- diferencias de normalizacion Unicode en los slugs
- comparacion textual del TXT, no validacion contra el HTML real ya presente en `sites/`

Antes de reabrir una de esas URLs:

1. confirma el archivo real en `sites/`
2. ejecuta `verify-pages.js` sobre esa ruta
3. confirma `remoteCount = 0`

Si pasa esos checks, tratala como cerrada aunque siga apareciendo en el TXT.

## Ultimo remanente esperado

Si en algun momento vuelve a aparecer un pendiente real, el criterio no es el TXT sino los checks duros del runbook.
