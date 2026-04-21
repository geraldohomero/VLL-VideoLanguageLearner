/**
 * VLL Overlay Module — Manages subtitle display
 */

(function initVLLOverlay(root, factory) {
  root.VLL_Overlay = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createVLLOverlay() {
  'use strict';

  let overlayEl = null;
  let currentSubtitleData = null;

  function create(playerEl) {
    if (overlayEl) return overlayEl;

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

    // Incremental update check: if text hasn't changed, don't recreate DOM
    if (currentSubtitleData && currentSubtitleData.text === entry.text && 
        currentSubtitleData.showPinyin === settings.showPinyin &&
        currentSubtitleData.showTranslation === settings.showTranslation) {
      
      // Still need to update colors if they changed
      updateColors(entry.words);
      return;
    }

    currentSubtitleData = { 
      text: entry.text, 
      showPinyin: settings.showPinyin, 
      showTranslation: settings.showTranslation 
    };

    overlayEl.innerHTML = '';
    overlayEl.classList.remove('vll-hidden');

    const box = document.createElement('div');
    box.className = 'vll-subtitle-box';

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
    }
  }

  return { create, render, clear, updateColors };
});
