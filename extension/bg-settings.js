// bg-settings.js — Extension settings and state
// Provides: settings, settingsReady, getActiveModel, getExtensionStatus,
//           SHARED_CACHE_DEFAULT_URL, SHARED_CACHE_KEY
// Expects: DEFAULT_PROVIDER, DEFAULT_MODEL, PROVIDERS (from providers.js)
'use strict';

const SHARED_CACHE_KEY = '';  // Set via popup settings or env
const SHARED_CACHE_DEFAULT_URL = 'https://podstr.cc';

let settings = {
  provider: DEFAULT_PROVIDER,
  model: DEFAULT_MODEL,
  cliModel: 'sonnet',
  targetLang: 'Russian',
  apiKey: null,
  sharedCacheUrl: SHARED_CACHE_DEFAULT_URL,
  sharedCacheApiKey: SHARED_CACHE_KEY,
  session_token: null,
  user: null,
};

const settingsReady = new Promise(resolve => {
  chrome.storage.sync.get(['provider', 'model', 'cliModel', 'targetLang', 'sharedCacheUrl'], (syncData) => {
    if (syncData.provider && PROVIDERS[syncData.provider]) settings.provider = syncData.provider;
    if (syncData.model) settings.model = syncData.model;
    if (syncData.cliModel) settings.cliModel = syncData.cliModel;
    if (syncData.targetLang) settings.targetLang = syncData.targetLang;
    if (syncData.sharedCacheUrl) settings.sharedCacheUrl = syncData.sharedCacheUrl;

    chrome.storage.local.get(['apiKey', 'sharedCacheApiKey', 'session_token', 'user'], (localData) => {
      if (localData.apiKey) settings.apiKey = localData.apiKey;
      if (localData.sharedCacheApiKey) settings.sharedCacheApiKey = localData.sharedCacheApiKey;
      if (localData.session_token) settings.session_token = localData.session_token;
      if (localData.user) settings.user = localData.user;
      resolve();
    });
  });
});

function getActiveModel() {
  if (settings.provider === 'claude-cli') return settings.cliModel || 'sonnet';
  return settings.model;
}

// Migration: move sharedCacheApiKey from sync to local (one-time)
settingsReady.then(() => {
  chrome.storage.sync.get(['sharedCacheApiKey'], (syncData) => {
    if (syncData.sharedCacheApiKey) {
      chrome.storage.local.get(['sharedCacheApiKey'], (localData) => {
        if (!localData.sharedCacheApiKey) {
          chrome.storage.local.set({ sharedCacheApiKey: syncData.sharedCacheApiKey });
          settings.sharedCacheApiKey = syncData.sharedCacheApiKey;
          console.log('[podstr.cc] Migrated sharedCacheApiKey from sync to local');
        }
        chrome.storage.sync.remove('sharedCacheApiKey');
      });
    }
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.provider) settings.provider = changes.provider.newValue || DEFAULT_PROVIDER;
    if (changes.model) settings.model = changes.model.newValue || DEFAULT_MODEL;
    if (changes.cliModel) settings.cliModel = changes.cliModel.newValue || 'sonnet';
    if (changes.targetLang) settings.targetLang = changes.targetLang.newValue || 'Russian';
    if (changes.sharedCacheUrl !== undefined) settings.sharedCacheUrl = changes.sharedCacheUrl.newValue || null;
  }
  if (area === 'local') {
    if (changes.apiKey) settings.apiKey = changes.apiKey.newValue || null;
    if (changes.sharedCacheApiKey !== undefined) settings.sharedCacheApiKey = changes.sharedCacheApiKey.newValue || '';
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
    model: getActiveModel(),
    canTranslate: hasKey || (!!settings.session_token && !!user && (user.quota_used || 0) < (user.quota_limit || 0)),
    auth: user ? {
      email: user.email,
      plan: user.plan || 'free',
      quota: { used: user.quota_used || 0, limit: user.quota_limit || 5 },
    } : null,
    extensionVersion: chrome.runtime.getManifest().version,
  };
}
