// МТС Линк — Авто-Подтверждение Присутствия (Content Script)
// Адаптер расширения: связывает общий движок с chrome.storage.
(function () {
  'use strict';

  // Универсальный доступ к WebExtension API (Chrome / Firefox / Edge)
  const extApi = (typeof chrome !== 'undefined' && chrome.storage) ? chrome : ((typeof browser !== 'undefined' && browser.storage) ? browser : null);

  const api = window.AutoConfirmCore.create({
    logPrefix: '[МТС Линк Авто-Подтверждение]',
    startupMessage: 'Скрипт успешно запущен и отслеживает окна присутствия.',
    toastId: 'mts-autoconfirm-toast',
    confirmedLog: (timeStr, count) => `Присутствие успешно подтверждено в ${timeStr}! (Всего: ${count})`,
    confirmedToast: (timeStr) => `Присутствие автоматически подтверждено (${timeStr})`,
    initialConfig: {
      enabled: true,
      sound: true,
      badge: true,
      count: 0
    },
    onCountChange: (count) => {
      // Сохраняем счетчик в хранилище
      try {
        if (extApi && extApi.storage && extApi.storage.local) {
          extApi.storage.local.set({ count });
        }
      } catch (e) {}
    }
  });

  // Загружаем настройки из хранилища
  function loadConfig() {
    try {
      if (extApi && extApi.storage && extApi.storage.local) {
        extApi.storage.local.get(['enabled', 'sound', 'badge', 'count'], (res) => {
          if (extApi.runtime && extApi.runtime.lastError) return;
          if (res) api.update(res);
        });

        if (extApi.storage.onChanged) {
          extApi.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            const patch = {};
            ['enabled', 'sound', 'badge', 'count'].forEach((key) => {
              if (changes[key]) patch[key] = changes[key].newValue;
            });
            api.update(patch);
          });
        }
      }
    } catch (e) {
      // Игнорируем ошибки инвалидации контекста расширения
    }
  }

  loadConfig();
  api.start();
})();