/**
 * VLL Dictionary Module — CC-CEDICT offline lookup
 * Loaded in the Service Worker via importScripts().
 * Provides instant (<1ms) Chinese → English/Pinyin lookup.
 */

let _vllDict = null;
let _vllDictLoading = null;

/**
 * Load the CC-CEDICT dictionary JSON into memory.
 * Called once when the service worker starts.
 * ~120k entries, ~4MB in memory.
 */
async function vllLoadDictionary() {
  if (_vllDict) return _vllDict;
  if (_vllDictLoading) return _vllDictLoading;

  _vllDictLoading = (async () => {
    try {
      const url = chrome.runtime.getURL('assets/dictionary.json');
      const res = await fetch(url);
      _vllDict = await res.json();
      console.log(`[VLL] Dictionary loaded: ${Object.keys(_vllDict).length} entries`);
      return _vllDict;
    } catch (err) {
      console.error('[VLL] Failed to load dictionary:', err);
      _vllDict = {};
      return _vllDict;
    } finally {
      _vllDictLoading = null;
    }
  })();

  return _vllDictLoading;
}

/**
 * Look up a single word in the dictionary.
 * @param {string} word - Chinese characters (simplified or traditional)
 * @returns {{ s: string, t: string, p: string, m: string } | null}
 *   s = simplified, t = traditional, p = pinyin, m = meaning (English)
 */
function vllLookupWord(word) {
  if (!_vllDict) return null;
  if (_vllDict[word]) return _vllDict[word];

  // Fallback: If word length > 1 and not found, combine single characters
  if (word.length > 1) {
    let combinedPinyin = [];
    let combinedMeaning = [];
    let hasAnyMatch = false;

    for (const char of word) {
      if (_vllDict[char]) {
        hasAnyMatch = true;
        combinedPinyin.push(_vllDict[char].p);
        // Take the first meaning of each char to keep it concise
        const firstMeaning = _vllDict[char].m.split('/')[0];
        combinedMeaning.push(`[${char}] ${firstMeaning}`);
      } else {
        combinedPinyin.push('?');
      }
    }

    if (hasAnyMatch) {
      return {
        p: combinedPinyin.join(' '),
        m: combinedMeaning.join('; ')
      };
    }
  }

  return null;
}

/**
 * Segment a Chinese text into individual words using Intl.Segmenter.
 * @param {string} text - Raw Chinese text
 * @returns {string[]} Array of word segments
 */
function vllSegmentText(text) {
  if (!text || text.trim().length === 0) return [];

  try {
    const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
    const segments = [];
    for (const seg of segmenter.segment(text)) {
      if (seg.isWordLike) {
        segments.push(seg.segment);
      } else {
        // Keep punctuation and spaces as-is for rendering
        segments.push(seg.segment);
      }
    }
    return segments;
  } catch (err) {
    // Fallback: split by character
    console.warn('[VLL] Intl.Segmenter not available, falling back to char split');
    return text.split('');
  }
}

/**
 * Process a full subtitle line: segment + lookup each word.
 * @param {string} text - Raw Chinese subtitle line
 * @returns {Array<{ hanzi: string, pinyin: string, meaning: string, isWord: boolean }>}
 */
function vllProcessLine(text) {
  const segments = vllSegmentText(text);
  return segments.map(seg => {
    const entry = vllLookupWord(seg);
    if (entry) {
      return {
        hanzi: seg,
        pinyin: entry.p,
        meaning: entry.m,
        isWord: true
      };
    }
    // Check if it's a CJK character (potential unknown word)
    const isCJK = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(seg);
    return {
      hanzi: seg,
      pinyin: '',
      meaning: '',
      isWord: isCJK
    };
  });
}

/**
 * Batch process: given a list of unique words, return a dictionary map.
 * @param {string[]} words - Array of unique Chinese words
 * @returns {Object} Map of { word: { pinyin, meaning } }
 */
function vllBatchLookup(words) {
  const result = {};
  for (const w of words) {
    const entry = vllLookupWord(w);
    if (entry) {
      result[w] = { pinyin: entry.p, meaning: entry.m };
    }
  }
  return result;
}
