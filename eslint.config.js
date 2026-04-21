const js = require("@eslint/js");

module.exports = [
  // Ignore generated and auxiliary folders from lint scope.
  {
    ignores: ["node_modules/**", "scratch/**", "site/**", "eslint.config.js"]
  },
  js.configs.recommended,

  // Node scripts (build/maintenance tooling).
  {
    files: ["scripts/**/*.js", "tests/**/*.cjs", "*.cjs"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      globals: {
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        __dirname: "readonly",
        process: "readonly",
        Buffer: "readonly",
        console: "readonly"
      }
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^(_|t)$",
          varsIgnorePattern: "^_"
        }
      ]
    }
  },

  // Browser helper pages.
  {
    files: ["*.js", "site/**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly"
      }
    }
  },

  // Chrome extension runtime files (legacy global pattern).
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      globals: {
        chrome: "readonly",
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        Blob: "readonly",
        Audio: "readonly",
        MutationObserver: "readonly",
        location: "readonly",
        AbortController: "readonly",
        indexedDB: "readonly",
        IDBKeyRange: "readonly",
        btoa: "readonly",
        importScripts: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        VLL_NetworkShared: "readonly",
        VLL_MessagesShared: "readonly",
        VLL_ConfigShared: "readonly",
        VLL_Subtitles: "readonly",
        vllLoadDictionary: "readonly",
        vllBatchLookup: "readonly",
        vllLookupWord: "readonly",
        vllProcessLine: "readonly",
        vllGetWord: "readonly",
        vllSaveWord: "readonly",
        vllUpdateColor: "readonly",
        vllDeleteWord: "readonly",
        vllGetAllWords: "readonly",
        vllGetWordsByColor: "readonly",
        vllGetWordColors: "readonly",
        vllSaveWordsBatch: "readonly",
        vllGetTranslationCache: "readonly",
        vllSetTranslationCache: "readonly",
        vllPruneExpiredTranslationCache: "readonly",
        vllGenerateCSV: "readonly",
        module: "readonly"
      }
    },
    rules: {
      "no-redeclare": "off",
      "no-unused-vars": "off"
    }
  }
];