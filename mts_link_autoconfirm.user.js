// ==UserScript==
// @name         Авто-Подтверждение Присутствия — МТС Линк & Яндекс Телемост
// @namespace    http://tampermonkey.net/
// @version      1.1.1
// @description  Автоматическое подтверждение присутствия на вебинарах, лекциях и встречах (МТС Линк, Webinar.ru, Яндекс Телемост)
// @author       Antigravity
// @match        https://*.mts-link.ru/*
// @match        https://*.webinar.ru/*
// @match        https://telemost.yandex.ru/*
// @match        https://*.telemost.yandex.ru/*
// @match        https://telemost.yandex.com/*
// @match        https://*.telemost.yandex.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==UserScript==

(function () {
  'use strict';

  // Настройки
  let config = {
    enabled: true,
    sound: true,
    badge: true,
    count: typeof GM_getValue !== 'undefined' ? GM_getValue('mts_confirm_count', 0) : 0
  };

  // Регистрируем команды меню в Tampermonkey / Violentmonkey
  if (typeof GM_registerMenuCommand !== 'undefined') {
    try {
      GM_registerMenuCommand('🔔 Переключить Звуковой Сигнал', () => {
        config.sound = !config.sound;
        alert(`Звуковой сигнал: ${config.sound ? 'Включен' : 'Выключен'}`);
      });
      GM_registerMenuCommand('📊 Сбросить счетчик присутствий', () => {
        config.count = 0;
        if (typeof GM_setValue !== 'undefined') GM_setValue('mts_confirm_count', 0);
        alert('Счетчик успешно сброшен!');
      });
    } catch (e) {}
  }

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

  // Звуковое оповещение (Web Audio API)
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
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.1);
      
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      
      osc.connect(gain);
      gain.connect(sharedAudioCtx.destination);
      
      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      console.warn('[MTS Link Auto-Confirm] Ошибка воспроизведения звука:', e);
    }
  }

  // Отображение всплывающего уведомления
  function showToast(text) {
    if (!config.badge || !document.body) return;
    
    let toast = document.getElementById('mts-autoconfirm-toast-us');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'mts-autoconfirm-toast-us';
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

  function isVisible(elem) {
    if (!elem) return false;
    const style = window.getComputedStyle(elem);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = elem.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isModalDialog(elem) {
    if (!isVisible(elem)) return false;

    if (elem.closest('[class*="chat"], [class*="message"], [class*="history"], [class*="feed"], [class*="stream"]')) {
      return false;
    }

    const rect = elem.getBoundingClientRect();
    if (rect.width > window.innerWidth * 0.92 && rect.height > window.innerHeight * 0.92) {
      return false;
    }

    return true;
  }

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

  function scanAndConfirm() {
    if (!config.enabled) return;

    const now = Date.now();
    if (now - lastConfirmTime < 2000) return;

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

    // 1. Поиск внутри валидных модалок
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

    // 2. Глобальный точечный поиск кнопок
    if (!foundAndClicked) {
      const allButtons = document.querySelectorAll('button, [role="button"], [class*="button"], [class*="btn"]');
      allButtons.forEach((btn) => {
        if (foundAndClicked || !isVisible(btn)) return;

        if (btn.closest('[class*="chat"], [class*="message"], [class*="history"]')) return;

        const btnText = (btn.textContent || '').trim().toLowerCase();
        if (btnText && checkButtonText(btnText)) {
          let parent = btn.parentElement;
          let isInsidePresenceContext = false;
          
          for (let i = 0; i < 5 && parent; i++) {
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

      if (typeof GM_setValue !== 'undefined') {
        try {
          GM_setValue('mts_confirm_count', config.count);
        } catch (e) {}
      }

      const timeStr = new Date().toLocaleTimeString('ru-RU');
      console.log(`%c[МТС Линк UserScript]%c Присутствие подтверждено в ${timeStr}! (Всего: ${config.count})`, 'color: #ff0032; font-weight: bold;', 'color: inherit;');

      playBeep();
      showToast(`Присутствие подтверждено (${timeStr})`);
    }
  }

  // Троттлинг работы MutationObserver
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

  const observer = new MutationObserver(() => scheduleScan());
  const rootElem = document.body || document.documentElement;
  if (rootElem) {
    observer.observe(rootElem, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden']
    });
  }

  setInterval(scanAndConfirm, 1000);
  scanAndConfirm();

  console.log('%c[МТС Линк UserScript]%c Скрипт успешно запущен.', 'color: #ff0032; font-weight: bold;', 'color: inherit;');
})();

