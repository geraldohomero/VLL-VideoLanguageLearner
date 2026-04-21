/**
 * VLL Sidepanel Settings Module
 */

(function initVLLSPSettings(root, factory) {
  root.VLL_SP_Settings = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createVLLSPSettings() {
  'use strict';

  let els = {};

  function init(inputEls) {
    els = inputEls;
  }

  function apply(settings, status) {
    if (settings.enabled !== undefined && els.enabled) els.enabled.checked = settings.enabled;
    if (settings.targetLang && els.targetLang) els.targetLang.value = settings.targetLang;
    if (settings.lookupProvider && els.lookupProvider) els.lookupProvider.value = settings.lookupProvider;
    if (settings.showPinyin !== undefined && els.showPinyin) els.showPinyin.checked = settings.showPinyin;
    if (settings.showTranslation !== undefined && els.showTranslation) els.showTranslation.checked = settings.showTranslation;
    if (settings.autoPause !== undefined && els.autoPause) els.autoPause.checked = settings.autoPause;

    if (status) applyStatus(status);
  }

  function applyStatus(status) {
    if (!els.lookupLoadingSetting || !els.lookupProviderSetting) return;

    if (status.googleReady) {
      els.lookupLoadingSetting.style.display = 'none';
      els.lookupProviderSetting.style.display = 'block';
      return;
    }

    els.lookupProviderSetting.style.display = 'none';
    els.lookupLoadingSetting.style.display = 'block';

    if (els.lookupLoadingNote) {
      if (status.inProgress) {
        els.lookupLoadingNote.textContent = 'Google carregando em segundo plano... usando dicionário local por enquanto.';
      } else if (status.lastError) {
        els.lookupLoadingNote.textContent = `Google indisponível no momento (${status.lastError}). Mantendo dicionário local.`;
      } else {
        els.lookupLoadingNote.textContent = 'Preparando Google em segundo plano... usando dicionário local por enquanto.';
      }
    }
  }

  function getValues() {
    return {
      enabled: els.enabled ? els.enabled.checked : true,
      targetLang: els.targetLang ? els.targetLang.value : 'pt',
      lookupProvider: els.lookupProvider ? els.lookupProvider.value : 'dictionary',
      showPinyin: els.showPinyin ? els.showPinyin.checked : true,
      showTranslation: els.showTranslation ? els.showTranslation.checked : true,
      autoPause: els.autoPause ? els.autoPause.checked : false
    };
  }

  return { init, apply, applyStatus, getValues };
});
