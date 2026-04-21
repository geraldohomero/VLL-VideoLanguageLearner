/**
 * VLL Logger Shared Module
 * Provides standardized logging with levels.
 */

(function initVLLLoggerShared(root, factory) {
  const api = factory();
  root.VLL_Logger = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createVLLLoggerShared() {
  'use strict';

  const LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
  };

  // Default level: INFO in development, WARN in production
  let currentLevel = LEVELS.INFO;

  function setLevel(level) {
    if (typeof level === 'string') {
      currentLevel = LEVELS[level.toUpperCase()] ?? currentLevel;
    } else if (typeof level === 'number') {
      currentLevel = level;
    }
  }

  function log(level, ...args) {
    if (level < currentLevel) return;

    const prefix = '[VLL]';
    switch (level) {
      case LEVELS.DEBUG:
        console.debug(prefix, '[DEBUG]', ...args);
        break;
      case LEVELS.INFO:
        console.log(prefix, ...args);
        break;
      case LEVELS.WARN:
        console.warn(prefix, '[WARN]', ...args);
        break;
      case LEVELS.ERROR:
        console.error(prefix, '[ERROR]', ...args);
        break;
    }
  }

  return {
    LEVELS,
    setLevel,
    debug: (...args) => log(LEVELS.DEBUG, ...args),
    info: (...args) => log(LEVELS.INFO, ...args),
    warn: (...args) => log(LEVELS.WARN, ...args),
    error: (...args) => log(LEVELS.ERROR, ...args)
  };
});
