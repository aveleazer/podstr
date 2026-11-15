// bg-settings.js — Extension settings and state
// Provides: settings, settingsReady, getExtensionStatus
// Expects: DEFAULT_PROVIDER, DEFAULT_MODEL, PROVIDERS (from providers.js)
'use strict';

let settings = {
  provider: DEFAULT_PROVIDER,
  model: DEFAULT_MODEL,
  targetLang: 'Russian',
  apiKey: null,
  session_token: null,
  user: null,
};

const settingsReady = new Promise(resolve => {
  chrome.storage.sync.get(['provider', 'model', 'targetLang'], (syncData) => {
    if (syncData.provider && PROVIDERS[syncData.provider]) settings.provider = syncData.provider;
    if (syncData.model) settings.model = syncData.model;
    if (syncData.targetLang) settings.targetLang = syncData.targetLang;

    chrome.storage.local.get(['apiKey', 'session_token', 'user'], (localData) => {
      if (localData.apiKey) settings.apiKey = localData.apiKey;
      if (localData.session_token) settings.session_token = localData.session_token;
      if (localData.user) settings.user = localData.user;
      resolve();
    });
  });
});

// Cleanup (AS-278): keys of the removed shared cache and Claude CLI queue (idempotent; drop in 1.0.0)
settingsReady.then(() => {
  chrome.storage.sync.remove(['sharedCacheUrl', 'sharedCacheApiKey', 'cliModel'], () => {
    if (chrome.runtime.lastError) console.warn('[podstr.cc] Settings cleanup (sync) failed:', chrome.runtime.lastError.message);
  });
  chrome.storage.local.remove('sharedCacheApiKey', () => {
    if (chrome.runtime.lastError) console.warn('[podstr.cc] Settings cleanup (local) failed:', chrome.runtime.lastError.message);
  });
});

// Migration (AS-258): the retired preview model id -> stable one (idempotent; other models untouched)
const RETIRED_PREVIEW_MODEL = 'google/gemini-3.1-flash-lite-preview';
settingsReady.then(() => {
  if (settings.model !== RETIRED_PREVIEW_MODEL) return;
  settings.model = DEFAULT_MODEL;
  chrome.storage.sync.set({ model: DEFAULT_MODEL }, () => {
    if (chrome.runtime.lastError) {
      console.warn('[podstr.cc] Model migration failed:', chrome.runtime.lastError.message);
    } else {
      console.log('[podstr.cc] Migrated model preview ->', DEFAULT_MODEL);
    }
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.provider) {
      const v = changes.provider.newValue;
      settings.provider = (v && PROVIDERS[v]) ? v : DEFAULT_PROVIDER; // same check as at startup: a synced value from another version/device may be unknown
    }
    if (changes.model) settings.model = changes.model.newValue || DEFAULT_MODEL;
    if (changes.targetLang) settings.targetLang = changes.targetLang.newValue || 'Russian';
  }
  if (area === 'local') {
    if (changes.apiKey) settings.apiKey = changes.apiKey.newValue || null;
    if (changes.session_token) settings.session_token = changes.session_token.newValue || null;
    if (changes.user) settings.user = changes.user.newValue || null;
  }
});

async function getExtensionStatus() {
  await settingsReady;
  const hasKey = !!settings.apiKey;
  const user = settings.user;

  return {
    provider: settings.provider || 'openrouter',
    model: settings.model,
    canTranslate: hasKey || (!!settings.session_token && !!user && (user.quota_used || 0) < (user.quota_limit || 0)),
    auth: user ? {
      email: user.email,
      plan: user.plan || 'free',
      quota: { used: user.quota_used || 0, limit: user.quota_limit || 5 },
    } : null,
    extensionVersion: chrome.runtime.getManifest().version,
  };
}
