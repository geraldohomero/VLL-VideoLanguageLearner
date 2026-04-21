/**
 * VLL Content Script — Main controller
 * Injected into YouTube pages. Manages the subtitle overlay,
 * word hover tooltips, and color-coded vocabulary tracking.
 *
 * Depends on: subtitles.js (loaded before this in manifest)
 */

/* global chrome, VLL_Subtitles, VLL_MessagesShared, VLL_ConfigShared, VLL_VocabShared */

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

  if (!configShared || !configShared.lookupProviders || !configShared.storageKeys || !configShared.defaults) {
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

  const vllState = {
    active: false,
    videoId: '',
    subtitles: [], // List of enriched subtitles
    currentIndex: -1,
    dictData: {},  // Dictionary cache
    wordColors: {}, // Saved word colors
    ptMeanings: {}, // Cached Portuguese meanings
    ptTrack: [],    // Portuguese subtitle lines
    lookupStatus: {
      inProgress: false,
      googleReady: false,
      targetLang: CFG.defaults.targetLang,
      lastError: ''
    },
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

  let overlayEl = null;
  let tooltipEl = null;
  let tooltipTimeout = null;
  let controlsEl = null;
  let loadingEl = null;
  let videoEl = null;
  let playerEl = null;
  let vllStartupToken = 0;

  function beginStartupRun() {
    vllStartupToken += 1;
    return vllStartupToken;
  }

  function cancelPendingStartup() {
    vllStartupToken += 1;
  }

  function isStaleStartup(token) {
    return token !== vllStartupToken;
  }

  /* ── Initialization ──────────────────────────────────────── */

  function init() {
    // Only run on watch pages
    if (!window.location.pathname.startsWith('/watch')) return;

    const newVideoId = VLL_Subtitles.getVideoId();
    if (!newVideoId || newVideoId === vllState.videoId) return;

    console.log('[VLL] Initializing for video:', newVideoId);
    vllState.videoId = newVideoId;

    // Load user settings
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
    } catch (e) { /* use defaults */ }
  }

  /**
   * Wait for the YouTube video player to be ready.
   */
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

  /**
   * Main startup: load subtitles, process with dictionary, start rendering.
   */
  async function startVLL() {
    const startupToken = beginStartupRun();
    cleanup();
    if (!vllState.settings.enabled) return;

    createOverlay();
    showLoading('Carregando legendas...');

    try {
      // Step 1: Load all subtitle data from YouTube
      const subData = await VLL_Subtitles.loadAllSubtitles(vllState.settings.targetLang);
      if (isStaleStartup(startupToken)) return;

      if (subData.zhTrack.length === 0) {
        if (isStaleStartup(startupToken)) return;
        showLoading('Sem legendas em chinês neste vídeo');
        setTimeout(() => hideLoading(), 3000);
        return;
      }

      vllState.ptTrack = subData.ptTrack;
      showLoading(`Processando ${subData.zhTrack.length} legendas...`);

      // Step 2: Collect all unique words from all subtitles
      const allText = subData.zhTrack.map(e => e.text).join('\n');
      const uniqueWords = getUniqueWords(allText);

      // Step 3: Send to service worker for dictionary lookup + color lookup
      const response = await chrome.runtime.sendMessage({
        type: MSG.BATCH_LOOKUP,
        words: uniqueWords,
        provider: vllState.settings.lookupProvider || CFG.lookupProviders.DICTIONARY,
        targetLang: vllState.settings.targetLang || CFG.defaults.targetLang
      });
      if (isStaleStartup(startupToken)) return;

      // Start Google lookup preload in background without blocking startup.
      chrome.runtime.sendMessage({
        type: MSG.PRELOAD_GOOGLE_LOOKUP,
        words: uniqueWords,
        targetLang: vllState.settings.targetLang || CFG.defaults.targetLang
      }).catch(() => {});

      vllState.dictData = response.dictData || {};
      vllState.wordColors = response.colorData || {};

      // Step 4: Process each subtitle line with dictionary data
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

      console.log(`[VLL] Ready! ${vllState.subtitles.length} subtitles, ${Object.keys(vllState.dictData).length} dictionary hits`);

      if (isStaleStartup(startupToken)) return;
      hideLoading();
      vllState.active = true;
      playerEl.classList.add('vll-active');

      // Step 5: Start syncing with video playback
      startSync();

      // Notify side panel
      chrome.runtime.sendMessage({
        type: MSG.SUBTITLES_READY,
        subtitles: vllState.subtitles,
        videoId: vllState.videoId
      }).catch(() => {});

    } catch (err) {
      if (isStaleStartup(startupToken)) return;
      console.error('[VLL] Startup error:', err);
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

  /**
   * Refetches dictionary data (to get Google meanings after preload)
   * and updates the existing subtitle objects without a full reload.
   */
  async function refreshMeanings() {
    if (!vllState.active || vllState.subtitles.length === 0) return;

    console.log('[VLL] Refreshing meanings from provider:', vllState.settings.lookupProvider);

    try {
      const allText = vllState.subtitles.map(s => s.text).join('\n');
      const uniqueWords = getUniqueWords(allText);

      const response = await chrome.runtime.sendMessage({
        type: MSG.BATCH_LOOKUP,
        words: uniqueWords,
        provider: vllState.settings.lookupProvider || CFG.lookupProviders.DICTIONARY,
        targetLang: vllState.settings.targetLang || CFG.defaults.targetLang
      });

      vllState.dictData = response.dictData || {};
      
      // Update existing subtitles
      vllState.subtitles.forEach(sub => {
        sub.words = segmentAndEnrich(sub.text);
      });

      // Force re-render of current subtitle
      if (vllState.currentIndex >= 0) {
        renderSubtitle(vllState.subtitles[vllState.currentIndex]);
      }

      console.log('[VLL] Meanings refreshed.');
    } catch (err) {
      console.warn('[VLL] Refresh meanings failed:', err);
    }
  }

  /* ── DOM: Overlay ────────────────────────────────────────── */

  function createOverlay() {
    if (overlayEl) return;

    overlayEl = document.createElement('div');
    overlayEl.className = 'vll-overlay vll-hidden';
    overlayEl.id = 'vll-overlay';

    // Prevent clicks from affecting the video player
    overlayEl.addEventListener('click', e => e.stopPropagation());

    playerEl.style.position = 'relative';
    playerEl.appendChild(overlayEl);
  }

  function showLoading(msg) {
    hideLoading();
    loadingEl = document.createElement('div');
    loadingEl.className = 'vll-loading';
    loadingEl.innerHTML = `
      <div class="vll-loading-spinner"></div>
      <span>${msg}</span>
    `;
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

      chrome.runtime.sendMessage({
        type: MSG.SAVE_SETTINGS,
        settings: vllState.settings
      }).catch(() => {});

      if (newEnabled) {
        startVLL();
      } else {
        cancelPendingStartup();
        cleanup();
      }
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
      btn.style.background = 'linear-gradient(135deg, rgba(255, 68, 102, 0.2), rgba(200, 50, 80, 0.1))';
      btn.style.borderColor = 'rgba(255, 68, 102, 0.2)';
      btn.style.color = 'var(--vll-red)';
    } else {
      btn.textContent = 'Ativar';
      btn.style.background = 'linear-gradient(135deg, rgba(68, 221, 136, 0.2), rgba(50, 200, 100, 0.1))';
      btn.style.borderColor = 'rgba(68, 221, 136, 0.2)';
      btn.style.color = 'var(--vll-green)';
    }
  }

  /* ── Render Subtitle ─────────────────────────────────────── */

  function renderSubtitle(entry) {
    if (!overlayEl) return;

    overlayEl.innerHTML = '';
    overlayEl.classList.remove('vll-hidden');

    const box = document.createElement('div');
    box.className = 'vll-subtitle-box';

    // Line 1: Hanzi words (interactive)
    const hanziLine = document.createElement('div');
    hanziLine.className = 'vll-line-hanzi';

    entry.words.forEach(w => {
      if (!w.isWord) {
        // Punctuation or whitespace
        const span = document.createElement('span');
        span.textContent = w.hanzi;
        span.style.color = 'var(--vll-text-dim)';
        hanziLine.appendChild(span);
        return;
      }

      const wordEl = document.createElement('div');
      wordEl.className = 'vll-word';
      if (w.color) wordEl.setAttribute('data-color', w.color);

      const hanziSpan = document.createElement('span');
      hanziSpan.className = 'vll-word-hanzi';
      hanziSpan.textContent = w.hanzi;
      wordEl.appendChild(hanziSpan);

      if (vllState.settings.showPinyin && w.pinyin) {
        const pinyinSpan = document.createElement('span');
        pinyinSpan.className = 'vll-word-pinyin';
        pinyinSpan.textContent = w.pinyin;
        wordEl.appendChild(pinyinSpan);
      }

      // Hover events for tooltip
      wordEl.addEventListener('mouseenter', (e) => showTooltip(w, entry.text, e));
      wordEl.addEventListener('mouseleave', () => {
        if (tooltipTimeout) clearTimeout(tooltipTimeout);
        // Delay hide to allow mouse to move to tooltip
        tooltipTimeout = setTimeout(() => {
          if (tooltipEl && !tooltipEl.matches(':hover')) {
            hideTooltip();
          }
        }, 300);
      });

      // Click for pronunciation
      wordEl.addEventListener('click', (e) => {
        e.stopPropagation();
        playPronunciation(w.hanzi);
      });

      hanziLine.appendChild(wordEl);
    });

    box.appendChild(hanziLine);

    // Line 2: Translation
    if (vllState.settings.showTranslation && entry.translation) {
      const transLine = document.createElement('div');
      transLine.className = 'vll-line-translation';
      transLine.textContent = entry.translation;
      box.appendChild(transLine);
    }

    overlayEl.appendChild(box);
  }

  function clearSubtitle() {
    if (overlayEl) {
      overlayEl.classList.add('vll-hidden');
    }
  }

  /* ── Tooltip ─────────────────────────────────────────────── */

  function showTooltip(wordData, context, event) {
    if (tooltipTimeout) {
      clearTimeout(tooltipTimeout);
      tooltipTimeout = null;
    }
    hideTooltip();

    tooltipEl = document.createElement('div');
    tooltipEl.className = 'vll-tooltip';

    // Position fixed above the subtitle overlay, perfectly centered
    const overlayRect = overlayEl.getBoundingClientRect();
    tooltipEl.style.left = `${overlayRect.left + (overlayRect.width / 2)}px`;
    tooltipEl.style.bottom = `${window.innerHeight - overlayRect.top}px`;
    tooltipEl.style.top = 'auto';
    tooltipEl.style.transform = 'translate(-50%, -10px)';

    // Hanzi (large) + Play Button
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
      playPronunciation(wordData.hanzi);
    });
    headerEl.appendChild(playBtn);

    tooltipEl.appendChild(headerEl);

    // Pinyin
    if (wordData.pinyin) {
      const pinyinEl = document.createElement('div');
      pinyinEl.className = 'vll-tooltip-pinyin';
      pinyinEl.textContent = wordData.pinyin;
      tooltipEl.appendChild(pinyinEl);
    }

    // Meaning
    const meaningEl = document.createElement('div');
    meaningEl.className = 'vll-tooltip-meaning';
    tooltipEl.appendChild(meaningEl);

    const isGoogle = vllState.settings.lookupProvider === CFG.lookupProviders.GOOGLE;

    if (wordData.meaning) {
      // Check if we have a cached PT meaning or if the meaning is already in the target language (Google case)
      if (vllState.ptMeanings[wordData.hanzi]) {
        wordData.meaningPt = vllState.ptMeanings[wordData.hanzi];
        meaningEl.textContent = wordData.meaningPt;
      } else if (wordData.meaningLang === vllState.settings.targetLang) {
        // If it's Google, we assume the meaning returned is already in the targetLang (PT)
        wordData.meaningPt = wordData.meaning;
        vllState.ptMeanings[wordData.hanzi] = wordData.meaning;
        meaningEl.textContent = wordData.meaning;
      } else {
        // Show English while translating (for local dictionary)
        meaningEl.textContent = `${wordData.meaning} (Traduzindo...)`;
        
        chrome.runtime.sendMessage({
          type: MSG.TRANSLATE_TEXT,
          text: wordData.meaning,
          sourceLang: wordData.meaningLang || 'en',
          targetLang: CFG.defaults.targetLang
        }).then(res => {
          if (res && res.translatedText) {
            vllState.ptMeanings[wordData.hanzi] = res.translatedText;
            wordData.meaningPt = res.translatedText;
            // Only update DOM if this is still the active tooltip for this word
            if (tooltipEl && document.body.contains(tooltipEl) && hanziEl.textContent === wordData.hanzi) {
              meaningEl.textContent = res.translatedText;
            }
          } else {
            meaningEl.textContent = wordData.meaning; // fallback to English
          }
        }).catch(() => {
          if (tooltipEl && document.body.contains(tooltipEl) && hanziEl.textContent === wordData.hanzi) {
            meaningEl.textContent = wordData.meaning; // fallback to English
          }
        });
      }
    } else {
      meaningEl.style.opacity = '0.5';
      meaningEl.textContent = '(sem definição no dicionário)';
    }

    // Context
    if (context) {
      const ctxEl = document.createElement('div');
      ctxEl.className = 'vll-tooltip-context';
      ctxEl.textContent = `"${context}"`;
      tooltipEl.appendChild(ctxEl);
    }

    // Color buttons
    const colorBtns = document.createElement('div');
    colorBtns.className = 'vll-color-buttons';

    VOCAB.colors.forEach(color => {
      const btn = document.createElement('button');
      btn.className = 'vll-color-btn';
      btn.setAttribute('data-color', color);
      btn.title = VOCAB.labels[color] || color;

      if (wordData.color === color) btn.classList.add('active');

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveWordColor(wordData, color, context);
        // Update UI
        colorBtns.querySelectorAll('.vll-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Update all matching word spans in overlay
        updateWordColorInDOM(wordData.hanzi, color);
      });

      colorBtns.appendChild(btn);
    });

    tooltipEl.appendChild(colorBtns);

    // Remove button (if word is saved)
    if (wordData.color && wordData.color !== 'white') {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'vll-remove-btn';
      removeBtn.textContent = '✕ Remover do vocabulário';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteWord(wordData.hanzi);
        hideTooltip();
        updateWordColorInDOM(wordData.hanzi, null);
      });
      tooltipEl.appendChild(removeBtn);
    }

    // Prevent tooltip from closing when hovered
    tooltipEl.addEventListener('mouseenter', () => {
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = null;
      }
    });
    tooltipEl.addEventListener('mouseleave', () => {
      if (tooltipTimeout) clearTimeout(tooltipTimeout);
      tooltipTimeout = setTimeout(() => hideTooltip(), 300);
    });
    tooltipEl.addEventListener('click', e => e.stopPropagation());

    document.body.appendChild(tooltipEl);
  }

  function hideTooltip() {
    if (tooltipEl) {
      tooltipEl.remove();
      tooltipEl = null;
    }
  }

  /* ── Word Actions ────────────────────────────────────────── */

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
      console.error('[VLL] Pronunciation playback failed:', err);
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
          color: color, // Backend still expects the raw color string or 'white'
          context: context
        }
      });
    } catch (err) {
      console.error('[VLL] Failed to save word:', err);
    }
  }

  async function deleteWord(word) {
    delete vllState.wordColors[word];

    try {
      await chrome.runtime.sendMessage({
        type: MSG.DELETE_WORD,
        word: word
      });
    } catch (err) {
      console.error('[VLL] Failed to delete word:', err);
    }
  }

  function updateWordColorInDOM(hanzi, color) {
    if (!overlayEl) return;
    
    const finalColor = color === 'white' ? null : color;
    
    const wordEls = overlayEl.querySelectorAll('.vll-word');
    wordEls.forEach(el => {
      const hanziEl = el.querySelector('.vll-word-hanzi');
      if (hanziEl && hanziEl.textContent === hanzi) {
        if (finalColor) {
          el.setAttribute('data-color', finalColor);
        } else {
          el.removeAttribute('data-color');
        }
      }
    });

    // Also update in the state for future renders
    vllState.subtitles.forEach(sub => {
      sub.words.forEach(w => {
        if (w.hanzi === hanzi) w.color = finalColor;
      });
    });
  }

  /* ── Video Sync ──────────────────────────────────────────── */

  let autoPausedIndex = -1;

  function startSync() {
    if (!videoEl) return;

    videoEl.addEventListener('timeupdate', onTimeUpdate);
    // Initial check
    onTimeUpdate();
  }

  function onTimeUpdate() {
    if (!vllState.active || !videoEl) return;

    const time = videoEl.currentTime;
    const idx = findSubtitleIndex(time);

    if (idx !== vllState.currentIndex) {
      // Auto-pause logic
      if (vllState.settings.autoPause && vllState.currentIndex >= 0 && autoPausedIndex !== vllState.currentIndex) {
        const prevSub = vllState.subtitles[vllState.currentIndex];
        const endTime = prevSub.start + prevSub.duration;
        
        // If we crossed the end boundary naturally (within 0.5s margin)
        if (!videoEl.paused && time >= endTime && time < endTime + 0.5) {
          videoEl.pause();
          autoPausedIndex = vllState.currentIndex;
          videoEl.currentTime = endTime - 0.05; // Seek back slightly to keep the subtitle on screen
          return;
        }
      }

      vllState.currentIndex = idx;
      if (idx >= 0) autoPausedIndex = -1; // Reset for the new subtitle

      if (idx >= 0) {
        renderSubtitle(vllState.subtitles[idx]);
        // Notify side panel of current position
        chrome.runtime.sendMessage({
          type: MSG.SUBTITLE_CHANGED,
          index: idx,
          time: time
        }).catch(() => {});
      } else {
        clearSubtitle();
      }
    }
  }

  function findSubtitleIndex(time) {
    for (let i = 0; i < vllState.subtitles.length; i++) {
      const sub = vllState.subtitles[i];
      if (time >= sub.start && time < sub.start + sub.duration) {
        return i;
      }
    }
    return -1;
  }

  /* ── Cleanup ─────────────────────────────────────────────── */

  function cleanup() {
    vllState.active = false;
    vllState.currentIndex = -1;
    vllState.subtitles = [];
    vllState.dictData = {};

    hideTooltip();
    hideLoading();

    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    if (playerEl) playerEl.classList.remove('vll-active');

    if (videoEl) {
      videoEl.removeEventListener('timeupdate', onTimeUpdate);
    }
  }

  /* ── Listen for messages from service worker / side panel ── */

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case MSG.GET_SUBTITLES:
        sendResponse({ subtitles: vllState.subtitles, videoId: vllState.videoId });
        break;

      case MSG.GET_CURRENT_INDEX:
        sendResponse({ index: vllState.currentIndex });
        break;

      case MSG.SEEK_TO_SUBTITLE:
        if (videoEl && msg.index >= 0 && msg.index < vllState.subtitles.length) {
          videoEl.currentTime = vllState.subtitles[msg.index].start;
        }
        sendResponse({ ok: true });
        break;

      case MSG.SETTINGS_CHANGED: {
        const wasEnabled = vllState.settings.enabled;
        const prevProvider = vllState.settings.lookupProvider;
        const prevTargetLang = vllState.settings.targetLang;
        vllState.settings = { ...vllState.settings, ...msg.settings };
        
        if (wasEnabled && !vllState.settings.enabled) {
          cancelPendingStartup();
          cleanup();
        } else if (!wasEnabled && vllState.settings.enabled) {
          startVLL();
        } else if (
          vllState.settings.enabled &&
          (prevProvider !== vllState.settings.lookupProvider || prevTargetLang !== vllState.settings.targetLang)
        ) {
          startVLL();
        }

        if (controlsEl) {
          const toggleBtn = controlsEl.querySelector('.vll-toggle-btn');
          if (toggleBtn) updateToggleButton(toggleBtn);
        }
        
        if (vllState.settings.enabled && vllState.currentIndex >= 0) {
          renderSubtitle(vllState.subtitles[vllState.currentIndex]);
        }
        sendResponse({ ok: true });
        break;
      }

      case MSG.LOOKUP_STATUS_CHANGED: {
        const wasReady = vllState.lookupStatus.googleReady;
        if (msg.status) vllState.lookupStatus = { ...vllState.lookupStatus, ...msg.status };
        
        // If Google just became ready and we are using it, refresh meanings
        if (!wasReady && vllState.lookupStatus.googleReady && vllState.settings.lookupProvider === 'google') {
          refreshMeanings();
        }
        sendResponse({ ok: true });
        break;
      }

      case MSG.WORD_COLOR_UPDATED:
        if (msg.word && msg.color) {
          vllState.wordColors[msg.word] = msg.color;
          updateWordColorInDOM(msg.word, msg.color);
        }
        sendResponse({ ok: true });
        break;

      case MSG.WORD_COLORS_BULK_UPDATED: {
        const colors = msg.colors || {};
        for (const [word, color] of Object.entries(colors)) {
          vllState.wordColors[word] = color;
          updateWordColorInDOM(word, color);
        }
        sendResponse({ ok: true });
        break;
      }
    }
    return true; // Keep channel open for async
  });

  /* ── YouTube SPA Navigation Handling ─────────────────────── */

  // YouTube is a SPA — detect navigation events
  document.addEventListener('yt-navigate-finish', () => {
    console.log('[VLL] yt-navigate-finish detected');
    // Longer delay: YouTube needs time to populate player response data
    setTimeout(init, 2000);
  });

  // Also handle popstate for browser back/forward
  window.addEventListener('popstate', () => {
    console.log('[VLL] popstate detected');
    setTimeout(init, 2000);
  });

  // URL change polling — catches all navigation types
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      console.log('[VLL] URL changed:', lastUrl, '→', window.location.href);
      lastUrl = window.location.href;
      setTimeout(init, 2000);
    }
  }, 1000);

  // Initial load — wait for YouTube to fully initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 2000));
  } else {
    setTimeout(init, 1500);
  }
})();
