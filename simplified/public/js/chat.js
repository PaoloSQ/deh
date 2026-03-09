const CHAT_BUNDLE_URL = 'https://cdn.jsdelivr.net/gh/SoporteSquads/SquadsChat@main/chat.bundle.es.js';
const CHAT_STORAGE_KEY = 'chatHistory';
const CHAT_WEBHOOK_URL = 'https://auto.srv791713.hstgr.cloud/webhook/c20da08e-c54a-4997-8971-a877ca5fc12c/chat';
const DEFAULT_MESSAGES = [
  '\u00a1Bienvenido a Deh Online! \ud83d\udc4b',
  'Me llamo Celia',
  '\u00bfEn qu\u00e9 puedo ayudarte hoy? \ud83d\ude0a',
];

function loadMessages() {
  try {
    const storedHistory = localStorage.getItem(CHAT_STORAGE_KEY);
    const parsedHistory = storedHistory ? JSON.parse(storedHistory) : [];
    return Array.isArray(parsedHistory) ? parsedHistory : [];
  } catch (error) {
    console.warn('No se pudo recuperar el historial del chat.', error);
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
    console.warn('No se pudo guardar el historial del chat.', error);
  }
}

function appendLegalNotice() {
  const tryAppendNotice = () => {
    const chatBody = document.querySelector('.chat-body');
    if (!chatBody || chatBody.querySelector('.chat-legal')) {
      return Boolean(chatBody);
    }

    const legalNotice = document.createElement('div');
    legalNotice.className = 'chat-legal';
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

  try {
    const { createChat } = await import(CHAT_BUNDLE_URL);
    const chatHistory = loadMessages();

    createChat({
      webhookUrl: CHAT_WEBHOOK_URL,
      showWelcomeScreen: false,
      defaultLanguage: 'es',
      initialMessages: chatHistory.length > 0 ? chatHistory : DEFAULT_MESSAGES,
      i18n: {
        es: {
          title: ' \u00a1Vamos a chatear!',
          subtitle: '',
          footer: '',
          getStarted: 'Nuevo chat',
          inputPlaceholder: 'Aqui tu consulta',
        },
      },
      onSendMessage: (message) => {
        saveMessage(message);
      },
    });

    appendLegalNotice();
  } catch (error) {
    console.error('No se pudo iniciar el chat de DEH Online.', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChat, { once: true });
} else {
  initChat();
}