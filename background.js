const PROXY_CONFIG = {
  mode: "fixed_servers",
  rules: {
    singleProxy: {
      scheme: "socks5", 
      host: "", // ВСТАВИТЬ IP
      port: 1080 // ИЗМЕНИТЬ PORT
    },
    bypassList: ["localhost", "127.0.0.1"]
  }
};

const DIRECT_CONFIG = {
  mode: "direct"
};

const PROXY_ERRORS = [
  "net::ERR_PROXY_CONNECTION_FAILED",
  "net::ERR_PROXY_CONNECTION_REFUSED",
  "net::ERR_PROXY_CERTIFICATE_INVALID",
  "net::ERR_PROXY_AUTHENTICATION_REQUIRED",
  "net::ERR_PROXY_UNREACHABLE"
];

chrome.webRequest.onAuthRequired.addListener(
  function(details) {
    return {
      authCredentials: {
        username: "", // ВСТАВИТЬ USERNAME
        password: "" // ВСТАВИТЬ PASSWORD
      }
    };
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

function setProxy(config) {
  chrome.proxy.settings.set(
    { value: config, scope: "regular" },
    () => {
      if (chrome.runtime.lastError) {
        console.error("Ошибка при установке прокси:", chrome.runtime.lastError);
      }
    }
  );
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "enableProxy") {
    setProxy(PROXY_CONFIG);
    chrome.storage.local.set({ proxyEnabled: true });
    sendResponse({ status: "Proxy enabled" });
  } else if (message.action === "disableProxy") {
    setProxy(DIRECT_CONFIG);
    chrome.storage.local.set({ proxyEnabled: false });
    sendResponse({ status: "Proxy disabled" });
  } else if (message.action === "getProxyStatus") {
    chrome.storage.local.get("proxyEnabled", (data) => {
      sendResponse({ proxyEnabled: data.proxyEnabled || false });
    });
    return true;
  }
});

chrome.webRequest.onErrorOccurred.addListener(
  function(details) {
    if (PROXY_ERRORS.includes(details.error)) {
      console.warn(`Обнаружена ошибка прокси: ${details.error} для URL: ${details.url}`);
      setProxy(DIRECT_CONFIG);
      chrome.storage.local.set({ proxyEnabled: false }, () => {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "Proxy Controller",
          message: `Обнаружена ошибка прокси (${details.error}). Прокси был автоматически отключен.`,
          priority: 2
        });
      });
    }
  },
  { urls: ["<all_urls>"] }
);
