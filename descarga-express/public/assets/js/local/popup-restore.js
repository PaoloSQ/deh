(function () {
  var POPUP_ROOT_ID = 'deh-local-popup-root';
  var POPUP_OPEN_CLASS = 'deh-popup-open';
  var STYLE_ID = 'deh-local-popup-styles';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      'body.' + POPUP_OPEN_CLASS + ' { overflow: hidden; }',
      '#' + POPUP_ROOT_ID + ' { position: fixed; inset: 0; display: none; z-index: 200010; }',
      '#' + POPUP_ROOT_ID + '[data-open="true"] { display: block; }',
      '#' + POPUP_ROOT_ID + ' .deh-popup-backdrop { position: absolute; inset: 0; background: rgba(12, 18, 28, 0.64); }',
      '#' + POPUP_ROOT_ID + ' .deh-popup-shell { position: relative; display: flex; align-items: center; justify-content: center; min-height: 100%; padding: 24px; }',
      '#' + POPUP_ROOT_ID + ' .deh-popup-card { position: relative; width: min(100%, 560px); background: #ffffff; color: #282936; border-radius: 24px; box-shadow: 0 22px 70px rgba(0, 0, 0, 0.22); padding: 28px 28px 24px; font-family: montserrat, Arial, sans-serif; }',
      '#' + POPUP_ROOT_ID + ' .deh-popup-close { position: absolute; top: 14px; right: 14px; width: 40px; height: 40px; border: 0; border-radius: 999px; background: #f3f4f6; color: #282936; cursor: pointer; font-size: 20px; line-height: 1; }',
      '#' + POPUP_ROOT_ID + ' .deh-popup-eyebrow { margin: 0 0 10px; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #c2274b; }',
      '#' + POPUP_ROOT_ID + ' .deh-popup-title { margin: 0 0 12px; font-size: clamp(26px, 4vw, 34px); line-height: 1.1; }',
      '#' + POPUP_ROOT_ID + ' .deh-popup-copy { margin: 0 0 18px; font-size: 15px; line-height: 1.65; color: #505562; }',
      '#' + POPUP_ROOT_ID + ' .deh-popup-copy p { margin: 0 0 12px; }',
      '#' + POPUP_ROOT_ID + ' .deh-popup-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 22px; }',
      '#' + POPUP_ROOT_ID + ' .deh-popup-action { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 18px; border-radius: 999px; border: 1px solid #c2274b; color: #c2274b; text-decoration: none; font-size: 14px; font-weight: 700; }',
      '#' + POPUP_ROOT_ID + ' .deh-popup-action[data-primary="true"] { background: #c2274b; color: #ffffff; }',
      '#' + POPUP_ROOT_ID + ' .deh-popup-meta { display: grid; gap: 10px; margin-top: 18px; padding: 14px 16px; border-radius: 16px; background: #fff3f0; color: #6a2f3c; font-size: 13px; line-height: 1.5; }',
      '@media (max-width: 640px) {',
      '  #' + POPUP_ROOT_ID + ' .deh-popup-shell { padding: 16px; }',
      '  #' + POPUP_ROOT_ID + ' .deh-popup-card { padding: 24px 18px 18px; border-radius: 20px; }',
      '  #' + POPUP_ROOT_ID + ' .deh-popup-actions { flex-direction: column; }',
      '  #' + POPUP_ROOT_ID + ' .deh-popup-action { width: 100%; }',
      '}'
    ].join('\n');

    document.head.appendChild(style);
  }

  function ensureRoot() {
    var root = document.getElementById(POPUP_ROOT_ID);
    if (root) return root;

    root = document.createElement('div');
    root.id = POPUP_ROOT_ID;
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = [
      '<div class="deh-popup-backdrop" data-popup-close="true"></div>',
      '<div class="deh-popup-shell">',
      '  <section class="deh-popup-card" role="dialog" aria-modal="true" aria-labelledby="deh-popup-title">',
      '    <button type="button" class="deh-popup-close" aria-label="Cerrar" data-popup-close="true">×</button>',
      '    <p class="deh-popup-eyebrow" id="deh-popup-eyebrow"></p>',
      '    <h2 class="deh-popup-title" id="deh-popup-title"></h2>',
      '    <div class="deh-popup-copy" id="deh-popup-copy"></div>',
      '    <div class="deh-popup-meta" id="deh-popup-meta" hidden></div>',
      '    <div class="deh-popup-actions" id="deh-popup-actions"></div>',
      '  </section>',
      '</div>'
    ].join('');

    root.addEventListener('click', function (event) {
      var target = event.target;
      if (target && target.getAttribute('data-popup-close') === 'true') {
        closePopup();
      }
    });

    document.body.appendChild(root);
    return root;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderParagraphs(lines) {
    return (lines || [])
      .map(function (line) {
        return '<p>' + escapeHtml(line) + '</p>';
      })
      .join('');
  }

  function getPopupDefinition(popupId) {
    if (popupId === 'ik1hh') {
      return {
        eyebrow: 'Contacto',
        title: 'Formulario de contacto',
        copy: [
          'Rellena el formulario y cuentanos tu caso.',
          'Nuestro equipo se pondra en contacto contigo para ayudarte y guiarte en el proceso.'
        ],
        meta: [
          'En el sitio original este boton abre un lightbox de Wix con acceso al formulario.',
          'En local lo restauramos con acceso directo a la ruta disponible.'
        ],
        actions: [
          { label: 'Abrir soporte', href: '/www.soporte.dehonline.es/', target: '_blank', primary: true },
          { label: 'Ir a contacto', href: '/www.dehonline.es/contacto', target: '_self' },
          { label: 'Acceso clientes', href: '/www.dehonline.es/acceso-clientes', target: '_self' }
        ]
      };
    }

    if (popupId === 'smykc') {
      return {
        eyebrow: 'Ayuda rapida',
        title: 'Atencion por WhatsApp',
        copy: [
          'El icono verde del sitio original dependia del runtime de Wix para lanzar la accion contextual.',
          'En esta copia local mantenemos la interaccion ofreciendote las vias reales de contacto disponibles.'
        ],
        meta: [
          'Si mas adelante localizamos el destino exacto de WhatsApp, se puede conectar aqui sin tocar el HTML exportado.'
        ],
        actions: [
          { label: 'Abrir soporte', href: '/www.soporte.dehonline.es/', target: '_blank', primary: true },
          { label: 'Formulario de contacto', href: '/www.dehonline.es/acceso-clientes', target: '_self' }
        ]
      };
    }

    return null;
  }

  function getLoginDefinition(trigger) {
    var isBlog = !!(trigger && trigger.getAttribute('data-hook') === 'login-button');
    return {
      eyebrow: 'Area privada',
      title: isBlog ? 'Inicia sesion o registrate' : 'Iniciar sesion',
      copy: [
        'Esta accion en el sitio original dependia de Wix Members y no queda operativa en el export estatico.',
        'Te redirigimos a los accesos reales que si estan disponibles en local.'
      ],
      meta: [
        'Puedes seguir validando la navegacion a Panel Clientes y Consola de servicios desde aqui.'
      ],
      actions: [
        { label: 'Panel Clientes', href: '/panel.dehonline.es/auth/login', target: '_blank', primary: true },
        { label: 'Consola de servicios', href: '/www.consola.dehonline.es/', target: '_blank' },
        { label: 'Acceso clientes', href: '/www.dehonline.es/acceso-clientes', target: '_self' }
      ]
    };
  }

  function openPopup(definition) {
    if (!definition) return;

    injectStyles();
    var root = ensureRoot();
    var eyebrow = root.querySelector('#deh-popup-eyebrow');
    var title = root.querySelector('#deh-popup-title');
    var copy = root.querySelector('#deh-popup-copy');
    var meta = root.querySelector('#deh-popup-meta');
    var actions = root.querySelector('#deh-popup-actions');

    eyebrow.textContent = definition.eyebrow || '';
    title.textContent = definition.title || '';
    copy.innerHTML = renderParagraphs(definition.copy);
    actions.innerHTML = '';

    if (definition.meta && definition.meta.length) {
      meta.hidden = false;
      meta.innerHTML = renderParagraphs(definition.meta);
    } else {
      meta.hidden = true;
      meta.innerHTML = '';
    }

    (definition.actions || []).forEach(function (action) {
      var link = document.createElement('a');
      link.className = 'deh-popup-action';
      link.href = action.href;
      link.target = action.target || '_self';
      if (action.target === '_blank') {
        link.rel = 'noreferrer noopener';
      }
      link.textContent = action.label;
      if (action.primary) {
        link.setAttribute('data-primary', 'true');
      }
      actions.appendChild(link);
    });

    root.setAttribute('data-open', 'true');
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add(POPUP_OPEN_CLASS);
  }

  function closePopup() {
    var root = document.getElementById(POPUP_ROOT_ID);
    if (!root) return;
    root.setAttribute('data-open', 'false');
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove(POPUP_OPEN_CLASS);
  }

  function handleTriggerClick(event) {
    var trigger = event.target.closest('[data-popupid], [data-testid="handle-button"], [data-hook="login-button"]');
    if (!trigger) return;

    if (trigger.hasAttribute('data-popupid')) {
      var popupId = trigger.getAttribute('data-popupid');
      var definition = getPopupDefinition(popupId);
      if (!definition) return;
      event.preventDefault();
      openPopup(definition);
      return;
    }

    if (trigger.getAttribute('data-testid') === 'handle-button' || trigger.getAttribute('data-hook') === 'login-button') {
      event.preventDefault();
      openPopup(getLoginDefinition(trigger));
    }
  }

  function handleEsc(event) {
    if (event.key === 'Escape') {
      closePopup();
    }
  }

  document.addEventListener('click', handleTriggerClick);
  document.addEventListener('keydown', handleEsc);
})();
