/**
 * VLL Content Script — Main controller
 * Injected into YouTube pages. Manages the subtitle overlay,
 * word hover tooltips, and color-coded vocabulary tracking.
 */

/* global chrome, VLL_Subtitles, VLL_MessagesShared, VLL_ConfigShared, VLL_VocabShared, VLL_Logger, VLL_Overlay, VLL_Tooltip */

(() => {
  'use strict';

  const logger = VLL_Logger;
  const MSG = VLL_MessagesShared.types;
  const CFG = VLL_ConfigShared;
  const VOCAB = VLL_VocabShared;

  /* ── State ───────────────────────────────────────────────── */

  const vllState = {
    active: false,
    videoId: '',
    subtitles: [], 
    currentIndex: -1,
    dictData: {},  
    wordColors: {}, 
    ptMeanings: {}, 
    ptTrack: [],    
    settings: {
      enabled: true,
      showPinyin: true,
      showHanzi: true,
      showTranslation: true,
      targetLang: CFG.defaults.targetLang,
      lookupProvider: CFG.lookupProviders.DICTIONARY,
      autoPause: false
    }
  };

  let controlsEl = null;
  let loadingEl = null;
  let videoEl = null;
  let playerEl = null;
  let vllStartupToken = 0;

  function beginStartupRun() { vllStartupToken += 1; return vllStartupToken; }
  function cancelPendingStartup() { vllStartupToken += 1; }
  function isStaleStartup(token) { return token !== vllStartupToken; }

  /* ── Initialization ──────────────────────────────────────── */

  function init() {
    if (!window.location.pathname.startsWith('/watch')) return;

    const newVideoId = VLL_Subtitles.getVideoId();
    if (!newVideoId || newVideoId === vllState.videoId) return;

    logger.info('Initializing for video:', newVideoId);
    vllState.videoId = newVideoId;

    loadSettings().then(() => {
      waitForPlayer().then(() => {
        createPermanentControls();
        if (vllState.settings.enabled) {
          startVLL();
        }
      });
    });
  }

  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get([CFG.storageKeys.SETTINGS]);
      if (result[CFG.storageKeys.SETTINGS]) {
        vllState.settings = { ...vllState.settings, ...result[CFG.storageKeys.SETTINGS] };
      }
    } catch (e) { 
      logger.warn('Failed to load settings, using defaults');
    }
  }

  function waitForPlayer() {
    return new Promise((resolve) => {
      const check = () => {
        playerEl = document.querySelector('#movie_player, .html5-video-player');
        videoEl = document.querySelector('video.html5-main-video, video');
        if (playerEl && videoEl) {
          resolve();
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  }

  async function startVLL() {
    const startupToken = beginStartupRun();
    cleanup();
    if (!vllState.settings.enabled) return;

    VLL_Overlay.create(playerEl);
    showLoading('Carregando legendas...');

    try {
      const subData = await VLL_Subtitles.loadAllSubtitles(vllState.settings.targetLang);
      if (isStaleStartup(startupToken)) return;

      if (subData.zhTrack.length === 0) {
        showLoading('Sem legendas em chinês neste vídeo');
        setTimeout(() => hideLoading(), 3000);
        return;
      }

      vllState.ptTrack = subData.ptTrack;
      showLoading(`Processando ${subData.zhTrack.length} legendas...`);

      const allText = subData.zhTrack.map(e => e.text).join('\n');
      const uniqueWords = getUniqueWords(allText);

      const response = await chrome.runtime.sendMessage({
        type: MSG.BATCH_LOOKUP,
        words: uniqueWords,
        provider: vllState.settings.lookupProvider,
        targetLang: vllState.settings.targetLang
      });
      if (isStaleStartup(startupToken)) return;

      chrome.runtime.sendMessage({
        type: MSG.PRELOAD_GOOGLE_LOOKUP,
        words: uniqueWords,
        targetLang: vllState.settings.targetLang
      }).catch(() => {});

      vllState.dictData = response.dictData || {};
      vllState.wordColors = response.colorData || {};

      vllState.subtitles = subData.zhTrack.map(entry => {
        const words = segmentAndEnrich(entry.text);
        const translation = VLL_Subtitles.matchTranslation(entry, vllState.ptTrack);
        return {
          start: entry.start,
          duration: entry.duration,
          text: entry.text,
          words,
          translation
        };
      });

      logger.info(`Ready! ${vllState.subtitles.length} subtitles`);

      if (isStaleStartup(startupToken)) return;
      hideLoading();
      vllState.active = true;
      playerEl.classList.add('vll-active');

      startSync();

      chrome.runtime.sendMessage({
        type: MSG.SUBTITLES_READY,
        subtitles: vllState.subtitles,
        videoId: vllState.videoId
      }).catch(() => {});

    } catch (err) {
      if (isStaleStartup(startupToken)) return;
      logger.error('Startup error:', err);
      showLoading('Erro ao carregar legendas');
      setTimeout(() => hideLoading(), 3000);
    }
  }

  /* ── Word Segmentation ───────────────────────────────────── */

  function getUniqueWords(text) {
    const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
    const words = new Set();
    for (const seg of segmenter.segment(text)) {
      if (seg.isWordLike) words.add(seg.segment);
    }
    return Array.from(words);
  }

  function segmentAndEnrich(text) {
    const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
    const result = [];

    for (const seg of segmenter.segment(text)) {
      const dict = vllState.dictData[seg.segment];
      const color = vllState.wordColors[seg.segment] || null;

      result.push({
        hanzi: seg.segment,
        pinyin: dict ? dict.pinyin : '',
        meaning: dict ? dict.meaning : '',
        meaningLang: dict ? (dict.meaningLang || 'en') : '',
        isWord: seg.isWordLike,
        color: color
      });
    }

    return result;
  }

  /* ── UI Components ───────────────────────────────────────── */

  function showLoading(msg) {
    hideLoading();
    loadingEl = document.createElement('div');
    loadingEl.className = 'vll-loading';
    
    const spinner = document.createElement('div');
    spinner.className = 'vll-loading-spinner';
    
    const text = document.createElement('span');
    text.textContent = msg;
    
    loadingEl.appendChild(spinner);
    loadingEl.appendChild(text);
    playerEl.appendChild(loadingEl);
  }

  function hideLoading() {
    if (loadingEl) {
      loadingEl.remove();
      loadingEl = null;
    }
  }

  function createPermanentControls() {
    if (!playerEl) return;
    if (controlsEl) {
      const timeDisplay = playerEl.querySelector('.ytp-time-display');
      if (timeDisplay && timeDisplay.parentNode) {
        if (controlsEl.parentNode !== timeDisplay.parentNode || controlsEl.previousSibling !== timeDisplay) {
          timeDisplay.parentNode.insertBefore(controlsEl, timeDisplay.nextSibling);
        }
      } else if (!playerEl.contains(controlsEl)) {
        playerEl.appendChild(controlsEl);
      }
      const toggleBtn = controlsEl.querySelector('.vll-toggle-btn');
      if (toggleBtn) updateToggleButton(toggleBtn);
      return;
    }

    controlsEl = document.createElement('div');
    controlsEl.className = 'vll-controls';

    const sidepanelBtn = document.createElement('div');
    sidepanelBtn.className = 'vll-badge';
    sidepanelBtn.textContent = 'Painel';
    sidepanelBtn.title = 'Abrir/fechar painel lateral do VLL';
    sidepanelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: MSG.TOGGLE_SIDEPANEL }).catch(() => {});
    });

    const toggleBtn = document.createElement('div');
    toggleBtn.className = 'vll-badge vll-toggle-btn';
    updateToggleButton(toggleBtn);
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const newEnabled = !vllState.settings.enabled;
      vllState.settings.enabled = newEnabled;
      updateToggleButton(toggleBtn);

      chrome.runtime.sendMessage({ type: MSG.SAVE_SETTINGS, settings: vllState.settings }).catch(() => {});

      if (newEnabled) startVLL();
      else { cancelPendingStartup(); cleanup(); }
    });

    controlsEl.appendChild(sidepanelBtn);
    controlsEl.appendChild(toggleBtn);
    
    const timeDisplay = playerEl.querySelector('.ytp-time-display');
    if (timeDisplay && timeDisplay.parentNode) {
      timeDisplay.parentNode.insertBefore(controlsEl, timeDisplay.nextSibling);
    } else {
      playerEl.appendChild(controlsEl);
    }
  }

  function updateToggleButton(btn) {
    if (vllState.settings.enabled) {
      btn.textContent = 'Desativar';
      btn.classList.remove('vll-inactive');
      btn.classList.add('vll-active');
    } else {
      btn.textContent = 'Ativar';
      btn.classList.remove('vll-active');
      btn.classList.add('vll-inactive');
    }
  }

  /* ── Subtitle Sync ───────────────────────────────────────── */

  function onWordHover(w, context, e) {
    VLL_Tooltip.show(w, context, document.getElementById('vll-overlay'), {
      vocabColors: VOCAB.colors,
      vocabLabels: VOCAB.labels,
      ptMeanings: vllState.ptMeanings,
      targetLang: vllState.settings.targetLang,
      onTranslate: async (text, sourceLang) => {
        const res = await chrome.runtime.sendMessage({
          type: MSG.TRANSLATE_TEXT,
          text: text,
          sourceLang: sourceLang,
          targetLang: vllState.settings.targetLang
        });
        if (res && res.translatedText) {
          vllState.ptMeanings[w.hanzi] = res.translatedText;
          return res.translatedText;
        }
        return null;
      },
      onPlay: playPronunciation,
      onSave: saveWordColor,
      onDelete: deleteWord
    });
  }

  async function playPronunciation(text) {
    if (!text) return;
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_PRONUNCIATION, text: text });
      if (response.dataUrl) {
        const audio = new Audio(response.dataUrl);
        await audio.play();
      }
    } catch (err) {
      logger.error('Pronunciation playback failed:', err);
    }
  }

  async function saveWordColor(wordData, color, context) {
    const finalColor = color === 'white' ? null : color;
    vllState.wordColors[wordData.hanzi] = finalColor;
    wordData.color = finalColor;

    try {
      await chrome.runtime.sendMessage({
        type: MSG.SAVE_WORD,
        entry: {
          word: wordData.hanzi,
          pinyin: wordData.pinyin,
          meaning: wordData.meaning,
          meaningPt: wordData.meaningPt || '',
          color: color,
          context: context
        }
      });
      updateWordColorInDOM(wordData.hanzi, color);
    } catch (err) {
      logger.error('Failed to save word:', err);
    }
  }

  async function deleteWord(word) {
    delete vllState.wordColors[word];
    try {
      await chrome.runtime.sendMessage({ type: MSG.DELETE_WORD, word: word });
      updateWordColorInDOM(word, null);
    } catch (err) {
      logger.error('Failed to delete word:', err);
    }
  }

  function updateWordColorInDOM(hanzi, color) {
    const finalColor = color === 'white' ? null : color;
    vllState.subtitles.forEach(sub => {
      sub.words.forEach(w => {
        if (w.hanzi === hanzi) w.color = finalColor;
      });
    });
    VLL_Overlay.updateColors(vllState.subtitles[vllState.currentIndex]?.words || []);
  }

  /* ── Video Sync ──────────────────────────────────────────── */

  let autoPausedIndex = -1;

  function startSync() {
    if (!videoEl) return;
    videoEl.addEventListener('timeupdate', onTimeUpdate);
    onTimeUpdate();
  }

  function onTimeUpdate() {
    if (!vllState.active || !videoEl) return;

    const time = videoEl.currentTime;
    const idx = findSubtitleIndex(time);

    if (idx !== vllState.currentIndex) {
      if (vllState.settings.autoPause && vllState.currentIndex >= 0 && autoPausedIndex !== vllState.currentIndex) {
        const prevSub = vllState.subtitles[vllState.currentIndex];
        const endTime = prevSub.start + prevSub.duration;
        if (!videoEl.paused && time >= endTime && time < endTime + 0.5) {
          videoEl.pause();
          autoPausedIndex = vllState.currentIndex;
          videoEl.currentTime = endTime - 0.05;
          return;
        }
      }

      vllState.currentIndex = idx;
      if (idx >= 0) {
        autoPausedIndex = -1;
        VLL_Overlay.render(vllState.subtitles[idx], vllState.settings, onWordHover, VLL_Tooltip.startHideTimer, playPronunciation);
        chrome.runtime.sendMessage({ type: MSG.SUBTITLE_CHANGED, index: idx, time: time }).catch(() => {});
      } else {
        VLL_Overlay.clear();
      }
    }
  }

  function findSubtitleIndex(time) {
    const subs = vllState.subtitles;
    if (!subs || subs.length === 0) return -1;
    let lo = 0, hi = subs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (subs[mid].start < time) lo = mid + 1;
      else hi = mid;
    }
    const candidates = [lo - 1, lo];
    for (const idx of candidates) {
      if (idx >= 0 && idx < subs.length) {
        const s = subs[idx];
        if (time >= s.start && time < s.start + s.duration) return idx;
      }
    }
    return -1;
  }

  function cleanup() {
    vllState.active = false;
    vllState.currentIndex = -1;
    VLL_Overlay.clear();
    VLL_Tooltip.hide();
    if (videoEl) videoEl.removeEventListener('timeupdate', onTimeUpdate);
    if (playerEl) playerEl.classList.remove('vll-active');
  }

  /* ── Message Listener ────────────────────────────────────── */

  chrome.runtime.onMessage.addListener((msg) => {
    if (!VLL_MessagesShared.validate(msg)) {
      logger.warn('Invalid message received:', msg);
      return;
    }

    switch (msg.type) {
      case MSG.SETTINGS_CHANGED:
        vllState.settings = { ...vllState.settings, ...msg.settings };
        if (vllState.active) {
          if (vllState.currentIndex >= 0) {
            VLL_Overlay.render(vllState.subtitles[vllState.currentIndex], vllState.settings, onWordHover, VLL_Tooltip.startHideTimer, playPronunciation);
          }
        }
        break;
      case MSG.WORD_COLOR_UPDATED:
        updateWordColorInDOM(msg.word, msg.color);
        break;
      case MSG.SEEK_TO_SUBTITLE:
        if (vllState.subtitles[msg.index]) {
          videoEl.currentTime = vllState.subtitles[msg.index].start;
          videoEl.play();
        }
        break;
    }
  });

  // Watch for SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      init();
    }
  }).observe(document, { subtree: true, childList: true });

  init();

})();
