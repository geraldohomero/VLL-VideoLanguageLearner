/* eslint-disable no-undef */
(function initVLLMessagesShared(root, factory) {
  const api = factory();

  root.VLL_MessagesShared = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createVLLMessagesShared() {
  'use strict';

  const types = {
    BATCH_LOOKUP: 'BATCH_LOOKUP',
    PRELOAD_GOOGLE_LOOKUP: 'PRELOAD_GOOGLE_LOOKUP',
    GET_LOOKUP_STATUS: 'GET_LOOKUP_STATUS',
    LOOKUP_WORD: 'LOOKUP_WORD',
    PROCESS_LINE: 'PROCESS_LINE',

    SAVE_WORD: 'SAVE_WORD',
    UPDATE_COLOR: 'UPDATE_COLOR',
    DELETE_WORD: 'DELETE_WORD',
    GET_ALL_WORDS: 'GET_ALL_WORDS',
    GET_WORDS_BY_COLOR: 'GET_WORDS_BY_COLOR',

    EXPORT_CSV: 'EXPORT_CSV',
    EXPORT_DATA: 'EXPORT_DATA',
    IMPORT_DATA: 'IMPORT_DATA',

    SAVE_SETTINGS: 'SAVE_SETTINGS',
    GET_SETTINGS: 'GET_SETTINGS',

    TRANSLATE_TEXT: 'TRANSLATE_TEXT',

    OPEN_SIDEPANEL: 'OPEN_SIDEPANEL',
    TOGGLE_SIDEPANEL: 'TOGGLE_SIDEPANEL',
    CLOSE_SIDEPANEL: 'CLOSE_SIDEPANEL',

    GET_SUBTITLES: 'GET_SUBTITLES',
    GET_CURRENT_INDEX: 'GET_CURRENT_INDEX',
    SEEK_TO_SUBTITLE: 'SEEK_TO_SUBTITLE',
    SUBTITLE_CHANGED: 'SUBTITLE_CHANGED',
    SUBTITLES_READY: 'SUBTITLES_READY',
    SUBTITLE_STATUS_CHANGED: 'SUBTITLE_STATUS_CHANGED',

    GET_STATS: 'GET_STATS',

    LOOKUP_STATUS_CHANGED: 'LOOKUP_STATUS_CHANGED',
    SETTINGS_CHANGED: 'SETTINGS_CHANGED',
    WORD_COLOR_UPDATED: 'WORD_COLOR_UPDATED',
    WORD_COLORS_BULK_UPDATED: 'WORD_COLORS_BULK_UPDATED',
    WORD_MEANING_UPDATED: 'WORD_MEANING_UPDATED',

    UPDATE_MEANING: 'UPDATE_MEANING',
    GET_PRONUNCIATION: 'GET_PRONUNCIATION'
  };

  function validate(msg) {
    if (!msg || typeof msg.type !== 'string') return false;
    
    switch (msg.type) {
      case types.BATCH_LOOKUP:
      case types.PRELOAD_GOOGLE_LOOKUP:
        return Array.isArray(msg.words);
      case types.SAVE_WORD:
        return !!(msg.entry && typeof msg.entry.word === 'string');
      case types.UPDATE_COLOR:
        return typeof msg.word === 'string' && typeof msg.color === 'string';
      case types.DELETE_WORD:
        return typeof msg.word === 'string';
      case types.TRANSLATE_TEXT:
        return typeof msg.text === 'string';
      case types.UPDATE_MEANING:
        return typeof msg.word === 'string' && typeof msg.customMeaning === 'string';
      case types.SEEK_TO_SUBTITLE:
        return typeof msg.index === 'number';
      case types.SUBTITLE_STATUS_CHANGED:
        return !!(msg.status && typeof msg.status.mode === 'string');
      default:
        return true; // Unknown types or types without payload requirements
    }
  }

  return { types, validate };
});
