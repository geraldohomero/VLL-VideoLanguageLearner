/**
 * VLL Service Worker (Background Script)
 * Central hub: loads dictionary, handles IndexedDB, routes messages.
 *
 * Manifest V3 — no ES modules, uses importScripts().
 */

importScripts('database.js', 'dictionary.js', 'export.js');

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
      // Ensure dictionary is loaded
      await vllLoadDictionary();

      // Look up each word in dictionary
      const dictData = vllBatchLookup(msg.words || []);

      // Also get saved colors from IndexedDB
      const colorData = await vllGetWordColors(msg.words || []);

      return { dictData, colorData };
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
      // Notify content script of the color update
      if (sender.tab) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'WORD_COLOR_UPDATED',
          word: msg.entry.word,
          color: msg.entry.color
        }).catch(() => {});
      }
      return { ok: true, entry: result };
    }

    case 'UPDATE_COLOR': {
      const result = await vllUpdateColor(msg.word, msg.color);
      // Notify content script
      if (sender.tab) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'WORD_COLOR_UPDATED',
          word: msg.word,
          color: msg.color
        }).catch(() => {});
      }
      return { ok: true, entry: result };
    }

    case 'DELETE_WORD': {
      await vllDeleteWord(msg.word);
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

    /* ── Settings ──────────────────────────────────────────── */

    case 'SAVE_SETTINGS': {
      await chrome.storage.local.set({ vllSettings: msg.settings });
      // Notify active YouTube tab
      const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*', active: true });
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'SETTINGS_CHANGED',
          settings: msg.settings
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
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${msg.targetLang || 'pt'}&dt=t&q=${encodeURIComponent(msg.text)}`;
        const res = await fetch(url);
        const data = await res.json();
        const translatedText = data[0].map(x => x[0]).join('');
        return { translatedText };
      } catch (err) {
        console.error('[VLL] Translation failed:', err);
        return { error: err.message };
      }
    }

    /* ── Side Panel ────────────────────────────────────────── */

    case 'OPEN_SIDEPANEL': {
      if (sender.tab) {
        await chrome.sidePanel.open({ tabId: sender.tab.id });
      }
      return { ok: true };
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
