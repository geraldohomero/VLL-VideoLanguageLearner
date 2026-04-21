/**
 * VLL Popup Script — Settings, stats, and export
 */

/* global chrome, VLL_MessagesShared, VLL_ConfigShared */

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

  const $id = (id) => document.getElementById(id);
  let lookupStatusPollTimer = null;

  function getLookupProviderValue() {
    const select = $id('lookup-provider-select');
    if (!select) return CFG.lookupProviders.DICTIONARY;
    return select.value || CFG.lookupProviders.DICTIONARY;
  }

  function applyLookupStatus(status) {
    const loadingSetting = $id('lookup-loading-setting');
    const loadingNote = $id('lookup-loading-note');
    const providerSetting = $id('lookup-provider-setting');

    if (!loadingSetting || !providerSetting) return;

    if (status && status.googleReady) {
      loadingSetting.style.display = 'none';
      providerSetting.style.display = 'block';
      return;
    }

    providerSetting.style.display = 'none';
    loadingSetting.style.display = 'block';

    if (loadingNote) {
      if (status && status.inProgress) {
        loadingNote.textContent = 'Google carregando em segundo plano... usando dicionário local por enquanto.';
      } else if (status && status.lastError) {
        loadingNote.textContent = `Google indisponível no momento (${status.lastError}). Mantendo dicionário local.`;
      } else {
        loadingNote.textContent = 'Preparando Google em segundo plano... usando dicionário local por enquanto.';
      }
    }
  }

  async function loadLookupStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_LOOKUP_STATUS });
      applyLookupStatus(response.status || {});
    } catch (err) {
      console.error('[VLL Popup] Failed to load lookup status:', err);
      applyLookupStatus({});
    }
  }

  /* ── Load Stats ──────────────────────────────────────────── */

  async function loadStats() {
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_STATS });
      const stats = response.stats || {};
      $id('stat-total').textContent = stats.total || 0;
      $id('stat-red').textContent = stats.red || 0;
      $id('stat-orange').textContent = stats.orange || 0;
      $id('stat-green').textContent = stats.green || 0;
    } catch (err) {
      console.error('[VLL Popup] Failed to load stats:', err);
    }
  }

  /* ── Load Settings ───────────────────────────────────────── */

  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_SETTINGS });
      const settings = response.settings || {};

      if (settings.enabled !== undefined) {
        $id('toggle-enabled').checked = settings.enabled;
      }
      if (settings.targetLang) {
        $id('lang-select').value = settings.targetLang;
      }
      if (settings.lookupProvider) {
        $id('lookup-provider-select').value = settings.lookupProvider;
      }
      if (settings.showPinyin !== undefined) {
        $id('toggle-pinyin').checked = settings.showPinyin;
      }
      if (settings.showTranslation !== undefined) {
        $id('toggle-translation').checked = settings.showTranslation;
      }
      if (settings.autoPause !== undefined) {
        $id('toggle-autopause').checked = settings.autoPause;
      }
    } catch (err) {
      console.error('[VLL Popup] Failed to load settings:', err);
    }
  }

  /* ── Save Settings ───────────────────────────────────────── */

  async function saveSettings() {
    const settings = {
      enabled: $id('toggle-enabled').checked,
      targetLang: $id('lang-select').value,
      lookupProvider: getLookupProviderValue(),
      showPinyin: $id('toggle-pinyin').checked,
      showTranslation: $id('toggle-translation').checked,
      autoPause: $id('toggle-autopause').checked
    };

    try {
      await chrome.runtime.sendMessage({
        type: MSG.SAVE_SETTINGS,
        settings
      });
    } catch (err) {
      console.error('[VLL Popup] Failed to save settings:', err);
    }
  }

  // Auto-save on changes
  $id('toggle-enabled').addEventListener('change', saveSettings);
  $id('lang-select').addEventListener('change', saveSettings);
  $id('lookup-provider-select').addEventListener('change', saveSettings);
  $id('toggle-pinyin').addEventListener('change', saveSettings);
  $id('toggle-translation').addEventListener('change', saveSettings);
  $id('toggle-autopause').addEventListener('change', saveSettings);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === MSG.LOOKUP_STATUS_CHANGED && msg.status) {
      applyLookupStatus(msg.status);
    } else if (msg.type === MSG.SETTINGS_CHANGED && msg.settings) {
      const settings = msg.settings;
      if (settings.enabled !== undefined) $id('toggle-enabled').checked = settings.enabled;
      if (settings.targetLang) $id('lang-select').value = settings.targetLang;
      if (settings.lookupProvider) $id('lookup-provider-select').value = settings.lookupProvider;
      if (settings.showPinyin !== undefined) $id('toggle-pinyin').checked = settings.showPinyin;
      if (settings.showTranslation !== undefined) $id('toggle-translation').checked = settings.showTranslation;
      if (settings.autoPause !== undefined) $id('toggle-autopause').checked = settings.autoPause;
    } else if (msg.type === MSG.WORD_COLORS_BULK_UPDATED) {
      loadStats();
      loadVocabList();
    } else if (msg.type === MSG.WORD_COLOR_UPDATED) {
      loadStats();
      loadVocabList();
    }
  });

  /* ── Open Side Panel ─────────────────────────────────────── */

  $id('btn-sidepanel').addEventListener('click', async () => {
    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await chrome.sidePanel.open({ tabId: tab.id });
      }
    } catch (err) {
      console.error('[VLL Popup] Failed to open side panel:', err);
    }
  });

  /* ── Export to Anki ──────────────────────────────────────── */

  $id('btn-export').addEventListener('click', async () => {
    const exportInfo = $id('export-info');

    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.EXPORT_CSV });

      if (response.count === 0) {
        exportInfo.textContent = 'Nenhuma palavra para exportar.';
        exportInfo.style.color = '#ffaa33';
        exportInfo.style.display = 'block';
        return;
      }

      // Create and download the file
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

      setTimeout(() => { exportInfo.style.display = 'none'; }, 3000);
    } catch (err) {
      exportInfo.textContent = '❌ Erro ao exportar.';
      exportInfo.style.color = '#ff4466';
      exportInfo.style.display = 'block';
      console.error('[VLL Popup] Export error:', err);
    }
  });

  /* ── Load Vocabulary ─────────────────────────────────────── */

  async function loadVocabList() {
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_ALL_WORDS });
      const listEl = $id('popup-vocab-list');
      
      if (!response.words || response.words.length === 0) {
        listEl.textContent = '';
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'popup-vocab-empty';
        emptyMsg.textContent = 'Nenhuma palavra salva ainda.';
        listEl.appendChild(emptyMsg);
        return;
      }

      // Sort newest first
      const words = response.words.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
      
      listEl.textContent = '';
      
      for (const w of words) {
        if (w.color === 'white' || !w.color) continue;
        
        const item = document.createElement('div');
        item.className = 'popup-vocab-item';
        
        const colorDot = document.createElement('div');
        colorDot.className = 'popup-vocab-color';
        colorDot.setAttribute('data-color', w.color);
        
        const hanziEl = document.createElement('div');
        hanziEl.className = 'popup-vocab-hanzi';
        hanziEl.textContent = w.word;
        hanziEl.title = w.word;
        
        const pinyinEl = document.createElement('div');
        pinyinEl.className = 'popup-vocab-pinyin';
        pinyinEl.textContent = w.pinyin || '';
        pinyinEl.title = w.pinyin || '';
        
        const meaning = w.meaningPt || w.meaning || '(sem definição)';
        const meaningEl = document.createElement('div');
        meaningEl.className = 'popup-vocab-meaning';
        meaningEl.textContent = meaning;
        meaningEl.title = meaning;
        
        item.appendChild(colorDot);
        item.appendChild(hanziEl);
        item.appendChild(pinyinEl);
        item.appendChild(meaningEl);
        
        listEl.appendChild(item);
      }
      
      if (listEl.children.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'popup-vocab-empty';
        emptyMsg.textContent = 'Nenhuma palavra salva ainda.';
        listEl.appendChild(emptyMsg);
      }
    } catch (err) {
      console.error('[VLL Popup] Failed to load vocab list:', err);
      const listEl = $id('popup-vocab-list');
      listEl.textContent = '';
      const errorMsg = document.createElement('div');
      errorMsg.className = 'popup-vocab-empty';
      errorMsg.textContent = 'Erro ao carregar banco de dados.';
      listEl.appendChild(errorMsg);
    }
  }

  /* ── Cross-Browser Data Export ───────────────────────────── */

  $id('btn-data-export').addEventListener('click', async () => {
    const transferInfo = $id('data-transfer-info');

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
      console.error('[VLL Popup] Data export error:', err);
    }
  });

  /* ── Cross-Browser Data Import ───────────────────────────── */

  $id('btn-data-import').addEventListener('click', () => {
    $id('import-file-input').click();
  });

  $id('import-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const transferInfo = $id('data-transfer-info');

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

      // Refresh data
      loadStats();
      loadVocabList();

      setTimeout(() => { transferInfo.style.display = 'none'; }, 3000);
    } catch (err) {
      transferInfo.textContent = '❌ Erro ao importar dados.';
      transferInfo.style.color = '#ff4466';
      transferInfo.style.display = 'block';
      console.error('[VLL Popup] Data import error:', err);
    }

    // Reset file input so the same file can be re-selected
    e.target.value = '';
  });

  /* ── Init ────────────────────────────────────────────────── */

  loadStats();
  loadSettings();
  loadLookupStatus();
  loadVocabList();

  // Keep popup status responsive while open.
  lookupStatusPollTimer = setInterval(loadLookupStatus, 2000);
  window.addEventListener('beforeunload', () => {
    if (lookupStatusPollTimer) clearInterval(lookupStatusPollTimer);
  });
})();
