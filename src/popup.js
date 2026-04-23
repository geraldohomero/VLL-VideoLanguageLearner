/**
 * VLL Popup Script — Minimal launcher
 */

/* global chrome, VLL_MessagesShared */

(() => {
  'use strict';

  const messagesShared = (typeof VLL_MessagesShared !== 'undefined' && VLL_MessagesShared)
    ? VLL_MessagesShared
    : null;

  if (!messagesShared || !messagesShared.types) {
    throw new Error('[VLL] Missing VLL_MessagesShared. Ensure messages.shared.js is loaded first.');
  }

  const MSG = messagesShared.types;
  const $id = (id) => document.getElementById(id);

  let subtitleStatusPollTimer = null;

  function applySubtitleStatus(status) {
    const statusEl = $id('popup-subtitle-status');
    if (!statusEl) return;

    const mode = status?.mode || 'idle';
    const message = status?.message || 'Abra um video no YouTube para iniciar';
    statusEl.textContent = message;
    statusEl.setAttribute('data-mode', mode);
  }

  async function loadSubtitleStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_SUBTITLES });
      applySubtitleStatus(response?.status || { mode: 'idle', message: 'Abra um video no YouTube para iniciar' });
    } catch (err) {
      console.error('[VLL Popup] Failed to load subtitle status:', err);
      applySubtitleStatus({ mode: 'error', message: 'Nao foi possivel consultar o status das legendas' });
    }
  }

  async function loadEnabledSetting() {
    const toggle = $id('toggle-enabled');
    if (!toggle) return;

    try {
      const response = await chrome.runtime.sendMessage({ type: MSG.GET_SETTINGS });
      const settings = response?.settings || {};
      if (settings.enabled !== undefined) {
        toggle.checked = settings.enabled;
      }
    } catch (err) {
      console.error('[VLL Popup] Failed to load settings:', err);
    }
  }

  async function saveEnabledSetting() {
    const toggle = $id('toggle-enabled');
    if (!toggle) return;

    try {
      await chrome.runtime.sendMessage({
        type: MSG.SAVE_SETTINGS,
        settings: { enabled: toggle.checked }
      });
    } catch (err) {
      console.error('[VLL Popup] Failed to save settings:', err);
    }
  }

  function bindEvents() {
    const toggle = $id('toggle-enabled');
    const sidepanelButton = $id('btn-sidepanel');

    if (toggle) {
      toggle.addEventListener('change', saveEnabledSetting);
    }

    if (sidepanelButton) {
      sidepanelButton.addEventListener('click', async () => {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.id !== undefined) {
            await chrome.sidePanel.open({ tabId: tab.id });
          }
        } catch (err) {
          console.error('[VLL Popup] Failed to open side panel:', err);
        }
      });
    }
  }

  function bindMessageListener() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === MSG.SUBTITLE_STATUS_CHANGED && msg.status) {
        applySubtitleStatus(msg.status);
      } else if (msg.type === MSG.SETTINGS_CHANGED && msg.settings) {
        const toggle = $id('toggle-enabled');
        if (toggle && msg.settings.enabled !== undefined) {
          toggle.checked = msg.settings.enabled;
        }
      }
    });
  }

  async function init() {
    bindEvents();
    bindMessageListener();
    await loadEnabledSetting();
    await loadSubtitleStatus();

    subtitleStatusPollTimer = setInterval(loadSubtitleStatus, 2500);
    window.addEventListener('beforeunload', () => {
      if (subtitleStatusPollTimer) clearInterval(subtitleStatusPollTimer);
    });
  }

  init();
})();
