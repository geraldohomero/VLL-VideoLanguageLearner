/**
 * VLL Sidepanel Settings Module
 */

(function initVLLSPSettings(root, factory) {
  root.VLL_SP_Settings = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createVLLSPSettings() {
  'use strict';

  const defaults = (typeof VLL_ConfigShared !== 'undefined' && VLL_ConfigShared && VLL_ConfigShared.defaults)
    ? VLL_ConfigShared.defaults
    : {};

  const DEFAULT_OVERLAY_STYLE = {
    fontScale: defaults.overlayStyle?.fontScale ?? 1,
    contrast: defaults.overlayStyle?.contrast ?? 1,
    textColor: defaults.overlayStyle?.textColor ?? '#e8e8f0',
    backgroundColor: defaults.overlayStyle?.backgroundColor ?? '#0a0a19',
    backgroundAlpha: defaults.overlayStyle?.backgroundAlpha ?? 0.4,
    blur: defaults.overlayStyle?.blur ?? 6
  };

  const DEFAULT_OVERLAY_POSITION = {
    x: defaults.overlayPosition?.x ?? 50,
    y: defaults.overlayPosition?.y ?? 84
  };

  let els = {};
  let lastSubtitleStatus = null;

  function asNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function init(inputEls) {
    els = inputEls;
  }

  function apply(settings, status) {
    if (settings.enabled !== undefined && els.enabled) els.enabled.checked = settings.enabled;
    if (settings.targetLang && els.targetLang) els.targetLang.value = settings.targetLang;
    if (settings.lookupProvider && els.lookupProvider) els.lookupProvider.value = settings.lookupProvider;
    if (settings.showPinyin !== undefined && els.showPinyin) els.showPinyin.checked = settings.showPinyin;
    if (settings.showTranslation !== undefined && els.showTranslation) els.showTranslation.checked = settings.showTranslation;
    if (settings.autoPause !== undefined && els.autoPause) els.autoPause.checked = settings.autoPause;

    const overlayStyle = {
      ...DEFAULT_OVERLAY_STYLE,
      ...(settings.overlayStyle || {})
    };
    const overlayPosition = {
      ...DEFAULT_OVERLAY_POSITION,
      ...(settings.overlayPosition || {})
    };

    if (els.overlayFontScale) els.overlayFontScale.value = String(asNumber(overlayStyle.fontScale, DEFAULT_OVERLAY_STYLE.fontScale));
    if (els.overlayContrast) els.overlayContrast.value = String(asNumber(overlayStyle.contrast, DEFAULT_OVERLAY_STYLE.contrast));
    if (els.overlayBackgroundAlpha) els.overlayBackgroundAlpha.value = String(asNumber(overlayStyle.backgroundAlpha, DEFAULT_OVERLAY_STYLE.backgroundAlpha));
    if (els.overlayBlur) els.overlayBlur.value = String(asNumber(overlayStyle.blur, DEFAULT_OVERLAY_STYLE.blur));
    if (els.overlayTextColor) els.overlayTextColor.value = overlayStyle.textColor || DEFAULT_OVERLAY_STYLE.textColor;
    if (els.overlayBackgroundColor) els.overlayBackgroundColor.value = overlayStyle.backgroundColor || DEFAULT_OVERLAY_STYLE.backgroundColor;
    if (els.overlayPositionX) els.overlayPositionX.value = String(asNumber(overlayPosition.x, DEFAULT_OVERLAY_POSITION.x));
    if (els.overlayPositionY) els.overlayPositionY.value = String(asNumber(overlayPosition.y, DEFAULT_OVERLAY_POSITION.y));

    if (status) applyStatus(status, settings.subtitleStatus);
  }

  function applyStatus(status, subtitleStatus) {
    if (!els.lookupLoadingSetting || !els.lookupProviderSetting) return;
    
    if (subtitleStatus) lastSubtitleStatus = subtitleStatus;

    if (status.googleReady) {
      els.lookupLoadingSetting.style.display = 'none';
      els.lookupProviderSetting.style.display = 'block';
      return;
    }

    els.lookupProviderSetting.style.display = 'none';
    els.lookupLoadingSetting.style.display = 'block';

    if (els.lookupLoadingNote) {
      const hasNativePt = lastSubtitleStatus?.hasNativePtTrack;

      if (status.inProgress) {
        els.lookupLoadingNote.textContent = hasNativePt 
          ? 'Legendas nativas detectadas. Google carregando definições em segundo plano...'
          : 'Google carregando em segundo plano... usando dicionário local por enquanto.';
      } else if (status.lastError) {
        els.lookupLoadingNote.textContent = `Google indisponível no momento (${status.lastError}). Mantendo dicionário local.`;
      } else if (!status.googleReady) {
        els.lookupLoadingNote.textContent = hasNativePt
          ? 'Legendas nativas ativas. Google disponível para definições detalhadas.'
          : 'Dicionário local ativo. Google disponível para definições em português.';
      } else {
        els.lookupLoadingNote.textContent = 'Preparando Google em segundo plano...';
      }
    }
  }

  function getValues() {
    return {
      enabled: els.enabled ? els.enabled.checked : true,
      targetLang: els.targetLang ? els.targetLang.value : 'pt',
      lookupProvider: els.lookupProvider ? els.lookupProvider.value : 'dictionary',
      showPinyin: els.showPinyin ? els.showPinyin.checked : true,
      showTranslation: els.showTranslation ? els.showTranslation.checked : true,
      autoPause: els.autoPause ? els.autoPause.checked : false,
      overlayStyle: {
        fontScale: asNumber(els.overlayFontScale?.value, DEFAULT_OVERLAY_STYLE.fontScale),
        contrast: asNumber(els.overlayContrast?.value, DEFAULT_OVERLAY_STYLE.contrast),
        textColor: els.overlayTextColor?.value || DEFAULT_OVERLAY_STYLE.textColor,
        backgroundColor: els.overlayBackgroundColor?.value || DEFAULT_OVERLAY_STYLE.backgroundColor,
        backgroundAlpha: asNumber(els.overlayBackgroundAlpha?.value, DEFAULT_OVERLAY_STYLE.backgroundAlpha),
        blur: asNumber(els.overlayBlur?.value, DEFAULT_OVERLAY_STYLE.blur)
      },
      overlayPosition: {
        x: asNumber(els.overlayPositionX?.value, DEFAULT_OVERLAY_POSITION.x),
        y: asNumber(els.overlayPositionY?.value, DEFAULT_OVERLAY_POSITION.y)
      }
    };
  }

  function resetOverlayStyle() {
    if (els.overlayFontScale) els.overlayFontScale.value = String(DEFAULT_OVERLAY_STYLE.fontScale);
    if (els.overlayContrast) els.overlayContrast.value = String(DEFAULT_OVERLAY_STYLE.contrast);
    if (els.overlayBackgroundAlpha) els.overlayBackgroundAlpha.value = String(DEFAULT_OVERLAY_STYLE.backgroundAlpha);
    if (els.overlayBlur) els.overlayBlur.value = String(DEFAULT_OVERLAY_STYLE.blur);
    if (els.overlayTextColor) els.overlayTextColor.value = DEFAULT_OVERLAY_STYLE.textColor;
    if (els.overlayBackgroundColor) els.overlayBackgroundColor.value = DEFAULT_OVERLAY_STYLE.backgroundColor;
    if (els.overlayPositionX) els.overlayPositionX.value = String(DEFAULT_OVERLAY_POSITION.x);
    if (els.overlayPositionY) els.overlayPositionY.value = String(DEFAULT_OVERLAY_POSITION.y);
  }

  return { init, apply, applyStatus, getValues, resetOverlayStyle };
});
