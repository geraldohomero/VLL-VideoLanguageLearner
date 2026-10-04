const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

test('dictionary split chunks are valid JSON and each under 5MB', () => {
  const chunkCount = 6;
  let totalEntries = 0;

  for (let i = 0; i < chunkCount; i++) {
    const chunkPath = path.join(rootDir, 'assets', `dictionary_${i}.json`);
    assert.ok(fs.existsSync(chunkPath), `Chunk file ${chunkPath} must exist`);

    const stat = fs.statSync(chunkPath);
    const sizeMB = stat.size / (1024 * 1024);
    assert.ok(
      sizeMB < 5.0,
      `Chunk dictionary_${i}.json (${sizeMB.toFixed(2)} MB) must be strictly under 5MB for AMO`
    );

    const data = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
    const entryCount = Object.keys(data).length;
    assert.ok(entryCount > 10000, `Chunk dictionary_${i}.json should contain at least 10,000 entries`);
    totalEntries += entryCount;
  }

  assert.ok(totalEntries > 150000, `Total dictionary entries (${totalEntries}) should exceed 150,000`);
});

test('src/dictionary.js loads all chunks and performs lookups correctly', async () => {
  const dictCode = fs.readFileSync(path.join(rootDir, 'src/dictionary.js'), 'utf8');

  // Set up mock sandbox with fetch simulating chrome.runtime.getURL
  const sandbox = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    chrome: {
      runtime: {
        getURL: (p) => p
      }
    },
    fetch: async (url) => {
      const fullPath = path.join(rootDir, url);
      if (!fs.existsSync(fullPath)) {
        return { ok: false, status: 404 };
      }
      const text = fs.readFileSync(fullPath, 'utf8');
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(text)
      };
    },
    Promise,
    Object,
    Array
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(dictCode, context);

  const loadedDict = await sandbox.vllLoadDictionary();
  assert.ok(loadedDict, 'vllLoadDictionary should return dictionary object');
  assert.ok(Object.keys(loadedDict).length > 150000, 'Loaded dictionary should have >150,000 entries');

  const nihao = sandbox.vllLookupWord('你好');
  assert.ok(nihao, 'Lookup for 你好 should succeed');
  assert.equal(nihao.p, 'nǐ hǎo');

  const zhongwen = sandbox.vllLookupWord('中文');
  assert.ok(zhongwen, 'Lookup for 中文 should succeed');
  assert.equal(zhongwen.p, 'Zhōng wén');
});
