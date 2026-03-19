// bg-cache.js — Local cache (gzip) + shared cache (community translations)
//
// Provides: sha256, sharedCacheGet, sharedCacheGetByUrl, sharedCachePut,
//           cacheGet, cachePut, buildCacheKey, compressText, decompressText,
//           sanitizePageUrl
// Expects:  settings, settingsReady (from bg-settings.js or background.js)
//           normalizeCacheKey (from providers.js)

'use strict';

// ══════════════════════════════════════════════════
// ── Shared cache (community translations) ──
// ══════════════════════════════════════════════════

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sharedCacheGet(hash, srcLang, tgtLang) {
  await settingsReady;
  if (!settings.sharedCacheUrl) return null;
  try {
    const key = `${hash}@${srcLang}@${tgtLang}`;
    const resp = await fetch(`${settings.sharedCacheUrl}/cache/${key}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.vtt) return null;
    return { vtt: data.vtt, model: data.model || null };
  } catch (e) {
    console.log('[podstr.cc] Shared cache GET failed:', e.message);
    return null;
  }
}

async function sharedCacheGetByUrl(normalizedUrl, tgtLang) {
  await settingsReady;
  if (!settings.sharedCacheUrl) return null;
  try {
    const resp = await fetch(
      `${settings.sharedCacheUrl}/cache/by-url?url=${encodeURIComponent(normalizedUrl)}&target_lang=${encodeURIComponent(tgtLang)}&include_vtt=1`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.vtt) return null;
    return { vtt: data.vtt, model: data.model || null };
  } catch (e) {
    console.log('[podstr.cc] Shared cache GET by-url failed:', e.message);
    return null;
  }
}

async function sharedCachePut(hash, srcLang, tgtLang, vtt, model, tabId, playlistUrl, overrideTitle, channel = '', earlyPageUrl = '') {
  await settingsReady;
  if (!settings.sharedCacheUrl) {
    console.log('[podstr.cc] Shared cache PUT skipped: no URL');
    return;
  }
  try {
    let pageTitle = overrideTitle || '';
    let pageUrl = earlyPageUrl ? sanitizePageUrl(earlyPageUrl) : '';
    if (tabId && (!pageTitle || !pageUrl)) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (!pageTitle) pageTitle = tab.title || '';
        if (!pageUrl) pageUrl = sanitizePageUrl(tab.url);
      } catch (e) { /* tab may be closed */ }
    }

    const key = `${hash}@${srcLang}@${tgtLang}`;
    console.log(`[podstr.cc] Shared cache PUT: ${key.substring(0, 20)}... to ${settings.sharedCacheUrl}`);
    const resp = await fetch(`${settings.sharedCacheUrl}/cache/${key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': settings.sharedCacheApiKey || '',
      },
      body: JSON.stringify({
        vtt,
        model,
        model_rank: 1,
        title: pageTitle,
        page_url: pageUrl,
        normalized_url: playlistUrl ? normalizeCacheKey('playlist:' + playlistUrl).replace('playlist:', '') : '',
        channel: channel || '',
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.log(`[podstr.cc] Shared cache PUT ${resp.status}: ${err.substring(0, 100)}`);
    } else {
      console.log('[podstr.cc] Shared cache PUT OK');
    }
  } catch (e) {
    console.log('[podstr.cc] Shared cache PUT failed:', e.message);
  }
}

// ══════════════════════════════════════════════════
// ── URL sanitization (for shared cache metadata) ──
// ══════════════════════════════════════════════════

function sanitizePageUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com') && parsed.searchParams.has('v')) {
      return parsed.origin + parsed.pathname + '?v=' + parsed.searchParams.get('v');
    }
    return parsed.origin + parsed.pathname;
  } catch (e) {
    return '';
  }
}

// ══════════════════════════════════════════════════
// ── Local cache with gzip compression ──
// ══════════════════════════════════════════════════

function buildCacheKey(url, targetLang, provider, model) {
  const key = normalizeCacheKey(url);
  const suffix = [targetLang, `${provider}:${model}`].join('@');
  return `cache:${key}@${suffix}`;
}

async function compressText(text) {
  const blob = new Blob([text]);
  const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

async function decompressText(base64) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

async function cacheGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, async (data) => {
      const stored = data[key];
      if (!stored) return resolve(null);
      try {
        if (typeof stored === 'string' && stored.startsWith('H4s')) {
          resolve(await decompressText(stored));
        } else {
          resolve(stored);
        }
      } catch (e) {
        console.warn('[podstr.cc] Cache decompression failed:', e);
        resolve(null);
      }
    });
  });
}

async function cachePut(key, vtt, cueCount) {
  const indexKey = 'cache_index';
  const compressed = await compressText(vtt);

  return new Promise((resolve) => {
    chrome.storage.local.get(indexKey, (data) => {
      const index = data[indexKey] || {};
      index[key] = { date: Date.now(), cues: cueCount, size: compressed.length };

      // LRU eviction
      const keys = Object.keys(index);
      if (keys.length > 500) {
        const sorted = keys.sort((a, b) => index[a].date - index[b].date);
        const toRemove = sorted.slice(0, 50);
        chrome.storage.local.remove(toRemove);
        for (const k of toRemove) delete index[k];
      }

      chrome.storage.local.set({ [key]: compressed, [indexKey]: index }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[podstr.cc] Cache write failed:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
  });
}
