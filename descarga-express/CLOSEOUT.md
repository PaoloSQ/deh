# Cierre de migracion (descarga-express)

Fecha: 2026-03-17

## Estado tecnico

- Alcance de migracion completado.
- Verificacion automatica global sobre `sites/` completada sin incidencias:
  - `processed: 48`
  - `localFileIssues: 0`
  - `localApiIssues: 0`
  - `thirdPartyIssues: 0`
  - `runtimeIssues: 0`

Comando de referencia:

```bash
node scripts/verify-pages.js --filter sites/
```

## QA automatizada ejecutada

### Visual parity (local vs remoto)

- Desktop (rutas criticas: `/`, `/blog`, `/book-online`, `/contacto`, `/documbox-info`, `/acceso-clientes`, `/comunidad`):
  - Home (`/`): `1` mismatch (`layout-drift`).
  - Contacto (`/contacto`): `1` mismatch (`layout-drift`).
  - Resto del bloque: `0` mismatches.
- Mobile (mismo bloque):
  - Home (`/`): `1` mismatch (`layout-drift`).
  - Contacto (`/contacto`): `1` mismatch (`layout-drift`).
  - Resto del bloque: `0` mismatches.

Notas:

- Se corrigio ruido de auditoria por lazy-load forzando carga eager en local para QA en:
  - `public/assets/js/local/image-fallback.js`
- El drift residual en Home/Contacto es leve y no bloqueante (alineacion/altura global).

### Interacciones (hover + scroll reveal)

- Desktop:
  - `/`, `/blog`, `/book-online`, `/contacto`, `/documbox-info`
  - Resultado: `hoverDifferences: 0`, `scrollDifferences: 0`.
- Mobile:
  - `/`, `/contacto`
  - Resultado: `hoverDifferences: 0`, `scrollDifferences: 0`.

## Ajustes de cierre aplicados

- Sincronizacion de avatares reales locales y manifiesto:
  - `scripts/sync-author-avatars.js`
  - `public/assets/data/avatar-manifest.json`
  - `public/assets/img/avatars/*`
- Endurecimiento de fallback de imagenes locales:
  - `public/assets/js/local/image-fallback.js`
- Correccion de media faltante en blog/home para eliminar 404 locales:
  - archivos añadidos en `public/assets/img/media/`

## Checklist QA manual recomendada

1. Home
  - Revisar hero principal y bloques de imagen.
  - Validar menu, enlaces principales y login social bar.
2. Blog
  - Revisar `blog`, `blog/page/2`, `blog/page/3`, `blog/page/4`.
  - Confirmar avatares y miniaturas de posts.
3. Formularios
  - Validar `contacto`, `book-online`, `documbox-info`.
  - Confirmar carga de campos y validaciones visuales.
4. Portales
  - Revisar `documbox`, `panel/login`, `soporte`, `consola`.

## URLs locales clave

- `http://www.dehonline.es:8080/`
- `http://www.dehonline.es:8080/blog`
- `http://www.dehonline.es:8080/book-online`
- `http://www.dehonline.es:8080/contacto`
- `http://www.dehonline.es:8080/documbox-info`
- `http://panel.dehonline.es:8080/auth/login`
- `http://documbox.dehonline.es:8080/`
