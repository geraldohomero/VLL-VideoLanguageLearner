const test = require('node:test');
const assert = require('node:assert/strict');

const vocabShared = require('../src/vocab.shared.js');

test('vocab.shared exposes expected colors and labels', () => {
  assert.deepEqual(vocabShared.colors, ['red', 'orange', 'green', 'white']);

  assert.equal(vocabShared.labels.red, 'Não sei');
  assert.equal(vocabShared.labels.orange, 'Não tenho certeza');
  assert.equal(vocabShared.labels.green, 'Sei!');
  assert.equal(vocabShared.labels.white, 'Não marcada');
});
