const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

test('background.js guards importScripts for Firefox background scripts context', () => {
  const bgCode = fs.readFileSync(path.join(rootDir, 'src/background.js'), 'utf8');

  // Must not have bare, top-level unguarded importScripts(...) call
  const bareImportMatch = bgCode.match(/^importScripts\s*\(/m);
  assert.equal(
    bareImportMatch,
    null,
    'importScripts must be guarded with typeof importScripts check for Firefox event page compatibility'
  );
});

test('background.js can execute in Firefox environment without chrome.sidePanel and without importScripts', () => {
  const scriptsToLoad = [
    'src/logger.shared.js',
    'src/messages.shared.js',
    'src/config.shared.js',
    'src/network.shared.js',
    'src/database.js',
    'src/dictionary.js',
    'src/export.js',
    'src/background.js'
  ];

  let sidebarActionOpened = false;

  const sandbox = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    Promise,
    Set,
    Map,
    Object,
    Array,
    Date,
    // browser API simulating Firefox MV3
    browser: {
      runtime: {
        sendMessage: async () => ({}),
        onMessage: { addListener: () => {} },
        onInstalled: { addListener: () => {} }
      },
      tabs: {
        query: async () => [],
        sendMessage: async () => ({}),
        onRemoved: { addListener: () => {} }
      },
      storage: {
        local: {
          get: async () => ({}),
          set: async () => ({})
        }
      },
      sidebarAction: {
        open: async () => { sidebarActionOpened = true; },
        close: async () => {},
        toggle: async () => {}
      }
    },
    // chrome namespace in Firefox has basic aliases, but NO chrome.sidePanel
    chrome: {
      runtime: {
        sendMessage: async () => ({}),
        onMessage: { addListener: () => {} },
        onInstalled: { addListener: () => {} },
        getURL: (p) => p
      },
      tabs: {
        query: async () => [],
        sendMessage: async () => ({}),
        onRemoved: { addListener: () => {} }
      },
      storage: {
        local: {
          get: async () => ({}),
          set: async () => ({})
        }
      }
      // Note: sidePanel is explicitly undefined!
    }
  };

  const context = vm.createContext(sandbox);

  // Load all scripts sequentially as Firefox would do
  for (const scriptRel of scriptsToLoad) {
    const code = fs.readFileSync(path.join(rootDir, scriptRel), 'utf8');
    assert.doesNotThrow(() => {
      vm.runInContext(code, context);
    }, `Script ${scriptRel} should execute in Firefox environment without throwing`);
  }
});

test('background.js handles sidebarAction in Firefox when sidePanel is not available', async () => {
  const bgCode = fs.readFileSync(path.join(rootDir, 'src/background.js'), 'utf8');

  // Assert that sidebarAction is referenced in background.js
  assert.ok(
    bgCode.includes('sidebarAction'),
    'background.js must support browser.sidebarAction for Firefox'
  );
});
