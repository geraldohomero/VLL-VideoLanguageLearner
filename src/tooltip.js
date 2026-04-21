/**
 * VLL Tooltip Module — Manages word hover tooltips
 */

(function initVLLTooltip(root, factory) {
  root.VLL_Tooltip = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createVLLTooltip() {
  'use strict';

  let tooltipEl = null;
  let tooltipTimeout = null;

  function show(wordData, context, overlayEl, options) {
    const { 
      vocabColors, 
      vocabLabels, 
      ptMeanings, 
      targetLang, 
      onTranslate, 
      onPlay, 
      onSave, 
      onDelete 
    } = options;

    if (tooltipTimeout) {
      clearTimeout(tooltipTimeout);
      tooltipTimeout = null;
    }
    hide();

    tooltipEl = document.createElement('div');
    tooltipEl.className = 'vll-tooltip';

    const overlayRect = overlayEl.getBoundingClientRect();
    tooltipEl.style.left = `${overlayRect.left + (overlayRect.width / 2)}px`;
    tooltipEl.style.bottom = `${window.innerHeight - overlayRect.top}px`;
    tooltipEl.style.top = 'auto';
    tooltipEl.style.transform = 'translate(-50%, -10px)';

    const headerEl = document.createElement('div');
    headerEl.className = 'vll-tooltip-header';

    const hanziEl = document.createElement('div');
    hanziEl.className = 'vll-tooltip-hanzi';
    hanziEl.textContent = wordData.hanzi;
    headerEl.appendChild(hanziEl);

    const playBtn = document.createElement('button');
    playBtn.className = 'vll-play-btn';
    playBtn.innerHTML = '🔊';
    playBtn.title = 'Tocar pronúncia';
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onPlay(wordData.hanzi);
    });
    headerEl.appendChild(playBtn);

    tooltipEl.appendChild(headerEl);

    if (wordData.pinyin) {
      const pinyinEl = document.createElement('div');
      pinyinEl.className = 'vll-tooltip-pinyin';
      pinyinEl.textContent = wordData.pinyin;
      tooltipEl.appendChild(pinyinEl);
    }

    const meaningEl = document.createElement('div');
    meaningEl.className = 'vll-tooltip-meaning';
    tooltipEl.appendChild(meaningEl);

    if (wordData.meaning) {
      if (ptMeanings[wordData.hanzi]) {
        meaningEl.textContent = ptMeanings[wordData.hanzi];
      } else if (wordData.meaningLang === targetLang) {
        meaningEl.textContent = wordData.meaning;
      } else {
        meaningEl.textContent = `${wordData.meaning} (Traduzindo...)`;
        onTranslate(wordData.meaning, wordData.meaningLang || 'en').then(translatedText => {
          if (translatedText && tooltipEl && document.body.contains(tooltipEl) && hanziEl.textContent === wordData.hanzi) {
            meaningEl.textContent = translatedText;
          }
        });
      }
    } else {
      meaningEl.style.opacity = '0.5';
      meaningEl.textContent = '(sem definição no dicionário)';
    }

    if (context) {
      const ctxEl = document.createElement('div');
      ctxEl.className = 'vll-tooltip-context';
      ctxEl.textContent = `"${context}"`;
      tooltipEl.appendChild(ctxEl);
    }

    const colorBtns = document.createElement('div');
    colorBtns.className = 'vll-color-buttons';

    vocabColors.forEach(color => {
      const btn = document.createElement('button');
      btn.className = 'vll-color-btn';
      btn.setAttribute('data-color', color);
      btn.title = vocabLabels[color] || color;

      if (wordData.color === color) btn.classList.add('active');

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onSave(wordData, color, context);
        colorBtns.querySelectorAll('.vll-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });

      colorBtns.appendChild(btn);
    });

    tooltipEl.appendChild(colorBtns);

    if (wordData.color && wordData.color !== 'white') {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'vll-remove-btn';
      removeBtn.textContent = '✕ Remover do vocabulário';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onDelete(wordData.hanzi);
        hide();
      });
      tooltipEl.appendChild(removeBtn);
    }

    tooltipEl.addEventListener('mouseenter', () => {
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = null;
      }
    });
    tooltipEl.addEventListener('mouseleave', () => {
      startHideTimer();
    });
    tooltipEl.addEventListener('click', e => e.stopPropagation());

    document.body.appendChild(tooltipEl);
  }

  function hide() {
    if (tooltipEl) {
      tooltipEl.remove();
      tooltipEl = null;
    }
  }

  function startHideTimer() {
    if (tooltipTimeout) clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => {
      if (tooltipEl && !tooltipEl.matches(':hover')) {
        hide();
      }
    }, 300);
  }

  function cancelHideTimer() {
    if (tooltipTimeout) {
      clearTimeout(tooltipTimeout);
      tooltipTimeout = null;
    }
  }

  return { show, hide, startHideTimer, cancelHideTimer };
});
