/**
 * VLL Sidepanel Vocabulary Module
 */

(function initVLLSPVocab(root, factory) {
  root.VLL_SP_Vocab = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createVLLSPVocab() {
  'use strict';

  let listEl = null;
  let emptyEl = null;
  let countEl = null;
  let searchEl = null;

  function init(els) {
    listEl = els.list;
    emptyEl = els.empty;
    countEl = els.count;
    searchEl = els.search;
  }

  function render(vocabulary, filter, options) {
    if (!listEl) return;
    listEl.innerHTML = '';

    let filtered = vocabulary;

    if (filter !== 'all') {
      filtered = filtered.filter(w => w.color === filter);
    }

    const searchTerm = searchEl ? searchEl.value.trim().toLowerCase() : '';
    if (searchTerm) {
      filtered = filtered.filter(w =>
        w.word.includes(searchTerm) ||
        (w.pinyin && w.pinyin.toLowerCase().includes(searchTerm)) ||
        (w.meaning && w.meaning.toLowerCase().includes(searchTerm))
      );
    }

    if (countEl) countEl.textContent = filtered.length;

    if (filtered.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    filtered.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));

    filtered.forEach(word => {
      const card = document.createElement('div');
      card.className = 'vll-vocab-card';

      const dot = document.createElement('div');
      dot.className = 'vll-vocab-color-dot';
      dot.setAttribute('data-color', word.color || 'white');
      card.appendChild(dot);

      const info = document.createElement('div');
      info.className = 'vll-vocab-info';

      const wordEl = document.createElement('div');
      wordEl.className = 'vll-vocab-word';
      wordEl.textContent = word.word;
      info.appendChild(wordEl);

      if (word.pinyin) {
        const pinyinEl = document.createElement('div');
        pinyinEl.className = 'vll-vocab-pinyin';
        pinyinEl.textContent = word.pinyin;
        info.appendChild(pinyinEl);
      }

      const displayMeaning = word.meaningPt || word.meaning;
      if (displayMeaning) {
        const meaningEl = document.createElement('div');
        meaningEl.className = 'vll-vocab-meaning';
        meaningEl.textContent = displayMeaning;
        info.appendChild(meaningEl);
      }

      card.appendChild(info);
      card.addEventListener('click', () => options.onWordClick(word));
      listEl.appendChild(card);
    });
  }

  return { init, render };
});
