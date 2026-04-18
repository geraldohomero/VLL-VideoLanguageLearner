/**
 * VLL Side Panel Script — Transcript view + vocabulary management
 */

/* global chrome */

(() => {
  'use strict';

  /* ── State ───────────────────────────────────────────────── */

  let subtitles = [];
  let vocabulary = [];
  let currentIndex = -1;
  let activeTab = 'transcript';
  let activeFilter = 'all';
  let selectedWord = null;

  /* ── DOM References ──────────────────────────────────────── */

  const $id = (id) => document.getElementById(id);

  const transcriptList = $id('transcript-list');
  const transcriptEmpty = $id('transcript-empty');
  const vocabList = $id('vocab-list');
  const vocabEmpty = $id('vocab-empty');
  const vocabCount = $id('vocab-count');
  const vocabSearch = $id('vocab-search');
  const wordDetail = $id('word-detail');
  const videoTitle = $id('vll-video-title');

  /* ── Tab Switching ───────────────────────────────────────── */

  document.querySelectorAll('.vll-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      activeTab = tabName;

      document.querySelectorAll('.vll-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.vll-panel').forEach(p => p.classList.remove('active'));
      $id(`panel-${tabName}`).classList.add('active');

      if (tabName === 'vocabulary') loadVocabulary();
    });
  });

  /* ── Transcript ──────────────────────────────────────────── */

  async function loadTranscript() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SUBTITLES' });
      if (response && response.subtitles && response.subtitles.length > 0) {
        subtitles = response.subtitles;
        renderTranscript();
        transcriptEmpty.style.display = 'none';

        if (response.videoId) {
          videoTitle.textContent = `Vídeo: ${response.videoId}`;
        }
      }
    } catch (err) {
      console.error('[VLL SP] Failed to load transcript:', err);
    }
  }

  function renderTranscript() {
    transcriptList.innerHTML = '';

    subtitles.forEach((sub, index) => {
      const item = document.createElement('div');
      item.className = 'vll-transcript-item';
      item.dataset.index = index;
      if (index === currentIndex) item.classList.add('active');

      // Time
      const time = document.createElement('div');
      time.className = 'vll-transcript-time';
      time.textContent = formatTime(sub.start);
      item.appendChild(time);

      // Hanzi (with clickable words)
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
              showWordDetail(w, sub.text);
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

      // Pinyin
      if (sub.words) {
        const pinyinLine = document.createElement('div');
        pinyinLine.className = 'vll-transcript-pinyin';
        pinyinLine.textContent = sub.words
          .filter(w => w.pinyin)
          .map(w => w.pinyin)
          .join(' ');
        if (pinyinLine.textContent) item.appendChild(pinyinLine);
      }

      // Translation
      if (sub.translation) {
        const transLine = document.createElement('div');
        transLine.className = 'vll-transcript-translation';
        transLine.textContent = sub.translation;
        item.appendChild(transLine);
      }

      // Click to seek
      item.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          type: 'SEEK_TO_SUBTITLE',
          index: index
        });
      });

      transcriptList.appendChild(item);
    });
  }

  function highlightCurrentSubtitle(index) {
    currentIndex = index;
    const items = transcriptList.querySelectorAll('.vll-transcript-item');
    items.forEach(item => {
      item.classList.toggle('active', parseInt(item.dataset.index) === index);
    });

    // Auto-scroll to active item
    const activeItem = transcriptList.querySelector('.vll-transcript-item.active');
    if (activeItem) {
      activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /* ── Vocabulary ──────────────────────────────────────────── */

  async function loadVocabulary() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_ALL_WORDS' });
      vocabulary = response.words || [];
      vocabCount.textContent = vocabulary.length;
      renderVocabulary();
    } catch (err) {
      console.error('[VLL SP] Failed to load vocabulary:', err);
    }
  }

  function renderVocabulary() {
    vocabList.innerHTML = '';

    let filtered = vocabulary;

    // Apply color filter
    if (activeFilter !== 'all') {
      filtered = filtered.filter(w => w.color === activeFilter);
    }

    // Apply search
    const searchTerm = vocabSearch.value.trim().toLowerCase();
    if (searchTerm) {
      filtered = filtered.filter(w =>
        w.word.includes(searchTerm) ||
        (w.pinyin && w.pinyin.toLowerCase().includes(searchTerm)) ||
        (w.meaning && w.meaning.toLowerCase().includes(searchTerm))
      );
    }

    if (filtered.length === 0) {
      vocabEmpty.style.display = 'block';
      return;
    }

    vocabEmpty.style.display = 'none';

    // Sort by date added (newest first)
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

      card.addEventListener('click', () => {
        showWordDetail({
          hanzi: word.word,
          pinyin: word.pinyin,
          meaning: word.meaning,
          meaningPt: word.meaningPt,
          color: word.color
        }, word.context);
      });

      vocabList.appendChild(card);
    });
  }

  /* ── Filters ─────────────────────────────────────────────── */

  document.querySelectorAll('.vll-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      document.querySelectorAll('.vll-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderVocabulary();
    });
  });

  // Search
  vocabSearch.addEventListener('input', () => {
    renderVocabulary();
  });

  /* ── Word Detail ─────────────────────────────────────────── */

  function showWordDetail(wordData, context) {
    selectedWord = wordData;

    $id('detail-hanzi').textContent = wordData.hanzi;
    $id('detail-pinyin').textContent = wordData.pinyin || '';
    const displayMeaning = wordData.meaningPt || wordData.meaning || '(sem definição)';
    $id('detail-meaning').textContent = displayMeaning;
    $id('detail-context').textContent = context ? `"${context}"` : '';

    // Color buttons
    const colorsEl = $id('detail-colors');
    colorsEl.innerHTML = '';

    ['red', 'orange', 'green', 'white'].forEach(color => {
      const btn = document.createElement('button');
      btn.className = 'vll-color-btn';
      btn.setAttribute('data-color', color);
      if (wordData.color === color) btn.classList.add('active');

      btn.addEventListener('click', async () => {
        colorsEl.querySelectorAll('.vll-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        await chrome.runtime.sendMessage({
          type: 'SAVE_WORD',
          entry: {
            word: wordData.hanzi,
            pinyin: wordData.pinyin,
            meaning: wordData.meaning,
            meaningPt: wordData.meaningPt,
            color: color,
            context: context || ''
          }
        });

        wordData.color = color;
        loadVocabulary();
      });

      colorsEl.appendChild(btn);
    });

    wordDetail.style.display = 'block';
  }

  // Close detail
  $id('detail-close').addEventListener('click', () => {
    wordDetail.style.display = 'none';
  });

  // Remove word
  $id('detail-remove').addEventListener('click', async () => {
    if (selectedWord) {
      await chrome.runtime.sendMessage({
        type: 'DELETE_WORD',
        word: selectedWord.hanzi
      });
      wordDetail.style.display = 'none';
      loadVocabulary();
    }
  });

  /* ── Message Listener ────────────────────────────────────── */

  chrome.runtime.onMessage.addListener((msg) => {
    switch (msg.type) {
      case 'SUBTITLES_READY':
        subtitles = msg.subtitles || [];
        renderTranscript();
        transcriptEmpty.style.display = 'none';
        break;

      case 'SUBTITLE_CHANGED':
        highlightCurrentSubtitle(msg.index);
        break;

      case 'WORD_COLOR_UPDATED':
        // Refresh vocabulary if on that tab
        if (activeTab === 'vocabulary') loadVocabulary();
        // Update transcript words
        const wordSpans = transcriptList.querySelectorAll('.vll-tw');
        wordSpans.forEach(span => {
          if (span.textContent === msg.word) {
            span.setAttribute('data-color', msg.color);
          }
        });
        break;
    }
  });

  /* ── Helpers ─────────────────────────────────────────────── */

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /* ── Init ────────────────────────────────────────────────── */

  loadTranscript();
  loadVocabulary();
})();
