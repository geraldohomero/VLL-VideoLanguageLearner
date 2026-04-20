/* eslint-disable no-undef */
(function initVLLNetworkShared(root, factory) {
  const api = factory();

  root.VLL_NetworkShared = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createVLLNetworkShared() {
  'use strict';

  function shouldRetryHttpStatus(status) {
    return status === 408 || status === 429 || status >= 500;
  }

  function shouldRetryNetworkError(err) {
    if (!err) return false;
    if (err.name === 'AbortError' || err.name === 'TypeError') return true;

    const msg = String(err.message || '').toLowerCase();
    return msg.includes('network') || msg.includes('fetch') || msg.includes('timed out');
  }

  function getRetryDelay(attemptIndex, backoffMs, jitterMax = 120, randomFn = Math.random) {
    const attempt = Number.isFinite(attemptIndex) ? attemptIndex : 0;
    const base = Number.isFinite(backoffMs) && backoffMs > 0 ? backoffMs : 0;
    const jitterLimit = Number.isFinite(jitterMax) && jitterMax > 0 ? jitterMax : 0;
    const randomValue = typeof randomFn === 'function' ? randomFn() : Math.random();
    const jitter = Math.floor(Math.max(0, Math.min(1, randomValue)) * jitterLimit);
    return base * (attempt + 1) + jitter;
  }

  return {
    shouldRetryHttpStatus,
    shouldRetryNetworkError,
    getRetryDelay
  };
});
