// МТС Линк — Авто-Подтверждение Присутствия (Popup Script)
document.addEventListener('DOMContentLoaded', () => {
  const toggleEnabled = document.getElementById('toggleEnabled');
  const toggleSound = document.getElementById('toggleSound');
  const toggleBadge = document.getElementById('toggleBadge');
  const statsCount = document.getElementById('statsCount');
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const btnReset = document.getElementById('btnReset');

  // Универсальный доступ к WebExtension API (Chrome / Firefox / Edge)
  const extApi = (typeof chrome !== 'undefined' && chrome.storage) ? chrome : ((typeof browser !== 'undefined' && browser.storage) ? browser : null);

  function updateStatusBadge(enabled) {
    if (!statusBadge || !statusText) return;
    if (enabled) {
      statusBadge.classList.remove('disabled');
      statusText.textContent = 'Активно';
    } else {
      statusBadge.classList.add('disabled');
      statusText.textContent = 'Отключено';
    }
  }

  // Загрузка настроек из хранилища
  if (extApi && extApi.storage && extApi.storage.local) {
    try {
      extApi.storage.local.get(['enabled', 'sound', 'badge', 'count'], (res) => {
        if (extApi.runtime && extApi.runtime.lastError) return;
        const enabled = res && res.enabled !== undefined ? res.enabled : true;
        const sound = res && res.sound !== undefined ? res.sound : true;
        const badge = res && res.badge !== undefined ? res.badge : true;
        const count = (res && res.count) || 0;

        if (toggleEnabled) toggleEnabled.checked = enabled;
        if (toggleSound) toggleSound.checked = sound;
        if (toggleBadge) toggleBadge.checked = badge;
        if (statsCount) statsCount.textContent = count;

        updateStatusBadge(enabled);
      });

      // Отслеживание изменений счетчика в реальном времени
      if (extApi.storage.onChanged) {
        extApi.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && changes.count && statsCount) {
            statsCount.textContent = changes.count.newValue || 0;
          }
        });
      }
    } catch (e) {
      console.warn('[Popup] Ошибка доступа к хранилищу:', e);
    }
  }

  // Вспомогательная функция безопасной записи
  function safeSetStorage(obj, callback) {
    if (extApi && extApi.storage && extApi.storage.local) {
      try {
        extApi.storage.local.set(obj, () => {
          if (extApi.runtime && extApi.runtime.lastError) return;
          if (typeof callback === 'function') callback();
        });
      } catch (e) {}
    }
  }

  // Сохранение настроек при изменении
  if (toggleEnabled) {
    toggleEnabled.addEventListener('change', () => {
      const val = toggleEnabled.checked;
      updateStatusBadge(val);
      safeSetStorage({ enabled: val });
    });
  }

  if (toggleSound) {
    toggleSound.addEventListener('change', () => {
      safeSetStorage({ sound: toggleSound.checked });
    });
  }

  if (toggleBadge) {
    toggleBadge.addEventListener('change', () => {
      safeSetStorage({ badge: toggleBadge.checked });
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      safeSetStorage({ count: 0 }, () => {
        if (statsCount) statsCount.textContent = 0;
        const originalText = btnReset.textContent;
        btnReset.textContent = 'Сброшено!';
        btnReset.style.color = '#00e676';
        btnReset.style.borderColor = 'rgba(0, 230, 118, 0.4)';
        setTimeout(() => {
          btnReset.textContent = originalText;
          btnReset.style.color = '';
          btnReset.style.borderColor = '';
        }, 1500);
      });
    });
  }
});