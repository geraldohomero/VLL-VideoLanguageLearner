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

  const DEFAULT_OVERLAY_STYLE = {
    fontScale: CFG.defaults.overlayStyle?.fontScale ?? 1,
    contrast: CFG.defaults.overlayStyle?.contrast ?? 1,
    textColor: CFG.defaults.overlayStyle?.textColor ?? '#e8e8f0',
    backgroundColor: CFG.defaults.overlayStyle?.backgroundColor ?? '#0a0a19',
    backgroundAlpha: CFG.defaults.overlayStyle?.backgroundAlpha ?? 0.4,
    blur: CFG.defaults.overlayStyle?.blur ?? 6
  };

  const DEFAULT_OVERLAY_POSITION = {
    x: CFG.defaults.overlayPosition?.x ?? 50,
    y: CFG.defaults.overlayPosition?.y ?? 84
  };

  const SUBTITLE_CHUNK_SIZE = 120;

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
    hasNativePtTrack: false,
    subtitleStatus: {
      mode: 'idle',
      message: 'Aguardando vídeo...'
    },
    segmentCache: new Map(),
    settings: {
      enabled: true,
      showPinyin: true,
      showHanzi: true,
      showTranslation: true,
      targetLang: CFG.defaults.targetLang,
      lookupProvider: CFG.lookupProviders.DICTIONARY,
      autoPause: false,
      overlayStyle: { ...DEFAULT_OVERLAY_STYLE },
      overlayPosition: { ...DEFAULT_OVERLAY_POSITION }
    }
  };

  let controlsEl = null;
  let loadingEl = null;
  let videoEl = null;
  let playerEl = null;
  let vllStartupToken = 0;
  let overlaySettingsSaveTimer = null;

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
        const incoming = result[CFG.storageKeys.SETTINGS];
        vllState.settings = {
          ...vllState.settings,
          ...incoming,
          overlayStyle: {
            ...DEFAULT_OVERLAY_STYLE,
            ...(incoming.overlayStyle || {})
          },
          overlayPosition: {
            ...DEFAULT_OVERLAY_POSITION,
            ...(incoming.overlayPosition || {})
          }
        };
      }
    } catch (e) { 
      logger.warn('Failed to load settings, using defaults');
    }
  }

  function setSubtitleStatus(mode, message) {
    vllState.subtitleStatus = {
      mode,
      message,
      updatedAt: Date.now(),
      videoId: vllState.videoId,
      hasNativePtTrack: !!vllState.hasNativePtTrack
    };

    chrome.runtime.sendMessage({
      type: MSG.SUBTITLE_STATUS_CHANGED,
      status: vllState.subtitleStatus
    }).catch(() => {});
  }

  function yieldToUI() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  function scheduleOverlaySettingsPersist() {
    if (overlaySettingsSaveTimer) {
      clearTimeout(overlaySettingsSaveTimer);
    }

    overlaySettingsSaveTimer = setTimeout(() => {
      chrome.runtime.sendMessage({ type: MSG.SAVE_SETTINGS, settings: vllState.settings }).catch((err) => {
        logger.warn('Failed to persist overlay settings:', err);
      });
      overlaySettingsSaveTimer = null;
    }, 220);
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

    VLL_Overlay.create(playerEl, {
      onSettingsChange: ({ overlayStyle, overlayPosition }) => {
        vllState.settings.overlayStyle = {
          ...vllState.settings.overlayStyle,
          ...(overlayStyle || {})
        };
        vllState.settings.overlayPosition = {
          ...vllState.settings.overlayPosition,
          ...(overlayPosition || {})
        };

        scheduleOverlaySettingsPersist();
      }
    });
    showLoading('Carregando legendas...');
    setSubtitleStatus('loading', 'Carregando legendas...');

    try {
      const subData = await VLL_Subtitles.loadAllSubtitles(vllState.settings.targetLang);
      if (isStaleStartup(startupToken)) return;

      if (subData.zhTrack.length === 0) {
        const noSubtitleMessage = 'Sem legendas em chines neste video';
        showLoading(noSubtitleMessage);
        setSubtitleStatus('no_subtitles', noSubtitleMessage);
        setTimeout(() => hideLoading(), 3000);
        return;
      }

      vllState.ptTrack = subData.ptTrack;
      vllState.hasNativePtTrack = !!subData.hasNativePtTrack;
      vllState.segmentCache.clear();

      // Fallback: if no Portuguese track (YouTube API may have returned 429),
      // batch-translate Chinese lines via Google Translate in the background.
      if (vllState.ptTrack.length === 0 && subData.zhTrack.length > 0) {
        logger.info('No PT track from YouTube. Falling back to Google Translate...');
        showLoading('Traduzindo legendas via Google Translate...');
        setSubtitleStatus('loading', 'Traduzindo legendas via Google Translate...');

        try {
          const translateResult = await chrome.runtime.sendMessage({
            type: MSG.BATCH_TRANSLATE_LINES,
            entries: subData.zhTrack,
            sourceLang: 'zh-CN',
            targetLang: vllState.settings.targetLang
          });
          if (isStaleStartup(startupToken)) return;

          if (translateResult && translateResult.entries && translateResult.entries.length > 0) {
            vllState.ptTrack = translateResult.entries;
            logger.info(`Google Translate fallback: ${translateResult.entries.length} lines translated`);
          } else {
            logger.warn('Google Translate fallback returned no entries');
          }
        } catch (err) {
          logger.warn('Google Translate fallback failed:', err);
        }
      }

      showLoading(`Processando ${subData.zhTrack.length} legendas...`);

      const uniqueWords = getUniqueWordsFromEntries(subData.zhTrack);

      const response = await chrome.runtime.sendMessage({
        type: MSG.BATCH_LOOKUP,
        words: uniqueWords,
        provider: vllState.settings.lookupProvider || CFG.lookupProviders.DICTIONARY,
        targetLang: vllState.settings.targetLang
      });
      if (isStaleStartup(startupToken)) return;

      vllState.dictData = response.dictData || {};
      vllState.wordColors = response.colorData || {};

      vllState.subtitles = await processSubtitlesInChunks(subData.zhTrack, startupToken);
      if (isStaleStartup(startupToken)) return;

      logger.info(`Ready! ${vllState.subtitles.length} subtitles`);

      if (isStaleStartup(startupToken)) return;
      hideLoading();
      vllState.active = true;
      playerEl.classList.add('vll-active');
      setSubtitleStatus('ready', `${vllState.subtitles.length} legendas prontas`);

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
      setSubtitleStatus('error', err?.message || 'Erro ao carregar legendas');
      setTimeout(() => hideLoading(), 3000);
    }
  }

  /* ── Word Segmentation ───────────────────────────────────── */

  function getSegmentedTokens(text) {
    const cacheKey = text || '';
    const cached = vllState.segmentCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
    const tokens = [];
    for (const seg of segmenter.segment(cacheKey)) {
      tokens.push({
        hanzi: seg.segment,
        isWord: !!seg.isWordLike
      });
    }

    vllState.segmentCache.set(cacheKey, tokens);
    return tokens;
  }

  function getUniqueWordsFromEntries(entries) {
    const words = new Set();
    (entries || []).forEach((entry) => {
      getSegmentedTokens(entry.text).forEach((token) => {
        if (token.isWord) words.add(token.hanzi);
      });
    });
    return Array.from(words);
  }

  function segmentAndEnrich(text) {
    return getSegmentedTokens(text).map((token) => {
      const dict = token.isWord ? vllState.dictData[token.hanzi] : null;
      const color = token.isWord ? (vllState.wordColors[token.hanzi] || null) : null;

      return {
        hanzi: token.hanzi,
        pinyin: dict ? dict.pinyin : '',
        meaning: dict ? dict.meaning : '',
        meaningLang: dict ? (dict.meaningLang || 'en') : '',
        customMeaning: '',
        isWord: token.isWord,
        color: color
      };
    });
  }

  async function processSubtitlesInChunks(zhTrack, startupToken) {
    const processed = [];
    const total = zhTrack.length;

    for (let i = 0; i < total; i += SUBTITLE_CHUNK_SIZE) {
      if (isStaleStartup(startupToken)) return [];

      const chunk = zhTrack.slice(i, i + SUBTITLE_CHUNK_SIZE);
      chunk.forEach((entry) => {
        const words = segmentAndEnrich(entry.text);
        const translation = (vllState.ptTrack && vllState.ptTrack.length > 0)
          ? VLL_Subtitles.matchTranslation(entry, vllState.ptTrack)
          : '';
        processed.push({
          start: entry.start,
          duration: entry.duration,
          text: entry.text,
          words,
          translation
        });
      });

      const progress = Math.min(100, Math.round(((i + chunk.length) / total) * 100));
      showLoading(`Processando legendas... ${progress}%`);
      setSubtitleStatus('loading', `Processando legendas... ${progress}%`);
      await yieldToUI();
    }

    return processed;
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

  function showTransientNotice(message) {
    if (!playerEl || !message) return;

    const notice = document.createElement('div');
    notice.className = 'vll-notice';
    notice.textContent = message;
    playerEl.appendChild(notice);

    setTimeout(() => {
      notice.classList.add('vll-hide');
      setTimeout(() => notice.remove(), 260);
    }, 1800);
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
      onDelete: deleteWord,
      onEditMeaning: editWordMeaning
    });
  }

  async function playPronunciation(text) {
    if (!text) return;
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_PRONUNCIATION, text: text });
      if (response && response.dataUrl) {
        const audio = new Audio(response.dataUrl);
        await audio.play();
        return;
      }

      showTransientNotice('Pronuncia indisponivel no momento');
    } catch (err) {
      logger.error('Pronunciation playback failed:', err);
      showTransientNotice('Falha ao reproduzir pronuncia');
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
          customMeaning: wordData.customMeaning || '',
          wordLang: 'zh',
          color: color,
          context: context
        }
      });
      updateWordColorInDOM(wordData.hanzi, color);
    } catch (err) {
      logger.error('Failed to save word:', err);
    }
  }

  async function editWordMeaning(word, customMeaning) {
    try {
      await chrome.runtime.sendMessage({
        type: MSG.UPDATE_MEANING,
        word: word,
        customMeaning: customMeaning
      });
      // Update local cache so tooltip shows the new meaning immediately
      vllState.ptMeanings[word] = customMeaning;
    } catch (err) {
      logger.error('Failed to edit word meaning:', err);
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
    vllState.subtitles = [];
    vllState.hasNativePtTrack = false;
    VLL_Overlay.clear();
    VLL_Tooltip.hide();
    if (videoEl) videoEl.removeEventListener('timeupdate', onTimeUpdate);
    if (playerEl) playerEl.classList.remove('vll-active');
    if (overlaySettingsSaveTimer) {
      clearTimeout(overlaySettingsSaveTimer);
      overlaySettingsSaveTimer = null;
    }
    setSubtitleStatus('idle', 'Aguardando legendas...');
  }

  /* ── Message Listener ────────────────────────────────────── */

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!VLL_MessagesShared.validate(msg)) {
      logger.warn('Invalid message received:', msg);
      return false;
    }

    if (msg.type === MSG.GET_SUBTITLES) {
      sendResponse({
        subtitles: vllState.subtitles,
        videoId: vllState.videoId,
        status: vllState.subtitleStatus
      });
      return true;
    }

    if (msg.type === MSG.GET_CURRENT_INDEX) {
      sendResponse({ index: vllState.currentIndex, status: vllState.subtitleStatus });
      return true;
    }

    switch (msg.type) {
      case MSG.SETTINGS_CHANGED:
        vllState.settings = {
          ...vllState.settings,
          ...msg.settings,
          overlayStyle: {
            ...vllState.settings.overlayStyle,
            ...(msg.settings?.overlayStyle || {})
          },
          overlayPosition: {
            ...vllState.settings.overlayPosition,
            ...(msg.settings?.overlayPosition || {})
          }
        };
        if (vllState.active) {
          if (vllState.currentIndex >= 0) {
            VLL_Overlay.render(vllState.subtitles[vllState.currentIndex], vllState.settings, onWordHover, VLL_Tooltip.startHideTimer, playPronunciation);
          }
        }
        break;
      case MSG.WORD_COLOR_UPDATED:
        updateWordColorInDOM(msg.word, msg.color);
        break;
      case MSG.WORD_MEANING_UPDATED:
        if (msg.word && msg.customMeaning) {
          vllState.ptMeanings[msg.word] = msg.customMeaning;
        }
        break;
      case MSG.SEEK_TO_SUBTITLE:
        if (vllState.subtitles[msg.index]) {
          videoEl.currentTime = vllState.subtitles[msg.index].start;
          videoEl.play();
        }
        break;
    }

    return false;
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
