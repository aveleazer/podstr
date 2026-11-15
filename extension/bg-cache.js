// bg-cache.js — Local cache (gzip)
//
// Provides: sha256, cacheGet, cachePut, buildCacheKey, compressText, decompressText
// Expects:  normalizeCacheKey (from providers.js)

'use strict';

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
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
