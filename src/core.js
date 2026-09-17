// МТС Линк — Авто-Подтверждение Присутствия (общий движок)
// Единый источник логики для расширения и userscript.
(function (global) {
  'use strict';

  // Ключевые фразы для поиска окон присутствия и кнопок (универсальный список)
  const PRESENCE_KEYWORDS = [
    'присутствие',
    'присутствия',
    'вы здесь',
    'вы с нами',
    'вы еще здесь',
    'вы всё ещё здесь',
    'вы ещё в собрании',
    'вы всё ещё на собрании',
    'проверка активности',
    'подтвердите',
    'подтверждение',
    'контроль присутствия',
    'продолжить звонок',
    'продолжить встречу',
    'продолжить просмотр',
    'продолжить участие',
    'продолжить работу',
    'неактивност',
    'are you still there',
    'are you here',
    'still in the meeting',
    'still in meeting',
    'attendance check',
    'activity check',
    'confirm attendance',
    'confirm presence'
  ];

  const BUTTON_KEYWORDS = [
    'я здесь',
    'подтвердить',
    'подтверждаю',
    'я на месте',
    'на месте',
    'да, я тут',
    'я тут',
    'я смотрю',
    'я вернулся',
    'продолжить',
    'продолжить просмотр',
    'продолжить участие',
    'вернуться в звонок',
    'остаться в собрании',
    'остаться',
    'переподключиться',
    'присоединиться повторно',
    'да',
    'i am here',
    'i\'m here',
    'i\'m back',
    'stay in meeting',
    'rejoin',
    'rejoin meeting',
    'confirm',
    'continue',
    'yes'
  ];

  const DIALOG_SELECTOR =
    '[role="dialog"], [role="alertdialog"], [class*="modal"], [class*="popup"], [class*="dialog"], [class*="presence"], [class*="testimonial"], [class*="confirm"], [class*="prompt"], [class*="alert"]';

  const BUTTON_SELECTOR = 'button, [role="button"], a, [class*="button"], [class*="btn"]';

  const CHAT_SELECTOR = '[class*="chat"], [class*="message"], [class*="history"], [class*="feed"], [class*="stream"]';

  const SCAN_INTERVAL_MS = 250;
  const POLL_INTERVAL_MS = 1000;
  const CONFIRM_COOLDOWN_MS = 2000;
  const TOAST_HIDE_MS = 5000;

  // Проверка видимости элемента
  function isVisible(elem) {
    if (!elem) return false;
    const style = window.getComputedStyle(elem);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = elem.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // Проверка, является ли элемент изолированным диалогом/модальным окном (а не всей страницей или чатом)
  function isModalDialog(elem) {
    if (!isVisible(elem)) return false;

    // Исключаем элементы чатов, истории сообщений и потоков видео
    if (elem.closest(CHAT_SELECTOR)) {
      return false;
    }

    const rect = elem.getBoundingClientRect();
    // Исключаем полноэкранные контейнеры (занимающие более 92% ширины и высоты экрана)
    if (rect.width > window.innerWidth * 0.92 && rect.height > window.innerHeight * 0.92) {
      return false;
    }

    return true;
  }

  // Клик по элементу с эмуляцией пользовательского нажатия и вызовом native click()
  function triggerClick(element) {
    if (!element || element.dataset.mtsAutoconfirmed === 'true') return false;
    element.dataset.mtsAutoconfirmed = 'true';

    ['mousedown', 'mouseup', 'click'].forEach((eventType) => {
      try {
        const event = new MouseEvent(eventType, {
          view: window,
          bubbles: true,
          cancelable: true
        });
        element.dispatchEvent(event);
      } catch (e) {}
    });

    if (typeof element.click === 'function') {
      try {
        element.click();
      } catch (e) {}
    }

    return true;
  }

  function checkDialogText(text) {
    const lower = text.toLowerCase();
    return PRESENCE_KEYWORDS.some((kw) => lower.includes(kw));
  }

  function checkButtonText(text) {
    const lower = text.toLowerCase().trim();
    return BUTTON_KEYWORDS.some((kw) => lower === kw || lower.includes(kw));
  }

  // Создаёт экземпляр автоконфирмера с внедряемым хранилищем
  function create(options) {
    options = options || {};

    const logPrefix = options.logPrefix || '[Авто-Подтверждение]';
    const startupMessage = options.startupMessage || 'Скрипт успешно запущен.';
    const toastId = options.toastId || 'mts-autoconfirm-toast';
    const confirmedLog = options.confirmedLog || ((timeStr, count) => `Присутствие подтверждено в ${timeStr}! (Всего: ${count})`);
    const confirmedToast = options.confirmedToast || ((timeStr) => `Присутствие подтверждено (${timeStr})`);
    const onCountChange = typeof options.onCountChange === 'function' ? options.onCountChange : function () {};
    const initial = options.initialConfig || {};

    const config = {
      enabled: initial.enabled !== undefined ? initial.enabled : true,
      sound: initial.sound !== undefined ? initial.sound : true,
      badge: initial.badge !== undefined ? initial.badge : true,
      count: initial.count !== undefined ? initial.count : 0
    };

    let lastConfirmTime = 0;
    let sharedAudioCtx = null;
    let scanScheduled = false;
    let lastScanTime = 0;
    let observer = null;
    let intervalId = null;

    // Воспроизведение короткого звукового сигнала через Web Audio API (с единым контекстом)
    function playBeep() {
      if (!config.sound) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
          sharedAudioCtx = new AudioCtx();
        }
        if (sharedAudioCtx.state === 'suspended') {
          sharedAudioCtx.resume();
        }

        const osc = sharedAudioCtx.createOscillator();
        const gain = sharedAudioCtx.createGain();
        const now = sharedAudioCtx.currentTime;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880, now + 0.1); // A5

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(sharedAudioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.35);
      } catch (e) {
        console.warn(logPrefix + ' Ошибка воспроизведения звука:', e);
      }
    }

    // Отображение плавающего уведомления на странице
    function showToast(text) {
      if (!config.badge || !document.body) return;

      let toast = document.getElementById(toastId);
      if (!toast) {
        toast = document.createElement('div');
        toast.id = toastId;
        toast.style.cssText = `
          position: fixed;
          bottom: 24px;
          right: 24px;
          background: rgba(18, 20, 29, 0.92);
          color: #ffffff;
          border: 1px solid rgba(255, 0, 50, 0.4);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 15px rgba(255, 0, 50, 0.2);
          backdrop-filter: blur(10px);
          padding: 12px 18px;
          border-radius: 12px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 14px;
          font-weight: 500;
          z-index: 999999;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          transform: translateY(20px);
          opacity: 0;
          pointer-events: none;
        `;
        document.body.appendChild(toast);
      }

      toast.textContent = '';
      const dot = document.createElement('span');
      dot.style.cssText = 'display:inline-block; width:10px; height:10px; border-radius:50%; background:#00E676; box-shadow:0 0 8px #00E676; flex-shrink:0;';
      const label = document.createElement('span');
      label.textContent = text;

      toast.appendChild(dot);
      toast.appendChild(label);

      requestAnimationFrame(() => {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
      });

      clearTimeout(toast.hideTimeout);
      toast.hideTimeout = setTimeout(() => {
        toast.style.transform = 'translateY(20px)';
        toast.style.opacity = '0';
      }, TOAST_HIDE_MS);
    }

    // Поиск и нажатие на кнопку подтверждения присутствия
    function scanAndConfirm() {
      if (!config.enabled) return;

      const now = Date.now();
      // Защита от повторных срабатываний чаще раза в 2 секунды
      if (now - lastConfirmTime < CONFIRM_COOLDOWN_MS) return;

      // 1. Поиск модальных диалоговых окон
      const dialogs = document.querySelectorAll(DIALOG_SELECTOR);

      let foundAndClicked = false;

      // Сначала ищем внутри валидных модальных окон
      dialogs.forEach((dialog) => {
        if (foundAndClicked || !isModalDialog(dialog)) return;

        const dialogText = dialog.textContent || '';
        if (checkDialogText(dialogText)) {
          const buttons = dialog.querySelectorAll(BUTTON_SELECTOR);
          buttons.forEach((btn) => {
            if (foundAndClicked || !isVisible(btn)) return;

            const btnText = btn.textContent || '';
            if (checkButtonText(btnText) || buttons.length === 1) {
              if (triggerClick(btn)) {
                foundAndClicked = true;
              }
            }
          });
        }
      });

      // 2. Глобальный точечный поиск кнопок по всей странице (только с проверкой ближайшего родителя)
      if (!foundAndClicked) {
        const allButtons = document.querySelectorAll(BUTTON_SELECTOR);
        allButtons.forEach((btn) => {
          if (foundAndClicked || !isVisible(btn)) return;

          // Не кликаем кнопки внутри чатов
          if (btn.closest('[class*="chat"], [class*="message"], [class*="history"]')) return;

          const btnText = (btn.textContent || '').trim().toLowerCase();
          if (btnText && checkButtonText(btnText)) {
            let parent = btn.parentElement;
            let isInsidePresenceContext = false;

            for (let i = 0; i < 5 && parent; i++) {
              // Не проверяем родителя, если это блок чата
              if (parent.matches && parent.matches('[class*="chat"], [class*="message"]')) {
                break;
              }
              if (checkDialogText(parent.textContent || '')) {
                isInsidePresenceContext = true;
                break;
              }
              parent = parent.parentElement;
            }

            if (isInsidePresenceContext || btnText.includes('я здесь') || btnText.includes('подтвердить присутствие')) {
              if (triggerClick(btn)) {
                foundAndClicked = true;
              }
            }
          }
        });
      }

      if (foundAndClicked) {
        lastConfirmTime = Date.now();
        config.count++;

        onCountChange(config.count);

        const timeStr = new Date().toLocaleTimeString('ru-RU');
        console.log('%c' + logPrefix + '%c ' + confirmedLog(timeStr, config.count), 'color: #ff0032; font-weight: bold;', 'color: inherit;');

        playBeep();
        showToast(confirmedToast(timeStr));
      }
    }

    // Троттлинг работы MutationObserver для предотвращения высокой загрузки ЦП
    function scheduleScan() {
      if (scanScheduled) return;
      scanScheduled = true;
      requestAnimationFrame(() => {
        scanScheduled = false;
        const now = Date.now();
        if (now - lastScanTime >= SCAN_INTERVAL_MS) {
          lastScanTime = now;
          scanAndConfirm();
        }
      });
    }

    // Синхронизация настроек из внешнего хранилища (без записи обратно)
    function update(partial) {
      if (!partial) return;
      if (partial.enabled !== undefined) config.enabled = partial.enabled;
      if (partial.sound !== undefined) config.sound = partial.sound;
      if (partial.badge !== undefined) config.badge = partial.badge;
      if (partial.count !== undefined) config.count = partial.count;
    }

    // Сброс счётчика с сохранением во внешнее хранилище
    function resetCount() {
      config.count = 0;
      onCountChange(0);
    }

    function start() {
      observer = new MutationObserver(() => {
        scheduleScan();
      });

      const rootElem = document.body || document.documentElement;
      if (rootElem) {
        observer.observe(rootElem, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'class', 'hidden']
        });
      }

      // Регулярная проверка на случай, если MutationObserver не уловил изменения
      intervalId = setInterval(scanAndConfirm, POLL_INTERVAL_MS);

      // Первоначальный запуск
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scanAndConfirm);
      } else {
        scanAndConfirm();
      }

      console.log('%c' + logPrefix + '%c ' + startupMessage, 'color: #ff0032; font-weight: bold;', 'color: inherit;');
    }

    function stop() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    return {
      start,
      stop,
      update,
      resetCount,
      scanAndConfirm,
      getConfig: () => config
    };
  }

  global.AutoConfirmCore = {
    create,
    PRESENCE_KEYWORDS,
    BUTTON_KEYWORDS
  };
})(typeof window !== 'undefined' ? window : this);
