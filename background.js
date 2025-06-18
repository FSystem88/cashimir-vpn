// background.js
const PROXY_ERRORS = [
  "net::ERR_PROXY_CONNECTION_FAILED",
  "net::ERR_PROXY_CONNECTION_REFUSED",
  "net::ERR_PROXY_CERTIFICATE_INVALID",
  "net::ERR_PROXY_AUTHENTICATION_REQUIRED",
  "net::ERR_PROXY_UNREACHABLE"
];

// Установка прокси
function setProxy(config) {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.set(
      { value: config, scope: "regular" },
      () => {
        if (chrome.runtime.lastError) {
          console.error("Ошибка установки прокси:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      }
    );
  });
}

// Сброс прокси
function resetProxy() {
  return setProxy({ mode: "direct" });
}

// Аутентификация
chrome.webRequest.onAuthRequired.addListener(
  (details, callbackFn) => {
    chrome.storage.local.get(['proxyLogin', 'proxyPassword'], (data) => {
      callbackFn(data.proxyLogin && data.proxyPassword ? {
        authCredentials: {
          username: data.proxyLogin,
          password: data.proxyPassword
        }
      } : {});
    });
  },
  { urls: ["<all_urls>"] },
  ["asyncBlocking"]
);

// Обработчик сообщений
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "enableProxy") {
    chrome.storage.local.get(['proxyIP', 'proxyPort', 'proxyType', 'bypassList', 'proxyLogin', 'proxyPassword'], async (data) => {
      if (!data.proxyIP || !data.proxyPort || !data.proxyType) {
        sendResponse({ status: "error", message: "Недостаточно данных для прокси" });
        return;
      }
      const config = {
        mode: "fixed_servers",
        rules: {
          singleProxy: {
            scheme: data.proxyType.toLowerCase(),
            host: data.proxyIP,
            port: parseInt(data.proxyPort)
          },
          bypassList: data.bypassList || ["localhost", "127.0.0.1"]
        }
      };
      try {
        await setProxy(config);
        await chrome.storage.local.set({ proxyEnabled: true });
        saveToHistory(data.proxyIP, data.proxyPort, data.proxyType);
        sendResponse({ status: "success" });
      } catch (error) {
        await resetProxy();
        await chrome.storage.local.set({ proxyEnabled: false });
        sendResponse({ status: "error", message: error.message });
      }
    });
    return true;
  } else if (message.action === "disableProxy") {
    resetProxy().then(async () => {
      await chrome.storage.local.set({ proxyEnabled: false });
      sendResponse({ status: "success" });
    }).catch(error => {
      sendResponse({ status: "error", message: error.message });
    });
    return true;
  } else if (message.action === "logout") {
    resetProxy().then(async () => {
      await chrome.storage.local.remove(['proxyIP', 'proxyPort', 'proxyType', 'proxyLogin', 'proxyPassword', 'bypassList', 'proxyEnabled']);
      sendResponse({ status: "success" });
    }).catch(error => {
      sendResponse({ status: "error", message: error.message });
    });
    return true;
  } else if (message.action === "getProxyStatus") {
    chrome.storage.local.get(["proxyEnabled"], (data) => {
      sendResponse({ proxyEnabled: data.proxyEnabled || false });
    });
    return true;
  } else if (message.action === "testProxy") {
    testProxyConnection(message.data, sendResponse);
    return true;
  } else if (message.action === "addBypassSite") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ status: "error", message: "Нет активной вкладки" });
        return;
      }
      const url = new URL(tabs[0].url);
      const hostname = url.hostname;
      chrome.storage.local.get(['bypassList'], async (data) => {
        const bypassList = data.bypassList || ["localhost", "127.0.0.1"];
        if (bypassList.includes(hostname)) {
          sendResponse({ status: "error", message: "Сайт уже в исключениях" });
          return;
        }
        bypassList.push(hostname);
        await chrome.storage.local.set({ bypassList });
        await updateProxySettings();
        sendResponse({ status: "success", hostname });
      });
    });
    return true;
  } else if (message.action === "removeBypassSite") {
    chrome.storage.local.get(['bypassList'], async (data) => {
      let bypassList = data.bypassList || ["localhost", "127.0.0.1"];
      bypassList = bypassList.filter(site => site !== message.hostname);
      await chrome.storage.local.set({ bypassList });
      await updateProxySettings();
      sendResponse({ status: "success" });
    });
    return true;
  } else if (message.action === "abortTest") {
    if (testController) {
      testController.abort();
      testController = null;
      resetProxy().then(() => sendResponse({ status: "success" }));
    } else {
      sendResponse({ status: "no_test" });
    }
    return true;
  }
});

