# Estado de Imagenes (Home)

Documento corto del estado actual del flujo de imagenes.

## Estado actual

- Flujo vigente: `extraer-y-descargar-imagenes.js` -> `renombrar-imagenes-descriptivo.js`
- Carpeta final: `simplified/public/img/home/`
- Rutas finales en plantilla: `/img/home/<archivo>`

## Comandos

Desde la raiz del repo:

```bash
node scripts/workflow.js home
```

O en modo manual:

```bash
node scripts/extraer-y-descargar-imagenes.js
node scripts/renombrar-imagenes-descriptivo.js
```

## Verificacion rapida

- Plantilla: `simplified/src/pages/index.handlebars`
- Buscar rutas: `/img/home/`
- Confirmar archivos existentes en: `simplified/public/img/home/`

## Nota

El detalle de renombrados se actualiza en `IMAGENES-RENOMBRADO.md` cuando se ejecuta el script de renombrado sobre archivos temporales de categoria (`hero-1`, `stats-1`, etc.).
