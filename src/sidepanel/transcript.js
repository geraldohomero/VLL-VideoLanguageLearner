/**
 * VLL Sidepanel Transcript Module
 */

(function initVLLSPTranscript(root, factory) {
  root.VLL_SP_Transcript = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createVLLSPTranscript() {
  'use strict';

  let listEl = null;
  let emptyEl = null;

  function init(els) {
    listEl = els.list;
    emptyEl = els.empty;
  }

  function render(subtitles, currentIndex, options) {
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!subtitles || subtitles.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    subtitles.forEach((sub, index) => {
      const item = document.createElement('div');
      item.className = 'vll-transcript-item';
      item.dataset.index = index;
      if (index === currentIndex) item.classList.add('active');

      const time = document.createElement('div');
      time.className = 'vll-transcript-time';
      time.textContent = options.formatTime(sub.start);
      item.appendChild(time);

      const hanziLine = document.createElement('div');
      hanziLine.className = 'vll-transcript-hanzi';

      if (sub.words) {
        sub.words.forEach(w => {
          if (w.isWord) {
            const span = document.createElement('span');
            span.className = 'vll-tw';
            span.textContent = w.hanzi;
            if (w.color) span.setAttribute('data-color', w.color);
            span.addEventListener('click', (e) => {
              e.stopPropagation();
              options.onWordClick(w, sub.text);
            });
            hanziLine.appendChild(span);
          } else {
            hanziLine.appendChild(document.createTextNode(w.hanzi));
          }
        });
      } else {
        hanziLine.textContent = sub.text;
      }
      item.appendChild(hanziLine);

      if (sub.words) {
        const pinyinLine = document.createElement('div');
        pinyinLine.className = 'vll-transcript-pinyin';
        pinyinLine.textContent = sub.words
          .filter(w => w.pinyin)
          .map(w => w.pinyin)
          .join(' ');
        if (pinyinLine.textContent) item.appendChild(pinyinLine);
      }

      if (sub.translation) {
        const transLine = document.createElement('div');
        transLine.className = 'vll-transcript-translation';
        transLine.textContent = sub.translation;
        item.appendChild(transLine);
      }

      const playBtn = document.createElement('button');
      playBtn.className = 'vll-transcript-play-btn';
      playBtn.innerHTML = '🔊';
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        options.onPlayPronunciation(sub.text);
      });
      item.appendChild(playBtn);

      item.addEventListener('click', () => options.onSeek(index));

      listEl.appendChild(item);
    });
  }

  function highlight(index) {
    if (!listEl) return;
    const items = listEl.querySelectorAll('.vll-transcript-item');
    items.forEach(item => {
      item.classList.toggle('active', parseInt(item.dataset.index) === index);
    });

    const activeItem = listEl.querySelector('.vll-transcript-item.active');
    if (activeItem) {
      activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function updateWordColor(word, color) {
    if (!listEl) return;
    const finalColor = color === 'white' ? null : color;
    const wordSpans = listEl.querySelectorAll('.vll-tw');
    wordSpans.forEach(span => {
      if (span.textContent === word) {
        if (finalColor) span.setAttribute('data-color', finalColor);
        else span.removeAttribute('data-color');
      }
    });
  }

  return { init, render, highlight, updateWordColor };
});
