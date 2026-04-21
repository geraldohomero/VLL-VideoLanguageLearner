import js from "@eslint/js";

export default [
  // Ignorar arquivos de distribuição e node_modules
  {
    ignores: ["node_modules/**", "scratch/package/dist/**"]
  },
  js.configs.recommended,
  // Configuração para scripts Node.js
  {
    files: ["scripts/**/*.js", "*.cjs"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      globals: {
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        __dirname: "readonly",
        process: "readonly",
        Buffer: "readonly"
      }
    }
  },
  // Configuração para código da extensão (browser/webextension)
  {
    files: ["src/**/*.js", "src/**/*.shared.js", "sidepanel/**/*.js", "*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
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
        btoa: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "error",
      "no-undef": "error"
    }
  }
];