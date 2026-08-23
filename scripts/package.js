#!/usr/bin/env node
/**
 * Production Packaging Script for VLL Chrome Extension
 * Creates a clean .zip distribution for the Chrome Web Store.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.error('Error: manifest.json not found at', manifestPath);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const version = manifest.version || '1.0.0';
const packageName = 'vll-video-language-learner';
const distDir = path.join(rootDir, 'dist');
const zipFileName = `${packageName}-v${version}.zip`;
const zipFilePath = path.join(distDir, zipFileName);

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Remove previous zip if it exists
if (fs.existsSync(zipFilePath)) {
  fs.unlinkSync(zipFilePath);
}

console.log(`📦 Packaging VLL Extension v${version}...`);

const excludePatterns = [
  '.git/*',
  '.github/*',
  'node_modules/*',
  'tests/*',
  'scratch/*',
  'docs/*',
  'site/*',
  'scripts/*',
  'dist/*',
  'assets/img/*',
  'index.html',
  '*.md',
  'eslint.config.js',
  'package.json',
  'package-lock.json',
  '.gitignore',
  '.DS_Store',
  'Thumbs.db'
];

const excludeArgs = excludePatterns.map(p => `-x "${p}"`).join(' ');
const zipCommand = `zip -r "${zipFilePath}" . ${excludeArgs}`;

try {
  execSync(zipCommand, { cwd: rootDir, stdio: 'pipe' });
  const stats = fs.statSync(zipFilePath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  const sizeKB = (stats.size / 1024).toFixed(1);

  console.log(`✅ Success! Created: dist/${zipFileName}`);
  console.log(`   File size: ${sizeKB} KB (${sizeMB} MB)`);
  console.log(`   Ready for upload to Chrome Developer Dashboard.`);
} catch (err) {
  console.error('❌ Packaging failed:', err.message);
  process.exit(1);
}
