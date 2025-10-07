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

// Построение PAC-скрипта и конфигурации для списков обхода/белого списка
function buildProxyConfig({ proxyIP, proxyPort, proxyType, bypassList, proxyOnlyList }) {
  const normalizedBypass = (bypassList || []).filter(Boolean);
  const normalizedProxyOnly = (proxyOnlyList || []).filter(Boolean);
  const defaultBypass = ["localhost", "127.0.0.1"]; // всегда добавляем

  const returnProxy = (() => {
    const hostPort = `${proxyIP}:${parseInt(proxyPort)}`;
    const type = String(proxyType || '').toLowerCase();
    if (type === 'socks5') return `SOCKS5 ${hostPort}`;
    if (type === 'socks4' || type === 'socks') return `SOCKS ${hostPort}`;
    // http/https
    return `PROXY ${hostPort}`;
  })();

  // Если задан белый список, используем PAC, чтобы проксировать ТОЛЬКО эти сайты
  if (normalizedProxyOnly.length > 0) {
    function expand(list) {
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var p = String(list[i] || '').trim();
        if (!p) continue;
        var hasStar = p.indexOf('*') !== -1;
        var isIP = /^\d+\.\d+\.\d+\.\d+$/.test(p);
        if (hasStar || isIP) {
          out.push(p);
        } else {
          out.push(p);
          out.push('*.' + p);
        }
      }
      return out;
    }
    const pac = `function FindProxyForURL(url, host) {
      var bypassIn = ${JSON.stringify([...new Set([...defaultBypass, ...normalizedBypass])])};
      var whiteIn = ${JSON.stringify(normalizedProxyOnly)};
      function expand(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
          var p = String(list[i] || '').trim();
          if (!p) continue;
          var hasStar = p.indexOf('*') !== -1;
          var isIP = /^\\d+\\.\\d+\\.\\d+\\.\\d+$/.test(p);
          if (hasStar || isIP) {
            out.push(p);
          } else {
            out.push(p);
            out.push('*.' + p);
          }
        }
        return out;
      }
      var bypass = expand(bypassIn);
      var white = expand(whiteIn);
      function match(list) {
        for (var i = 0; i < list.length; i++) {
          if (shExpMatch(host, list[i])) return true;
        }
        return false;
      }
      if (match(bypass)) return "DIRECT";
      if (white.length > 0) {
        if (match(white)) return ${JSON.stringify(returnProxy)};
        return "DIRECT";
      }
      return ${JSON.stringify(returnProxy)};
    }`;
    return {
      mode: "pac_script",
      pacScript: { data: pac }
    };
  }

  // Иначе используем фиксированный прокси с bypassList
  return {
    mode: "fixed_servers",
    rules: {
      singleProxy: {
        scheme: String(proxyType || '').toLowerCase(),
        host: proxyIP,
        port: parseInt(proxyPort)
      },
      bypassList: (() => {
        const expanded = [];
        const input = [...new Set([...defaultBypass, ...normalizedBypass])];
        for (const p of input) {
          const hasStar = p.includes('*');
          const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(p);
          if (hasStar || isIP) {
            expanded.push(p);
          } else {
            expanded.push(p, '*.' + p);
          }
        }
        return expanded;
      })()
    }
  };
}

// Обработчик запросов
// onBeforeRequest больше не требуется для маршрутизации: это делает PAC

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
        const config = buildProxyConfig({
          proxyIP: data.proxyIP,
          proxyPort: data.proxyPort,
          proxyType: data.proxyType,
          bypassList: data.bypassList,
          proxyOnlyList: data.proxyOnlyList
        });
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
  } else if (message.action === "getDirectIP") {
    (async () => {
      try {
        const data = await new Promise(resolve => chrome.storage.local.get(['proxyEnabled', 'proxyIP', 'proxyPort', 'proxyType', 'bypassList', 'proxyOnlyList'], resolve));
        const wasEnabled = !!data.proxyEnabled;
        let restoreConfig = null;
        if (wasEnabled && data.proxyIP && data.proxyPort && data.proxyType) {
          restoreConfig = buildProxyConfig({
            proxyIP: data.proxyIP,
            proxyPort: data.proxyPort,
            proxyType: data.proxyType,
            bypassList: data.bypassList,
            proxyOnlyList: data.proxyOnlyList
          });
        }

        if (wasEnabled) {
          await resetProxy();
        }

        let ip = null;
        try {
          const resp = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
          if (resp.ok) {
            const json = await resp.json();
            ip = json.ip || null;
          }
        } catch (_) {}

        if (wasEnabled && restoreConfig) {
          try { await setProxy(restoreConfig); } catch (_) {}
        }

        if (ip) {
          sendResponse({ status: "success", ip });
        } else {
          sendResponse({ status: "error", message: "Не удалось получить IP" });
        }
      } catch (e) {
        sendResponse({ status: "error", message: e?.message || 'Ошибка' });
      }
    })();
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
  const config = buildProxyConfig({
    proxyIP: data.proxyIP,
    proxyPort: data.proxyPort,
    proxyType: data.proxyType,
    bypassList: data.bypassList,
    proxyOnlyList: data.proxyOnlyList
  });
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
  const fetchProxiesBatch = async (count = 10) => {
    try {
      const requests = Array.from({ length: count }, () => fetch("http://pubproxy.com/api/proxy?speed=10&"));
      const responses = await Promise.allSettled(requests);
      const jsons = await Promise.all(responses.map(r => r.status === 'fulfilled' ? r.value.json().catch(() => null) : null));
      const proxies = [];
      for (const data of jsons) {
        if (data && data.count > 0 && data.data && data.data[0]) proxies.push(data.data[0]);
      }
      if (proxies.length === 0) throw new Error("Нет доступных прокси");
      return proxies;
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
        const batch = await fetchProxiesBatch(10);
        // тестируем до первого удачного параллельно
        const tests = batch.map(p => new Promise((resolve) => {
          testProxyConnection(
            { proxyIP: p.ip, proxyPort: p.port, proxyType: p.type },
            (resp) => resolve({ p, resp }),
            5000
          );
        }));
        const results = await Promise.all(tests);
        // обновим счетчик тестов
        testCount += results.length;
        await chrome.storage.local.set({ proxyTestCount: testCount });

        const ok = results.find(r => r.resp.status === 'success');
        if (ok) {
          const proxy = ok.p;
          chrome.storage.local.set({
            proxyIP: proxy.ip,
            proxyPort: proxy.port,
            proxyType: proxy.type,
            proxyLogin: "",
            proxyPassword: ""
          }, () => {
            isFindingProxy = false;
            sendResponse({ status: "success", ip: proxy.ip, port: proxy.port, type: proxy.type, testCount });
          });
        } else {
          if (isFindingProxy) setTimeout(tryNextProxy, 500);
        }
      } catch (error) {
        if (isFindingProxy) {
          setTimeout(tryNextProxy, 1000);
        }
      }
    };

    tryNextProxy();
  });
}