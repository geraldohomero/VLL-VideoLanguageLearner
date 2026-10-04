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

  if (!manifest.browser_specific_settings) {
    manifest.browser_specific_settings = {};
  }
  if (!manifest.browser_specific_settings.gecko) {
    manifest.browser_specific_settings.gecko = {};
  }
  manifest.browser_specific_settings.gecko.id =
    manifest.browser_specific_settings.gecko.id || 'vll@geraldohomero.github.io';
  manifest.browser_specific_settings.gecko.strict_min_version =
    manifest.browser_specific_settings.gecko.strict_min_version || '140.0';
  manifest.browser_specific_settings.gecko.data_collection_permissions =
    manifest.browser_specific_settings.gecko.data_collection_permissions || { required: ['none'] };

  return manifest;
}

module.exports = {
  buildChromeManifest,
  buildFirefoxManifest
};
