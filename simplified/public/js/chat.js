const CHAT_BUNDLE_URL =
  "https://cdn.jsdelivr.net/gh/SoporteSquads/SquadsChat@main/chat.bundle.es.js";
const CHAT_STORAGE_KEY = "chatHistory";
const CHAT_WEBHOOK_URL =
  "https://auto.srv791713.hstgr.cloud/webhook/c20da08e-c54a-4997-8971-a877ca5fc12c/chat";
const DEFAULT_MESSAGES = [
  "\u00a1Bienvenido a Deh Online! \ud83d\udc4b",
  "Me llamo Celia",
  "\u00bfEn qu\u00e9 puedo ayudarte hoy? \ud83d\ude0a",
];

const FALLBACK_CHAT_ID = "deh-chat-fallback";
const CHAT_BASE_STYLE_ID = "deh-chat-base-style";
const CHAT_BASE_STYLE_URL = "https://cdn.jsdelivr.net/npm/@n8n/chat/dist/style.css";

function ensureChatBaseStyles() {
  if (document.getElementById(CHAT_BASE_STYLE_ID)) {
    return;
  }

  const link = document.createElement("link");
  link.id = CHAT_BASE_STYLE_ID;
  link.rel = "stylesheet";
  link.href = CHAT_BASE_STYLE_URL;
  document.head.appendChild(link);
}

function ensureFallbackLauncher() {
  let button = document.getElementById(FALLBACK_CHAT_ID);
  if (button) {
    return button;
  }

  button = document.createElement("button");
  button.id = FALLBACK_CHAT_ID;
  button.className = "deh-chat-fallback";
  button.type = "button";
  button.setAttribute("aria-label", "Abrir chat");
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3C6.48 3 2 6.94 2 11.8c0 2.7 1.38 5.1 3.55 6.68L5 22l3.69-1.95c1.03.28 2.13.43 3.31.43 5.52 0 10-3.94 10-8.8S17.52 3 12 3z"></path>
    </svg>
    <span>\u00a1Vamos a chatear!</span>
  `;

  button.addEventListener("click", () => {
    const chatToggle = document.querySelector(".chat-window-toggle");
    if (chatToggle) {
      chatToggle.click();
      return;
    }

    window.open("https://www.dehonline.es/contacto.html", "_blank", "noopener,noreferrer");
  });

  document.body.appendChild(button);
  return button;
}

function hideFallbackLauncher() {
  const fallback = document.getElementById(FALLBACK_CHAT_ID);
  if (!fallback) {
    return;
  }
  fallback.classList.add("is-hidden");
}

function isVisibleElement(element) {
  return Boolean(
    element &&
    element.isConnected &&
    (element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0)
  );
}

function enforceFloatingPosition() {
  const wrapper = document.querySelector(".chat-window-wrapper");
  if (wrapper) {
    wrapper.style.position = "fixed";
    wrapper.style.left = "20px";
    wrapper.style.right = "auto";
    wrapper.style.bottom = "74px";
    wrapper.style.zIndex = "3300";
  }

  const root = document.querySelector(".n8n-chat");
  if (root) {
    root.style.position = "fixed";
    root.style.left = "20px";
    root.style.right = "auto";
    root.style.bottom = "74px";
    root.style.zIndex = "3300";
  }

  const toggle = document.querySelector(".chat-window-toggle");
  if (toggle) {
    toggle.style.position = "fixed";
    toggle.style.left = "20px";
    toggle.style.right = "auto";
    toggle.style.bottom = "74px";
    toggle.style.zIndex = "3300";
  }

  return isVisibleElement(wrapper) || isVisibleElement(root) || isVisibleElement(toggle);
}

function watchForChatMount() {
  const checkMounted = () => {
    const mounted = document.querySelector(".chat-window-wrapper, .chat-window-toggle, .n8n-chat");
    if (mounted && enforceFloatingPosition()) {
      hideFallbackLauncher();
      return true;
    }
    return false;
  };

  if (checkMounted()) {
    return;
  }

  const observer = new MutationObserver(() => {
    if (checkMounted()) {
      observer.disconnect();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 15000);
}

function loadMessages() {
  try {
    const storedHistory = localStorage.getItem(CHAT_STORAGE_KEY);
    const parsedHistory = storedHistory ? JSON.parse(storedHistory) : [];
    return Array.isArray(parsedHistory) ? parsedHistory : [];
  } catch (error) {
    console.warn("No se pudo recuperar el historial del chat.", error);
    return [];
  }
}

function saveMessage(message) {
  if (!message) {
    return;
  }

  const chatHistory = loadMessages();
  chatHistory.push(message);

  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatHistory));
  } catch (error) {
    console.warn("No se pudo guardar el historial del chat.", error);
  }
}

function appendLegalNotice() {
  const tryAppendNotice = () => {
    const chatBody = document.querySelector(".chat-body");
    if (!chatBody || chatBody.querySelector(".chat-legal")) {
      return Boolean(chatBody);
    }

    const legalNotice = document.createElement("div");
    legalNotice.className = "chat-legal";
    legalNotice.innerHTML = `
      Al continuar, aceptas que los datos facilitados sean tratados por DEH Online para atender tu solicitud.
      Puedes ejercer tus derechos en <a href="mailto:rgpd@dehonline.es">rgpd@dehonline.es</a>.
      Mas info <a href="https://www.dehonline.es/politica-de-privacidad" target="_blank" rel="noopener noreferrer">aqui</a>.
    `;
    chatBody.appendChild(legalNotice);
    return true;
  };

  if (tryAppendNotice()) {
    return;
  }

  const observer = new MutationObserver(() => {
    if (tryAppendNotice()) {
      observer.disconnect();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 12000);
}

async function initChat() {
  if (window.__dehChatInitialized) {
    return;
  }

  window.__dehChatInitialized = true;
  ensureChatBaseStyles();
  ensureFallbackLauncher();
  watchForChatMount();

  try {
    const { createChat } = await import(CHAT_BUNDLE_URL);
    const chatHistory = loadMessages();

    createChat({
      webhookUrl: CHAT_WEBHOOK_URL,
      showWelcomeScreen: false,
      defaultLanguage: "es",
      initialMessages: chatHistory.length > 0 ? chatHistory : DEFAULT_MESSAGES,
      i18n: {
        es: {
          title: " \u00a1Vamos a chatear!",
          subtitle: "",
          footer: "",
          getStarted: "Nuevo chat",
          inputPlaceholder: "Aqui tu consulta",
        },
      },
      onSendMessage: (message) => {
        saveMessage(message);
      },
    });

    appendLegalNotice();
    watchForChatMount();
  } catch (error) {
    console.error("No se pudo iniciar el chat de DEH Online.", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChat, { once: true });
} else {
  initChat();
}
