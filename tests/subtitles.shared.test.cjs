const test = require('node:test');
const assert = require('node:assert/strict');

const shared = require('../src/subtitles.shared.js');

test('buildSubtitleUrl appends missing params and fmt', () => {
  const url = shared.buildSubtitleUrl(
    'https://www.youtube.com/api/timedtext?foo=bar&sparams=ip,ipbits',
    'zh-CN',
    'Chinese Manual',
    '.zh-CN',
    'json3'
  );

  assert.equal(url.includes('lang=zh-CN'), true);
  assert.equal(url.includes('name=Chinese%20Manual'), true);
  assert.equal(url.includes('vss_id=.zh-CN'), true);
  assert.equal(url.includes('fmt=json3'), true);
  assert.equal(url.includes('ip,ipbits'), true);
});

test('buildSubtitleUrl does not append name for asr tracks', () => {
  const url = shared.buildSubtitleUrl(
    'https://www.youtube.com/api/timedtext?kind=asr',
    'zh-CN',
    'Auto Track',
    'a.zh-CN',
    null
  );

  assert.equal(url.includes('name='), false);
});

test('matchTranslation picks nearest by timestamp within window', () => {
  const zhEntry = { start: 10.0, duration: 2.0 };
  const ptTrack = [
    { start: 7.5, text: 'distante' },
    { start: 10.2, text: 'correta' },
    { start: 12.8, text: 'tambem distante' }
  ];

  assert.equal(shared.matchTranslation(zhEntry, ptTrack), 'correta');
});

test('matchTranslation returns empty when outside allowed distance', () => {
  const zhEntry = { start: 30.0, duration: 1.0 };
  const ptTrack = [
    { start: 20.0, text: 'muito cedo' },
    { start: 35.0, text: 'muito tarde' }
  ];

  assert.equal(shared.matchTranslation(zhEntry, ptTrack), '');
});

test('matchTranslation returns empty for invalid inputs', () => {
  assert.equal(shared.matchTranslation(null, []), '');
  assert.equal(shared.matchTranslation({ start: '10' }, []), '');
  assert.equal(shared.matchTranslation({ start: 10 }, null), '');
});
