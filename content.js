// МТС Линк — Авто-Подтверждение Присутствия (Content Script)
(function () {
  'use strict';

  let config = {
    enabled: true,
    sound: true,
    badge: true,
    count: 0
  };

  // Универсальный доступ к WebExtension API (Chrome / Firefox / Edge)
  const extApi = (typeof chrome !== 'undefined' && chrome.storage) ? chrome : ((typeof browser !== 'undefined' && browser.storage) ? browser : null);

  // Загружаем настройки из хранилища
  function loadConfig() {
    try {
      if (extApi && extApi.storage && extApi.storage.local) {
        extApi.storage.local.get(['enabled', 'sound', 'badge', 'count'], (res) => {
          if (extApi.runtime && extApi.runtime.lastError) return;
          if (res) {
            if (res.enabled !== undefined) config.enabled = res.enabled;
            if (res.sound !== undefined) config.sound = res.sound;
            if (res.badge !== undefined) config.badge = res.badge;
            if (res.count !== undefined) config.count = res.count;
          }
        });

        if (extApi.storage.onChanged) {
          extApi.storage.onChanged.addListener((changes, area) => {
            if (area === 'local') {
              if (changes.enabled) config.enabled = changes.enabled.newValue;
              if (changes.sound) config.sound = changes.sound.newValue;
              if (changes.badge) config.badge = changes.badge.newValue;
              if (changes.count) config.count = changes.count.newValue;
            }
          });
        }
      }
    } catch (e) {
      // Игнорируем ошибки инвалидации контекста расширения
    }
  }

  loadConfig();

  // Ключевые фразы для поиска окон присутствия и кнопок
  const PRESENCE_KEYWORDS = [
    'присутствие',
    'присутствия',
    'вы здесь',
    'вы с нами',
    'вы еще здесь',
    'вы всё ещё здесь',
    'проверка активности',
    'подтвердите',
    'подтверждение',
    'контроль присутствия',
    'продолжить звонок',
    'продолжить встречу',
    'неактивност'
  ];

  const BUTTON_KEYWORDS = [
    'я здесь',
    'подтвердить',
    'подтверждаю',
    'я на месте',
    'да, я тут',
    'продолжить',
    'да',
    'вернуться в звонок',
    'остаться',
    'я тут'
  ];

  let lastConfirmTime = 0;
  let sharedAudioCtx = null;

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
      
      const osc1 = sharedAudioCtx.createOscillator();
      const gain = sharedAudioCtx.createGain();
      const now = sharedAudioCtx.currentTime;
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.setValueAtTime(880, now + 0.1); // A5
      
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      
      osc1.connect(gain);
      gain.connect(sharedAudioCtx.destination);
      
      osc1.start(now);
      osc1.stop(now + 0.35);
    } catch (e) {
      console.warn('[MTS Link Auto-Confirm] Ошибка воспроизведения звука:', e);
    }
  }

  // Отображение плавающего уведомления на странице
  function showToast(text) {
    if (!config.badge || !document.body) return;
    
    let toast = document.getElementById('mts-autoconfirm-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'mts-autoconfirm-toast';
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
    }, 5000);
  }

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
    if (elem.closest('[class*="chat"], [class*="message"], [class*="history"], [class*="feed"], [class*="stream"]')) {
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

  // Поиск и нажатие на кнопку подтверждения присутствия
  function scanAndConfirm() {
    if (!config.enabled) return;

    const now = Date.now();
    // Защита от повторных срабатываний чаще раза в 2 секунды
    if (now - lastConfirmTime < 2000) return;

    // 1. Поиск модальных диалоговых окон
    const dialogs = document.querySelectorAll(
      '[role="dialog"], [role="alertdialog"], [class*="modal"], [class*="popup"], [class*="dialog"], [class*="presence"], [class*="testimonial"], [class*="confirm"], [class*="prompt"], [class*="alert"]'
    );

    let foundAndClicked = false;

    const checkDialogText = (text) => {
      const lower = text.toLowerCase();
      return PRESENCE_KEYWORDS.some((kw) => lower.includes(kw));
    };

    const checkButtonText = (text) => {
      const lower = text.toLowerCase().trim();
      return BUTTON_KEYWORDS.some((kw) => lower === kw || lower.includes(kw));
    };

    // Сначала ищем внутри валидных модальных окон
    dialogs.forEach((dialog) => {
      if (foundAndClicked || !isModalDialog(dialog)) return;

      const dialogText = dialog.textContent || '';
      if (checkDialogText(dialogText)) {
        const buttons = dialog.querySelectorAll('button, [role="button"], a, [class*="button"], [class*="btn"]');
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
      const allButtons = document.querySelectorAll('button, [role="button"], [class*="button"], [class*="btn"]');
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

      // Сохраняем счетчик в хранилище
      try {
        if (extApi && extApi.storage && extApi.storage.local) {
          extApi.storage.local.set({ count: config.count });
        }
      } catch (e) {}

      const timeStr = new Date().toLocaleTimeString('ru-RU');
      console.log(`%c[МТС Линк Авто-Подтверждение]%c Присутствие успешно подтверждено в ${timeStr}! (Всего: ${config.count})`, 'color: #ff0032; font-weight: bold;', 'color: inherit;');

      playBeep();
      showToast(`Присутствие автоматически подтверждено (${timeStr})`);
    }
  }

  // Троттлинг работы MutationObserver для предотвращения высокой загрузки ЦП
  let scanScheduled = false;
  let lastScanTime = 0;
  const SCAN_INTERVAL_MS = 250;

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

  const observer = new MutationObserver(() => {
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
  setInterval(scanAndConfirm, 1000);

  // Первоначальный запуск
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanAndConfirm);
  } else {
    scanAndConfirm();
  }

  console.log('%c[МТС Линк Авто-Подтверждение]%c Скрипт успешно запущен и отслеживает окна присутствия.', 'color: #ff0032; font-weight: bold;', 'color: inherit;');
})();

