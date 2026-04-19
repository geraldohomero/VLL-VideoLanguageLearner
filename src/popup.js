/**
 * VLL Popup Script — Settings, stats, and export
 */

/* global chrome */

(() => {
  'use strict';

  const $id = (id) => document.getElementById(id);
  let lookupStatusPollTimer = null;

  function getLookupProviderValue() {
    const select = $id('lookup-provider-select');
    if (!select) return 'dictionary';
    return select.value || 'dictionary';
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
      const response = await chrome.runtime.sendMessage({ type: 'GET_LOOKUP_STATUS' });
      applyLookupStatus(response.status || {});
    } catch (err) {
      console.error('[VLL Popup] Failed to load lookup status:', err);
      applyLookupStatus({});
    }
  }

  /* ── Load Stats ──────────────────────────────────────────── */

  async function loadStats() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
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
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
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
        type: 'SAVE_SETTINGS',
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
    if (msg.type === 'LOOKUP_STATUS_CHANGED' && msg.status) {
      applyLookupStatus(msg.status);
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
      const response = await chrome.runtime.sendMessage({ type: 'EXPORT_CSV' });

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
      const response = await chrome.runtime.sendMessage({ type: 'GET_ALL_WORDS' });
      const listEl = $id('popup-vocab-list');
      
      if (!response.words || response.words.length === 0) {
        listEl.innerHTML = '<div class="popup-vocab-empty">Nenhuma palavra salva ainda.</div>';
        return;
      }

      // Sort newest first
      const words = response.words.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
      
      listEl.innerHTML = '';
      
      for (const w of words) {
        if (w.color === 'white' || !w.color) continue;
        
        const item = document.createElement('div');
        item.className = 'popup-vocab-item';
        
        const meaning = w.meaningPt || w.meaning || '(sem definição)';
        
        item.innerHTML = `
          <div class="popup-vocab-color" data-color="${w.color}"></div>
          <div class="popup-vocab-hanzi" title="${w.word}">${w.word}</div>
          <div class="popup-vocab-pinyin" title="${w.pinyin}">${w.pinyin}</div>
          <div class="popup-vocab-meaning" title="${meaning}">${meaning}</div>
        `;
        listEl.appendChild(item);
      }
      
      if (listEl.children.length === 0) {
         listEl.innerHTML = '<div class="popup-vocab-empty">Nenhuma palavra salva ainda.</div>';
      }
    } catch (err) {
      console.error('[VLL Popup] Failed to load vocab list:', err);
      $id('popup-vocab-list').innerHTML = '<div class="popup-vocab-empty">Erro ao carregar banco de dados.</div>';
    }
  }

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
