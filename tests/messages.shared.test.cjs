const test = require('node:test');
const assert = require('node:assert/strict');

const messagesShared = require('../src/messages.shared.js');

test('messages.shared exports a stable message type map', () => {
  assert.equal(typeof messagesShared, 'object');
  assert.equal(typeof messagesShared.types, 'object');

  const requiredTypes = [
    'BATCH_LOOKUP',
    'PRELOAD_GOOGLE_LOOKUP',
    'GET_LOOKUP_STATUS',
    'SAVE_SETTINGS',
    'GET_SETTINGS',
    'TRANSLATE_TEXT',
    'GET_SUBTITLES',
    'SEEK_TO_SUBTITLE',
    'SUBTITLES_READY',
    'LOOKUP_STATUS_CHANGED',
    'SETTINGS_CHANGED',
    'WORD_COLOR_UPDATED',
    'WORD_COLORS_BULK_UPDATED'
  ];

  for (const key of requiredTypes) {
    assert.equal(messagesShared.types[key], key);
  }
});
