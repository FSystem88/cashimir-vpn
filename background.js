// background.js

const PROXY_ERRORS = [
  "net::ERR_PROXY_CONNECTION_FAILED",
  "net::ERR_PROXY_CONNECTION_REFUSED",
  "net::ERR_PROXY_CERTIFICATE_INVALID",
  "net::ERR_PROXY_AUTHENTICATION_REQUIRED",
  "net::ERR_PROXY_UNREACHABLE"
];

// Функция для установки прокси
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

// Обработчик запроса аутентификации
chrome.webRequest.onAuthRequired.addListener(
  function(details) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['proxyLogin', 'proxyPassword'], (data) => {
        if (data.proxyLogin && data.proxyPassword) {
          resolve({
            authCredentials: {
              username: data.proxyLogin,
              password: data.proxyPassword
            }
          });
        } else {
          resolve({});
        }
      });
    });
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

// Обработчик сообщений от popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "enableProxy") {
    chrome.storage.local.get(['proxyIP', 'proxyPort'], (data) => {
      if (data.proxyIP && data.proxyPort) {
        const PROXY_CONFIG = {
          mode: "fixed_servers",
          rules: {
            singleProxy: {
              scheme: "socks5",
              host: data.proxyIP,
              port: parseInt(data.proxyPort)
            },
            bypassList: ["localhost", "127.0.0.1"]
          }
        };
        setProxy(PROXY_CONFIG);
        chrome.storage.local.set({ proxyEnabled: true });
        sendResponse({ status: "Proxy enabled" });
      } else {
        sendResponse({ status: "Proxy data missing" });
      }
    });
    return true;
  } else if (message.action === "disableProxy") {
    const DIRECT_CONFIG = {
      mode: "direct"
    };
    setProxy(DIRECT_CONFIG);
    chrome.storage.local.set({ proxyEnabled: false });
    sendResponse({ status: "Proxy disabled" });
    return true;
  } else if (message.action === "getProxyStatus") {
    chrome.storage.local.get("proxyEnabled", (data) => {
      sendResponse({ proxyEnabled: data.proxyEnabled || false });
    });
    return true;
  }
});

// Обработка ошибок прокси
chrome.webRequest.onErrorOccurred.addListener(
  function(details) {
    if (PROXY_ERRORS.includes(details.error)) {
      console.warn(`Обнаружена ошибка прокси: ${details.error} для URL: ${details.url}`);
      const DIRECT_CONFIG = {
        mode: "direct"
      };
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

// Обновление прокси при изменении настроек
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.proxyIP || changes.proxyPort || changes.proxyLogin || changes.proxyPassword) {
      chrome.storage.local.get(['proxyIP', 'proxyPort', 'proxyLogin', 'proxyPassword', 'proxyEnabled'], (data) => {
        if (data.proxyIP && data.proxyPort && data.proxyLogin && data.proxyPassword && data.proxyEnabled) {
          const PROXY_CONFIG = {
            mode: "fixed_servers",
            rules: {
              singleProxy: {
                scheme: "socks5",
                host: data.proxyIP,
                port: parseInt(data.proxyPort)
              },
              bypassList: ["localhost", "127.0.0.1"]
            }
          };
          setProxy(PROXY_CONFIG);
        }
      });
    }
  }
});
