/* eslint-disable no-undef */
(function initVLLVocabShared(root, factory) {
  const api = factory();

  root.VLL_VocabShared = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createVLLVocabShared() {
  'use strict';

  const colors = ['red', 'orange', 'green', 'white'];

  const labels = {
    red: 'Não sei',
    orange: 'Não tenho certeza',
    green: 'Sei!',
    white: 'Não marcada'
  };

  return {
    colors,
    labels
  };
});
