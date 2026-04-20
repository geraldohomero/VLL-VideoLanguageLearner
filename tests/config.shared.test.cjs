const test = require('node:test');
const assert = require('node:assert/strict');

const configShared = require('../src/config.shared.js');

test('config.shared exports provider, storage and defaults contracts', () => {
  assert.equal(configShared.lookupProviders.DICTIONARY, 'dictionary');
  assert.equal(configShared.lookupProviders.GOOGLE, 'google');

  assert.equal(configShared.storageKeys.SETTINGS, 'vllSettings');
  assert.equal(configShared.storageKeys.CAPTION_MODE, 'vll_caption_mode');

  assert.equal(configShared.defaults.targetLang, 'pt');
  assert.equal(configShared.defaults.lookupProvider, configShared.lookupProviders.DICTIONARY);
});
