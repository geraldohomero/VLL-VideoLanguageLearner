/**
 * VLL Export Module — CSV generation for Anki import
 * Runs in the Service Worker context.
 */

/**
 * Generate a CSV string from saved words for Anki import.
 * Format: word;pinyin;meaning;color;context
 * Uses semicolon separator (safer for CJK content).
 * @param {Array} words - Array of word records from IndexedDB
 * @returns {string} CSV content with UTF-8 BOM
 */
function vllGenerateCSV(words) {
  // UTF-8 BOM for Excel/Anki compatibility
  const BOM = '\ufeff';
  const header = 'word;pinyin;meaning;color;context;wordLang';

  const rows = words.map(w => {
    const fields = [
      escapeCSVField(w.word || ''),
      escapeCSVField(w.pinyin || ''),
      escapeCSVField(w.customMeaning || w.meaningPt || w.meaning || ''),
      escapeCSVField(w.color || 'white'),
      escapeCSVField(w.context || ''),
      escapeCSVField(w.wordLang || '')
    ];
    return fields.join(';');
  });

  return BOM + header + '\n' + rows.join('\n');
}

/**
 * Escape a CSV field: wrap in quotes if it contains special chars.
 */
function escapeCSVField(value) {
  const str = String(value);
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Create a downloadable Blob URL from CSV content.
 * Used by the popup to trigger download.
 */
function vllCreateCSVBlob(csvContent) {
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
}
