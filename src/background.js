/**
 * VLL Service Worker (Background Script)
 * Central hub: loads dictionary, handles IndexedDB, routes messages.
 *
 * Manifest V3 — no ES modules, uses importScripts().
 */

importScripts('messages.shared.js', 'config.shared.js', 'network.shared.js', 'database.js', 'dictionary.js', 'export.js');

const VLL_GOOGLE_LOOKUP_CONCURRENCY = 6;
const VLL_TRANSLATE_TIMEOUT_MS = 7000;
const VLL_TRANSLATE_RETRIES = 2;
const VLL_TRANSLATE_BACKOFF_MS = 300;
const _vllSidepanelOpenTabs = new Set();
let _vllSettingsMutationQueue = Promise.resolve();

const _vllGoogleLookupState = {
  inProgress: false,
  ready: false,
  targetLang: 'pt',
  cache: Object.create(null),
  loadedWords: new Set(),
  lastError: ''
};

const vllNetworkShared = (typeof VLL_NetworkShared !== 'undefined' && VLL_NetworkShared)
  ? VLL_NetworkShared
  : null;

if (!vllNetworkShared) {
  throw new Error('[VLL] Missing VLL_NetworkShared. Ensure network.shared.js is loaded first.');
}

const vllMessagesShared = (typeof VLL_MessagesShared !== 'undefined' && VLL_MessagesShared)
  ? VLL_MessagesShared
  : null;

if (!vllMessagesShared || !vllMessagesShared.types) {
  throw new Error('[VLL] Missing VLL_MessagesShared. Ensure messages.shared.js is loaded first.');
}

const MSG = vllMessagesShared.types;

const vllConfigShared = (typeof VLL_ConfigShared !== 'undefined' && VLL_ConfigShared)
  ? VLL_ConfigShared
  : null;

if (!vllConfigShared || !vllConfigShared.lookupProviders || !vllConfigShared.storageKeys || !vllConfigShared.defaults) {
  throw new Error('[VLL] Missing VLL_ConfigShared. Ensure config.shared.js is loaded first.');
}

const CFG = vllConfigShared;

_vllGoogleLookupState.targetLang = CFG.defaults.targetLang;

function vllDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function vllFetchWithTimeout(url, options = {}, timeoutMs = VLL_TRANSLATE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function vllFetchWithRetry(url, options = {}, config = {}) {
  const retries = Number.isInteger(config.retries) ? config.retries : VLL_TRANSLATE_RETRIES;
  const timeoutMs = Number.isInteger(config.timeoutMs) ? config.timeoutMs : VLL_TRANSLATE_TIMEOUT_MS;
  const backoffMs = Number.isInteger(config.backoffMs) ? config.backoffMs : VLL_TRANSLATE_BACKOFF_MS;

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await vllFetchWithTimeout(url, options, timeoutMs);
      if (!response.ok) {
        const retriable = vllNetworkShared.shouldRetryHttpStatus(response.status);
        if (!retriable || attempt === retries) {
          throw new Error(`HTTP ${response.status}`);
        }
        await vllDelay(vllNetworkShared.getRetryDelay(attempt, backoffMs));
        continue;
      }
      return response;
    } catch (err) {
      lastErr = err;
      const retriable = vllNetworkShared.shouldRetryNetworkError(err);
      if (!retriable || attempt === retries) {
        throw err;
      }
      await vllDelay(vllNetworkShared.getRetryDelay(attempt, backoffMs));
    }
  }

  throw lastErr || new Error('Fetch failed');
}

