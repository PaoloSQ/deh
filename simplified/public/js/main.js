/* ========================================
   DEH Online - JavaScript Principal
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {
  console.log('DEH Online - Sitio cargado');
  
  initMobileMenu();
  initSmoothScroll();
  initAnimations();
});

/**
 * Menú móvil
 */
function initMobileMenu() {
  const menuToggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');
  
  if (menuToggle && nav) {
    menuToggle.addEventListener('click', () => {
      nav.classList.toggle('active');
      menuToggle.classList.toggle('active');
    });
  }
}

/**
 * Scroll suave para anclas
 */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href !== '#') {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({
            behavior: 'smooth'
          });
        }
      }
    });
  });
}

/**
 * Animaciones al scroll
 */
function initAnimations() {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.card, .section').forEach(el => {
    observer.observe(el);
  });
}

/**
 * Utilidad: mostrar/ocultar elementos
 */
function toggleElement(selector) {
  const element = document.querySelector(selector);
  if (element) {
    element.classList.toggle('hidden');
  }
}

/**
 * Utilidad: añadir clase al hacer scroll
 */
function addClassOnScroll(selector, className) {
  window.addEventListener('scroll', () => {
    const element = document.querySelector(selector);
    if (element) {
      if (window.scrollY > 100) {
        element.classList.add(className);
      } else {
        element.classList.remove(className);
      }
    }
  });
}

window.DEH = {
  toggleElement,
  addClassOnScroll
};
