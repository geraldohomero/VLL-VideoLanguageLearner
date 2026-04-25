/**
 * VLL Database Module — IndexedDB wrapper (Promise-based)
 * Runs in the Service Worker context (extension origin).
 * Content scripts communicate via chrome.runtime.sendMessage.
 */

const VLL_DB_NAME = 'VLL_DB';
const VLL_DB_VERSION = 2;
const VLL_STORE_WORDS = 'words';
const VLL_STORE_TRANSLATIONS = 'translations';

/* ── Open / Upgrade ──────────────────────────────────────── */

function vllOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VLL_DB_NAME, VLL_DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(VLL_STORE_WORDS)) {
        const store = db.createObjectStore(VLL_STORE_WORDS, { keyPath: 'word' });
        store.createIndex('color', 'color', { unique: false });
        store.createIndex('dateAdded', 'dateAdded', { unique: false });
        store.createIndex('lastSeen', 'lastSeen', { unique: false });
      }

      if (!db.objectStoreNames.contains(VLL_STORE_TRANSLATIONS)) {
        const translationStore = db.createObjectStore(VLL_STORE_TRANSLATIONS, { keyPath: 'key' });
        translationStore.createIndex('expiresAt', 'expiresAt', { unique: false });
        translationStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ── CRUD Operations ─────────────────────────────────────── */

async function vllSaveWord(entry) {
  const db = await vllOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VLL_STORE_WORDS, 'readwrite');
    const store = tx.objectStore(VLL_STORE_WORDS);

    const record = {
      word: entry.word,
      pinyin: entry.pinyin || '',
      meaning: entry.meaning || '',
      meaningPt: entry.meaningPt || '',
      customMeaning: entry.customMeaning || '',
      wordLang: entry.wordLang || '',
      color: entry.color || 'red',
      dateAdded: entry.dateAdded || new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      context: entry.context || ''
    };

    const req = store.put(record);
    req.onsuccess = () => { db.close(); resolve(record); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function vllSaveWordsBatch(entries) {
  const safeEntries = Array.isArray(entries) ? entries.filter(e => e && e.word) : [];
  if (safeEntries.length === 0) return [];

  const db = await vllOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VLL_STORE_WORDS, 'readwrite');
    const store = tx.objectStore(VLL_STORE_WORDS);
    const records = [];

    tx.oncomplete = () => {
      db.close();
      resolve(records);
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Batch save failed'));
    };

    for (const entry of safeEntries) {
      const record = {
        word: entry.word,
        pinyin: entry.pinyin || '',
        meaning: entry.meaning || '',
        meaningPt: entry.meaningPt || '',
        customMeaning: entry.customMeaning || '',
        wordLang: entry.wordLang || '',
        color: entry.color || 'red',
        dateAdded: entry.dateAdded || new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        context: entry.context || ''
      };
      records.push(record);
      store.put(record);
    }
  });
}

async function vllGetWord(word) {
  const db = await vllOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VLL_STORE_WORDS, 'readonly');
    const store = tx.objectStore(VLL_STORE_WORDS);
    const req = store.get(word);
    req.onsuccess = () => { db.close(); resolve(req.result || null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function vllGetAllWords() {
  const db = await vllOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VLL_STORE_WORDS, 'readonly');
    const store = tx.objectStore(VLL_STORE_WORDS);
    const req = store.getAll();
    req.onsuccess = () => { db.close(); resolve(req.result || []); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function vllUpdateColor(word, color) {
  const existing = await vllGetWord(word);
  if (!existing) return null;
  existing.color = color;
  existing.lastSeen = new Date().toISOString();
  return vllSaveWord(existing);
}

async function vllUpdateMeaning(word, customMeaning) {
  const existing = await vllGetWord(word);
  if (!existing) return null;
  existing.customMeaning = customMeaning;
  existing.lastSeen = new Date().toISOString();
  return vllSaveWord(existing);
}

async function vllDeleteWord(word) {
  const db = await vllOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VLL_STORE_WORDS, 'readwrite');
    const store = tx.objectStore(VLL_STORE_WORDS);
    const req = store.delete(word);
    req.onsuccess = () => { db.close(); resolve(true); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function vllGetWordsByColor(color) {
  const db = await vllOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VLL_STORE_WORDS, 'readonly');
    const store = tx.objectStore(VLL_STORE_WORDS);
    const index = store.index('color');
    const req = index.getAll(color);
    req.onsuccess = () => { db.close(); resolve(req.result || []); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/**
 * Batch lookup: given an array of words, return a map { word: colorRecord }
 * for all words that exist in the database.
 */
async function vllGetWordColors(wordList) {
  const db = await vllOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VLL_STORE_WORDS, 'readonly');
    const store = tx.objectStore(VLL_STORE_WORDS);
    const colorMap = {};
    let pending = wordList.length;

    if (pending === 0) { db.close(); resolve(colorMap); return; }

    wordList.forEach(w => {
      const req = store.get(w);
      req.onsuccess = () => {
        if (req.result) colorMap[w] = req.result.color;
        if (--pending === 0) { db.close(); resolve(colorMap); }
      };
      req.onerror = () => {
        if (--pending === 0) { db.close(); resolve(colorMap); }
      };
    });
  });
}

/* ── Translation Cache ───────────────────────────────────── */

async function vllGetTranslationCache(key) {
  const db = await vllOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VLL_STORE_TRANSLATIONS, 'readonly');
    const store = tx.objectStore(VLL_STORE_TRANSLATIONS);
    const req = store.get(key);

    req.onsuccess = () => {
      const cached = req.result || null;
      db.close();

      if (!cached) {
        resolve(null);
        return;
      }

      if (typeof cached.expiresAt === 'number' && cached.expiresAt <= Date.now()) {
        resolve(null);
        return;
      }

      resolve(cached);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function vllSetTranslationCache(entry) {
  if (!entry || !entry.key) return null;

  const db = await vllOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VLL_STORE_TRANSLATIONS, 'readwrite');
    const store = tx.objectStore(VLL_STORE_TRANSLATIONS);

    const record = {
      key: entry.key,
      translatedText: entry.translatedText || '',
      romanizedText: entry.romanizedText || '',
      sourceLang: entry.sourceLang || 'auto',
      targetLang: entry.targetLang || 'pt',
      updatedAt: Date.now(),
      expiresAt: Number.isFinite(entry.expiresAt) ? entry.expiresAt : (Date.now() + 1000 * 60 * 60 * 24 * 30)
    };

    const req = store.put(record);
    req.onsuccess = () => {
      db.close();
      resolve(record);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function vllPruneExpiredTranslationCache(limit = 100) {
  const db = await vllOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VLL_STORE_TRANSLATIONS, 'readwrite');
    const store = tx.objectStore(VLL_STORE_TRANSLATIONS);
    const index = store.index('expiresAt');
    const range = IDBKeyRange.upperBound(Date.now());
    let removed = 0;

    index.openCursor(range).onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor || removed >= limit) {
        db.close();
        resolve(removed);
        return;
      }

      removed += 1;
      cursor.delete();
      cursor.continue();
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Translation cache cleanup failed'));
    };
  });
}
