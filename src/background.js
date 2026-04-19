/**
 * VLL Service Worker (Background Script)
 * Central hub: loads dictionary, handles IndexedDB, routes messages.
 *
 * Manifest V3 — no ES modules, uses importScripts().
 */

importScripts('database.js', 'dictionary.js', 'export.js');

const VLL_GOOGLE_LOOKUP_CONCURRENCY = 6;
const VLL_LOOKUP_PROVIDER_DICTIONARY = 'dictionary';
const VLL_LOOKUP_PROVIDER_GOOGLE = 'google';
const _vllSidepanelOpenTabs = new Set();

const _vllGoogleLookupState = {
  inProgress: false,
  ready: false,
  targetLang: 'pt',
  cache: Object.create(null),
  loadedWords: new Set(),
  lastError: ''
};

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

async function vllTranslateWithGoogle(text, sourceLang = 'auto', targetLang = 'pt') {
  if (!text || !text.trim()) {
    return { translatedText: '', romanizedText: '' };
  }

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&dt=rm&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Translate HTTP ${res.status}`);

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

function vllResetGoogleLookupState(targetLang = 'pt') {
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
    await chrome.runtime.sendMessage({ type: 'LOOKUP_STATUS_CHANGED', status });
  } catch {
    // No listeners (normal when popup/content is closed).
  }

  try {
    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'LOOKUP_STATUS_CHANGED', status }).catch(() => {});
    }
  } catch {
    // Ignore tab query/send failures.
  }
}

async function vllPreloadGoogleLookup(words, targetLang = 'pt') {
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

async function vllGetLookupDataForProvider(words, provider, targetLang = 'pt') {
  const safeWords = (words || []).filter(Boolean);
  const selectedProvider = provider || VLL_LOOKUP_PROVIDER_DICTIONARY;

  if (selectedProvider === VLL_LOOKUP_PROVIDER_GOOGLE) {
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
        dictData[word] = data;
      }
    }

    return dictData;
  }

  await vllLoadDictionary();
  return vllBatchLookup(safeWords);
}

async function vllBroadcastWordColorUpdate(tabId, word, color) {
  const payload = {
    type: 'WORD_COLOR_UPDATED',
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

    case 'BATCH_LOOKUP': {
      const targetLang = msg.targetLang || 'pt';
      const provider = msg.provider || VLL_LOOKUP_PROVIDER_DICTIONARY;
      const dictData = await vllGetLookupDataForProvider(msg.words || [], provider, targetLang);

      // Also get saved colors from IndexedDB
      const colorData = await vllGetWordColors(msg.words || []);

      return { dictData, colorData, status: vllGetLookupStatus() };
    }

    case 'PRELOAD_GOOGLE_LOOKUP': {
      const targetLang = msg.targetLang || 'pt';
      const result = await vllPreloadGoogleLookup(msg.words || [], targetLang);
      return result;
    }

    case 'GET_LOOKUP_STATUS': {
      return { status: vllGetLookupStatus() };
    }

    case 'LOOKUP_WORD': {
      await vllLoadDictionary();
      const entry = vllLookupWord(msg.word);
      const saved = await vllGetWord(msg.word);
      return {
        dict: entry,
        saved: saved
      };
    }

    case 'PROCESS_LINE': {
      await vllLoadDictionary();
      const processed = vllProcessLine(msg.text);
      return { words: processed };
    }

    /* ── Database Operations ───────────────────────────────── */

    case 'SAVE_WORD': {
      const result = await vllSaveWord(msg.entry);
      await vllBroadcastWordColorUpdate(sender.tab?.id, msg.entry.word, msg.entry.color);
      return { ok: true, entry: result };
    }

    case 'UPDATE_COLOR': {
      const result = await vllUpdateColor(msg.word, msg.color);
      await vllBroadcastWordColorUpdate(sender.tab?.id, msg.word, msg.color);
      return { ok: true, entry: result };
    }

    case 'DELETE_WORD': {
      await vllDeleteWord(msg.word);
      await vllBroadcastWordColorUpdate(sender.tab?.id, msg.word, 'white');
      return { ok: true };
    }

    case 'GET_ALL_WORDS': {
      const words = await vllGetAllWords();
      return { words };
    }

    case 'GET_WORDS_BY_COLOR': {
      const words = await vllGetWordsByColor(msg.color);
      return { words };
    }

    /* ── Export ─────────────────────────────────────────────── */

    case 'EXPORT_CSV': {
      const allWords = await vllGetAllWords();
      const csvContent = vllGenerateCSV(allWords);
      // Return the CSV content — the popup will handle the download
      return { csv: csvContent, count: allWords.length };
    }

    /* ── Cross-Browser Data Export/Import ─────────────────── */

    case 'EXPORT_DATA': {
      const exportWords = await vllGetAllWords();
      const exportSettings = await chrome.storage.local.get(['vllSettings']);
      const exportPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        source: 'VLL — Video Language Learner',
        words: exportWords,
        settings: exportSettings.vllSettings || {}
      };
      return { data: JSON.stringify(exportPayload, null, 2), count: exportWords.length };
    }

    case 'IMPORT_DATA': {
      try {
        const importPayload = JSON.parse(msg.data);
        if (!importPayload || importPayload.source !== 'VLL — Video Language Learner') {
          return { ok: false, error: 'Arquivo inválido. Este não é um backup do VLL.' };
        }

        let importedCount = 0;
        const importedWords = [];

        // Import words
        if (Array.isArray(importPayload.words)) {
          for (const word of importPayload.words) {
            if (word && word.word) {
              await vllSaveWord(word);
              importedWords.push({ word: word.word, color: word.color || 'red' });
              importedCount++;
            }
          }
        }

        // Import settings (merge with existing)
        if (importPayload.settings && typeof importPayload.settings === 'object') {
          const existing = await chrome.storage.local.get(['vllSettings']);
          const merged = { ...(existing.vllSettings || {}), ...importPayload.settings };
          await chrome.storage.local.set({ vllSettings: merged });

          // Broadcast settings change to all YouTube tabs
          const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
          for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'SETTINGS_CHANGED',
              settings: merged
            }).catch(() => {});
          }
        }

        // Broadcast color updates for all imported words to all tabs and extension pages
        if (importedWords.length > 0) {
          const ytTabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });

          for (const { word, color } of importedWords) {
            const payload = { type: 'WORD_COLOR_UPDATED', word, color };

            // Notify all YouTube content scripts
            for (const tab of ytTabs) {
              chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
            }

            // Notify extension pages (popup, side panel)
            chrome.runtime.sendMessage(payload).catch(() => {});
          }
        }

        return { ok: true, importedCount };
      } catch (err) {
        return { ok: false, error: 'Erro ao processar arquivo: ' + err.message };
      }
    }

    /* ── Settings ──────────────────────────────────────────── */

    case 'SAVE_SETTINGS': {
      const existing = await chrome.storage.local.get(['vllSettings']);
      const merged = { ...(existing.vllSettings || {}), ...(msg.settings || {}) };
      await chrome.storage.local.set({ vllSettings: merged });

      if (msg.settings && msg.settings.targetLang && msg.settings.targetLang !== _vllGoogleLookupState.targetLang) {
        vllResetGoogleLookupState(msg.settings.targetLang);
        await vllNotifyLookupStatusChanged();
      }

      // Notify active YouTube tab
      const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*', active: true });
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'SETTINGS_CHANGED',
          settings: merged
        }).catch(() => {});
      }
      return { ok: true };
    }

    case 'GET_SETTINGS': {
      const result = await chrome.storage.local.get(['vllSettings']);
      return { settings: result.vllSettings || {} };
    }

    /* ── Translation ───────────────────────────────────────── */

    case 'TRANSLATE_TEXT': {
      try {
        const result = await vllTranslateWithGoogle(msg.text, msg.sourceLang || 'en', msg.targetLang || 'pt');
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

    case 'OPEN_SIDEPANEL': {
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

    case 'TOGGLE_SIDEPANEL': {
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

    case 'GET_SUBTITLES': {
      // Forward to the content script of the active tab
      const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*', active: true, currentWindow: true });
      if (tabs.length > 0) {
        try {
          const response = await chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_SUBTITLES' });
          return response;
        } catch {
          return { subtitles: [], videoId: '' };
        }
      }
      return { subtitles: [], videoId: '' };
    }

    case 'SEEK_TO_SUBTITLE': {
      const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*', active: true, currentWindow: true });
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SEEK_TO_SUBTITLE',
          index: msg.index
        }).catch(() => {});
      }
      return { ok: true };
    }

    // Forward subtitle change events to side panel
    case 'SUBTITLE_CHANGED':
    case 'SUBTITLES_READY': {
      // These are forwarded automatically via runtime messaging
      return { ok: true };
    }

    /* ── Stats ─────────────────────────────────────────────── */

    case 'GET_STATS': {
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
