/**
 * VLL Database Module — IndexedDB wrapper (Promise-based)
 * Runs in the Service Worker context (extension origin).
 * Content scripts communicate via chrome.runtime.sendMessage.
 */

const VLL_DB_NAME = 'VLL_DB';
const VLL_DB_VERSION = 1;
const VLL_STORE_WORDS = 'words';

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
