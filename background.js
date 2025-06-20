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

// Проверка URL на соответствие списков
function shouldProxyUrl(url, bypassList, proxyOnlyList) {
  if (!url) return false;
  const hostname = new URL(url).hostname;
  const bypassRegexes = (bypassList || []).map(pattern => 
    new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$')
  );
  const proxyOnlyRegexes = (proxyOnlyList || []).map(pattern => 
    new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$')
  );

  if (bypassRegexes.some(regex => regex.test(hostname))) {
    return false;
  }

  if (proxyOnlyList?.length > 0) {
    return proxyOnlyRegexes.some(regex => regex.test(hostname));
  }

  return true;
}

// Обработчик запросов
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    return new Promise(resolve => {
      chrome.storage.local.get(['proxyEnabled', 'bypassList', 'proxyOnlyList'], (data) => {
        if (!data.proxyEnabled || !shouldProxyUrl(details.url, data.bypassList, data.proxyOnlyList)) {
          resolve({ cancel: false });
        } else {
          resolve({ cancel: false });
        }
      });
    });
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

let isFindingProxy = false;
let testController = null;

// Остановка поиска прокси
function stopProxySearch() {
  if (isFindingProxy) {
    isFindingProxy = false;
    if (testController) {
      testController.abort();
      testController = null;
    }
    return chrome.storage.local.set({ proxyTestCount: 0 });
  }
  return Promise.resolve();
}

// Обработчик сообщений
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "enableProxy") {
    chrome.storage.local.get(['proxyIP', 'proxyPort', 'proxyType', 'bypassList', 'proxyOnlyList', 'proxyLogin', 'proxyPassword'], async (data) => {
      if (!data.proxyIP || !data.proxyPort || !data.proxyType) {
        sendResponse({ status: "error", message: "Недостаточно данных для прокси" });
        return;
      }
      try {
        await stopProxySearch(); // Останавливаем поиск перед подключением
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
      await chrome.storage.local.remove(['proxyIP', 'proxyPort', 'proxyType', 'proxyLogin', 'proxyPassword', 'bypassList', 'proxyOnlyList', 'proxyEnabled', 'proxyTestCount']);
      sendResponse({ status: "success" });
    }).catch(error => {
      sendResponse({ status: "error", message: error.message });
    });
    return true;
  } else if (message.action === "getProxyStatus") {
    chrome.storage.local.get(["proxyEnabled", "proxyTestCount"], (data) => {
      sendResponse({ 
        proxyEnabled: data.proxyEnabled || false, 
        proxyTestCount: data.proxyTestCount || 0,
        isFindingProxy: isFindingProxy 
      });
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
      chrome.storage.local.get(['bypassList', 'proxyOnlyList'], async (data) => {
        const bypassList = data.bypassList || ["localhost", "127.0.0.1"];
        const proxyOnlyList = data.proxyOnlyList || [];
        if (bypassList.includes(hostname) || proxyOnlyList.includes(hostname)) {
          sendResponse({ status: "error", message: "Сайт уже в одном из списков" });
          return;
        }
        bypassList.push(hostname);
        await chrome.storage.local.set({ bypassList });
        await updateProxySettings();
        sendResponse({ status: "success", hostname });
      });
    });
    return true;
  } else if (message.action === "addProxyOnlySite") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ status: "error", message: "Нет активной вкладки" });
        return;
      }
      const url = new URL(tabs[0].url);
      const hostname = url.hostname;
      chrome.storage.local.get(['bypassList', 'proxyOnlyList'], async (data) => {
        const bypassList = data.bypassList || ["localhost", "127.0.0.1"];
        const proxyOnlyList = data.proxyOnlyList || [];
        if (bypassList.includes(hostname) || proxyOnlyList.includes(hostname)) {
          sendResponse({ status: "error", message: "Сайт уже в одном из списков" });
          return;
        }
        proxyOnlyList.push(hostname);
        await chrome.storage.local.set({ proxyOnlyList });
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
  } else if (message.action === "removeProxyOnlySite") {
    chrome.storage.local.get(['proxyOnlyList'], async (data) => {
      let proxyOnlyList = data.proxyOnlyList || [];
      proxyOnlyList = proxyOnlyList.filter(site => site !== message.hostname);
      await chrome.storage.local.set({ proxyOnlyList });
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
  } else if (message.action === "findProxy") {
    chrome.storage.local.get(['proxyEnabled'], async (data) => {
      if (data.proxyEnabled) {
        sendResponse({ status: "error", message: "Прокси уже подключен" });
        return;
      }
      findWorkingProxy(sendResponse);
    });
    return true;
  } else if (message.action === "stopFindProxy") {
    stopProxySearch().then(() => {
      sendResponse({ status: "success" });
    }).catch(() => {
      sendResponse({ status: "no_search" });
    });
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
  const data = await new Promise(resolve => chrome.storage.local.get(['proxyIP', 'proxyPort', 'proxyType', 'bypassList', 'proxyOnlyList', 'proxyEnabled'], resolve));
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
function testProxyConnection({ proxyIP, proxyPort, proxyType, proxyLogin, proxyPassword }, sendResponse, timeout = 10000) {
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
    }, timeout);

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
          sendResponse({ status: "error", message: error.name === "AbortError" ? "Таймаут" : error.message });
        });
      });
  }).catch(error => {
    testController = null;
    resetProxy().then(() => {
      sendResponse({ status: "error", message: error.message });
    });
  });
}

// Поиск рабочего прокси
async function findWorkingProxy(sendResponse) {
  isFindingProxy = true;
  const fetchProxy = async () => {
    try {
      const response = await fetch("http://pubproxy.com/api/proxy?speed=10&");
      const data = await response.json();
      if (data.count === 0) {
        throw new Error("Нет доступных прокси");
      }
      return data.data[0];
    } catch (error) {
      throw new Error("Ошибка получения прокси: " + error.message);
    }
  };

  chrome.storage.local.get(['proxyTestCount'], async (data) => {
    let testCount = data.proxyTestCount || 0;

    const tryNextProxy = async () => {
      if (!isFindingProxy) {
        sendResponse({ status: "stopped" });
        return;
      }
      try {
        const proxy = await fetchProxy();
        testCount++;
        await chrome.storage.local.set({ proxyTestCount: testCount });

        await new Promise((resolve, reject) => {
          testProxyConnection(
            { proxyIP: proxy.ip, proxyPort: proxy.port, proxyType: proxy.type },
            (response) => {
              if (response.status === "success") {
                chrome.storage.local.set({
                  proxyIP: proxy.ip,
                  proxyPort: proxy.port,
                  proxyType: proxy.type,
                  proxyLogin: "",
                  proxyPassword: ""
                }, () => {
                  isFindingProxy = false;
                  resolve({ status: "success", ip: proxy.ip, port: proxy.port, type: proxy.type, testCount });
                });
              } else {
                reject(new Error(response.message));
              }
            },
            5000
          );
        });
        sendResponse({ status: "success", ip: proxy.ip, port: proxy.port, type: proxy.type, testCount });
      } catch (error) {
        if (isFindingProxy) {
          setTimeout(tryNextProxy, 1000);
        }
      }
    };

    tryNextProxy();
  });
}