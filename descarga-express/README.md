# descarga-express

Servidor Express para exponer todo el contenido de descargas como estático.

## Uso

1. Instala dependencias:

```bash
npm install
```

2. Arranca en modo normal:

```bash
npm start
```

3. Accede en:

- `http://localhost:8080/`
- `http://localhost:8080/health`

## Estructura

- El contenido web se sirve desde `descargas` dentro de este proyecto.
- Organizacion interna:
	- `descargas/sites`: dominios y subdominios dehonline.
	- `descargas/shared`: assets compartidos (wix/parastorage).
	- `descargas/third-party`: recursos de terceros puntuales.
	- `descargas/cap`, `descargas/js`, `descargas/images`, `descargas/assets`: rutas legacy de raiz.
- El servidor mantiene compatibilidad con rutas historicas:
	- Busca primero en raiz y luego en `sites`, `shared`, `third-party`.
	- Resuelve rutas directas, sin extension y tipo carpeta con `index.html`.

## Variables opcionales

- `PORT`: puerto del servidor (por defecto `8080`).
- `NODE_ENV`: en `development` desactiva caché estática.

## Comparacion renderizada

Compara cada HTML local contra la version renderizada del dominio real y espera a que la pagina se estabilice antes de decidir.

```bash
npm run compare-rendered -- --filter blog/page/3
```

Opciones utiles:

- `--replace`: reemplaza el HTML local por el HTML renderizado remoto si hay diferencias.
- `--only-different`: deja en el informe solo paginas distintas o con error.
- `--limit N`: limita el numero de paginas analizadas.
- `--filter texto`: filtra por ruta o URL.

Salidas:

- `RENDER-COMPARE-REPORT.md`
- `RENDER-COMPARE-REPORT.json`

## Limpieza de terceros

Elimina integraciones de tracking y monitorizacion incrustadas en los HTML sin tocar `Thunderbolt`.

```bash
npm run clean-third-party -- --filter blog/page/3
```

Opciones utiles:

- `--dry-run`: analiza y genera informe sin escribir cambios.
- `--limit N`: limita el numero de paginas analizadas.
- `--filter texto`: filtra por ruta.

Salidas:

- `THIRD-PARTY-CLEAN-REPORT.md`
- `THIRD-PARTY-CLEAN-REPORT.json`

## Verificacion de paginas

Abre las paginas en localhost con Puppeteer y clasifica incidencias en archivos locales, API local, terceros y runtime.

```bash
npm run verify-pages -- --filter blog/page/3
```

Opciones utiles:

- `--limit N`: limita el numero de paginas analizadas.
- `--filter texto`: filtra por ruta.
- `--timeout ms`: timeout maximo por pagina.

Salidas:

- `VERIFY-PAGES-REPORT.md`
- `VERIFY-PAGES-REPORT.json`
