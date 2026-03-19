# Public Structure Proposal

## Objetivo

Reorganizar `public/` para que sea:

- legible
- escalable
- compatible con las rutas actuales
- migrable por fases sin romper el sitio

## Estado actual

Hoy `public/` mezcla cuatro capas distintas:

- `assets/`: vendor, fuentes, JS, CSS y misc heredado
- `css/`: CSS propio/localizado de páginas
- `img/`: imágenes servidas por rutas locales
- `media/`: recursos sueltos adicionales

Además, dentro de `css/` conviven:

- `pages/`: CSS heredado por página
- `shared/`: CSS deduplicado exacto
- `structured/`: nuevos entrypoints semánticos

## Estructura objetivo

```text
public/
  assets/
    vendor/
      wix/
        css/
        js/
      blog/
      bookings/
      groups/
    fonts/
    data/
    misc/

  styles/
    foundation/
      reset.css
      tokens.css
      typography.css
      utilities.css
    vendor/
      wix-core.css
      wix-widgets.css
      blog.css
      bookings.css
      groups.css
    layout/
      header.css
      footer.css
      sections.css
      forms.css
      cards.css
      modals.css
    families/
      commercial.css
      blog-list.css
      blog-post.css
      partners.css
      booking.css
      profiles.css
      legal.css
    pages/
      home.css
      contacto.css
      acceso-clientes.css
    overrides/
      360homeservice.css
      acuerdo-ecpj.css
    structured/
      pages/
        home/
          head.css
        360homeservice/
          head.css
        acuerdo-ecpj/
          head.css

  images/
    shared/
    pages/
      www-dehonline-es/
    media/

  js/
    local/
    app/
    vendor/
```

## Mapeo desde la estructura actual

### Mantener por compatibilidad inmediata

- `public/css/pages/`
- `public/css/shared/`
- `public/css/structured/`
- `public/assets/js/`
- `public/assets/css/`
- `public/img/`
- `public/media/`

### Introducir como nueva capa estable

- `public/styles/`
- `public/images/`
- `public/js/`
- `public/assets/vendor/`

## Reglas de migración

### 1. No romper rutas existentes

Mientras haya HTML apuntando a rutas actuales, no se eliminan:

- `/css/pages/...`
- `/css/shared/...`
- `/img/...`
- `/media/...`
- `/assets/...`

### 2. Mover primero por alias, no por sustitución agresiva

La primera fase debe ser:

- crear entrypoints limpios en `styles/` o `css/structured/`
- mantener el orden real de carga
- reutilizar el CSS existente mediante `@import` o wrappers

### 3. Separar vendor de sitio

Todo lo que siga siendo runtime heredado o CSS de servicios debe vivir como vendor:

- Wix thunderbolt
- bookings
- blog
- groups
- widgets TPA

### 4. Separar semántica de página

Lo que hoy son `style-001.css`, `style-002.css`, etc. debe ir migrando a:

- `foundation/`
- `vendor/`
- `layout/`
- `families/`
- `pages/`
- `overrides/`

### 5. Overrides mínimos

Un archivo en `overrides/` sólo debe existir si:

- afecta a una sola página
- no puede vivir razonablemente en `families/` o `layout/`

## Ruta recomendada por fases

### Fase 1

- Mantener `assets/`, `css/`, `img/`, `media/`
- Seguir consolidando CSS repetido en `css/shared/`
- Usar `css/structured/` como entrypoints semánticos de bajo riesgo

### Fase 2

- Crear `styles/foundation/`
- Extraer fuentes, tokens y base tipográfica
- Crear `styles/vendor/`

### Fase 3

- Crear `styles/layout/` y `styles/families/`
- Reescribir entrypoints de páginas clave para consumir estas capas

### Fase 4

- Pasar imágenes nuevas a `images/`
- Pasar JS local nuevo a `js/local/` y `js/app/`
- Dejar `assets/` sólo para vendor y legado

### Fase 5

- Cuando una familia esté completamente migrada, eliminar dependencias antiguas de `css/pages/...`

## Recomendación práctica ahora

Si seguimos mañana, el mejor siguiente paso es:

1. crear `public/styles/foundation/`
2. mover ahí fuentes y tokens globales
3. seguir ampliando `public/css/structured/pages/`
4. no mover aún `img/`, `media/` ni `assets/` hasta cerrar CSS
