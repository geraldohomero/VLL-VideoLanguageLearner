/* eslint-disable no-undef */
(function initVLLConfigShared(root, factory) {
  const api = factory();

  root.VLL_ConfigShared = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createVLLConfigShared() {
  'use strict';

  const lookupProviders = {
    DICTIONARY: 'dictionary',
    GOOGLE: 'google'
  };

  const storageKeys = {
    SETTINGS: 'vllSettings',
    CAPTION_MODE: 'vll_caption_mode'
  };

  const defaults = {
    targetLang: 'pt',
    lookupProvider: lookupProviders.DICTIONARY
  };

  return {
    lookupProviders,
    storageKeys,
    defaults
  };
});
