(function () {
  function getFocusableElements(container) {
    return Array.from(
      container.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute("hidden"));
  }

  function buildMailtoUrl(form) {
    const formData = new FormData(form);
    const isPhoneForm = form.dataset.helpForm === "phone";
    const subject = isPhoneForm
      ? "Solicitud de llamada desde DEH Online"
      : "Consulta comercial desde DEH Online";
    const intro = isPhoneForm
      ? "Quiero que me llaméis desde la web de DEH Online."
      : "Quiero recibir información comercial desde la web de DEH Online.";
    const firstName = formData.get("firstName") || formData.get("name") || "-";
    const lastName = formData.get("lastName") || "-";
    const lines = isPhoneForm
      ? [
          intro,
          "",
          "Nombre: " + firstName,
          "Apellido: " + lastName,
          "Teléfono: " + (formData.get("phone") || "-"),
          "Email: " + (formData.get("email") || "-"),
          "",
          "Comunidad DEH Online: " + (formData.get("community") ? "Sí" : "No"),
          "Comunicaciones comerciales: " +
            (formData.get("communications") ? "Sí" : "No"),
        ]
      : [
          intro,
          "",
          "Nombre: " + firstName,
          "Empresa: " + (formData.get("company") || "-"),
          "Teléfono: " + (formData.get("phone") || "-"),
          "Email: " + (formData.get("email") || "-"),
          "",
          "Mensaje:",
          formData.get("message") || "-",
        ];

    return (
      "mailto:comercial@deh.es?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(lines.join("\n"))
    );
  }

  function initHelpModals() {
    const modalLayer = document.querySelector("[data-help-modal-layer]");

    if (!modalLayer || modalLayer.dataset.initialized === "true") {
      return;
    }

    modalLayer.dataset.initialized = "true";

    const triggers = Array.from(
      document.querySelectorAll("[data-help-modal-trigger]"),
    );
    const modals = Array.from(modalLayer.querySelectorAll("[data-help-modal]"));
    const forms = Array.from(modalLayer.querySelectorAll("[data-help-form]"));

    let activeModal = null;
    let activeTrigger = null;

    function setModalVisibility(modal, isVisible) {
      modal.hidden = !isVisible;
      modal.setAttribute("aria-hidden", String(!isVisible));
    }

    function closeModal() {
      if (!activeModal) {
        return;
      }

      modals.forEach((modal) => setModalVisibility(modal, false));
      modalLayer.hidden = true;
      modalLayer.setAttribute("aria-hidden", "true");
      document.body.classList.remove("help-modal-open");

      const triggerToRestore = activeTrigger;
      activeModal = null;
      activeTrigger = null;

      if (triggerToRestore && typeof triggerToRestore.focus === "function") {
        triggerToRestore.focus();
      }
    }

    function openModal(key, trigger) {
      const targetModal = modalLayer.querySelector(
        '[data-help-modal="' + key + '"]',
      );

      if (!targetModal) {
        return;
      }

      modals.forEach((modal) =>
        setModalVisibility(modal, modal === targetModal),
      );
      modalLayer.hidden = false;
      modalLayer.setAttribute("aria-hidden", "false");
      document.body.classList.add("help-modal-open");

      activeModal = targetModal;
      activeTrigger = trigger;

      window.requestAnimationFrame(() => {
        const focusableElements = getFocusableElements(targetModal);
        const elementToFocus = focusableElements[0] || targetModal;
        elementToFocus.focus();
      });
    }

    triggers.forEach((trigger) => {
      trigger.addEventListener("click", () => {
        openModal(trigger.dataset.helpModalTrigger, trigger);
      });
    });

    forms.forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();

        if (!form.reportValidity()) {
          return;
        }

        window.location.href = buildMailtoUrl(form);
      });
    });

    modalLayer.addEventListener("click", (event) => {
      if (event.target.closest("[data-help-modal-close]")) {
        closeModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (!activeModal) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements(activeModal);

      if (focusableElements.length === 0) {
        event.preventDefault();
        activeModal.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHelpModals);
  } else {
    initHelpModals();
  }
})();
