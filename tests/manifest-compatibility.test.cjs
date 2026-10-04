const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'manifest.json');

test('manifest.json has Firefox Gecko configuration', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.ok(manifest.browser_specific_settings, 'manifest should have browser_specific_settings');
  assert.ok(manifest.browser_specific_settings.gecko, 'manifest should have gecko settings');
  assert.equal(
    manifest.browser_specific_settings.gecko.id,
    'vll@geraldohomero.github.io',
    'gecko id must match agreed id'
  );
  assert.ok(
    manifest.browser_specific_settings.gecko.strict_min_version,
    'gecko strict_min_version should be defined'
  );
});

test('manifest.json has cross-browser background scripts configuration', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.ok(manifest.background, 'manifest should have background');
  assert.equal(
    manifest.background.service_worker,
    'src/background.js',
    'Chrome requires background.service_worker'
  );
  assert.ok(
    Array.isArray(manifest.background.scripts),
    'Firefox requires background.scripts array'
  );
  assert.ok(
    manifest.background.scripts.includes('src/background.js'),
    'background.scripts must include background.js'
  );
  assert.ok(
    manifest.background.scripts.includes('src/messages.shared.js'),
    'background.scripts must include shared dependencies'
  );
  assert.equal(
    manifest.background.scripts[manifest.background.scripts.length - 1],
    'src/background.js',
    'background.js must be the last script loaded'
  );
});

test('manifest.json has both side_panel (Chrome) and sidebar_action (Firefox)', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.ok(manifest.side_panel, 'manifest should have side_panel for Chrome');
  assert.equal(manifest.side_panel.default_path, 'src/sidepanel.html');

  assert.ok(manifest.sidebar_action, 'manifest should have sidebar_action for Firefox');
  assert.equal(manifest.sidebar_action.default_panel, 'src/sidepanel.html');
});

test('package manifest transforms target manifests properly for Chrome and Firefox', () => {
  const { buildChromeManifest, buildFirefoxManifest } = require('../scripts/package-manifest.js');
  const baseManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const chromeManifest = buildChromeManifest(baseManifest);
  assert.equal(chromeManifest.browser_specific_settings, undefined, 'Chrome manifest should not include browser_specific_settings');
  assert.equal(chromeManifest.sidebar_action, undefined, 'Chrome manifest should not include sidebar_action');
  assert.equal(chromeManifest.background.scripts, undefined, 'Chrome manifest should not include background.scripts');
  assert.equal(chromeManifest.background.service_worker, 'src/background.js', 'Chrome manifest retains service_worker');
  assert.ok(chromeManifest.side_panel, 'Chrome manifest retains side_panel');
  assert.ok(chromeManifest.permissions.includes('sidePanel'), 'Chrome manifest retains sidePanel permission');

  const firefoxManifest = buildFirefoxManifest(baseManifest);
  assert.ok(firefoxManifest.browser_specific_settings?.gecko?.id, 'Firefox manifest retains gecko id');
  assert.deepEqual(
    firefoxManifest.browser_specific_settings?.gecko?.data_collection_permissions,
    { required: ['none'] },
    'Firefox manifest must define data_collection_permissions: { required: ["none"] }'
  );
  assert.ok(firefoxManifest.sidebar_action, 'Firefox manifest retains sidebar_action');
  assert.equal(firefoxManifest.side_panel, undefined, 'Firefox manifest should not include side_panel');
  assert.ok(!firefoxManifest.permissions.includes('sidePanel'), 'Firefox manifest should not include sidePanel permission');
  assert.ok(Array.isArray(firefoxManifest.background.scripts), 'Firefox manifest retains background.scripts');
  assert.equal(firefoxManifest.background.service_worker, undefined, 'Firefox manifest should not include service_worker');
});

test('manifest.json specifies data_collection_permissions required for Firefox AMO', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.deepEqual(
    manifest.browser_specific_settings?.gecko?.data_collection_permissions,
    { required: ['none'] },
    'Gecko settings must include data_collection_permissions with required ["none"]'
  );
});

test('all assets in assets/ are strictly under 5MB for AMO compliance', () => {
  const assetsDir = path.join(rootDir, 'assets');
  const files = fs.readdirSync(assetsDir);
  for (const file of files) {
    const filePath = path.join(assetsDir, file);
    const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      const sizeMB = stat.size / (1024 * 1024);
      assert.ok(
        sizeMB < 5.0,
        `File ${file} (${sizeMB.toFixed(2)} MB) must be strictly under 5MB for Mozilla AMO`
      );
    }
  }
});

