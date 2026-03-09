/* JavaScript Común - Funciones compartidas */

document.addEventListener('DOMContentLoaded', () => {
  console.log('DEH Online cargado');
});

function initMobileMenu() {
  // Menú móvil si es necesario
}

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href !== '#') {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });
}
