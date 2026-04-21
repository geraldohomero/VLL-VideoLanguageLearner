/**
 * VLL Side Panel Script — Orchestrator
 */

/* global chrome, VLL_MessagesShared, VLL_ConfigShared, VLL_VocabShared, VLL_Logger, VLL_SP_Transcript, VLL_SP_Vocab, VLL_SP_Settings */

(() => {
  'use strict';

  const logger = VLL_Logger;
  const MSG = VLL_MessagesShared.types;
  const CFG = VLL_ConfigShared;
  const VOCAB = VLL_VocabShared;

  /* ── State ───────────────────────────────────────────────── */

  const state = {
    subtitles: [],
    vocabulary: [],
    currentIndex: -1,
    activeTab: 'transcript',
    activeFilter: 'all',
    selectedWord: null,
    subtitleStatus: {
      mode: 'idle',
      message: 'Aguardando legendas...'
    }
  };

  /* ── DOM References ──────────────────────────────────────── */

  const $id = (id) => document.getElementById(id);

  const els = {
    transcript: {
      list: $id('transcript-list'),
      empty: $id('transcript-empty'),
      status: $id('transcript-status')
    },
    vocab: {
      list: $id('vocab-list'),
      empty: $id('vocab-empty'),
      count: $id('vocab-count'),
      search: $id('vocab-search')
    },
    settings: {
      enabled: $id('sp-toggle-enabled'),
      targetLang: $id('sp-lang-select'),
      lookupProvider: $id('sp-lookup-provider-select'),
      showPinyin: $id('sp-toggle-pinyin'),
      showTranslation: $id('sp-toggle-translation'),
      autoPause: $id('sp-toggle-autopause'),
      overlayFontScale: $id('sp-overlay-font-scale'),
      overlayContrast: $id('sp-overlay-contrast'),
      overlayBackgroundAlpha: $id('sp-overlay-bg-alpha'),
      overlayBlur: $id('sp-overlay-blur'),
      overlayTextColor: $id('sp-overlay-text-color'),
      overlayBackgroundColor: $id('sp-overlay-bg-color'),
      overlayPositionX: $id('sp-overlay-pos-x'),
      overlayPositionY: $id('sp-overlay-pos-y'),
      overlayReset: $id('sp-overlay-reset'),
      captionStyleToggle: $id('sp-caption-style-toggle'),
      captionStyleContent: $id('sp-caption-style-content'),
      lookupLoadingSetting: $id('sp-lookup-loading-setting'),
      lookupLoadingNote: $id('sp-lookup-loading-note'),
      lookupProviderSetting: $id('sp-lookup-provider-setting')
    },
    detail: {
      panel: $id('word-detail'),
      hanzi: $id('detail-hanzi'),
      pinyin: $id('detail-pinyin'),
      meaning: $id('detail-meaning'),
      context: $id('detail-context'),
      colors: $id('detail-colors')
    },
    videoTitle: $id('vll-video-title')
  };

  /* ── Initialization ──────────────────────────────────────── */

  function init() {
    VLL_SP_Transcript.init(els.transcript);
    VLL_SP_Vocab.init(els.vocab);
    VLL_SP_Settings.init(els.settings);

    setupEventListeners();
    refreshAll();

    setInterval(loadLookupStatus, 2000);
  }

  function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.vll-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        state.activeTab = tabName;

        document.querySelectorAll('.vll-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        document.querySelectorAll('.vll-panel').forEach(p => p.classList.remove('active'));
        $id(`panel-${tabName}`).classList.add('active');

        if (tabName === 'vocabulary') refreshVocab();
        if (tabName === 'settings') { loadSettings(); loadLookupStatus(); }
      });
    });

    // Filters
    document.querySelectorAll('.vll-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeFilter = btn.dataset.filter;
        document.querySelectorAll('.vll-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        refreshVocab();
      });
    });

    // Search
    if (els.vocab.search) {
      els.vocab.search.addEventListener('input', () => refreshVocab());
    }

    // Settings auto-save
    Object.values(els.settings).forEach(el => {
      if (!el) return;
      if (el.tagName === 'SELECT' || (el.tagName === 'INPUT' && ['checkbox', 'range', 'color'].includes(el.type))) {
        const eventName = (el.type === 'range' || el.type === 'color') ? 'input' : 'change';
        el.addEventListener(eventName, saveSettings);
      }
    });

    if (els.settings.overlayReset) {
      els.settings.overlayReset.addEventListener('click', async () => {
        if (VLL_SP_Settings && typeof VLL_SP_Settings.resetOverlayStyle === 'function') {
          VLL_SP_Settings.resetOverlayStyle();
          await saveSettings();
        }
      });
    }

    if (els.settings.captionStyleToggle && els.settings.captionStyleContent) {
      els.settings.captionStyleToggle.addEventListener('click', () => {
        const expanded = els.settings.captionStyleToggle.getAttribute('aria-expanded') === 'true';
        els.settings.captionStyleToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        els.settings.captionStyleContent.style.display = expanded ? 'none' : 'block';
      });
    }

    // Detail Panel
    $id('detail-close').addEventListener('click', () => els.detail.panel.style.display = 'none');
    $id('detail-play').addEventListener('click', () => state.selectedWord && playPronunciation(state.selectedWord.hanzi));
    $id('detail-remove').addEventListener('click', deleteSelectedWord);

    // Export buttons
    $id('sp-btn-export').addEventListener('click', exportToAnki);
    $id('sp-btn-data-export').addEventListener('click', exportData);
    $id('sp-btn-data-import').addEventListener('click', () => $id('sp-import-file-input').click());
    $id('sp-import-file-input').addEventListener('change', importData);
  }

  /* ── Data Fetching ───────────────────────────────────────── */

  async function refreshAll() {
    await Promise.all([
      loadTranscript(),
      loadVocabData(),
      loadSettings(),
      loadLookupStatus()
    ]);
  }

  async function loadTranscript() {
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_SUBTITLES });
      if (response && response.subtitles) {
        state.subtitles = response.subtitles;
        if (response.status) {
          state.subtitleStatus = response.status;
        }
        if (response.videoId) els.videoTitle.textContent = `Vídeo: ${response.videoId}`;
        VLL_SP_Transcript.render(state.subtitles, state.currentIndex, {
          status: state.subtitleStatus,
          formatTime,
          onWordClick: (w, ctx) => { playPronunciation(w.hanzi); showWordDetail(w, ctx); },
          onPlayPronunciation: playPronunciation,
          onSeek: (idx) => chrome.runtime.sendMessage({ type: MSG.SEEK_TO_SUBTITLE, index: idx })
        });
      }
    } catch (err) { logger.error('Failed to load transcript:', err); }
  }

  async function loadVocabData() {
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_ALL_WORDS });
      state.vocabulary = response.words || [];
      refreshVocab();
      loadStats();
    } catch (err) { logger.error('Failed to load vocabulary:', err); }
  }

  function refreshVocab() {
    VLL_SP_Vocab.render(state.vocabulary, state.activeFilter, {
      onWordClick: (w) => { 
        playPronunciation(w.word); 
        showWordDetail({ hanzi: w.word, pinyin: w.pinyin, meaning: w.meaning, meaningPt: w.meaningPt, color: w.color }, w.context); 
      }
    });
  }

  async function loadStats() {
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_STATS });
      const stats = response.stats || {};
      $id('sp-stat-total').textContent = stats.total || 0;
      $id('sp-stat-red').textContent = stats.red || 0;
      $id('sp-stat-orange').textContent = stats.orange || 0;
      $id('sp-stat-green').textContent = stats.green || 0;
    } catch (err) { logger.error('Failed to load stats:', err); }
  }

  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_SETTINGS });
      VLL_SP_Settings.apply(response.settings || {});
    } catch (err) { logger.error('Failed to load settings:', err); }
  }

  async function saveSettings() {
    const settings = VLL_SP_Settings.getValues();
    try {
      await chrome.runtime.sendMessage({ type: MSG.SAVE_SETTINGS, settings });
    } catch (err) { logger.error('Failed to save settings:', err); }
  }

  async function loadLookupStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_LOOKUP_STATUS });
      if (VLL_SP_Settings && typeof VLL_SP_Settings.applyStatus === 'function') {
        VLL_SP_Settings.applyStatus(response.status || {});
      } else {
        logger.warn('VLL_SP_Settings.applyStatus not found yet');
      }
    } catch (err) { logger.error('Failed to load lookup status:', err); }
  }

  /* ── Actions ─────────────────────────────────────────────── */

  function showWordDetail(wordData, context) {
    state.selectedWord = wordData;
    els.detail.hanzi.textContent = wordData.hanzi;
    els.detail.pinyin.textContent = wordData.pinyin || '';
    els.detail.meaning.textContent = wordData.meaningPt || wordData.meaning || '(sem definição)';
    els.detail.context.textContent = context ? `"${context}"` : '';

    els.detail.colors.innerHTML = '';
    VOCAB.colors.forEach(color => {
      const btn = document.createElement('button');
      btn.className = 'vll-color-btn';
      btn.setAttribute('data-color', color);
      btn.title = VOCAB.labels[color] || color;
      if (wordData.color === color) btn.classList.add('active');

      btn.addEventListener('click', async () => {
        els.detail.colors.querySelectorAll('.vll-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        saveWordColor(wordData, color, context);
      });
      els.detail.colors.appendChild(btn);
    });

    els.detail.panel.style.display = 'block';
  }

  async function saveWordColor(wordData, color, context) {
    try {
      await chrome.runtime.sendMessage({
        type: MSG.SAVE_WORD,
        entry: { word: wordData.hanzi, pinyin: wordData.pinyin, meaning: wordData.meaning, meaningPt: wordData.meaningPt, color: color, context: context || '' }
      });
      loadVocabData();
      VLL_SP_Transcript.updateWordColor(wordData.hanzi, color);
    } catch (err) { logger.error('Failed to save word color:', err); }
  }

  async function deleteSelectedWord() {
    if (!state.selectedWord) return;
    const word = state.selectedWord.hanzi;
    try {
      await chrome.runtime.sendMessage({ type: MSG.DELETE_WORD, word });
      els.detail.panel.style.display = 'none';
      loadVocabData();
      VLL_SP_Transcript.updateWordColor(word, null);
    } catch (err) { logger.error('Failed to delete word:', err); }
  }

  async function playPronunciation(text) {
    if (!text) return;
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_PRONUNCIATION, text });
      if (response.dataUrl) new Audio(response.dataUrl).play();
    } catch (err) { logger.error('Pronunciation failed:', err); }
  }

  /* ── Export / Import ─────────────────────────────────────── */

  async function exportToAnki() {
    const info = $id('sp-export-info');
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.EXPORT_CSV });
      if (response.count === 0) { showInfo(info, 'Nenhuma palavra para exportar.', '#ffaa33'); return; }
      downloadFile(response.csv, `vll_anki_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
      showInfo(info, `✅ ${response.count} palavras exportadas!`, '#44dd88');
    } catch (err) { showInfo(info, '❌ Erro ao exportar.', '#ff4466'); }
  }

  async function exportData() {
    const info = $id('sp-data-transfer-info');
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.EXPORT_DATA });
      if (response.count === 0) { showInfo(info, 'Nenhum dado para exportar.', '#ffaa33'); return; }
      downloadFile(response.data, `vll_backup_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
      showInfo(info, `✅ ${response.count} palavras exportadas!`, '#44dd88');
    } catch (err) { showInfo(info, '❌ Erro ao exportar.', '#ff4466'); }
  }

  async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const info = $id('sp-data-transfer-info');
    try {
      const text = await file.text();
      const res = await chrome.runtime.sendMessage({ type: MSG.IMPORT_DATA, data: text });
      if (!res.ok) { showInfo(info, `❌ ${res.error}`, '#ff4466'); return; }
      showInfo(info, `✅ ${res.importedCount} palavras importadas!`, '#44dd88');
      loadVocabData();
    } catch (err) { showInfo(info, '❌ Erro ao importar.', '#ff4466'); }
    e.target.value = '';
  }

  /* ── Helpers ─────────────────────────────────────────────── */

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function showInfo(el, msg, color) {
    el.textContent = msg;
    el.style.color = color;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 3000);
  }

  /* ── Message Listener ────────────────────────────────────── */

  chrome.runtime.onMessage.addListener((msg) => {
    if (!VLL_MessagesShared.validate(msg)) return;
    switch (msg.type) {
      case MSG.SUBTITLES_READY:
        state.subtitles = msg.subtitles || [];
        VLL_SP_Transcript.render(state.subtitles, state.currentIndex, {
          status: state.subtitleStatus,
          formatTime,
          onWordClick: (w, ctx) => { playPronunciation(w.hanzi); showWordDetail(w, ctx); },
          onPlayPronunciation: playPronunciation,
          onSeek: (idx) => chrome.runtime.sendMessage({ type: MSG.SEEK_TO_SUBTITLE, index: idx })
        });
        break;
      case MSG.SUBTITLE_STATUS_CHANGED:
        state.subtitleStatus = msg.status || state.subtitleStatus;
        VLL_SP_Transcript.render(state.subtitles, state.currentIndex, {
          status: state.subtitleStatus,
          formatTime,
          onWordClick: (w, ctx) => { playPronunciation(w.hanzi); showWordDetail(w, ctx); },
          onPlayPronunciation: playPronunciation,
          onSeek: (idx) => chrome.runtime.sendMessage({ type: MSG.SEEK_TO_SUBTITLE, index: idx })
        });
        break;
      case MSG.SUBTITLE_CHANGED:
        state.currentIndex = msg.index;
        VLL_SP_Transcript.highlight(msg.index);
        break;
      case MSG.WORD_COLOR_UPDATED:
        loadVocabData();
        VLL_SP_Transcript.updateWordColor(msg.word, msg.color);
        break;
      case MSG.SETTINGS_CHANGED:
        loadSettings();
        loadTranscript();
        break;
    }
  });

  init();
})();
