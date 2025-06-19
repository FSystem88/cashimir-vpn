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
  const removeBypassBtn = document.getElementById("removeBypassBtn");
  const bypassListDisplay = document.getElementById("bypassListDisplay");
  const bypassSites = document.getElementById("bypassSites");
  const bypassListControl = document.getElementById("bypassListControl");
  const saveBypassBtn = document.getElementById("saveBypassBtn");

  // Показать форму или панель
  function showForm() {
    proxyFormDiv.classList.remove("hidden");
    proxyControlDiv.classList.add("hidden");
    connectBtn.classList.add("hidden");
    toggleBtn.classList.add("hidden");
    logoutBtn.classList.add("hidden");
    fetchInitialIP();
    loadHistory();
  }

  function showControl() {
    proxyFormDiv.classList.add("hidden");
    proxyControlDiv.classList.remove("hidden");
    toggleBtn.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    updateBypassControls();
    fetchAndUpdateIP();
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

  // Получение начального IP
  function fetchInitialIP() {
    fetch("https://api.ipify.org?format=json")
      .then(response => response.ok ? response.json() : Promise.reject("Ошибка сети"))
      .then(data => initialIPSpan.textContent = data.ip || "Неизвестно")
      .catch(() => initialIPSpan.textContent = "Ошибка получения IP");
  }

  // Обновление статуса
  function fetchAndUpdateIP() {
    chrome.runtime.sendMessage({ action: "getProxyStatus" }, response => {
      chrome.storage.local.get(['bypassList'], data => {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          const hostname = tabs[0] ? new URL(tabs[0].url).hostname : "";
          const bypassList = data.bypassList || ["localhost", "127.0.0.1"];
          const isBypassed = bypassList.some(pattern => {
            const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
            return regex.test(hostname);
          });

          if (isBypassed) {
            currentIPSpan.textContent = "Сайт в исключении";
            currentIPSpan.style.color = "#ffa726";
          } else if (response.proxyEnabled) {
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

  // Обновление кнопок исключений
  function updateBypassControls() {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) return;
      const hostname = new URL(tabs[0].url).hostname;
      chrome.storage.local.get(['bypassList'], data => {
        const bypassList = data.bypassList || ["localhost", "127.0.0.1"];
        const isBypassed = bypassList.some(pattern => {
          const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
          return regex.test(hostname);
        });
        addBypassBtn.classList.toggle("hidden", isBypassed);
        removeBypassBtn.classList.toggle("hidden", !isBypassed);
        loadBypassList();
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
              updateBypassControls();
              fetchAndUpdateIP();
            }
          });
        });
        bypassSites.appendChild(li);
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
      chrome.storage.local.get(['proxyIP', 'proxyPort', 'proxyType', 'proxyLogin', 'proxyPassword', 'bypassList'], data => {
        document.getElementById("proxyIP").value = data.proxyIP || "";
        document.getElementById("proxyPort").value = data.proxyPort || "";
        document.getElementById("proxyType").value = data.proxyType || "socks5";
        document.getElementById("proxyLogin").value = data.proxyLogin || "";
        document.getElementById("proxyPassword").value = data.proxyPassword || "";
        document.getElementById("bypassList").value = (data.bypassList || []).join(", ");
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

    setLoadingState(connectBtn);
    chrome.storage.local.set({ proxyIP, proxyPort, proxyType, proxyLogin, proxyPassword, bypassList }, () => {
      chrome.runtime.sendMessage({ action: "enableProxy" }, response => {
        clearLoadingState(connectBtn, "Подключиться");
        if (response.status === "success") {
          showControl();
          setToggleButtonState(true);
          fetchAndUpdateIP();
          loadHistory();
          updateBypassControls();
        } else {
          formError.textContent = response.message || "Ошибка подключения";
        }
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
          updateBypassControls();
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
        updateBypassControls();
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
        clearLoadingState(removeBypassBtn, "Удалить сайт из исключений");
        if (response.status === "success") {
          updateBypassControls();
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
    setLoadingState(saveBypassBtn);
    chrome.storage.local.set({ bypassList }, () => {
      chrome.runtime.sendMessage({ action: "enableProxy" }, response => {
        clearLoadingState(saveBypassBtn, "Сохранить исключения");
        if (response.status === "success") {
          updateBypassControls();
          fetchAndUpdateIP();
        } else {
          formError.textContent = response.message || "Ошибка сохранения";
        }
      });
    });
  });

  // Выход
  logoutBtn.addEventListener("click", () => {
    setLoadingState(logoutBtn);
    chrome.runtime.sendMessage({ action: "logout" }, response => {
      clearLoadingState(logoutBtn, "Выйти");
      if (response.status === "success") {
        showForm();
        currentIPSpan.textContent = "Загрузка...";
        checkFormInputs();
      } else {
        formError.textContent = response.message || "Ошибка выхода";
      }
    });
  });

  // Экспорт
  exportBtn.addEventListener("click", () => {
    chrome.storage.local.get(['proxyIP', 'proxyPort', 'proxyType', 'proxyLogin', 'proxyPassword', 'bypassList'], data => {
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
            checkFormInputs();
            formError.textContent = "Настройки импортированы";
            formError.style.color = "#4caf50";
            loadHistory();
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
      updateBypassControls();
    }
    if (changes.proxyIP || changes.proxyPort || changes.proxyType || changes.bypassList) {
      fetchAndUpdateIP();
      updateBypassControls();
    }
    if (changes.proxyHistory) loadHistory();
  });

  // Прерывание теста
  window.addEventListener("unload", () => {
    chrome.runtime.sendMessage({ action: "abortTest" });
  });

  // Валидация
  function validateIP(ip) {
    return /^(25[0-5]|2[0-4]\d|[0-1]?\d?\d)(\.(25[0-5]|2[0-4]\d|[0-1]?\d?\d)){3}$/.test(ip);
  }

  function validatePort(port) {
    const num = Number(port);
    return Number.isInteger(num) && num > 0 && num <= 65535;
  }

  function validateBypassList(bypassList) {
    return bypassList.every(entry => {
      // Проверяем, что строка состоит из букв, цифр, точек, звездочек и дефисов
      // и не содержит недопустимых символов
      if (!/^[a-zA-Z0-9.\-*]+$/.test(entry)) return false;
      
      // Проверяем, что строка не пустая и не состоит только из звездочек
      if (entry.trim() === '' || entry.trim() === '*') return false;
      
      try {
        // Пробуем создать регулярное выражение из шаблона
        // Экранируем точки и заменяем * на .*
        const regexPattern = '^' + entry.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
        new RegExp(regexPattern);
        return true;
      } catch {
        return false;
      }
    });
  }
});
