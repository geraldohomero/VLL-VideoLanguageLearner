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
      onDelete,
      onEditMeaning
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

    const playBtn = document.createElement('button');
    playBtn.className = 'vll-play-btn';
    playBtn.innerHTML = '🔊';
    playBtn.title = 'Tocar pronúncia';
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onPlay(wordData.hanzi);
    });
    headerEl.appendChild(playBtn);

    const hanziEl = document.createElement('div');
    hanziEl.className = 'vll-tooltip-hanzi';
    hanziEl.textContent = wordData.hanzi;
    headerEl.appendChild(hanziEl);

    if (wordData.pinyin) {
      const pinyinEl = document.createElement('div');
      pinyinEl.className = 'vll-tooltip-pinyin';
      pinyinEl.textContent = wordData.pinyin;
      headerEl.appendChild(pinyinEl);
    }

    tooltipEl.appendChild(headerEl);

    // Meaning container with edit capability
    const meaningWrapper = document.createElement('div');
    meaningWrapper.className = 'vll-tooltip-meaning-wrapper';

    const meaningEl = document.createElement('div');
    meaningEl.className = 'vll-tooltip-meaning';

    const editBtn = document.createElement('button');
    editBtn.className = 'vll-edit-meaning-btn';
    editBtn.innerHTML = '✏️';
    editBtn.title = 'Editar significado';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startInlineEdit(meaningWrapper, meaningEl, wordData, context, onEditMeaning, onSave);
    });

    meaningWrapper.appendChild(meaningEl);
    meaningWrapper.appendChild(editBtn);
    tooltipEl.appendChild(meaningWrapper);

    // Determine which meaning to display (customMeaning has priority)
    if (wordData.customMeaning) {
      meaningEl.textContent = wordData.customMeaning;
    } else if (wordData.meaning) {
      if (ptMeanings[wordData.hanzi]) {
        meaningEl.textContent = ptMeanings[wordData.hanzi];
      } else if (wordData.meaningLang === targetLang) {
        meaningEl.textContent = wordData.meaning;
      } else {
        meaningEl.textContent = wordData.meaning;
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

    // Google Translate links
    const gtLinks = document.createElement('div');
    gtLinks.className = 'vll-gt-links';

    const sourceLang = wordData.meaningLang === targetLang ? 'auto' : 'zh-CN';

    const gtWordBtn = document.createElement('a');
    gtWordBtn.className = 'vll-gt-link';
    gtWordBtn.href = `https://translate.google.com/?sl=${sourceLang}&tl=${encodeURIComponent(targetLang)}&text=${encodeURIComponent(wordData.hanzi)}&op=translate`;
    gtWordBtn.target = '_blank';
    gtWordBtn.rel = 'noopener';
    gtWordBtn.title = 'Buscar palavra no Google Tradutor';
    gtWordBtn.innerHTML = '<span class="vll-gt-icon">G</span> Palavra';
    gtWordBtn.addEventListener('click', (e) => e.stopPropagation());
    gtLinks.appendChild(gtWordBtn);

    if (context) {
      const gtSentenceBtn = document.createElement('a');
      gtSentenceBtn.className = 'vll-gt-link';
      gtSentenceBtn.href = `https://translate.google.com/?sl=${sourceLang}&tl=${encodeURIComponent(targetLang)}&text=${encodeURIComponent(context)}&op=translate`;
      gtSentenceBtn.target = '_blank';
      gtSentenceBtn.rel = 'noopener';
      gtSentenceBtn.title = 'Buscar frase no Google Tradutor';
      gtSentenceBtn.innerHTML = '<span class="vll-gt-icon">G</span> Frase';
      gtSentenceBtn.addEventListener('click', (e) => e.stopPropagation());
      gtLinks.appendChild(gtSentenceBtn);
    }

    tooltipEl.appendChild(gtLinks);

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

  function startInlineEdit(wrapperEl, meaningEl, wordData, context, onEditMeaning, onSave) {
    // Don't start editing if already editing
    if (wrapperEl.querySelector('.vll-tooltip-meaning-input')) return;

    const currentText = meaningEl.textContent || '';
    const meaningHeight = meaningEl.offsetHeight;

    // Lock tooltip dimensions before hiding elements
    if (tooltipEl) {
      tooltipEl.style.width = `${tooltipEl.offsetWidth}px`;
      tooltipEl.style.minHeight = `${tooltipEl.offsetHeight}px`;
    }

    const input = document.createElement('textarea');
    input.className = 'vll-tooltip-meaning-input';
    input.value = currentText === '(sem definição no dicionário)' ? '' : currentText;
    input.placeholder = 'Digite o significado...';
    input.style.minHeight = `${Math.max(meaningHeight, 36)}px`;

    // Hide the meaning text and edit button
    meaningEl.style.display = 'none';
    const editBtn = wrapperEl.querySelector('.vll-edit-meaning-btn');
    if (editBtn) editBtn.style.display = 'none';

    wrapperEl.appendChild(input);
    input.focus();
    input.select();

    function confirmEdit() {
      const newMeaning = input.value.trim();
      if (newMeaning && newMeaning !== currentText) {
        // If word not saved yet, save it first with red color
        if (!wordData.color || wordData.color === 'white') {
          onSave(wordData, 'red', context);
        }
        onEditMeaning(wordData.hanzi, newMeaning);
        meaningEl.textContent = newMeaning;
        meaningEl.style.opacity = '1';
      }
      cleanupEdit();
    }

    function cancelEdit() {
      cleanupEdit();
    }

    function cleanupEdit() {
      if (input.parentNode) input.remove();
      meaningEl.style.display = '';
      if (editBtn) editBtn.style.display = '';
      // Unlock tooltip dimensions
      if (tooltipEl) {
        tooltipEl.style.width = '';
        tooltipEl.style.minHeight = '';
      }
    }

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    });

    input.addEventListener('blur', () => {
      // Small delay to allow click events to fire first
      setTimeout(() => {
        if (input.parentNode) confirmEdit();
      }, 150);
    });

    input.addEventListener('click', (e) => e.stopPropagation());
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
