/**
 * VLL Message Validation Tests
 */

const test = require('node:test');
const assert = require('node:assert');
const VLL_MessagesShared = require('../src/messages.shared.js');

test('Message Validation — types and structure', (t) => {
  const MSG = VLL_MessagesShared.types;

  test('should validate BATCH_LOOKUP correctly', () => {
    assert.strictEqual(VLL_MessagesShared.validate({ type: MSG.BATCH_LOOKUP, words: ['test'] }), true);
    assert.strictEqual(VLL_MessagesShared.validate({ type: MSG.BATCH_LOOKUP, words: 'not-an-array' }), false);
    assert.strictEqual(VLL_MessagesShared.validate({ type: MSG.BATCH_LOOKUP }), false);
  });

  test('should validate SAVE_WORD correctly', () => {
    assert.strictEqual(VLL_MessagesShared.validate({ type: MSG.SAVE_WORD, entry: { word: 'nihao' } }), true);
    assert.strictEqual(VLL_MessagesShared.validate({ type: MSG.SAVE_WORD, entry: {} }), false);
    assert.strictEqual(VLL_MessagesShared.validate({ type: MSG.SAVE_WORD }), false);
  });

  test('should validate UPDATE_COLOR correctly', () => {
    assert.strictEqual(VLL_MessagesShared.validate({ type: MSG.UPDATE_COLOR, word: 'nihao', color: 'red' }), true);
    assert.strictEqual(VLL_MessagesShared.validate({ type: MSG.UPDATE_COLOR, word: 'nihao' }), false);
  });

  test('should pass through unknown types', () => {
    assert.strictEqual(VLL_MessagesShared.validate({ type: 'UNKNOWN_TYPE' }), true);
  });

  test('should fail on missing type', () => {
    assert.strictEqual(VLL_MessagesShared.validate({}), false);
    assert.strictEqual(VLL_MessagesShared.validate(null), false);
  });
});
