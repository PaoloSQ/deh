/* JavaScript Común - Funciones compartidas */

document.addEventListener("DOMContentLoaded", () => {
  console.log("DEH Online cargado");
  initCookieBanner();
});

function initCookieBanner() {
  const banner = document.querySelector("[data-cookie-banner]");
  const modal = document.querySelector("[data-cookie-modal]");
  const launcher = document.querySelector(".cookie-launcher");
  if (!banner || !modal) {
    return;
  }

  const storageKey = "deh_cookie_preference";
  let savedPreference = null;

  try {
    savedPreference = window.localStorage.getItem(storageKey);
  } catch (error) {
    savedPreference = null;
  }

  if (savedPreference) {
    banner.classList.add("is-hidden");
  }
  toggleCookieLauncher(launcher, banner);

  const actions = document.querySelectorAll("[data-cookie-action]");
  actions.forEach((button) => {
    button.addEventListener("click", () => {
      const preference = button.getAttribute("data-cookie-action") || "custom";
      try {
        window.localStorage.setItem(storageKey, preference);
      } catch (error) {
        // Ignore storage failures and still close the banner.
      }
      banner.classList.add("is-hidden");
      closeCookieModal(modal, banner);
      toggleCookieLauncher(launcher, banner);
    });
  });

  const configTriggers = document.querySelectorAll("[data-cookie-config-trigger]");
  configTriggers.forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      openCookieModal(modal, banner);
    });
  });

  const closeButtons = modal.querySelectorAll("[data-cookie-modal-close]");
  closeButtons.forEach((button) => {
    button.addEventListener("click", () => closeCookieModal(modal, banner));
  });

  const saveButton = modal.querySelector("[data-cookie-save]");
  if (saveButton) {
    saveButton.addEventListener("click", () => {
      try {
        window.localStorage.setItem(storageKey, "custom");
      } catch (error) {
        // Ignore storage failures and still apply UI changes.
      }
      banner.classList.add("is-hidden");
      closeCookieModal(modal, banner);
      toggleCookieLauncher(launcher, banner);
    });
  }

  const tabs = modal.querySelectorAll("[data-cookie-tab]");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const selected = tab.getAttribute("data-cookie-tab");
      tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
      const tabItems = modal.querySelectorAll(".cookie-modal__tablist li");
      tabItems.forEach((item) => {
        const itemTab = item.querySelector("[data-cookie-tab]");
        item.classList.toggle("is-active", itemTab === tab);
      });
      const panels = modal.querySelectorAll("[data-cookie-panel]");
      panels.forEach((panel) => {
        const name = panel.getAttribute("data-cookie-panel");
        panel.classList.toggle("is-active", name === selected);
      });
    });
  });

  const collapsers = modal.querySelectorAll("[data-cookie-collapse]");
  collapsers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const option = trigger.closest(".cookie-modal__option");
      if (!option) {
        return;
      }
      option.classList.toggle("is-open");
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCookieModal(modal, banner);
    }
  });
}

function openCookieModal(modal, banner) {
  modal.hidden = false;
  banner?.classList.add("is-modal-open");
  document.body.style.overflow = "hidden";
}

function closeCookieModal(modal, banner) {
  modal.hidden = true;
  banner?.classList.remove("is-modal-open");
  document.body.style.overflow = "";
}

function toggleCookieLauncher(launcher, banner) {
  if (!launcher || !banner) {
    return;
  }
  const bannerHidden = banner.classList.contains("is-hidden");
  launcher.classList.toggle("is-visible", bannerHidden);
}

function initMobileMenu() {
  // Menú móvil si es necesario
}

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      const href = this.getAttribute("href");
      if (href !== "#") {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({ behavior: "smooth" });
        }
      }
    });
  });
}
