# Relacion de grupos de paginas

Este documento agrupa los HTML de `descarga-express` por funcion y patron de ruta. No implica mover archivos; solo sirve para planificar congelado de contenido, limpieza y verificaciones.

## Grupo 1. Home y portada principal

- `sites/www.dehonline.es/index.html`

## Grupo 2. Paginas comerciales y de producto

- `sites/www.dehonline.es/acceso-clientes.html`
- `sites/www.dehonline.es/app-vigiladas.html`
- `sites/www.dehonline.es/book-online.html`
- `sites/www.dehonline.es/canaldedenuncias.html`
- `sites/www.dehonline.es/certibox.html`
- `sites/www.dehonline.es/comunidad.html`
- `sites/www.dehonline.es/contacto.html`
- `sites/www.dehonline.es/datos-com-propietarios-comunidades.html`
- `sites/www.dehonline.es/documbox-info.html`
- `sites/www.dehonline.es/info-control-exp-notificaciones.html`
- `sites/www.dehonline.es/lexbox.html`
- `sites/www.dehonline.es/planes-af.html`
- `sites/www.dehonline.es/plataforma-control-exp-notificaciones.html`
- `sites/www.dehonline.es/pymes.html`
- `sites/www.dehonline.es/servicios-as.html`
- `sites/www.dehonline.es/tsa.html`

## Grupo 3. Blog y discovery

- `sites/www.dehonline.es/blog.html`
- `sites/www.dehonline.es/blog/page/2.html`
- `sites/www.dehonline.es/blog/page/3.html`
- `sites/www.dehonline.es/blog/page/4.html`
- `sites/www.dehonline.es/blog/categories/administración-de-fincas.html`
- `sites/www.dehonline.es/blog/categories/inteligencia-artificial.html`

## Grupo 4. Posts del blog

- `sites/www.dehonline.es/post/carpetas-financieras-digitales-facilita-el-acceso-a-financiación-para-tu-pyme.html`
- `sites/www.dehonline.es/post/cen-el-control-que-tu-despacho-necesitaba-para-gestionar-notificaciones-electrónicas.html`
- `sites/www.dehonline.es/post/demasiado-pequeño-para-digitalizar-desmitificando-el-uso-de-herramientas-para-digitalizar-tu-admin.html`
- `sites/www.dehonline.es/post/el-verano-del-administrador-de-fincas-descanso-de-unos-tormenta-perfecta-de-otros.html`
- `sites/www.dehonline.es/post/estrenamos-nueva-imagen-en-la-web-de-deh-online.html`
- `sites/www.dehonline.es/post/hsm-la-cámara-acorazada-para-tus-certificados-digitales.html`
- `sites/www.dehonline.es/post/la-inteligencia-artificial-está-transformando-la-administración-de-fincas-de-verdad-no-en-powerpoi.html`
- `sites/www.dehonline.es/post/sabes-realmente-quién-trabaja-en-tus-comunidades-la-homologación-de-proveedores-como-sello-de-gara.html`
- `sites/www.dehonline.es/post/vas-a-pedir-un-préstamo-como-pyme-esto-es-lo-que-necesitas-tener-a-mano.html`

## Grupo 5. Comunidad y grupos

- `sites/www.dehonline.es/grupos/comunicacion-con-clientes.html`
- `sites/www.dehonline.es/grupos/energia.html`
- `sites/www.dehonline.es/grupos/factura-electronica.html`
- `sites/www.dehonline.es/grupos/financiacion-pymes.html`
- `sites/www.dehonline.es/grupos/riesgos-laborales.html`
- `sites/www.dehonline.es/grupos/tecnologia.html`

## Grupo 6. Legal y politicas

- `sites/www.dehonline.es/condiciones-de-uso.html`
- `sites/www.dehonline.es/politica-de-compliance.html`
- `sites/www.dehonline.es/politica-de-cookies.html`
- `sites/www.dehonline.es/politica-de-privacidad.html`
- `sites/www.dehonline.es/política-de-privacidad-para-redes-sociales.html`

## Grupo 7. Portales, soporte y panel

- `sites/documbox.dehonline.es/index.html`
- `sites/panel.dehonline.es/auth/login.html`
- `sites/soporte.dehonline.es/index.html`
- `sites/www.consola.dehonline.es/index.html`
- `sites/www.soporte.dehonline.es/index.html`

## Grupo 8. HTML internos de assets

- `public/assets/misc/encrypted-tbn2.gstatic.com/images/index.html`
- `public/assets/misc/services/editor-elements-library/dist/siteAssets/media/Carousel.f4b92e4d.html`

## Lectura operativa

- Grupo 1: candidato prioritario para congelado parcial del contenido renderizado.
- Grupo 2: paginas de producto; suelen admitir congelado selectivo por secciones.
- Grupo 3: listados; suelen mezclar contenido visible congelable con runtime de Wix.
- Grupo 4: posts; suelen poder estabilizarse mejor que los listados.
- Grupo 5: mayor probabilidad de depender de datos dinamicos o JSON embebido.
- Grupo 6: candidatas a HTML totalmente estatico.
- Grupo 7: suelen depender de subdominio real, login o backend.
- Grupo 8: no son paginas de usuario final; se tratan como assets internos.
