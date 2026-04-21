/**
 * VLL Overlay Module — Manages subtitle display
 */

(function initVLLOverlay(root, factory) {
  root.VLL_Overlay = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createVLLOverlay() {
  'use strict';

  let overlayEl = null;
  let currentSubtitleData = null;
  let onSettingsChange = null;
  let dragState = null;

  const DEFAULT_STYLE = {
    fontScale: 1,
    contrast: 1,
    textColor: '#e8e8f0',
    backgroundColor: '#0a0a19',
    backgroundAlpha: 0.4,
    blur: 6
  };

  const DEFAULT_POSITION = {
    x: 50,
    y: 84
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numberOr(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function hexToRgba(hex, alpha) {
    const safe = String(hex || '').replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(safe)) {
      return `rgba(10, 10, 25, ${alpha})`;
    }
    const r = parseInt(safe.slice(0, 2), 16);
    const g = parseInt(safe.slice(2, 4), 16);
    const b = parseInt(safe.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function sanitizeSettings(settings) {
    const overlayStyle = {
      ...DEFAULT_STYLE,
      ...(settings?.overlayStyle || {})
    };
    const overlayPosition = {
      ...DEFAULT_POSITION,
      ...(settings?.overlayPosition || {})
    };

    overlayStyle.fontScale = clamp(numberOr(overlayStyle.fontScale, DEFAULT_STYLE.fontScale), 0.7, 1.8);
    overlayStyle.contrast = clamp(numberOr(overlayStyle.contrast, DEFAULT_STYLE.contrast), 0.75, 1.8);
    overlayStyle.backgroundAlpha = clamp(numberOr(overlayStyle.backgroundAlpha, DEFAULT_STYLE.backgroundAlpha), 0, 0.9);
    overlayStyle.blur = clamp(numberOr(overlayStyle.blur, DEFAULT_STYLE.blur), 0, 20);
    overlayPosition.x = clamp(numberOr(overlayPosition.x, DEFAULT_POSITION.x), 5, 95);
    overlayPosition.y = clamp(numberOr(overlayPosition.y, DEFAULT_POSITION.y), 5, 95);

    return { overlayStyle, overlayPosition };
  }

  function getSettingsSignature(settings) {
    const safe = sanitizeSettings(settings);
    return JSON.stringify(safe);
  }

  function applyOverlayCssVars(settings) {
    if (!overlayEl) return;
    const safe = sanitizeSettings(settings);
    const rootStyle = document.documentElement.style;

    overlayEl.style.setProperty('--vll-user-font-scale', String(safe.overlayStyle.fontScale));
    overlayEl.style.setProperty('--vll-user-contrast', String(safe.overlayStyle.contrast));
    overlayEl.style.setProperty('--vll-user-text-color', safe.overlayStyle.textColor);
    overlayEl.style.setProperty('--vll-user-bg-color', safe.overlayStyle.backgroundColor);
    overlayEl.style.setProperty('--vll-user-bg-alpha', String(safe.overlayStyle.backgroundAlpha));
    overlayEl.style.setProperty('--vll-user-bg-rgba', hexToRgba(safe.overlayStyle.backgroundColor, safe.overlayStyle.backgroundAlpha));
    overlayEl.style.setProperty('--vll-user-blur', `${safe.overlayStyle.blur}px`);

    rootStyle.setProperty('--vll-user-text-color', safe.overlayStyle.textColor);
    rootStyle.setProperty('--vll-user-bg-color', safe.overlayStyle.backgroundColor);
    rootStyle.setProperty('--vll-user-bg-alpha', String(safe.overlayStyle.backgroundAlpha));
    rootStyle.setProperty('--vll-user-bg-rgba', hexToRgba(safe.overlayStyle.backgroundColor, safe.overlayStyle.backgroundAlpha));
    rootStyle.setProperty('--vll-user-blur', `${safe.overlayStyle.blur}px`);
    rootStyle.setProperty('--vll-user-contrast', String(safe.overlayStyle.contrast));

    overlayEl.style.left = `${safe.overlayPosition.x}%`;
    overlayEl.style.top = `${safe.overlayPosition.y}%`;
    overlayEl.style.bottom = 'auto';
    overlayEl.style.transform = 'translate(-50%, -100%)';
  }

  function emitSettingsChange(nextPartial) {
    if (typeof onSettingsChange !== 'function') return;
    onSettingsChange(nextPartial);
  }

  function stopDragging() {
    if (!dragState) return;
    window.removeEventListener('mousemove', dragState.onMouseMove);
    window.removeEventListener('mouseup', dragState.onMouseUp);
    dragState = null;
  }

  function startDragging(e, settings) {
    if (!overlayEl) return;
    const safe = sanitizeSettings(settings);
    const parentRect = overlayEl.parentElement.getBoundingClientRect();

    const onMouseMove = (event) => {
      const xPercent = ((event.clientX - parentRect.left) / parentRect.width) * 100;
      const yPercent = ((event.clientY - parentRect.top) / parentRect.height) * 100;

      const nextPosition = {
        x: clamp(xPercent, 5, 95),
        y: clamp(yPercent, 10, 95)
      };

      applyOverlayCssVars({
        overlayStyle: safe.overlayStyle,
        overlayPosition: nextPosition
      });

      emitSettingsChange({ overlayPosition: nextPosition });
    };

    const onMouseUp = () => stopDragging();
    dragState = { onMouseMove, onMouseUp };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  }

  function create(playerEl, options = {}) {
    if (overlayEl) return overlayEl;

    onSettingsChange = options.onSettingsChange || null;

    overlayEl = document.createElement('div');
    overlayEl.className = 'vll-overlay vll-hidden';
    overlayEl.id = 'vll-overlay';

    overlayEl.addEventListener('click', e => e.stopPropagation());
    playerEl.style.position = 'relative';
    playerEl.appendChild(overlayEl);

    return overlayEl;
  }

  function render(entry, settings, onWordHover, onWordLeave, onWordClick) {
    if (!overlayEl) return;

    const settingsSignature = getSettingsSignature(settings);

    // Incremental update check: if text hasn't changed, don't recreate DOM
    if (currentSubtitleData && currentSubtitleData.text === entry.text && 
        currentSubtitleData.showPinyin === settings.showPinyin &&
        currentSubtitleData.showTranslation === settings.showTranslation &&
        currentSubtitleData.settingsSignature === settingsSignature) {
      
      // Still need to update colors if they changed
      updateColors(entry.words);
      return;
    }

    currentSubtitleData = { 
      text: entry.text, 
      showPinyin: settings.showPinyin, 
      showTranslation: settings.showTranslation,
      settingsSignature
    };

    applyOverlayCssVars(settings);

    overlayEl.innerHTML = '';
    overlayEl.classList.remove('vll-hidden');

    const box = document.createElement('div');
    box.className = 'vll-subtitle-box';

    box.addEventListener('mousedown', (e) => {
      if (e.target.closest('.vll-word')) return;
      startDragging(e, settings);
    });

    const hanziLine = document.createElement('div');
    hanziLine.className = 'vll-line-hanzi';

    entry.words.forEach(w => {
      if (!w.isWord) {
        const span = document.createElement('span');
        span.textContent = w.hanzi;
        span.style.color = 'var(--vll-text-dim)';
        hanziLine.appendChild(span);
        return;
      }

      const wordEl = document.createElement('div');
      wordEl.className = 'vll-word';
      if (w.color) wordEl.setAttribute('data-color', w.color);
      wordEl.setAttribute('data-hanzi', w.hanzi); // For easy selection

      const hanziSpan = document.createElement('span');
      hanziSpan.className = 'vll-word-hanzi';
      hanziSpan.textContent = w.hanzi;
      wordEl.appendChild(hanziSpan);

      if (settings.showPinyin && w.pinyin) {
        const pinyinSpan = document.createElement('span');
        pinyinSpan.className = 'vll-word-pinyin';
        pinyinSpan.textContent = w.pinyin;
        wordEl.appendChild(pinyinSpan);
      }

      wordEl.addEventListener('mouseenter', (e) => onWordHover(w, entry.text, e));
      wordEl.addEventListener('mouseleave', () => onWordLeave());
      wordEl.addEventListener('click', (e) => {
        e.stopPropagation();
        onWordClick(w.hanzi);
      });

      hanziLine.appendChild(wordEl);
    });

    box.appendChild(hanziLine);

    if (settings.showTranslation && entry.translation) {
      const transLine = document.createElement('div');
      transLine.className = 'vll-line-translation';
      transLine.textContent = entry.translation;
      box.appendChild(transLine);
    }

    overlayEl.appendChild(box);
  }

  function updateColors(words) {
    if (!overlayEl) return;
    words.forEach(w => {
      if (!w.isWord) return;
      const wordEl = overlayEl.querySelector(`.vll-word[data-hanzi="${w.hanzi}"]`);
      if (wordEl) {
        if (w.color) wordEl.setAttribute('data-color', w.color);
        else wordEl.removeAttribute('data-color');
      }
    });
  }

  function clear() {
    if (overlayEl) {
      overlayEl.classList.add('vll-hidden');
      currentSubtitleData = null;
      stopDragging();
    }
  }

  return { create, render, clear, updateColors };
});
