/* eslint-disable no-undef */
(function initVLLSubtitlesShared(root, factory) {
  const api = factory();

  root.VLL_SubtitlesShared = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createVLLSubtitlesShared() {
  'use strict';

  const translationTrackCache = new WeakMap();

  function buildSubtitleUrl(baseUrl, langCode, trackName, vssId, fmt) {
    let url = baseUrl;

    if (langCode && !url.includes('&lang=') && !url.includes('?lang=')) {
      url += '&lang=' + encodeURIComponent(langCode);
    }

    if (
      trackName &&
      !url.includes('&name=') &&
      !url.includes('?name=') &&
      !url.includes('&kind=asr') &&
      !url.includes('?kind=asr')
    ) {
      url += '&name=' + encodeURIComponent(trackName);
    }

    if (vssId && !url.includes('&vss_id=') && !url.includes('?vss_id=')) {
      url += '&vss_id=' + encodeURIComponent(vssId);
    }

    if (fmt) {
      url = url.replace(/&fmt=[^&]*/g, '').replace(/\?fmt=[^&]*&/, '?');
      url += '&fmt=' + encodeURIComponent(fmt);
    }

    return url;
  }

  function getPreparedTranslationTrack(ptTrack) {
    if (!Array.isArray(ptTrack) || ptTrack.length === 0) return [];

    const cached = translationTrackCache.get(ptTrack);
    if (cached) return cached;

    const prepared = ptTrack
      .filter(e => typeof e?.start === 'number' && typeof e?.text === 'string')
      .slice()
      .sort((a, b) => a.start - b.start);

    translationTrackCache.set(ptTrack, prepared);
    return prepared;
  }

  function matchTranslation(zhEntry, ptTrack) {
    if (!zhEntry || typeof zhEntry.start !== 'number') return '';

    const prepared = getPreparedTranslationTrack(ptTrack);
    if (prepared.length === 0) return '';

    let lo = 0;
    let hi = prepared.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (prepared[mid].start < zhEntry.start) lo = mid + 1;
      else hi = mid;
    }

    const candidates = [];
    if (lo < prepared.length) candidates.push(prepared[lo]);
    if (lo > 0) candidates.push(prepared[lo - 1]);

    if (candidates.length === 0) return '';

    let best = candidates[0];
    let bestDiff = Math.abs(best.start - zhEntry.start);

    for (let i = 1; i < candidates.length; i++) {
      const diff = Math.abs(candidates[i].start - zhEntry.start);
      if (diff < bestDiff) {
        best = candidates[i];
        bestDiff = diff;
      }
    }

    const duration = typeof zhEntry.duration === 'number' ? zhEntry.duration : 0;
    const maxDiff = Math.max(1.0, Math.min(3.0, duration * 0.75 || 2.0));

    return bestDiff <= maxDiff ? best.text : '';
  }

  return {
    buildSubtitleUrl,
    matchTranslation
  };
});