function vllParseGoogleTranslationResponse(data) {
  const chunks = Array.isArray(data?.[0]) ? data[0] : [];

  const translatedText = chunks
    .map(chunk => (typeof chunk?.[0] === 'string' ? chunk[0] : ''))
    .join('')
    .trim();

  const romanizedText = chunks
    .map(chunk => (typeof chunk?.[3] === 'string' ? chunk[3] : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { translatedText, romanizedText };
}

async function vllTranslateWithGoogle(text, sourceLang = 'auto', targetLang = CFG.defaults.targetLang) {
  if (!text || !text.trim()) {
    return { translatedText: '', romanizedText: '' };
  }

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&dt=rm&q=${encodeURIComponent(text)}`;
  const res = await vllFetchWithRetry(url, {}, {
    retries: VLL_TRANSLATE_RETRIES,
    timeoutMs: VLL_TRANSLATE_TIMEOUT_MS,
    backoffMs: VLL_TRANSLATE_BACKOFF_MS
  });

  const data = await res.json();
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    return { translatedText: '', romanizedText: '' };
  }

  return vllParseGoogleTranslationResponse(data);
}

async function vllBatchLookupWithGoogle(words, targetLang = 'pt') {
  const dictData = Object.create(null);
  const queue = (words || []).filter(Boolean);
  const workerCount = Math.max(1, Math.min(VLL_GOOGLE_LOOKUP_CONCURRENCY, queue.length || 1));

  async function worker() {
    while (queue.length > 0) {
      const word = queue.shift();
      try {
        const translated = await vllTranslateWithGoogle(word, 'zh-CN', targetLang);
        if (translated.translatedText) {
          dictData[word] = {
            pinyin: translated.romanizedText || '',
            meaning: translated.translatedText,
            meaningLang: targetLang
          };
        }
      } catch (err) {
        console.warn('[VLL] Google lookup failed for word:', word, err.message);
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return dictData;
}

function vllResetGoogleLookupState(targetLang = CFG.defaults.targetLang) {
  _vllGoogleLookupState.inProgress = false;
  _vllGoogleLookupState.ready = false;
  _vllGoogleLookupState.targetLang = targetLang;
  _vllGoogleLookupState.cache = Object.create(null);
  _vllGoogleLookupState.loadedWords = new Set();
  _vllGoogleLookupState.lastError = '';
}

function vllGetLookupStatus() {
  return {
    inProgress: _vllGoogleLookupState.inProgress,
    googleReady: _vllGoogleLookupState.ready,
    targetLang: _vllGoogleLookupState.targetLang,
    lastError: _vllGoogleLookupState.lastError
  };
}

async function vllNotifyLookupStatusChanged() {
  const status = vllGetLookupStatus();
  try {
    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: MSG.LOOKUP_STATUS_CHANGED, status }).catch(() => {});
    }
  } catch {
    // Ignore tab query failures.
  }

  // Also broadcast to extension pages (side panel, popup)
  try {
    await chrome.runtime.sendMessage({ type: MSG.LOOKUP_STATUS_CHANGED, status });
  } catch {
    // No extension pages open.
  }
}

async function vllPreloadGoogleLookup(words, targetLang = CFG.defaults.targetLang) {
  const requestedWords = (words || []).filter(Boolean);
  if (requestedWords.length === 0) {
    if (!_vllGoogleLookupState.ready) {
      _vllGoogleLookupState.ready = true;
      await vllNotifyLookupStatusChanged();
    }
    return { ok: true, ...vllGetLookupStatus(), loadedCount: 0 };
  }

  // New language invalidates previous preload cache.
  if (_vllGoogleLookupState.targetLang !== targetLang) {
    vllResetGoogleLookupState(targetLang);
  }

  const missing = requestedWords.filter(w => !_vllGoogleLookupState.loadedWords.has(w));
  if (missing.length === 0) {
    if (!_vllGoogleLookupState.ready) {
      _vllGoogleLookupState.ready = true;
      await vllNotifyLookupStatusChanged();
    }
    return {
      ok: true,
      ...vllGetLookupStatus(),
      loadedCount: requestedWords.length
    };
  }

  _vllGoogleLookupState.inProgress = true;
  _vllGoogleLookupState.lastError = '';
  await vllNotifyLookupStatusChanged();

  try {
    const batch = await vllBatchLookupWithGoogle(missing, targetLang);
    for (const word of missing) {
      if (batch[word]) {
        _vllGoogleLookupState.cache[word] = batch[word];
      }
      _vllGoogleLookupState.loadedWords.add(word);
    }
    _vllGoogleLookupState.ready = true;
  } catch (err) {
    _vllGoogleLookupState.lastError = err.message || 'Erro desconhecido';
  } finally {
    _vllGoogleLookupState.inProgress = false;
    await vllNotifyLookupStatusChanged();
  }

  return {
    ok: true,
    ...vllGetLookupStatus(),
    loadedCount: requestedWords.length
  };
}

async function vllGetLookupDataForProvider(words, provider, targetLang = CFG.defaults.targetLang) {
  const safeWords = (words || []).filter(Boolean);
  const selectedProvider = provider || CFG.lookupProviders.DICTIONARY;

  if (selectedProvider === CFG.lookupProviders.GOOGLE) {
    // Non-blocking behavior: use whatever is already cached from Google,
    // then fall back to local dictionary for missing words while preload runs.
    const dictData = Object.create(null);
    const missingWords = [];

    for (const w of safeWords) {
      if (_vllGoogleLookupState.cache[w]) {
        dictData[w] = _vllGoogleLookupState.cache[w];
      } else {
        missingWords.push(w);
      }
    }

    if (missingWords.length > 0) {
      // Kick off (or continue) Google preload in background without blocking UI.
      vllPreloadGoogleLookup(safeWords, targetLang).catch(() => {});

      // Immediate fallback so subtitles render fast.
      await vllLoadDictionary();
      const fallback = vllBatchLookup(missingWords);
      for (const [word, data] of Object.entries(fallback)) {
        dictData[word] = { ...data, meaningLang: 'en' };
      }
    }

    return dictData;
  }

  await vllLoadDictionary();
  const dict = vllBatchLookup(safeWords);
  // Mark dictionary results as English
  for (const word in dict) {
    dict[word].meaningLang = 'en';
  }
  return dict;
}

async function vllBroadcastWordColorUpdate(tabId, word, color) {
  const payload = {
    type: MSG.WORD_COLOR_UPDATED,
    word,
    color
  };

  // Notify content script in the originating YouTube tab.
  if (Number.isInteger(tabId)) {
    chrome.tabs.sendMessage(tabId, payload).catch(() => {});
  }

  // Notify extension pages (side panel, popup, etc.).
  try {
    await chrome.runtime.sendMessage(payload);
  } catch {
    // No listeners currently open.
  }
}

async function vllBroadcastWordColorsBulk(colorMap) {
  const payload = {
    type: MSG.WORD_COLORS_BULK_UPDATED,
    colors: colorMap || {}
  };

  try {
    const ytTabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
    for (const tab of ytTabs) {
      chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
    }
  } catch {
    // Ignore tab query failures.
  }

  try {
    await chrome.runtime.sendMessage(payload);
  } catch {
    // No extension pages currently open.
  }
}

function vllRunSettingsMutation(task) {
  const run = _vllSettingsMutationQueue.then(() => task());
  _vllSettingsMutationQueue = run.catch(() => {});
  return run;
}

async function vllBroadcastSettingsChanged(settings) {
  const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, {
      type: MSG.SETTINGS_CHANGED,
      settings
    }).catch(() => {});
  }

  chrome.runtime.sendMessage({
    type: MSG.SETTINGS_CHANGED,
    settings
  }).catch(() => {});
}

async function vllPersistMergedSettings(partialSettings) {
  const existing = await chrome.storage.local.get([CFG.storageKeys.SETTINGS]);
  const merged = { ...(existing[CFG.storageKeys.SETTINGS] || {}), ...(partialSettings || {}) };
  await chrome.storage.local.set({ [CFG.storageKeys.SETTINGS]: merged });

  if (merged.targetLang && merged.targetLang !== _vllGoogleLookupState.targetLang) {
    vllResetGoogleLookupState(merged.targetLang);
    await vllNotifyLookupStatusChanged();
  }

  await vllBroadcastSettingsChanged(merged);
  return merged;
}

/* ── Startup ───────────────────────────────────────────────── */

// Load dictionary on install/startup
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[VLL] Extension installed/updated');
  await vllLoadDictionary();
});

// Also load when service worker wakes up
vllLoadDictionary().then(() => {
  console.log('[VLL] Service worker ready');
}).catch(err => {
  console.error('[VLL] Dictionary load error:', err);
});

/* ── Message Handler ───────────────────────────────────────── */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch(err => {
    console.error('[VLL] Message handler error:', err);
    sendResponse({ error: err.message });
  });
  return true; // Keep channel open for async response
});

async function handleMessage(msg, sender) {
  switch (msg.type) {

    /* ── Dictionary Operations ─────────────────────────────── */

    case MSG.BATCH_LOOKUP: {
      const targetLang = msg.targetLang || CFG.defaults.targetLang;
      const provider = msg.provider || CFG.lookupProviders.DICTIONARY;
      const dictData = await vllGetLookupDataForProvider(msg.words || [], provider, targetLang);

      // Also get saved colors from IndexedDB
      const colorData = await vllGetWordColors(msg.words || []);

      return { dictData, colorData, status: vllGetLookupStatus() };
    }

    case MSG.PRELOAD_GOOGLE_LOOKUP: {
      const targetLang = msg.targetLang || CFG.defaults.targetLang;
      const result = await vllPreloadGoogleLookup(msg.words || [], targetLang);
      return result;
    }

    case MSG.GET_LOOKUP_STATUS: {
      return { status: vllGetLookupStatus() };
    }

    case MSG.LOOKUP_WORD: {
      await vllLoadDictionary();
      const entry = vllLookupWord(msg.word);
      const saved = await vllGetWord(msg.word);
      return {
        dict: entry,
        saved: saved
      };
    }

    case MSG.PROCESS_LINE: {
      await vllLoadDictionary();
      const processed = vllProcessLine(msg.text);
      return { words: processed };
    }

    /* ── Database Operations ───────────────────────────────── */

    case MSG.SAVE_WORD: {
      const result = await vllSaveWord(msg.entry);
      await vllBroadcastWordColorUpdate(sender.tab?.id, msg.entry.word, msg.entry.color);
      return { ok: true, entry: result };
    }

    case MSG.UPDATE_COLOR: {
      const result = await vllUpdateColor(msg.word, msg.color);
      await vllBroadcastWordColorUpdate(sender.tab?.id, msg.word, msg.color);
      return { ok: true, entry: result };
    }

    case MSG.DELETE_WORD: {
      await vllDeleteWord(msg.word);
      await vllBroadcastWordColorUpdate(sender.tab?.id, msg.word, 'white');
      return { ok: true };
    }

    case MSG.GET_ALL_WORDS: {
      const words = await vllGetAllWords();
      return { words };
    }

    case MSG.GET_WORDS_BY_COLOR: {
      const words = await vllGetWordsByColor(msg.color);
      return { words };
    }

    /* ── Export ─────────────────────────────────────────────── */

    case MSG.EXPORT_CSV: {
      const allWords = await vllGetAllWords();
      const csvContent = vllGenerateCSV(allWords);
      // Return the CSV content — the popup will handle the download
      return { csv: csvContent, count: allWords.length };
    }

    /* ── Cross-Browser Data Export/Import ─────────────────── */

    case MSG.EXPORT_DATA: {
      const exportWords = await vllGetAllWords();
      const exportSettings = await chrome.storage.local.get([CFG.storageKeys.SETTINGS]);
      const exportPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        source: 'VLL — Video Language Learner',
        words: exportWords,
        settings: exportSettings[CFG.storageKeys.SETTINGS] || {}
      };
      return { data: JSON.stringify(exportPayload, null, 2), count: exportWords.length };
    }

    case MSG.IMPORT_DATA: {
      try {
        const importPayload = JSON.parse(msg.data);
        if (!importPayload || importPayload.source !== 'VLL — Video Language Learner') {
          return { ok: false, error: 'Arquivo inválido. Este não é um backup do VLL.' };
        }
        return await vllRunSettingsMutation(async () => {
          let importedCount = 0;
          const importedColorMap = {};

          // Import words
          if (Array.isArray(importPayload.words)) {
            const wordsToImport = importPayload.words.filter(word => word && word.word);
            const savedWords = await vllSaveWordsBatch(wordsToImport);
            importedCount = savedWords.length;

            for (const word of savedWords) {
              importedColorMap[word.word] = word.color || 'red';
            }
          }

          // Import settings (merge with existing)
          if (importPayload.settings && typeof importPayload.settings === 'object') {
            await vllPersistMergedSettings(importPayload.settings);
          }

          // Broadcast all imported colors in one message for better performance on large imports
          if (Object.keys(importedColorMap).length > 0) {
            await vllBroadcastWordColorsBulk(importedColorMap);
          }

          return { ok: true, importedCount };
        });
      } catch (err) {
        return { ok: false, error: 'Erro ao processar arquivo: ' + err.message };
      }
    }

    /* ── Settings ──────────────────────────────────────────── */

    case MSG.SAVE_SETTINGS: {
      await vllRunSettingsMutation(async () => {
        await vllPersistMergedSettings(msg.settings || {});
      });
      return { ok: true };
    }

    case MSG.GET_SETTINGS: {
      const result = await chrome.storage.local.get([CFG.storageKeys.SETTINGS]);
      return { settings: result[CFG.storageKeys.SETTINGS] || {} };
    }

    /* ── Translation ───────────────────────────────────────── */

    case MSG.TRANSLATE_TEXT: {
      try {
        const result = await vllTranslateWithGoogle(msg.text, msg.sourceLang || 'en', msg.targetLang || CFG.defaults.targetLang);
        return {
          translatedText: result.translatedText,
          romanizedText: result.romanizedText
        };
      } catch (err) {
        console.error('[VLL] Translation failed:', err);
        return { error: err.message };
      }
    }

    /* ── Side Panel ────────────────────────────────────────── */

    case MSG.OPEN_SIDEPANEL: {
      if (sender.tab) {
        chrome.sidePanel.setOptions({
          tabId: sender.tab.id,
          enabled: true,
          path: 'src/sidepanel.html'
        }).catch(() => {});
        await chrome.sidePanel.open({ tabId: sender.tab.id });
        _vllSidepanelOpenTabs.add(sender.tab.id);
      }
      return { ok: true };
    }

    case MSG.TOGGLE_SIDEPANEL: {
      if (!sender.tab) return { ok: false };

      const tabId = sender.tab.id;
      const isOpen = _vllSidepanelOpenTabs.has(tabId);

      if (isOpen) {
        await chrome.sidePanel.setOptions({ tabId, enabled: false });
        _vllSidepanelOpenTabs.delete(tabId);
        return { ok: true, open: false };
      }

      chrome.sidePanel.setOptions({
        tabId,
        enabled: true,
        path: 'src/sidepanel.html'
      }).catch(() => {});
      await chrome.sidePanel.open({ tabId });
      _vllSidepanelOpenTabs.add(tabId);
      return { ok: true, open: true };
    }

    case MSG.GET_SUBTITLES: {
      // Forward to the content script of the active tab
      const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*', active: true, currentWindow: true });
      if (tabs.length > 0) {
        try {
          const response = await chrome.tabs.sendMessage(tabs[0].id, { type: MSG.GET_SUBTITLES });
          return response;
        } catch {
          return { subtitles: [], videoId: '' };
        }
      }
      return { subtitles: [], videoId: '' };
    }

    case MSG.SEEK_TO_SUBTITLE: {
      const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*', active: true, currentWindow: true });
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: MSG.SEEK_TO_SUBTITLE,
          index: msg.index
        }).catch(() => {});
      }
      return { ok: true };
    }

    // Forward subtitle change events to side panel
    case MSG.SUBTITLE_CHANGED:
    case MSG.SUBTITLES_READY: {
      // These are forwarded automatically via runtime messaging
      return { ok: true };
    }

    /* ── Stats ─────────────────────────────────────────────── */

    case MSG.GET_STATS: {
      const all = await vllGetAllWords();
      const stats = {
        total: all.length,
        red: all.filter(w => w.color === 'red').length,
        orange: all.filter(w => w.color === 'orange').length,
        green: all.filter(w => w.color === 'green').length,
        white: all.filter(w => w.color === 'white').length
      };
      return { stats };
    }

    case MSG.GET_PRONUNCIATION: {
      const text = msg.text;
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=zh-CN&client=tw-ob`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      return { dataUrl: `data:audio/mpeg;base64,${base64}` };
    }

    default:
      console.warn('[VLL] Unknown message type:', msg.type);
      return { error: 'Unknown message type' };
  }
}

/* ── Side Panel Context ────────────────────────────────────── */

// Enable side panel for YouTube tabs
chrome.sidePanel.setOptions({
  enabled: true
}).catch(() => {});

// Set side panel behavior — open on action click
chrome.sidePanel.setPanelBehavior({
  openPanelOnActionClick: false
}).catch(() => {});

chrome.tabs.onRemoved.addListener((tabId) => {
  _vllSidepanelOpenTabs.delete(tabId);
});

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
