/**
 * VLL Side Panel Script — Transcript view + vocabulary management
 */

/* global chrome, VLL_MessagesShared, VLL_ConfigShared, VLL_VocabShared */

(() => {
  'use strict';

  const messagesShared = (typeof VLL_MessagesShared !== 'undefined' && VLL_MessagesShared)
    ? VLL_MessagesShared
    : null;

  if (!messagesShared || !messagesShared.types) {
    throw new Error('[VLL] Missing VLL_MessagesShared. Ensure messages.shared.js is loaded first.');
  }

  const MSG = messagesShared.types;

  const configShared = (typeof VLL_ConfigShared !== 'undefined' && VLL_ConfigShared)
    ? VLL_ConfigShared
    : null;

  if (!configShared || !configShared.lookupProviders) {
    throw new Error('[VLL] Missing VLL_ConfigShared. Ensure config.shared.js is loaded first.');
  }

  const CFG = configShared;

  const vocabShared = (typeof VLL_VocabShared !== 'undefined' && VLL_VocabShared)
    ? VLL_VocabShared
    : null;

  if (!vocabShared || !Array.isArray(vocabShared.colors) || !vocabShared.labels) {
    throw new Error('[VLL] Missing VLL_VocabShared. Ensure vocab.shared.js is loaded first.');
  }

  const VOCAB = vocabShared;

  /* ── State ───────────────────────────────────────────────── */

  let subtitles = [];
  let vocabulary = [];
  let currentIndex = -1;
  let activeTab = 'transcript';
  let activeFilter = 'all';
  let selectedWord = null;
  let lookupStatusPollTimer = null;

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

  const settingsEls = {
    enabled: $id('sp-toggle-enabled'),
    targetLang: $id('sp-lang-select'),
    lookupProvider: $id('sp-lookup-provider-select'),
    showPinyin: $id('sp-toggle-pinyin'),
    showTranslation: $id('sp-toggle-translation'),
    autoPause: $id('sp-toggle-autopause'),
    lookupLoadingSetting: $id('sp-lookup-loading-setting'),
    lookupLoadingNote: $id('sp-lookup-loading-note'),
    lookupProviderSetting: $id('sp-lookup-provider-setting')
  };

  /* ── Tab Switching ───────────────────────────────────────── */

  document.querySelectorAll('.vll-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      activeTab = tabName;

      document.querySelectorAll('.vll-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.vll-panel').forEach(p => p.classList.remove('active'));
      $id(`panel-${tabName}`).classList.add('active');

      if (tabName === 'vocabulary') {
        loadVocabulary();
        loadStats();
      }
      if (tabName === 'settings') {
        loadSettings();
        loadLookupStatus();
      }
    });
  });

  function getLookupProviderValue() {
    if (!settingsEls.lookupProvider) return CFG.lookupProviders.DICTIONARY;
    return settingsEls.lookupProvider.value || CFG.lookupProviders.DICTIONARY;
  }

  function applyLookupStatus(status) {
    if (!settingsEls.lookupLoadingSetting || !settingsEls.lookupProviderSetting) return;

    if (status && status.googleReady) {
      settingsEls.lookupLoadingSetting.style.display = 'none';
      settingsEls.lookupProviderSetting.style.display = 'block';
      return;
    }

    settingsEls.lookupProviderSetting.style.display = 'none';
    settingsEls.lookupLoadingSetting.style.display = 'block';

    if (settingsEls.lookupLoadingNote) {
      if (status && status.inProgress) {
        settingsEls.lookupLoadingNote.textContent = 'Google carregando em segundo plano... usando dicionário local por enquanto.';
      } else if (status && status.lastError) {
        settingsEls.lookupLoadingNote.textContent = `Google indisponível no momento (${status.lastError}). Mantendo dicionário local.`;
      } else {
        settingsEls.lookupLoadingNote.textContent = 'Preparando Google em segundo plano... usando dicionário local por enquanto.';
      }
    }
  }

  async function loadLookupStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_LOOKUP_STATUS });
      applyLookupStatus(response.status || {});
    } catch (err) {
      console.error('[VLL SP] Failed to load lookup status:', err);
      applyLookupStatus({});
    }
  }

  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_SETTINGS });
      const settings = response.settings || {};

      if (settings.enabled !== undefined && settingsEls.enabled) {
        settingsEls.enabled.checked = settings.enabled;
      }
      if (settings.targetLang && settingsEls.targetLang) {
        settingsEls.targetLang.value = settings.targetLang;
      }
      if (settings.lookupProvider && settingsEls.lookupProvider) {
        settingsEls.lookupProvider.value = settings.lookupProvider;
      }
      if (settings.showPinyin !== undefined && settingsEls.showPinyin) {
        settingsEls.showPinyin.checked = settings.showPinyin;
      }
      if (settings.showTranslation !== undefined && settingsEls.showTranslation) {
        settingsEls.showTranslation.checked = settings.showTranslation;
      }
      if (settings.autoPause !== undefined && settingsEls.autoPause) {
        settingsEls.autoPause.checked = settings.autoPause;
      }
    } catch (err) {
      console.error('[VLL SP] Failed to load settings:', err);
    }
  }

  async function saveSettings() {
    const settings = {
      enabled: settingsEls.enabled ? settingsEls.enabled.checked : true,
      targetLang: settingsEls.targetLang ? settingsEls.targetLang.value : 'pt',
      lookupProvider: getLookupProviderValue(),
      showPinyin: settingsEls.showPinyin ? settingsEls.showPinyin.checked : true,
      showTranslation: settingsEls.showTranslation ? settingsEls.showTranslation.checked : true,
      autoPause: settingsEls.autoPause ? settingsEls.autoPause.checked : false
    };

    try {
      await chrome.runtime.sendMessage({
        type: MSG.SAVE_SETTINGS,
        settings
      });
    } catch (err) {
      console.error('[VLL SP] Failed to save settings:', err);
    }
  }

  // Auto-save settings
  [
    settingsEls.enabled,
    settingsEls.targetLang,
    settingsEls.lookupProvider,
    settingsEls.showPinyin,
    settingsEls.showTranslation,
    settingsEls.autoPause
  ].forEach(el => {
    if (el) el.addEventListener('change', saveSettings);
  });

  // Export to Anki from settings tab
  $id('sp-btn-export').addEventListener('click', async () => {
    const exportInfo = $id('sp-export-info');

    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.EXPORT_CSV });

      if (response.count === 0) {
        exportInfo.textContent = 'Nenhuma palavra para exportar.';
        exportInfo.style.color = '#ffaa33';
        exportInfo.style.display = 'block';
        return;
      }

      const blob = new Blob([response.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vll_anki_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      exportInfo.textContent = `✅ ${response.count} palavras exportadas!`;
      exportInfo.style.color = '#44dd88';
      exportInfo.style.display = 'block';

      setTimeout(() => {
        exportInfo.style.display = 'none';
      }, 3000);
    } catch (err) {
      exportInfo.textContent = '❌ Erro ao exportar.';
      exportInfo.style.color = '#ff4466';
      exportInfo.style.display = 'block';
      console.error('[VLL SP] Export error:', err);
    }
  });

  /* ── Cross-Browser Data Export ───────────────────────────── */

  $id('sp-btn-data-export').addEventListener('click', async () => {
    const transferInfo = $id('sp-data-transfer-info');

    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.EXPORT_DATA });

      if (response.count === 0) {
        transferInfo.textContent = 'Nenhum dado para exportar.';
        transferInfo.style.color = '#ffaa33';
        transferInfo.style.display = 'block';
        return;
      }

      const blob = new Blob([response.data], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vll_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      transferInfo.textContent = `✅ ${response.count} palavras exportadas com sucesso!`;
      transferInfo.style.color = '#44dd88';
      transferInfo.style.display = 'block';

      setTimeout(() => { transferInfo.style.display = 'none'; }, 3000);
    } catch (err) {
      transferInfo.textContent = '❌ Erro ao exportar dados.';
      transferInfo.style.color = '#ff4466';
      transferInfo.style.display = 'block';
      console.error('[VLL SP] Data export error:', err);
    }
  });

  /* ── Cross-Browser Data Import ───────────────────────────── */

  $id('sp-btn-data-import').addEventListener('click', () => {
    $id('sp-import-file-input').click();
  });

  $id('sp-import-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const transferInfo = $id('sp-data-transfer-info');

    try {
      const text = await file.text();
      const response = await chrome.runtime.sendMessage({ type: MSG.IMPORT_DATA, data: text });

      if (!response.ok) {
        transferInfo.textContent = `❌ ${response.error}`;
        transferInfo.style.color = '#ff4466';
        transferInfo.style.display = 'block';
        return;
      }

      transferInfo.textContent = `✅ ${response.importedCount} palavras importadas!`;
      transferInfo.style.color = '#44dd88';
      transferInfo.style.display = 'block';

      // Refresh vocabulary list
      loadVocabulary();

      setTimeout(() => { transferInfo.style.display = 'none'; }, 3000);
    } catch (err) {
      transferInfo.textContent = '❌ Erro ao importar dados.';
      transferInfo.style.color = '#ff4466';
      transferInfo.style.display = 'block';
      console.error('[VLL SP] Data import error:', err);
    }

    // Reset file input so the same file can be re-selected
    e.target.value = '';
  });

  /* ── Transcript ──────────────────────────────────────────── */

  async function loadTranscript() {
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_SUBTITLES });
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
              playPronunciation(w.hanzi);
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

      // Play full line button
      const playBtn = document.createElement('button');
      playBtn.className = 'vll-transcript-play-btn';
      playBtn.innerHTML = '🔊';
      playBtn.title = 'Tocar frase completa';
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        playPronunciation(sub.text);
      });
      item.appendChild(playBtn);

      // Click to seek
      item.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          type: MSG.SEEK_TO_SUBTITLE,
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

  /* ── Stats ────────────────────────────────────────────────── */

  async function loadStats() {
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_STATS });
      const stats = response.stats || {};
      $id('sp-stat-total').textContent = stats.total || 0;
      $id('sp-stat-red').textContent = stats.red || 0;
      $id('sp-stat-orange').textContent = stats.orange || 0;
      $id('sp-stat-green').textContent = stats.green || 0;
    } catch (err) {
      console.error('[VLL SP] Failed to load stats:', err);
    }
  }

  /* ── Vocabulary ──────────────────────────────────────────── */

  async function loadVocabulary() {
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_ALL_WORDS });
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
        playPronunciation(word.word);
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
    
    // Add play button if not already there or just handle it via the existing ID if we change HTML
    // But since I don't want to change HTML structure too much, I'll check if I should add a button dynamically
    // Actually, I should probably update sidepanel.html too.
    
    $id('detail-pinyin').textContent = wordData.pinyin || '';
    const displayMeaning = wordData.meaningPt || wordData.meaning || '(sem definição)';
    $id('detail-meaning').textContent = displayMeaning;
    $id('detail-context').textContent = context ? `"${context}"` : '';

    // Color buttons
    const colorsEl = $id('detail-colors');
    colorsEl.innerHTML = '';

    VOCAB.colors.forEach(color => {
      const btn = document.createElement('button');
      btn.className = 'vll-color-btn';
      btn.setAttribute('data-color', color);
      btn.title = VOCAB.labels[color] || color;
      if (wordData.color === color) btn.classList.add('active');

      btn.addEventListener('click', async () => {
        colorsEl.querySelectorAll('.vll-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Optimistic UI update: reflect color immediately in transcript.
        wordData.color = color;
        applyWordColorToTranscript(wordData.hanzi, color);

        try {
          await chrome.runtime.sendMessage({
            type: MSG.SAVE_WORD,
            entry: {
              word: wordData.hanzi,
              pinyin: wordData.pinyin,
              meaning: wordData.meaning,
              meaningPt: wordData.meaningPt,
              color: color,
              context: context || ''
            }
          });
        } catch (err) {
          console.error('[VLL SP] Failed to save word color:', err);
        }

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

  $id('detail-play').addEventListener('click', () => {
    if (selectedWord) {
      playPronunciation(selectedWord.hanzi);
    }
  });

  // Remove word
  $id('detail-remove').addEventListener('click', async () => {
    if (selectedWord) {
      // Optimistic UI update for immediate feedback.
      applyWordColorToTranscript(selectedWord.hanzi, 'white');

      try {
        await chrome.runtime.sendMessage({
          type: MSG.DELETE_WORD,
          word: selectedWord.hanzi
        });
      } catch (err) {
        console.error('[VLL SP] Failed to delete word:', err);
      }

      wordDetail.style.display = 'none';
      loadVocabulary();
    }
  });

  /* ── Message Listener ────────────────────────────────────── */

  chrome.runtime.onMessage.addListener((msg) => {
    switch (msg.type) {
      case MSG.SUBTITLES_READY:
        subtitles = msg.subtitles || [];
        renderTranscript();
        transcriptEmpty.style.display = 'none';
        break;

      case MSG.SUBTITLE_CHANGED:
        highlightCurrentSubtitle(msg.index);
        break;

      case MSG.WORD_COLOR_UPDATED:
        // Refresh vocabulary and stats if on that tab
        if (activeTab === 'vocabulary') loadVocabulary();
        loadStats();
        applyWordColorToTranscript(msg.word, msg.color);
        break;

      case MSG.WORD_COLORS_BULK_UPDATED: {
        const colors = msg.colors || {};
        for (const [word, color] of Object.entries(colors)) {
          applyWordColorToTranscript(word, color);
        }
        if (activeTab === 'vocabulary') loadVocabulary();
        loadStats();
        break;
      }

      case MSG.LOOKUP_STATUS_CHANGED:
        applyLookupStatus(msg.status || {});
        break;

      case MSG.SETTINGS_CHANGED:
        loadSettings();
        // Refresh transcript and vocabulary to reflect provider/lang changes
        loadTranscript();
        if (activeTab === 'vocabulary') loadVocabulary();
        break;
    }
  });

  /* ── Helpers ─────────────────────────────────────────────── */

  async function playPronunciation(text) {
    if (!text) return;
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG.GET_PRONUNCIATION,
        text: text
      });

      if (response.error) throw new Error(response.error);
      if (!response.dataUrl) throw new Error('No audio data received');

      const audio = new Audio(response.dataUrl);
      await audio.play();
    } catch (err) {
      console.error('[VLL SP] Pronunciation playback failed:', err);
    }
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function applyWordColorToTranscript(word, color) {
    if (!word) return;

    const normalize = (value) => (value || '').normalize('NFC').trim();
    const normalizedTarget = normalize(word);
    const finalColor = color === 'white' ? null : color;

    // Update rendered transcript spans immediately.
    const wordSpans = transcriptList.querySelectorAll('.vll-tw');
    wordSpans.forEach(span => {
      if (normalize(span.textContent) === normalizedTarget) {
        if (finalColor) {
          span.setAttribute('data-color', finalColor);
        } else {
          span.removeAttribute('data-color');
        }
      }
    });

    // Keep in-memory transcript data in sync for future re-renders.
    subtitles.forEach(sub => {
      if (!sub.words) return;
      sub.words.forEach(w => {
        if (normalize(w.hanzi) === normalizedTarget) {
          w.color = finalColor;
        }
      });
    });
  }

  /* ── Init ────────────────────────────────────────────────── */

  loadTranscript();
  loadVocabulary();
  loadStats();
  loadSettings();
  loadLookupStatus();

  lookupStatusPollTimer = setInterval(loadLookupStatus, 2000);
  window.addEventListener('beforeunload', () => {
    if (lookupStatusPollTimer) clearInterval(lookupStatusPollTimer);
  });
})();
