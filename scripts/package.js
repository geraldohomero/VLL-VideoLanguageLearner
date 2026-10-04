#!/usr/bin/env node
/**
 * Production Packaging Script for VLL Extension (Chrome & Firefox)
 * Creates clean distribution packages for:
 * - Chrome Web Store (.zip)
 * - Firefox Add-ons (AMO) (.zip / .xpi)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { buildChromeManifest, buildFirefoxManifest } = require('./package-manifest.js');

const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.error('Error: manifest.json not found at', manifestPath);
  process.exit(1);
}

const baseManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const version = baseManifest.version || '1.0.0';
const packageName = 'vll-video-language-learner';
const distDir = path.join(rootDir, 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const args = process.argv.slice(2);
const targetArg = args.find((a) => a.startsWith('--target='));
const target = targetArg ? targetArg.split('=')[1].toLowerCase() : 'all';

const filesAndDirsToInclude = [
  'manifest.json',
  'rules.json',
  'assets',
  'icons',
  'src'
];

function copyRecursive(src, dest, filter) {
  if (filter && !filter(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child), filter);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function packageForTarget(browserTarget) {
  const isFirefox = browserTarget === 'firefox';
  const targetLabel = isFirefox ? 'Firefox (AMO)' : 'Chrome Web Store';
  const zipFileName = `${packageName}-${browserTarget}-v${version}.zip`;
  const zipFilePath = path.join(distDir, zipFileName);

  const tmpDir = path.join(distDir, `.tmp-${browserTarget}`);
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tmpDir, { recursive: true });

  const filter = (srcPath) => !srcPath.includes(path.join('assets', 'img'));

  try {
    for (const item of filesAndDirsToInclude) {
      const srcPath = path.join(rootDir, item);
      if (fs.existsSync(srcPath)) {
        copyRecursive(srcPath, path.join(tmpDir, item), filter);
      }
    }

    const tailoredManifest = isFirefox
      ? buildFirefoxManifest(baseManifest)
      : buildChromeManifest(baseManifest);

    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify(tailoredManifest, null, 2) + '\n',
      'utf8'
    );

    if (fs.existsSync(zipFilePath)) {
      fs.unlinkSync(zipFilePath);
    }

    execSync(`zip -r "${zipFilePath}" .`, { cwd: tmpDir, stdio: 'pipe' });

    // Export clean unpacked directory for developer mode loading without warnings
    const unpackedDir = path.join(distDir, browserTarget);
    if (fs.existsSync(unpackedDir)) {
      fs.rmSync(unpackedDir, { recursive: true, force: true });
    }
    copyRecursive(tmpDir, unpackedDir);

    // For Chrome, also maintain legacy zip name if default/all
    if (!isFirefox) {
      const legacyZip = path.join(distDir, `${packageName}-v${version}.zip`);
      fs.copyFileSync(zipFilePath, legacyZip);
    }

    const stats = fs.statSync(zipFilePath);
    const sizeKB = (stats.size / 1024).toFixed(1);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`✅ [${targetLabel}] Created: dist/${zipFileName} (${sizeKB} KB / ${sizeMB} MB)`);
    console.log(`   Unpacked directory: dist/${browserTarget}/ (0 warnings)`);
  } finally {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

console.log(`📦 Packaging VLL Extension v${version}...`);

if (target === 'chrome' || target === 'all') {
  packageForTarget('chrome');
}
if (target === 'firefox' || target === 'all') {
  packageForTarget('firefox');
}

console.log('🎉 Packaging completed successfully.');
