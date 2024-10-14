document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("toggleBtn");
  const currentIPSpan = document.getElementById("currentIP");
  const statusSpan = document.getElementById("status");

  // Функция для установки состояния кнопки
  function setButtonState(proxyEnabled) {
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

  // Функция для снятия состояния загрузки
  function clearLoadingState() {
    toggleBtn.disabled = false;
  }

  // Получение текущего статуса прокси при загрузке
  chrome.runtime.sendMessage({ action: "getProxyStatus" }, (response) => {
    setButtonState(response.proxyEnabled);
    fetchAndUpdateIP();
  });

  // Обработчик клика по кнопке
  toggleBtn.addEventListener("click", () => {
    setLoadingState();
    chrome.runtime.sendMessage({ action: "getProxyStatus" }, (response) => {
      if (response.proxyEnabled) {
        // Если прокси включен, отключаем его
        chrome.runtime.sendMessage({ action: "disableProxy" }, (response) => {
          setButtonState(false);
          clearLoadingState();
          fetchAndUpdateIP();
        });
      } else {
        // Если прокси отключен, включаем его
        chrome.runtime.sendMessage({ action: "enableProxy" }, (response) => {
          setButtonState(true);
          clearLoadingState();
          fetchAndUpdateIP();
        });
      }
    });
  });

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

  // Функция для проверки соответствия IP
  function checkIP(ip) {
    const vpnIP = "";  // вставить IP
    if (ip === vpnIP) {
      statusSpan.textContent = "Подключение успешно";
      statusSpan.style.color = "#28a745"; 
    } else {
      statusSpan.textContent = "Не подключено к VPN";
      statusSpan.style.color = "#dc3545"; 
    }
  }

  // Обработчик изменений в хранилище
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.proxyEnabled) {
      setButtonState(changes.proxyEnabled.newValue);
      fetchAndUpdateIP();
    }
  });
});
