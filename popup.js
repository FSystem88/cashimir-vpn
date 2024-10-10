document.addEventListener("DOMContentLoaded", () => {
  const enableBtn = document.getElementById("enableBtn");
  const disableBtn = document.getElementById("disableBtn");
  const currentIPSpan = document.getElementById("currentIP");
  const statusSpan = document.getElementById("status");

  function updateButtons(proxyEnabled) {
    if (proxyEnabled) {
      enableBtn.classList.add("active");
      disableBtn.classList.remove("active");
      enableBtn.disabled = true;
      disableBtn.disabled = false;
    } else {
      disableBtn.classList.add("active");
      enableBtn.classList.remove("active");
      disableBtn.disabled = true;
      enableBtn.disabled = false;
    }
  }

  chrome.runtime.sendMessage({ action: "getProxyStatus" }, (response) => {
    updateButtons(response.proxyEnabled);
    fetchAndUpdateIP();
  });

  enableBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "enableProxy" }, (response) => {
      updateButtons(true);
      fetchAndUpdateIP();
    });
  });

  disableBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "disableProxy" }, (response) => {
      updateButtons(false);
      fetchAndUpdateIP();
    });
  });

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

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.proxyEnabled) {
      updateButtons(changes.proxyEnabled.newValue);
      fetchAndUpdateIP();
    }
  });
});
