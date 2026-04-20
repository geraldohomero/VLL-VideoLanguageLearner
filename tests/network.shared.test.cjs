const test = require('node:test');
const assert = require('node:assert/strict');

const networkShared = require('../src/network.shared.js');

test('shouldRetryHttpStatus accepts retryable statuses', () => {
  assert.equal(networkShared.shouldRetryHttpStatus(408), true);
  assert.equal(networkShared.shouldRetryHttpStatus(429), true);
  assert.equal(networkShared.shouldRetryHttpStatus(500), true);
  assert.equal(networkShared.shouldRetryHttpStatus(503), true);
});

test('shouldRetryHttpStatus rejects non-retryable statuses', () => {
  assert.equal(networkShared.shouldRetryHttpStatus(200), false);
  assert.equal(networkShared.shouldRetryHttpStatus(400), false);
  assert.equal(networkShared.shouldRetryHttpStatus(404), false);
});

test('shouldRetryNetworkError handles abort and network-like errors', () => {
  assert.equal(networkShared.shouldRetryNetworkError({ name: 'AbortError' }), true);
  assert.equal(networkShared.shouldRetryNetworkError({ name: 'TypeError' }), true);
  assert.equal(networkShared.shouldRetryNetworkError(new Error('Network request failed')), true);
  assert.equal(networkShared.shouldRetryNetworkError(new Error('fetch failed')), true);
});

test('shouldRetryNetworkError rejects unrelated errors', () => {
  assert.equal(networkShared.shouldRetryNetworkError(new Error('Invalid payload')), false);
  assert.equal(networkShared.shouldRetryNetworkError(null), false);
});

test('getRetryDelay uses attempt index, backoff and jitter', () => {
  const delay0 = networkShared.getRetryDelay(0, 300, 120, () => 0.5);
  const delay1 = networkShared.getRetryDelay(1, 300, 120, () => 1);

  assert.equal(delay0, 360);
  assert.equal(delay1, 720);
});

test('getRetryDelay clamps invalid params safely', () => {
  const delay = networkShared.getRetryDelay(-1, -10, -1, () => 0.7);
  assert.equal(delay, 0);
});
