// popup.js

document.addEventListener("DOMContentLoaded", () => {
  const proxyFormDiv = document.getElementById("proxyForm");
  const proxyControlDiv = document.getElementById("proxyControl");
  const form = document.getElementById("form");
  const formError = document.getElementById("formError");
  
  const connectBtn = document.getElementById("connectBtn");
  const toggleBtn = document.getElementById("toggleBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const currentIPSpan = document.getElementById("currentIP");
  const statusSpan = document.getElementById("status");

  // Функция для отображения формы
  function showForm() {
    proxyFormDiv.classList.remove("hidden");
    proxyControlDiv.classList.add("hidden");
  }

  // Функция для отображения панели управления прокси
  function showControl() {
    proxyFormDiv.classList.add("hidden");
    proxyControlDiv.classList.remove("hidden");
  }

  // Функция для установки состояния кнопки переключения
  function setToggleButtonState(proxyEnabled) {
    if (proxyEnabled) {
      toggleBtn.textContent = "OFF";
      toggleBtn.classList.remove("disabled", "loading");
      toggleBtn.classList.add("enabled");
    } else {
      toggleBtn.textContent = "ON";
      toggleBtn.classList.remove("enabled", "loading");
      toggleBtn.classList.add("disabled");
    }
  }

  // Функция для отображения состояния загрузки
  function setLoadingState() {
    toggleBtn.textContent = "Загрузка...";
    toggleBtn.classList.remove("enabled", "disabled");
    toggleBtn.classList.add("loading");
    toggleBtn.disabled = true;
  }

  // Функция для очистки состояния загрузки
  function clearLoadingState() {
    toggleBtn.disabled = false;
  }

  // Функция для получения и обновления IP
  function fetchAndUpdateIP() {
    fetch("https://api.ipify.org?format=json")
      .then(response => response.json())
      .then(data => {
        currentIPSpan.textContent = data.ip;
        checkIP(data.ip);
      })
      .catch(() => {
        currentIPSpan.textContent = "Не удалось получить IP";
        statusSpan.textContent = "Ошибка";
        statusSpan.style.color = "#dc3545"; 
      });
  }

  // Функция для проверки IP
  function checkIP(ip) {
    chrome.storage.local.get(['proxyIP'], (data) => {
      const vpnIP = data.proxyIP; 
      if (ip === vpnIP) {
        statusSpan.textContent = "Подключение успешно";
        statusSpan.style.color = "#28a745"; 
      } else {
        statusSpan.textContent = "Не подключено к VPN";
        statusSpan.style.color = "#dc3545"; 
      }
    });
  }

  // Проверка наличия сохраненных данных прокси при загрузке
  chrome.storage.local.get(['proxyIP', 'proxyPort', 'proxyLogin', 'proxyPassword'], (data) => {
    if (data.proxyIP && data.proxyPort && data.proxyLogin && data.proxyPassword) {
      // Данные прокси существуют, показываем панель управления
      showControl();
      chrome.runtime.sendMessage({ action: "getProxyStatus" }, (response) => {
        setToggleButtonState(response.proxyEnabled);
        fetchAndUpdateIP();
      });
    } else {
      // Данных прокси нет, показываем форму
      showForm();
    }
  });

  // Обработчик отправки формы
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    formError.textContent = "";

    const proxyIP = document.getElementById("proxyIP").value.trim();
    const proxyPort = document.getElementById("proxyPort").value.trim();
    const proxyLogin = document.getElementById("proxyLogin").value.trim();
    const proxyPassword = document.getElementById("proxyPassword").value.trim();

    if (!proxyIP || !proxyPort || !proxyLogin || !proxyPassword) {
      formError.textContent = "Все поля обязательны для заполнения.";
      return;
    }

    // Дополнительная валидация IP и порта
    if (!validateIP(proxyIP)) {
      formError.textContent = "Неверный формат IP-адреса.";
      return;
    }

    if (!validatePort(proxyPort)) {
      formError.textContent = "Неверный формат порта.";
      return;
    }

    // Сохраняем данные прокси в хранилище
    chrome.storage.local.set({
      proxyIP,
      proxyPort,
      proxyLogin,
      proxyPassword
    }, () => {
      // Пытаемся включить прокси с новыми данными
      chrome.runtime.sendMessage({ action: "enableProxy" }, (response) => {
        if (response.status === "Proxy enabled") {
          // Если успешно, показываем панель управления
          showControl();
          setToggleButtonState(true);
          fetchAndUpdateIP();
        } else {
          formError.textContent = "Не удалось подключиться к прокси. Проверьте введенные данные.";
        }
      });
    });
  });

  // Обработчик клика на кнопку переключения прокси
  toggleBtn.addEventListener("click", () => {
    setLoadingState();
    chrome.runtime.sendMessage({ action: "getProxyStatus" }, (response) => {
      if (response.proxyEnabled) {
        // Если прокси включен, отключаем его
        chrome.runtime.sendMessage({ action: "disableProxy" }, (response) => {
          setToggleButtonState(false);
          clearLoadingState();
          fetchAndUpdateIP();
        });
      } else {
        // Если прокси выключен, включаем его
        chrome.runtime.sendMessage({ action: "enableProxy" }, (response) => {
          setToggleButtonState(true);
          clearLoadingState();
          fetchAndUpdateIP();
        });
      }
    });
  });

  // Обработчик клика на кнопку Logout
  logoutBtn.addEventListener("click", () => {
    // Отключаем прокси, если включен
    chrome.runtime.sendMessage({ action: "disableProxy" }, (response) => {
      // Удаляем данные прокси из хранилища
      chrome.storage.local.remove(['proxyIP', 'proxyPort', 'proxyLogin', 'proxyPassword', 'proxyEnabled'], () => {
        // Показать форму
        showForm();
        // Очистить IP и статус
        currentIPSpan.textContent = "Загрузка...";
        statusSpan.textContent = "Проверка...";
      });
    });
  });

  // Обработчик изменений в хранилище
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.proxyEnabled) {
        setToggleButtonState(changes.proxyEnabled.newValue);
        fetchAndUpdateIP();
      }
      if (changes.proxyIP || changes.proxyPort) {
        // Обновляем статус подключения при изменении данных прокси
        fetchAndUpdateIP();
      }
    }
  });

  // Функции для валидации IP и порта
  function validateIP(ip) {
    const regex = /^(25[0-5]|2[0-4]\d|[0-1]?\d?\d)(\.(25[0-5]|2[0-4]\d|[0-1]?\d?\d)){3}$/;
    return regex.test(ip);
  }

  function validatePort(port) {
    const portNum = Number(port);
    return Number.isInteger(portNum) && portNum > 0 && portNum <= 65535;
  }
});
