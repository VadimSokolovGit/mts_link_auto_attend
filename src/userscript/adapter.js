// Адаптер userscript: связывает общий движок с GM_getValue / GM_setValue.
// Этот файл — фрагмент сборки: итоговый скрипт генерируется build.js
// (заголовок UserScript + src/core.js + этот адаптер).
(function () {
  'use strict';

  const COUNT_KEY = 'mts_confirm_count';

  function readCount() {
    try {
      return typeof GM_getValue !== 'undefined' ? GM_getValue(COUNT_KEY, 0) : 0;
    } catch (e) {
      return 0;
    }
  }

  const api = window.AutoConfirmCore.create({
    logPrefix: '[МТС Линк UserScript]',
    startupMessage: 'Скрипт успешно запущен.',
    toastId: 'mts-autoconfirm-toast-us',
    confirmedLog: (timeStr, count) => `Присутствие подтверждено в ${timeStr}! (Всего: ${count})`,
    confirmedToast: (timeStr) => `Присутствие подтверждено (${timeStr})`,
    initialConfig: {
      enabled: true,
      sound: true,
      badge: true,
      count: readCount()
    },
    onCountChange: (count) => {
      if (typeof GM_setValue !== 'undefined') {
        try {
          GM_setValue(COUNT_KEY, count);
        } catch (e) {}
      }
    }
  });

  // Регистрируем команды меню в Tampermonkey / Violentmonkey
  if (typeof GM_registerMenuCommand !== 'undefined') {
    try {
      GM_registerMenuCommand('🔔 Переключить Звуковой Сигнал', () => {
        const sound = !api.getConfig().sound;
        api.update({ sound });
        alert(`Звуковой сигнал: ${sound ? 'Включен' : 'Выключен'}`);
      });
      GM_registerMenuCommand('📊 Сбросить счетчик присутствий', () => {
        api.resetCount();
        alert('Счетчик успешно сброшен!');
      });
    } catch (e) {}
  }

  api.start();
})();