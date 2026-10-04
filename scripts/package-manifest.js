'use strict';

/**
 * Manifest transformation helper for target browser packages.
 */

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function buildChromeManifest(baseManifest) {
  const manifest = clone(baseManifest);

  delete manifest.browser_specific_settings;
  delete manifest.sidebar_action;

  if (manifest.background) {
    delete manifest.background.scripts;
  }

  return manifest;
}

function buildFirefoxManifest(baseManifest) {
  const manifest = clone(baseManifest);

  delete manifest.side_panel;

  if (Array.isArray(manifest.permissions)) {
    manifest.permissions = manifest.permissions.filter((p) => p !== 'sidePanel');
  }

  if (manifest.background) {
    delete manifest.background.service_worker;
  }

  return manifest;
}

module.exports = {
  buildChromeManifest,
  buildFirefoxManifest
};