// Обработка ошибок
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (PROXY_ERRORS.includes(details.error)) {
      console.warn(`Ошибка прокси: ${details.error} для ${details.url}`);
      resetProxy().then(async () => {
        await chrome.storage.local.set({ proxyEnabled: false });
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "CASHIMIR VPN",
          message: `Ошибка прокси (${details.error}). Прокси отключен.`,
          priority: 2
        });
      });
    }
  },
  { urls: ["<all_urls>"] }
);

// Обновление прокси
async function updateProxySettings() {
  const data = await new Promise(resolve => chrome.storage.local.get(['proxyIP', 'proxyPort', 'proxyType', 'bypassList', 'proxyEnabled'], resolve));
  if (!data.proxyEnabled || !data.proxyIP || !data.proxyPort || !data.proxyType) return;
  const config = {
    mode: "fixed_servers",
    rules: {
      singleProxy: {
        scheme: data.proxyType.toLowerCase(),
        host: data.proxyIP,
        port: parseInt(data.proxyPort)
      },
      bypassList: data.bypassList || ["localhost", "127.0.0.1"]
    }
  };
  try {
    await setProxy(config);
  } catch (error) {
    console.error("Ошибка обновления прокси:", error);
    await resetProxy();
    await chrome.storage.local.set({ proxyEnabled: false });
  }
}

// История подключений
function saveToHistory(ip, port, type) {
  chrome.storage.local.get(['proxyHistory'], (data) => {
    let history = data.proxyHistory || [];
    const entry = { ip, port, type, timestamp: Date.now() };
    history = history.filter(h => h.ip !== ip || h.port !== port || h.type !== type);
    history.unshift(entry);
    if (history.length > 5) history.pop();
    chrome.storage.local.set({ proxyHistory: history });
  });
}

// Тестирование прокси
let testController = null;

function testProxyConnection({ proxyIP, proxyPort, proxyType, proxyLogin, proxyPassword }, sendResponse) {
  const testUrl = "https://api.ipify.org?format=json";
  const config = {
    mode: "fixed_servers",
    rules: {
      singleProxy: {
        scheme: proxyType.toLowerCase(),
        host: proxyIP,
        port: parseInt(proxyPort)
      }
    }
  };

  setProxy(config).then(() => {
    testController = new AbortController();
    const timeoutId = setTimeout(() => {
      testController?.abort();
    }, 10000);

    const fetchOptions = { signal: testController.signal, cache: "no-store" };
    if (proxyLogin && proxyPassword) {
      fetchOptions.headers = {
        "Proxy-Authorization": "Basic " + btoa(`${proxyLogin}:${proxyPassword}`)
      };
    }

    fetch(testUrl, fetchOptions)
      .then(response => {
        clearTimeout(timeoutId);
        testController = null;
        if (!response.ok) {
          throw new Error(response.status === 407 ? "Неверные логин/пароль" : `Ошибка: ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        resetProxy().then(() => {
          sendResponse({ status: "success", ip: data.ip });
        });
      })
      .catch(error => {
        clearTimeout(timeoutId);
        testController = null;
        resetProxy().then(() => {
          sendResponse({ status: "error", message: error.name === "AbortError" ? "Таймаут (10 секунд)" : error.message });
        });
      });
  }).catch(error => {
    testController = null;
    resetProxy().then(() => {
      sendResponse({ status: "error", message: error.message });
    });
  });
}