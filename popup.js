// popup.js
document.addEventListener("DOMContentLoaded", () => {
  const proxyFormDiv = document.getElementById("proxyForm");
  const proxyControlDiv = document.getElementById("proxyControl");
  const form = document.getElementById("form");
  const formError = document.getElementById("formError");
  const testResult = document.getElementById("testResult");
  const connectBtn = document.getElementById("connectBtn");
  const testBtn = document.getElementById("testBtn");
  const toggleBtn = document.getElementById("toggleBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const importBtn = document.getElementById("importBtn");
  const exportBtn = document.getElementById("exportBtn");
  const importFile = document.getElementById("importFile");
  const initialIPSpan = document.getElementById("initialIP");
  const currentIPSpan = document.getElementById("currentIP");
  const historyList = document.getElementById("historyList");
  const historyDiv = document.getElementById("history");
  const addBypassBtn = document.getElementById("addBypassBtn");
  const addProxyOnlyBtn = document.getElementById("addProxyOnlyBtn");
  const removeBypassBtn = document.getElementById("removeBypassBtn");
  const removeProxyOnlyBtn = document.getElementById("removeProxyOnlyBtn");
  const bypassListDisplay = document.getElementById("bypassListDisplay");
  const proxyOnlyListDisplay = document.getElementById("proxyOnlyListDisplay");
  const bypassSites = document.getElementById("bypassSites");
  const proxyOnlySites = document.getElementById("proxyOnlySites");
  const bypassListControl = document.getElementById("bypassListControl");
  const proxyOnlyListControl = document.getElementById("proxyOnlyListControl");
  const saveBypassBtn = document.getElementById("saveBypassBtn");
  const saveProxyOnlyBtn = document.getElementById("saveProxyOnlyBtn");
  const findProxyBtn = document.getElementById("findProxyBtn");
  const stopFindProxyBtn = document.getElementById("stopFindProxyBtn");
  const proxyTestCount = document.getElementById("proxyTestCount");
  const proxyTestCountControl = document.getElementById("proxyTestCountControl");

  // Показать форму или панель
  function showForm() {
    proxyFormDiv.classList.remove("hidden");
    proxyControlDiv.classList.add("hidden");
    connectBtn.classList.add("hidden");
    toggleBtn.classList.add("hidden");
    logoutBtn.classList.add("hidden");
    fetchInitialIP();
    loadHistory();
    updateTestCount();
    updateFindProxyButtonState();
  }

  function showControl() {
    proxyFormDiv.classList.add("hidden");
    proxyControlDiv.classList.remove("hidden");
    toggleBtn.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    findProxyBtn.classList.add("hidden");
    stopFindProxyBtn.classList.add("hidden");
    updateListControls();
    fetchAndUpdateIP();
    updateTestCount();
  }

  // Состояние кнопки переключения
  function setToggleButtonState(enabled) {
    toggleBtn.textContent = enabled ? "Выключить" : "Включить";
    toggleBtn.classList.toggle("enabled", enabled);
    toggleBtn.classList.toggle("disabled", !enabled);
    toggleBtn.classList.remove("loading");
    toggleBtn.disabled = false;
  }

  function setLoadingState(button) {
    button.textContent = "Загрузка...";
    button.classList.add("loading");
    button.classList.remove("enabled", "disabled");
    button.disabled = true;
  }

  function clearLoadingState(button, text) {
    button.textContent = text;
    button.classList.remove("loading");
    button.disabled = false;
  }

  // Обновление состояния кнопок поиска
  function updateFindProxyButtonState() {
    chrome.runtime.sendMessage({ action: "getProxyStatus" }, response => {
      if (response.isFindingProxy) {
        findProxyBtn.classList.add("hidden");
        stopFindProxyBtn.classList.remove("hidden");
      } else {
        findProxyBtn.classList.remove("hidden");
        stopFindProxyBtn.classList.add("hidden");
      }
    });
  }

  // Получение начального IP
  function fetchInitialIP() {
    fetch("https://api.ipify.org?format=json")
      .then(response => response.ok ? response.json() : Promise.reject("Ошибка сети"))
      .then(data => initialIPSpan.textContent = data.ip || "Неизвестно")
      .catch(() => initialIPSpan.textContent = "Ошибка получения IP");
  }

  // Обновление счетчика проверенных прокси
  function updateTestCount() {
    chrome.runtime.sendMessage({ action: "getProxyStatus" }, response => {
      proxyTestCount.textContent = response.proxyTestCount || 0;
      proxyTestCountControl.textContent = response.proxyTestCount || 0;
    });
  }

  // Обновление статуса
  function fetchAndUpdateIP() {
    chrome.runtime.sendMessage({ action: "getProxyStatus" }, response => {
      chrome.storage.local.get(['bypassList', 'proxyOnlyList'], data => {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          const hostname = tabs[0] ? new URL(tabs[0].url).hostname : "";
          const bypassList = data.bypassList || ["localhost", "127.0.0.1"];
          const proxyOnlyList = data.proxyOnlyList || [];
          const isBypassed = bypassList.some(pattern => {
            const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
            return regex.test(hostname);
          });
          const isProxyOnly = proxyOnlyList.length > 0 && proxyOnlyList.some(pattern => {
            const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
            return regex.test(hostname);
          });

          if (isBypassed) {
            currentIPSpan.textContent = "Сайт в исключении";
            currentIPSpan.style.color = "#ffa726";
          } else if (response.proxyEnabled && (proxyOnlyList.length === 0 || isProxyOnly)) {
            fetchIP();
          } else {
            currentIPSpan.textContent = "VPN отключен";
            currentIPSpan.style.color = "#e57373";
          }
        });
      });
    });
  }

  // Получение IP
  function fetchIP() {
    fetch("https://api.ipify.org?format=json")
      .then(response => response.ok ? response.json() : Promise.reject("Ошибка сети"))
      .then(data => {
        currentIPSpan.textContent = data.ip || "Неизвестно";
        currentIPSpan.style.color = "#4caf50";
      })
      .catch(() => {
        currentIPSpan.textContent = "Ошибка получения IP";
        currentIPSpan.style.color = "#e57373";
      });
  }

  // Загрузка истории
  function loadHistory() {
    chrome.storage.local.get(['proxyHistory'], data => {
      historyList.innerHTML = "";
      if (data.proxyHistory?.length) {
        historyDiv.classList.remove("hidden");
        data.proxyHistory.forEach(entry => {
          const li = document.createElement("li");
          li.textContent = `${entry.ip}:${entry.port} (${entry.type})`;
          li.title = `Подключиться к ${entry.ip}`;
          li.addEventListener("click", () => {
            document.getElementById("proxyIP").value = entry.ip;
            document.getElementById("proxyPort").value = entry.port;
            document.getElementById("proxyType").value = entry.type;
            checkFormInputs();
          });
          historyList.appendChild(li);
        });
      } else {
        historyDiv.classList.add("hidden");
      }
    });
  }

  // Обновление кнопок списков
  function updateListControls() {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) return;
      const hostname = new URL(tabs[0].url).hostname;
      chrome.storage.local.get(['bypassList', 'proxyOnlyList'], data => {
        const bypassList = data.bypassList || ["localhost", "127.0.0.1"];
        const proxyOnlyList = data.proxyOnlyList || [];
        const isBypassed = bypassList.some(pattern => {
          const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
          return regex.test(hostname);
        });
        const isProxyOnly = proxyOnlyList.some(pattern => {
          const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
          return regex.test(hostname);
        });

        addBypassBtn.classList.toggle("hidden", isBypassed || isProxyOnly);
        removeBypassBtn.classList.toggle("hidden", !isBypassed);
        addProxyOnlyBtn.classList.toggle("hidden", isBypassed || isProxyOnly);
        removeProxyOnlyBtn.classList.toggle("hidden", !isProxyOnly);
        loadBypassList();
        loadProxyOnlyList();
      });
    });
  }

  // Загрузка списка исключений
  function loadBypassList() {
    chrome.storage.local.get(['bypassList'], data => {
      bypassSites.innerHTML = "";
      const bypassList = data.bypassList || [];
      bypassListControl.value = bypassList.join(", ");
      bypassListDisplay.classList.remove("hidden");
      bypassList.filter(site => !["localhost", "127.0.0.1"].includes(site)).forEach(site => {
        const li = document.createElement("li");
        li.textContent = site;
        li.title = `Удалить ${site}`;
        li.addEventListener("click", () => {
          chrome.runtime.sendMessage({ action: "removeBypassSite", hostname: site }, response => {
            if (response.status === "success") {
              loadBypassList();
              updateListControls();
              fetchAndUpdateIP();
            }
          });
        });
        bypassSites.appendChild(li);
      });
    });
  }

  // Загрузка списка проксируемых сайтов
  function loadProxyOnlyList() {
    chrome.storage.local.get(['proxyOnlyList'], data => {
      proxyOnlySites.innerHTML = "";
      const proxyOnlyList = data.proxyOnlyList || [];
      proxyOnlyListControl.value = proxyOnlyList.join(", ");
      proxyOnlyListDisplay.classList.remove("hidden");
      proxyOnlyList.forEach(site => {
        const li = document.createElement("li");
        li.textContent = site;
        li.title = `Удалить ${site}`;
        li.addEventListener("click", () => {
          chrome.runtime.sendMessage({ action: "removeProxyOnlySite", hostname: site }, response => {
            if (response.status === "success") {
              loadProxyOnlyList();
              updateListControls();
              fetchAndUpdateIP();
            }
          });
        });
        proxyOnlySites.appendChild(li);
      });
    });
  }

  // Проверка ввода
  function checkFormInputs() {
    const proxyIP = document.getElementById("proxyIP").value.trim();
    const proxyPort = document.getElementById("proxyPort").value.trim();
    const proxyType = document.getElementById("proxyType").value;
    const valid = proxyIP && proxyPort && proxyType;
    connectBtn.classList.toggle("hidden", !valid);
    testBtn.disabled = !valid;
    testBtn.classList.toggle("enabled", valid);
    testBtn.classList.toggle("disabled", !valid);
  }

  // Инициализация
  function initializeInterface() {
    chrome.runtime.sendMessage({ action: "getProxyStatus" }, response => {
      chrome.storage.local.get(['proxyIP', 'proxyPort', 'proxyType', 'proxyLogin', 'proxyPassword', 'bypassList', 'proxyOnlyList'], data => {
        document.getElementById("proxyIP").value = data.proxyIP || "";
        document.getElementById("proxyPort").value = data.proxyPort || "";
        document.getElementById("proxyType").value = data.proxyType || "socks5";
        document.getElementById("proxyLogin").value = data.proxyLogin || "";
        document.getElementById("proxyPassword").value = data.proxyPassword || "";
        document.getElementById("bypassList").value = (data.bypassList || []).join(", ");
        document.getElementById("proxyOnlyList").value = (data.proxyOnlyList || []).join(", ");
        checkFormInputs();
        if (response.proxyEnabled && data.proxyIP && data.proxyPort && data.proxyType) {
          showControl();
          setToggleButtonState(true);
        } else if (data.proxyIP && data.proxyPort && data.proxyType) {
          showControl();
          setToggleButtonState(false);
        } else {
          showForm();
        }
        loadHistory();
        updateTestCount();
      });
    });
  }

  initializeInterface();

  // Обработчик ввода
  form.addEventListener("input", () => {
    checkFormInputs();
    testResult.textContent = "";
    formError.textContent = "";
    document.getElementById("proxyIP").classList.remove("invalid");
    document.getElementById("proxyPort").classList.remove("invalid");
    document.getElementById("bypassList").classList.remove("invalid");
    document.getElementById("proxyOnlyList").classList.remove("invalid");
  });

  // Отправка формы
  form.addEventListener("submit", e => {
    e.preventDefault();
    formError.textContent = "";
    testResult.textContent = "";

    const proxyIP = document.getElementById("proxyIP").value.trim();
    const proxyPort = document.getElementById("proxyPort").value.trim();
    const proxyType = document.getElementById("proxyType").value;
    const proxyLogin = document.getElementById("proxyLogin").value.trim();
    const proxyPassword = document.getElementById("proxyPassword").value.trim();
    const bypassList = document.getElementById("bypassList").value.split(",").map(s => s.trim()).filter(s => s);
    const proxyOnlyList = document.getElementById("proxyOnlyList").value.split(",").map(s => s.trim()).filter(s => s);

    if (!validateIP(proxyIP)) {
      formError.textContent = "Неверный IP (пример: 192.168.0.1)";
      document.getElementById("proxyIP").classList.add("invalid");
      return;
    }
    if (!validatePort(proxyPort)) {
      formError.textContent = "Порт должен быть от 1 до 65535";
      document.getElementById("proxyPort").classList.add("invalid");
      return;
    }
    if (!validateBypassList(bypassList)) {
      formError.textContent = "Неверный формат исключений (пример: *.ru, example.com)";
      document.getElementById("bypassList").classList.add("invalid");
      return;
    }
    if (!validateBypassList(proxyOnlyList)) {
      formError.textContent = "Неверный формат проксируемых сайтов (пример: *.com, example.org)";
      document.getElementById("proxyOnlyList").classList.add("invalid");
      return;
    }
    const intersection = bypassList.filter(site => proxyOnlyList.includes(site));
    if (intersection.length > 0) {
      formError.textContent = `Сайты не могут быть одновременно в обоих списках: ${intersection.join(", ")}`;
      document.getElementById("bypassList").classList.add("invalid");
      document.getElementById("proxyOnlyList").classList.add("invalid");
      return;
    }

    setLoadingState(connectBtn);
    chrome.runtime.sendMessage({ action: "stopFindProxy" }, () => {
      chrome.storage.local.set({ proxyIP, proxyPort, proxyType, proxyLogin, proxyPassword, bypassList, proxyOnlyList }, () => {
        chrome.runtime.sendMessage({ action: "enableProxy" }, response => {
          clearLoadingState(connectBtn, "Подключиться");
          updateFindProxyButtonState();
          updateTestCount();
          if (response.status === "success") {
            showControl();
            setToggleButtonState(true);
            fetchAndUpdateIP();
            loadHistory();
            updateListControls();
          } else {
            formError.textContent = response.message || "Ошибка подключения";
          }
        });
      });
    });
  });

  // Тестирование
  testBtn.addEventListener("click", () => {
    formError.textContent = "";
    testResult.textContent = "";

    const proxyIP = document.getElementById("proxyIP").value.trim();
    const proxyPort = document.getElementById("proxyPort").value.trim();
    const proxyType = document.getElementById("proxyType").value;
    const proxyLogin = document.getElementById("proxyLogin").value.trim();
    const proxyPassword = document.getElementById("proxyPassword").value.trim();

    if (!validateIP(proxyIP)) {
      formError.textContent = "Неверный IP";
      document.getElementById("proxyIP").classList.add("invalid");
      return;
    }
    if (!validatePort(proxyPort)) {
      formError.textContent = "Неверный порт";
      document.getElementById("proxyPort").classList.add("invalid");
      return;
    }

    setLoadingState(testBtn);
    chrome.runtime.sendMessage({
      action: "testProxy",
      data: { proxyIP, proxyPort, proxyType, proxyLogin, proxyPassword }
    }, response => {
      clearLoadingState(testBtn, "Протестировать");
      checkFormInputs();
      testResult.textContent = response.status === "success" ? 
        `Соединение успешно! IP: ${response.ip}` : 
        `Ошибка: ${response.message}`;
      testResult.style.color = response.status === "success" ? "#4caf50" : "#e57373";
    });
  });

  // Поиск прокси
  findProxyBtn.addEventListener("click", () => {
    setLoadingState(findProxyBtn);
    findProxyBtn.classList.add("hidden");
    stopFindProxyBtn.classList.remove("hidden");
    formError.textContent = "";
    testResult.textContent = "";
    chrome.runtime.sendMessage({ action: "findProxy" }, response => {
      clearLoadingState(findProxyBtn, "Найти прокси");
      updateFindProxyButtonState();
      updateTestCount();
      if (response.status === "success") {
        document.getElementById("proxyIP").value = response.ip;
        document.getElementById("proxyPort").value = response.port;
        document.getElementById("proxyType").value = response.type;
        document.getElementById("proxyLogin").value = "";
        document.getElementById("proxyPassword").value = "";
        checkFormInputs();
        testResult.textContent = `Найден рабочий прокси: ${response.ip}:${response.port} (${response.type})`;
        testResult.style.color = "#4caf50";
      } else if (response.status === "stopped") {
        testResult.textContent = "Поиск прокси остановлен";
        testResult.style.color = "#ffa726";
      } else {
        formError.textContent = response.message || "Ошибка поиска прокси";
        formError.style.color = "#e57373";
      }
    });
  });

  // Остановка поиска прокси
  stopFindProxyBtn.addEventListener("click", () => {
    setLoadingState(stopFindProxyBtn);
    chrome.runtime.sendMessage({ action: "stopFindProxy" }, response => {
      clearLoadingState(stopFindProxyBtn, "Остановить поиск");
      updateFindProxyButtonState();
      updateTestCount();
      if (response.status === "success") {
        testResult.textContent = "Поиск прокси остановлен";
        testResult.style.color = "#ffa726";
      } else {
        formError.textContent = "Поиск уже остановлен";
        formError.style.color = "#e57373";
      }
    });
  });

  // Переключение VPN
  toggleBtn.addEventListener("click", () => {
    setLoadingState(toggleBtn);
    chrome.runtime.sendMessage({ action: "getProxyStatus" }, response => {
      const action = response.proxyEnabled ? "disableProxy" : "enableProxy";
      chrome.runtime.sendMessage({ action }, res => {
        clearLoadingState(toggleBtn, action === "disableProxy" ? "Включить" : "Выключить");
        if (res.status === "success") {
          setToggleButtonState(action === "enableProxy");
          fetchAndUpdateIP();
          updateListControls();
        } else {
          formError.textContent = res.message || "Ошибка переключения";
        }
      });
    });
  });

  // Добавление исключения
  addBypassBtn.addEventListener("click", () => {
    setLoadingState(addBypassBtn);
    chrome.runtime.sendMessage({ action: "addBypassSite" }, response => {
      clearLoadingState(addBypassBtn, "Добавить сайт в исключения");
      if (response.status === "success") {
        updateListControls();
        fetchAndUpdateIP();
      } else {
        formError.textContent = response.message || "Ошибка добавления";
      }
    });
  });

  // Добавление проксируемого сайта
  addProxyOnlyBtn.addEventListener("click", () => {
    setLoadingState(addProxyOnlyBtn);
    chrome.runtime.sendMessage({ action: "addProxyOnlySite" }, response => {
      clearLoadingState(addProxyOnlyBtn, "Добавить сайт в прокси");
      if (response.status === "success") {
        updateListControls();
        fetchAndUpdateIP();
      } else {
        formError.textContent = response.message || "Ошибка добавления";
      }
    });
  });

  // Удаление исключения
  removeBypassBtn.addEventListener("click", () => {
    setLoadingState(removeBypassBtn);
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) return;
      const hostname = new URL(tabs[0].url).hostname;
      chrome.runtime.sendMessage({ action: "removeBypassSite", hostname }, response => {
        clearLoadingState(removeBypassBtn, "Удалить из исключений");
        if (response.status === "success") {
          updateListControls();
          fetchAndUpdateIP();
        } else {
          formError.textContent = response.message || "Ошибка удаления";
        }
      });
    });
  });

  // Удаление проксируемого сайта
  removeProxyOnlyBtn.addEventListener("click", () => {
    setLoadingState(removeProxyOnlyBtn);
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) return;
      const hostname = new URL(tabs[0].url).hostname;
      chrome.runtime.sendMessage({ action: "removeProxyOnlySite", hostname }, response => {
        clearLoadingState(removeProxyOnlyBtn, "Удалить из прокси");
        if (response.status === "success") {
          updateListControls();
          fetchAndUpdateIP();
        } else {
          formError.textContent = response.message || "Ошибка удаления";
        }
      });
    });
  });

  // Сохранение исключений
  saveBypassBtn.addEventListener("click", () => {
    const bypassList = bypassListControl.value.split(",").map(s => s.trim()).filter(s => s);
    if (!validateBypassList(bypassList)) {
      formError.textContent = "Неверный формат исключений (пример: *.ru, example.com)";
      bypassListControl.classList.add("invalid");
      return;
    }
    chrome.storage.local.get(['proxyOnlyList'], data => {
      const proxyOnlyList = data.proxyOnlyList || [];
      const intersection = bypassList.filter(site => proxyOnlyList.includes(site));
      if (intersection.length > 0) {
        formError.textContent = `Сайты не могут быть одновременно в обоих списках: ${intersection.join(", ")}`;
        bypassListControl.classList.add("invalid");
        return;
      }
      setLoadingState(saveBypassBtn);
      chrome.storage.local.set({ bypassList }, () => {
        chrome.runtime.sendMessage({ action: "enableProxy" }, response => {
          clearLoadingState(saveBypassBtn, "Сохранить исключения");
          if (response.status === "success") {
            updateListControls();
            fetchAndUpdateIP();
          } else {
            formError.textContent = response.message || "Ошибка сохранения";
          }
        });
      });
    });
  });

  // Сохранение проксируемых сайтов
  saveProxyOnlyBtn.addEventListener("click", () => {
    const proxyOnlyList = proxyOnlyListControl.value.split(",").map(s => s.trim()).filter(s => s);
    if (!validateBypassList(proxyOnlyList)) {
      formError.textContent = "Неверный формат проксируемых сайтов (пример: *.com, example.org)";
      proxyOnlyListControl.classList.add("invalid");
      return;
    }
    chrome.storage.local.get(['bypassList'], data => {
      const bypassList = data.bypassList || ["localhost", "127.0.0.1"];
      const intersection = proxyOnlyList.filter(site => bypassList.includes(site));
      if (intersection.length > 0) {
        formError.textContent = `Сайты не могут быть одновременно в обоих списках: ${intersection.join(", ")}`;
        proxyOnlyListControl.classList.add("invalid");
        return;
      }
      setLoadingState(saveProxyOnlyBtn);
      chrome.storage.local.set({ proxyOnlyList }, () => {
        chrome.runtime.sendMessage({ action: "enableProxy" }, response => {
          clearLoadingState(saveProxyOnlyBtn, "Сохранить проксируемые");
          if (response.status === "success") {
            updateListControls();
            fetchAndUpdateIP();
          } else {
            formError.textContent = response.message || "Ошибка сохранения";
          }
        });
      });
    });
  });

  // Выход
  logoutBtn.addEventListener("click", () => {
    setLoadingState(logoutBtn);
    chrome.runtime.sendMessage({ action: "getProxyStatus" }, response => {
      if (response.proxyEnabled) {
        chrome.runtime.sendMessage({ action: "disableProxy" }, res => {
          if (res.status === "success") {
            chrome.runtime.sendMessage({ action: "logout" }, logoutRes => {
              clearLoadingState(logoutBtn, "Выйти");
              if (logoutRes.status === "success") {
                showForm();
                currentIPSpan.textContent = "Загрузка...";
                checkFormInputs();
                updateTestCount();
              } else {
                formError.textContent = logoutRes.message || "Ошибка выхода";
              }
            });
          } else {
            clearLoadingState(logoutBtn, "Выйти");
            formError.textContent = res.message || "Ошибка отключения прокси";
          }
        });
      } else {
        chrome.runtime.sendMessage({ action: "logout" }, logoutRes => {
          clearLoadingState(logoutBtn, "Выйти");
          if (logoutRes.status === "success") {
            showForm();
            currentIPSpan.textContent = "Загрузка...";
            checkFormInputs();
            updateTestCount();
          } else {
            formError.textContent = logoutRes.message || "Ошибка выхода";
          }
        });
      }
    });
  });

  // Экспорт
  exportBtn.addEventListener("click", () => {
    chrome.storage.local.get(['proxyIP', 'proxyPort', 'proxyType', 'proxyLogin', 'proxyPassword', 'bypassList', 'proxyOnlyList', 'proxyTestCount'], data => {
      const settings = { ...data };
      const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({ url, filename: "cashimir-vpn-settings.json" });
    });
  });

  // Импорт
  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const settings = JSON.parse(event.target.result);
        if (settings.proxyIP && settings.proxyPort && settings.proxyType) {
          chrome.storage.local.set(settings, () => {
            document.getElementById("proxyIP").value = settings.proxyIP || "";
            document.getElementById("proxyPort").value = settings.proxyPort || "";
            document.getElementById("proxyType").value = settings.proxyType || "socks5";
            document.getElementById("proxyLogin").value = settings.proxyLogin || "";
            document.getElementById("proxyPassword").value = settings.proxyPassword || "";
            document.getElementById("bypassList").value = (settings.bypassList || []).join(", ");
            document.getElementById("proxyOnlyList").value = (settings.proxyOnlyList || []).join(", ");
            checkFormInputs();
            formError.textContent = "Настройки импортированы";
            formError.style.color = "#4caf50";
            loadHistory();
            updateTestCount();
            initializeInterface();
          });
        } else {
          formError.textContent = "Неверный формат файла";
        }
      } catch {
        formError.textContent = "Ошибка чтения файла";
      }
    };
    reader.readAsText(file);
  });

  // Обработчик изменений
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.proxyEnabled) {
      setToggleButtonState(changes.proxyEnabled.newValue);
      fetchAndUpdateIP();
      updateListControls();
      updateFindProxyButtonState();
    }
    if (changes.proxyIP || changes.proxyPort || changes.proxyType || changes.bypassList || changes.proxyOnlyList) {
      fetchAndUpdateIP();
      updateListControls();
    }
    if (changes.proxyHistory) loadHistory();
    if (changes.proxyTestCount) updateTestCount();
  });

  // Прерывание теста
  window.addEventListener("unload", () => {
    chrome.runtime.sendMessage({ action: "abortTest" });
    chrome.runtime.sendMessage({ action: "stopFindProxy" });
  });

  // Валидация
  function validateIP(ip) {
    return /^(25[0-5]|2[0-4]\d|[0-1]?\d?\d)(\.(25[0-5]|2[0-4]\d|[0-1]?\d?\d)){3}$/.test(ip);
  }

  function validatePort(port) {
    const num = Number(port);
    return Number.isInteger(num) && num > 0 && num <= 65535;
  }

  function validateBypassList(list) {
    return list.every(entry => {
      if (!/^[a-zA-Z0-9.\-*]+$/.test(entry)) return false;
      if (entry.trim() === '' || entry.trim() === '*') return false;
      try {
        const regexPattern = '^' + entry.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
        new RegExp(regexPattern);
        return true;
      } catch {
        return false;
      }
    });
  }
});