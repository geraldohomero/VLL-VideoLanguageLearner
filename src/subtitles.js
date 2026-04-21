/**
 * VLL Subtitles Module — YouTube caption extraction & parsing
 * Runs as a content script in the YouTube page context.
 *
 * Uses multiple strategies to reliably extract caption data:
 * 1. Parse from script tags (fresh page load)
 * 2. Fetch page HTML directly (SPA navigation fallback)
 * 3. Extract from ytcfg embedded data
 */

/* global chrome, VLL_SubtitlesShared, VLL_NetworkShared, VLL_ConfigShared */

const VLL_Subtitles = (() => {

  const shared = (typeof VLL_SubtitlesShared !== 'undefined' && VLL_SubtitlesShared)
    ? VLL_SubtitlesShared
    : null;

  if (!shared) {
    throw new Error('[VLL] Missing VLL_SubtitlesShared. Ensure subtitles.shared.js is loaded first.');
  }

  const networkShared = (typeof VLL_NetworkShared !== 'undefined' && VLL_NetworkShared)
    ? VLL_NetworkShared
    : null;

  if (!networkShared) {
    throw new Error('[VLL] Missing VLL_NetworkShared. Ensure network.shared.js is loaded first.');
  }

  const configShared = (typeof VLL_ConfigShared !== 'undefined' && VLL_ConfigShared)
    ? VLL_ConfigShared
    : null;

  if (!configShared || !configShared.defaults) {
    throw new Error('[VLL] Missing VLL_ConfigShared. Ensure config.shared.js is loaded first.');
  }

  const CFG = configShared;

  const VLL_SUBTITLE_TIMEOUT_MS = 9000;
  const VLL_SUBTITLE_RETRIES = 1;
  const VLL_SUBTITLE_BACKOFF_MS = 300;

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = VLL_SUBTITLE_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function fetchWithRetry(url, options = {}, config = {}) {
    const retries = Number.isInteger(config.retries) ? config.retries : VLL_SUBTITLE_RETRIES;
    const timeoutMs = Number.isInteger(config.timeoutMs) ? config.timeoutMs : VLL_SUBTITLE_TIMEOUT_MS;
    const backoffMs = Number.isInteger(config.backoffMs) ? config.backoffMs : VLL_SUBTITLE_BACKOFF_MS;

    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetchWithTimeout(url, options, timeoutMs);
        if (!response.ok) {
          if (!networkShared.shouldRetryHttpStatus(response.status) || attempt === retries) {
            return response;
          }
          await delay(networkShared.getRetryDelay(attempt, backoffMs));
          continue;
        }
        return response;
      } catch (err) {
        lastErr = err;
        if (!networkShared.shouldRetryNetworkError(err) || attempt === retries) {
          throw err;
        }
        await delay(networkShared.getRetryDelay(attempt, backoffMs));
      }
    }

    throw lastErr || new Error('Fetch failed');
  }

  /**
   * Extract a complete JSON object from a string starting at a given position.
   * Uses bracket counting instead of regex to handle nested objects correctly.
   */
  function extractJSONObject(text, startIndex) {
    return shared.extractJSONObject(text, startIndex);
  }

  /**
   * Extract caption tracks from a page HTML string.
   * Works with both script tag content and fetched HTML.
   */
  function extractTracksFromHTML(html) {
    return shared.extractTracksFromHTML(html);
  }

  /**
   * Normalize raw track objects into our format.
   */
  function parseTracks(tracks) {
    return shared.parseTracks(tracks);
  }

  /**
   * Main extraction: try multiple strategies to find caption tracks.
   */
  async function extractCaptionTracks() {
    const videoId = getVideoId();
    if (!videoId) return [];

    // Strategy 1: Fetch via InnerTube API (Android client)
    // This is crucial because the Web client now requires complex PO Token (n-parameter)
    // validation which returns 0 bytes if missing. The Android client bypasses this.
    console.log('[VLL] Strategy 1: Fetching via InnerTube API (Android bypass)...');
    try {
      const response = await fetchWithRetry('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)'
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'ANDROID',
              clientVersion: '20.10.38'
            }
          },
          videoId: videoId
        })
      }, {
        retries: VLL_SUBTITLE_RETRIES,
        timeoutMs: VLL_SUBTITLE_TIMEOUT_MS,
        backoffMs: VLL_SUBTITLE_BACKOFF_MS
      });
      
      if (response.ok) {
        const data = await response.json();
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (tracks && tracks.length > 0) {
          console.log(`[VLL] Found ${tracks.length} tracks via InnerTube API!`);
          tracks.forEach(t => t._source = 'android');
          return parseTracks(tracks);
        }
      } else {
        console.warn(`[VLL] InnerTube API returned HTTP ${response.status}`);
      }
    } catch (e) {
      console.warn('[VLL] InnerTube API fetch failed:', e.message);
    }

    // Strategy 2: Parse from current page script tags (Legacy fallback)
    console.log('[VLL] Strategy 2: Parsing script tags...');
    try {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent;
        if (!text || text.length < 100) continue;
        if (!text.includes('captionTracks') && !text.includes('captions')) continue;

        const tracks = extractTracksFromHTML(text);
        if (tracks.length > 0) {
          tracks.forEach(t => t._source = 'script');
          return tracks;
        }
      }
    } catch (e) {
      console.warn('[VLL] Strategy 2 failed:', e.message);
    }

    // Strategy 3: Fetch page HTML directly (handles SPA navigation fallback)
    console.log('[VLL] Strategy 3: Fetching page HTML...');
    try {
      const response = await fetchWithRetry(`https://www.youtube.com/watch?v=${videoId}`, {
        credentials: 'same-origin'
      }, {
        retries: VLL_SUBTITLE_RETRIES,
        timeoutMs: VLL_SUBTITLE_TIMEOUT_MS,
        backoffMs: VLL_SUBTITLE_BACKOFF_MS
      });
      const html = await response.text();
      const tracks = extractTracksFromHTML(html);
      if (tracks.length > 0) {
        tracks.forEach(t => t._source = 'html');
        return tracks;
      }
    } catch (e) {
      console.warn('[VLL] Strategy 3 failed:', e.message);
    }

    return [];
  }

  /**
   * Find the best Chinese subtitle track.
   * Prefers manual captions over auto-generated.
   */
  function findChineseTrack(tracks) {
    return shared.findChineseTrack(tracks);
  }

  /**
   * Find Portuguese subtitle track.
   */
  function findPortugueseTrack(tracks) {
    return shared.findPortugueseTrack(tracks);
  }

  /**
   * Decode HTML entities in subtitle text.
   */
  function decodeHTMLEntities(text) {
    return shared.decodeHTMLEntities(text);
  }

  /**
   * Safely parse JSON from response text. Returns null if invalid.
   */
  function safeJSONParse(text) {
    return shared.safeJSONParse(text);
  }

  /**
   * Parse subtitle entries from JSON3 format data.
   */
  function parseJSON3(data) {
    return shared.parseJSON3(data);
  }

  /**
   * Parse subtitle entries from XML text.
   * Handles both legacy XML (<text start="sec" dur="sec">) 
   * and SRV3 XML (<p t="ms" d="ms">).
   */
  function parseXML(xmlText) {
    return shared.parseXML(xmlText);
  }

  /**
   * Ensure the timedtext URL has all required parameters.
   * YouTube sometimes provides baseUrls that need lang/name to work.
   */
  function buildSubtitleUrl(baseUrl, langCode, trackName, vssId, fmt) {
    // IMPORTANT: Do NOT use the URL/URLSearchParams classes here!
    // URLSearchParams will URL-encode the commas in YouTube's 'sparams' query
    // parameter (e.g. sparams=ip,ipbits -> sparams=ip%2Cipbits). This completely
    // invalidates the YouTube URL signature and causes the API to return 0 bytes.
    return shared.buildSubtitleUrl(baseUrl, langCode, trackName, vssId, fmt);
  }

  /**
   * Fetch and parse timed text from a caption track.
   * Tries multiple URL/format combinations.
   * @param {string} baseUrl - The timedtext API URL
   * @param {string} langCode - Language code (e.g. 'zh-CN')
   * @param {string} trackName - Track name
   * @param {string} vssId - VSS ID (e.g. '.zh-CN')
   * @param {string} source - Source of the track metadata
   */
  async function fetchSubtitleTrack(baseUrl, langCode, trackName, vssId, source) {
    console.log(`[VLL] Fetching subtitles for [${langCode}]`);
    console.log(`[VLL] Full baseUrl: ${baseUrl}`);

    // Build URL variations to try. 
    // IMPORTANT: For Android-sourced tracks, the baseUrl is already signed and complete.
    // Adding/modifying params will likely break the signature and return 0 bytes.
    const urlVariations = source === 'android' 
      ? [baseUrl] 
      : [
          buildSubtitleUrl(baseUrl, langCode, trackName, vssId, null),
          buildSubtitleUrl(baseUrl, langCode, trackName, vssId, 'json3'),
          buildSubtitleUrl(baseUrl, langCode, trackName, vssId, 'srv3'),
          buildSubtitleUrl(baseUrl, langCode, trackName, vssId, 'vtt'),
          baseUrl
        ];

    // De-duplicate
    const uniqueUrls = [...new Set(urlVariations)];

    for (let i = 0; i < uniqueUrls.length; i++) {
      const fetchUrl = uniqueUrls[i];
      console.log(`[VLL] Attempt ${i + 1}/${uniqueUrls.length}: ${fetchUrl.substring(0, 120)}...`);

      try {
        const headers = {};
        // Only use Android UA if the track metadata came from the Android bypass
        if (source === 'android') {
           headers['User-Agent'] = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)';
        }

        const response = await fetchWithRetry(fetchUrl, { headers }, {
          retries: VLL_SUBTITLE_RETRIES,
          timeoutMs: VLL_SUBTITLE_TIMEOUT_MS,
          backoffMs: VLL_SUBTITLE_BACKOFF_MS
        });
        if (!response.ok) {
          console.warn(`[VLL] HTTP ${response.status}`);
          continue;
        }

        const text = await response.text();
        console.log(`[VLL] Response: ${text.length} chars`);

        if (!text || text.trim().length === 0) {
          console.warn('[VLL] Empty response, trying next...');
          continue;
        }

        // Try XML parse
        const xmlEntries = parseXML(text);
        if (xmlEntries.length > 0) {
          console.log(`[VLL] ✅ Parsed ${xmlEntries.length} entries (XML)`);
          return xmlEntries;
        }

        // Try JSON parse
        const jsonData = safeJSONParse(text);
        if (jsonData) {
          const jsonEntries = parseJSON3(jsonData);
          if (jsonEntries.length > 0) {
            console.log(`[VLL] ✅ Parsed ${jsonEntries.length} entries (JSON3)`);
            return jsonEntries;
          }
        }

        console.warn(`[VLL] Got ${text.length} chars but couldn't parse. First 200: ${text.substring(0, 200)}`);
      } catch (err) {
        console.warn(`[VLL] Fetch error: ${err.message}`);
      }
    }

    console.error('[VLL] ❌ All subtitle fetch attempts failed');
    return [];
  }

  /**
   * Fetch a translated version of a track.
   */
  async function fetchTranslatedTrack(baseUrl, targetLang) {
    try {
      // Use string appending to avoid corrupting the signature
      let url = baseUrl;
      if (!url.includes('&tlang=') && !url.includes('?tlang=')) {
        url += '&tlang=' + encodeURIComponent(targetLang);
      }

      const response = await fetchWithRetry(url, {
        headers: {
          'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)'
        }
      }, {
        retries: VLL_SUBTITLE_RETRIES,
        timeoutMs: VLL_SUBTITLE_TIMEOUT_MS,
        backoffMs: VLL_SUBTITLE_BACKOFF_MS
      });
      if (!response.ok) return [];

      const text = await response.text();
      if (!text || text.trim().length === 0) return [];

      // Try XML first
      const xmlEntries = parseXML(text);
      if (xmlEntries.length > 0) return xmlEntries;

      // Try JSON
      const jsonData = safeJSONParse(text);
      if (jsonData) {
        const jsonEntries = parseJSON3(jsonData);
        if (jsonEntries.length > 0) return jsonEntries;
      }

      // Try JSON3 format explicitly
      let url2 = url.replace(/&fmt=[^&]*/g, '').replace(/\?fmt=[^&]*&/, '?') + '&fmt=json3';
      const response2 = await fetchWithRetry(url2, {
        headers: {
          'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)'
        }
      }, {
        retries: VLL_SUBTITLE_RETRIES,
        timeoutMs: VLL_SUBTITLE_TIMEOUT_MS,
        backoffMs: VLL_SUBTITLE_BACKOFF_MS
      });
      if (response2.ok) {
        const text2 = await response2.text();
        const data2 = safeJSONParse(text2);
        if (data2) {
          const entries = parseJSON3(data2);
          if (entries.length > 0) return entries;
        }
      }

      return [];
    } catch (err) {
      console.warn('[VLL] Translation track fetch failed:', err.message);
      return [];
    }
  }

  /**
   * Main entry: load all subtitle data for the current video.
   * Pre-loads EVERYTHING before video plays.
   */
  async function loadAllSubtitles(targetLang = CFG.defaults.targetLang) {
    console.log('[VLL] === Starting subtitle loading ===');
    const tracks = await extractCaptionTracks();

    if (tracks.length === 0) {
      console.warn('[VLL] No caption tracks found for this video');
      return { zhTrack: [], ptTrack: [], tracks: [], videoId: getVideoId() };
    }

    console.log(`[VLL] Found ${tracks.length} caption tracks:`);
    tracks.forEach(t => console.log(`  - ${t.name} [${t.languageCode}] ${t.isAutoGenerated ? '(auto)' : '(manual)'}`));

    // Find Chinese track
    const zhMeta = findChineseTrack(tracks);
    let zhTrack = [];
    let ptTrack = [];

    if (zhMeta) {
      console.log(`[VLL] Loading Chinese subtitles: ${zhMeta.name} [${zhMeta.languageCode}] (Source: ${zhMeta._source})`);
      zhTrack = await fetchSubtitleTrack(zhMeta.baseUrl, zhMeta.languageCode, zhMeta.name, zhMeta.vssId, zhMeta._source);
      console.log(`[VLL] Loaded ${zhTrack.length} Chinese subtitle entries`);

      // Try to get translated track
      console.log(`[VLL] Loading ${targetLang} translation...`);
      ptTrack = await fetchTranslatedTrack(zhMeta.baseUrl, targetLang);
      console.log(`[VLL] Loaded ${ptTrack.length} translated entries`);
    } else {
      console.warn('[VLL] No Chinese track found. Available languages:',
        tracks.map(t => t.languageCode).join(', '));

      if (tracks.length > 0) {
        console.log(`[VLL] Trying first available track: ${tracks[0].name} (Source: ${tracks[0]._source})`);
        zhTrack = await fetchSubtitleTrack(tracks[0].baseUrl, tracks[0].languageCode, tracks[0].name, tracks[0].vssId, tracks[0]._source);
        console.log(`[VLL] Loaded ${zhTrack.length} entries from ${tracks[0].languageCode}`);
      }
    }

    // If translated track is still empty, try Portuguese track directly once.
    if (ptTrack.length === 0) {
      const ptMeta = findPortugueseTrack(tracks);
      if (ptMeta) {
        console.log(`[VLL] Trying Portuguese track as fallback... (Source: ${ptMeta._source})`);
        ptTrack = await fetchSubtitleTrack(ptMeta.baseUrl, ptMeta.languageCode, ptMeta.name, ptMeta.vssId, ptMeta._source);
      }
    }

    return {
      zhTrack,
      ptTrack,
      tracks,
      videoId: getVideoId()
    };
  }

  /**
   * Get the current YouTube video ID.
   */
  function getVideoId() {
    const url = new URL(window.location.href);
    return url.searchParams.get('v') || '';
  }

  /**
   * Match a translated line to a Chinese line by timestamp proximity.
   */
  function matchTranslation(zhEntry, ptTrack) {
    return shared.matchTranslation(zhEntry, ptTrack);
  }

  // Public API
  return {
    extractCaptionTracks,
    findChineseTrack,
    findPortugueseTrack,
    fetchSubtitleTrack,
    fetchTranslatedTrack,
    loadAllSubtitles,
    getVideoId,
    matchTranslation
  };
})();
