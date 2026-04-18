#!/usr/bin/env node
/**
 * CC-CEDICT → JSON Converter for VLL
 * Downloads the CC-CEDICT dictionary and converts it to an optimized JSON file.
 *
 * Usage: node scripts/convert-cedict.js
 * Output: assets/dictionary.json
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CEDICT_URL = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz';
const OUTPUT_DIR = path.join(__dirname, '..', 'assets');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'dictionary.json');
const RAW_FILE = path.join(OUTPUT_DIR, 'cedict_ts.u8');

/* ── Tone number → accent conversion ─────────────────────── */

const TONE_MARKS = {
  a: ['ā', 'á', 'ǎ', 'à', 'a'],
  e: ['ē', 'é', 'ě', 'è', 'e'],
  i: ['ī', 'í', 'ǐ', 'ì', 'i'],
  o: ['ō', 'ó', 'ǒ', 'ò', 'o'],
  u: ['ū', 'ú', 'ǔ', 'ù', 'u'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
};

function numericToAccented(syllable) {
  // Handle special case: "u:" → "ü"
  let s = syllable.replace(/u:/g, 'ü').replace(/U:/g, 'Ü');

  const toneNum = parseInt(s.slice(-1));
  if (isNaN(toneNum) || toneNum < 1 || toneNum > 5) return s;

  s = s.slice(0, -1); // Remove tone number
  const toneIdx = toneNum - 1;

  // Tone placement rules:
  // 1. 'a' or 'e' gets the tone mark
  // 2. 'ou' → tone on 'o'
  // 3. Otherwise, tone on the last vowel
  const lower = s.toLowerCase();

  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    if (ch === 'a' || ch === 'e') {
      const marks = TONE_MARKS[ch];
      const replacement = s[i] === s[i].toUpperCase()
        ? marks[toneIdx].toUpperCase()
        : marks[toneIdx];
      return s.slice(0, i) + replacement + s.slice(i + 1);
    }
    if (ch === 'o' && lower[i + 1] === 'u') {
      const marks = TONE_MARKS['o'];
      const replacement = s[i] === s[i].toUpperCase()
        ? marks[toneIdx].toUpperCase()
        : marks[toneIdx];
      return s.slice(0, i) + replacement + s.slice(i + 1);
    }
  }

  // Last vowel gets the tone
  for (let i = lower.length - 1; i >= 0; i--) {
    const ch = lower[i];
    if (TONE_MARKS[ch]) {
      const marks = TONE_MARKS[ch];
      const replacement = s[i] === s[i].toUpperCase()
        ? marks[toneIdx].toUpperCase()
        : marks[toneIdx];
      return s.slice(0, i) + replacement + s.slice(i + 1);
    }
  }

  return s;
}

function convertPinyin(pinyinStr) {
  // "ni3 hao3" → "nǐ hǎo"
  return pinyinStr
    .split(' ')
    .map(numericToAccented)
    .join(' ');
}

/* ── Download ─────────────────────────────────────────────── */

function download(url) {
  return new Promise((resolve, reject) => {
    const handler = (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location;
        console.log(`  ↳ Redirect → ${redirectUrl}`);
        const mod = redirectUrl.startsWith('https') ? https : http;
        mod.get(redirectUrl, handler).on('error', reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    };

    console.log(`⬇ Downloading CC-CEDICT from:\n  ${url}`);
    https.get(url, handler).on('error', reject);
  });
}

/* ── Parse ────────────────────────────────────────────────── */

function parseCedict(text) {
  const dict = {};
  const lines = text.split('\n');
  let count = 0;

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || line.trim().length === 0) continue;

    // Format: Traditional Simplified [pin1 yin1] /meaning1/meaning2/
    const match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/\s*$/);
    if (!match) continue;

    const [, traditional, simplified, pinyinRaw, meaningsRaw] = match;
    const pinyin = convertPinyin(pinyinRaw);
    const meaning = meaningsRaw.replace(/\//g, '; ');

    // Index by simplified (primary) — most learners use simplified
    if (!dict[simplified]) {
      dict[simplified] = {
        t: traditional,
        p: pinyin,
        m: meaning
      };
      count++;
    }

    // Also index by traditional if different
    if (traditional !== simplified && !dict[traditional]) {
      dict[traditional] = {
        t: traditional,
        p: pinyin,
        m: meaning
      };
      count++;
    }
  }

  return { dict, count };
}

/* ── Main ─────────────────────────────────────────────────── */

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   VLL — CC-CEDICT Dictionary Builder ║');
  console.log('╚══════════════════════════════════════╝\n');

  // Ensure output dir exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let rawText;

  // Check if we already have the raw file
  if (fs.existsSync(RAW_FILE)) {
    console.log('📂 Found existing cedict_ts.u8, using cached file...');
    rawText = fs.readFileSync(RAW_FILE, 'utf-8');
  } else {
    // Download and decompress
    const gzData = await download(CEDICT_URL);
    console.log(`📦 Downloaded ${(gzData.length / 1024 / 1024).toFixed(1)} MB (gzipped)`);

    const decompressed = zlib.gunzipSync(gzData);
    rawText = decompressed.toString('utf-8');

    // Save raw file for future use
    fs.writeFileSync(RAW_FILE, rawText, 'utf-8');
    console.log(`💾 Saved raw dictionary to ${RAW_FILE}`);
  }

  // Parse
  console.log('\n⚙ Parsing CC-CEDICT entries...');
  const { dict, count } = parseCedict(rawText);
  console.log(`✅ Parsed ${count.toLocaleString()} entries`);

  // Write JSON
  const jsonStr = JSON.stringify(dict);
  fs.writeFileSync(OUTPUT_FILE, jsonStr, 'utf-8');
  const sizeMB = (Buffer.byteLength(jsonStr) / 1024 / 1024).toFixed(1);
  console.log(`💾 Saved to ${OUTPUT_FILE} (${sizeMB} MB)`);

  // Quick test
  console.log('\n🧪 Quick test:');
  const testWords = ['你好', '世界', '学习', '中文', '汉字'];
  for (const w of testWords) {
    const entry = dict[w];
    if (entry) {
      console.log(`  ${w} → ${entry.p} → ${entry.m}`);
    } else {
      console.log(`  ${w} → (not found)`);
    }
  }

  console.log('\n🎉 Dictionary ready for VLL!');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
