const $ = id => document.getElementById(id);

// ══════════════════════════════════════════════════
// ── Dev mode toggle (double-click on logo) ──
// ══════════════════════════════════════════════════

let devMode = false;

function applyDevMode(enabled) {
  devMode = enabled;
  document.body.classList.toggle('dev-mode', enabled);

  // If leaving dev mode while on Settings tab, switch to first tab
  if (!enabled) {
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab && activeTab.dataset.tab === 'settings') {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      document.querySelector('.tab-btn[data-tab="current"]').classList.add('active');
      $('tab-current').classList.add('active');
    }
  }
}

chrome.storage.sync.get(['devMode'], (data) => {
  applyDevMode(!!data.devMode);
});

$('headerLogo').addEventListener('dblclick', () => {
  devMode = !devMode;
  chrome.storage.sync.set({ devMode });
  applyDevMode(devMode);

  // Flash feedback
  const logo = $('headerLogo');
  logo.classList.add('flash');
  setTimeout(() => logo.classList.remove('flash'), 400);
});

// ══════════════════════════════════════════════════
// ── Tab switching ──
// ══════════════════════════════════════════════════

let translationsLoaded = false;

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');

    if (btn.dataset.tab === 'translations' && !translationsLoaded) {
      loadTranslations();
    }
    if (btn.dataset.tab === 'wishlist') {
      loadWishlist();
    }
    if (btn.dataset.tab === 'current') {
      loadQueue();
    }
  });
});

// ══════════════════════════════════════════════════
// ── Provider / Model / Key (Settings tab) ──
// ══════════════════════════════════════════════════

chrome.storage.sync.get(['provider', 'model'], (data) => {
  const prov = data.provider || DEFAULT_PROVIDER;
  const mod = data.model || DEFAULT_MODEL;
  const radio = document.querySelector(`input[value="${prov}"]`);
  if (radio) radio.checked = true;
  onProviderChange(prov, mod);
});

chrome.storage.local.get(['apiKey'], (data) => {
  if (data.apiKey) $('apiKeyInput').value = data.apiKey;
});

document.querySelectorAll('input[name="provider"]').forEach(r => {
  r.addEventListener('change', (e) => {
    const firstModel = PROVIDERS[e.target.value].models[0].code;
    chrome.storage.sync.set({ provider: e.target.value, model: firstModel });
    onProviderChange(e.target.value, firstModel);
  });
});

function onProviderChange(provider, selectedModel) {
  $('apiKeySection').style.display = PROVIDERS[provider].needsKey ? 'block' : 'none';

  $('serverStatus').style.display = PROVIDERS[provider].needsServer ? 'flex' : 'none';
  if (PROVIDERS[provider].needsServer) checkServer();

  const sel = $('modelSelect');
  sel.replaceChildren();
  for (const m of PROVIDERS[provider].models) {
    const opt = document.createElement('option');
    opt.value = m.code;
    opt.textContent = m.label;
    if (m.code === selectedModel) opt.selected = true;
    sel.appendChild(opt);
  }
}

let keyTimer;
$('apiKeyInput').addEventListener('input', (e) => {
  clearTimeout(keyTimer);
  keyTimer = setTimeout(() => {
    const val = e.target.value.trim();
    if (val) {
      chrome.storage.local.set({ apiKey: val });
    } else {
      chrome.storage.local.remove('apiKey');
    }
  }, 500);
});

$('toggleKey').addEventListener('click', () => {
  const inp = $('apiKeyInput');
  inp.type = inp.type === 'password' ? 'text' : 'password';
});

$('modelSelect').addEventListener('change', (e) => {
  chrome.storage.sync.set({ model: e.target.value });
});

function checkServer() {
  const row = $('serverStatus');
  const dot = row.querySelector('.dot');
  const label = row.querySelector('span');
  chrome.runtime.sendMessage({ type: 'ping_server' }, (resp) => {
    if (chrome.runtime.lastError || !resp?.ok) {
      row.className = 'status-row status-err';
      dot.className = 'dot dot-red';
      label.textContent = 'Сервер очередей недоступен';
    } else {
      row.className = 'status-row status-ok';
      dot.className = 'dot dot-green';
      label.textContent = 'Сервер очередей работает';
    }
  });
}

// ══════════════════════════════════════════════════
// ── Toggle (Player tab) ──
// ══════════════════════════════════════════════════

chrome.storage.sync.get(['isEnabled'], (data) => {
  $('toggleEnabled').checked = data.isEnabled !== false;
});
$('toggleEnabled').addEventListener('change', () => {
  chrome.storage.sync.set({ isEnabled: $('toggleEnabled').checked });
});

// ══════════════════════════════════════════════════
// ── Subtitle style (Player tab) ──
// ══════════════════════════════════════════════════

let colorTouched = false;

function saveSubtitleStyle() {
  const style = {};
  const fontSize = parseInt($('styleFontSize').value);
  if (fontSize >= 14) style.fontSize = fontSize;
  else style.fontSize = 'auto';

  if (colorTouched) style.color = $('styleColor').value;

  style.bgOpacity = parseInt($('styleBgOpacity').value);

  const position = $('stylePosition').value;
  if (position) style.position = position;

  chrome.storage.sync.set({ subtitleStyle: style });
}

chrome.storage.sync.get('subtitleStyle', (data) => {
  const s = data.subtitleStyle || {};
  if (s.fontSize && s.fontSize !== 'auto') {
    $('styleFontSize').value = s.fontSize;
    $('styleFontSizeVal').textContent = s.fontSize + 'px';
  }
  if (s.color) {
    $('styleColor').value = s.color;
    colorTouched = true;
  }
  if (s.bgOpacity !== undefined) {
    $('styleBgOpacity').value = s.bgOpacity;
    $('styleBgOpacityVal').textContent = s.bgOpacity + '%';
  }
  if (s.position) $('stylePosition').value = s.position;
});

$('styleFontSize').addEventListener('input', (e) => {
  const v = parseInt(e.target.value);
  $('styleFontSizeVal').textContent = v < 14 ? 'авто' : v + 'px';
  saveSubtitleStyle();
});

$('styleColor').addEventListener('input', () => {
  colorTouched = true;
  saveSubtitleStyle();
});

$('styleColorReset').addEventListener('click', () => {
  $('styleColor').value = '#ffffff';
  colorTouched = false;
  saveSubtitleStyle();
});

$('styleBgOpacity').addEventListener('input', (e) => {
  $('styleBgOpacityVal').textContent = e.target.value + '%';
  saveSubtitleStyle();
});

$('stylePosition').addEventListener('change', () => saveSubtitleStyle());

// ══════════════════════════════════════════════════
// ── Shared cache settings (Settings tab) ──
// ══════════════════════════════════════════════════

chrome.storage.sync.get(['sharedCacheEnabled'], (data) => {
  $('toggleSharedCache').checked = data.sharedCacheEnabled !== false;
});
chrome.storage.local.get(['sharedCacheApiKey'], (data) => {
  if (data.sharedCacheApiKey) $('sharedCacheApiKey').value = data.sharedCacheApiKey;
});

$('toggleSharedCache').addEventListener('change', () => {
  chrome.storage.sync.set({ sharedCacheEnabled: $('toggleSharedCache').checked });
});

let cacheKeyTimer;
$('sharedCacheApiKey').addEventListener('input', (e) => {
  clearTimeout(cacheKeyTimer);
  cacheKeyTimer = setTimeout(() => {
    chrome.storage.local.set({ sharedCacheApiKey: e.target.value.trim() });
  }, 500);
});

// ══════════════════════════════════════════════════
// ── Drop zone (Translations tab, dev only) ──
// ══════════════════════════════════════════════════

{
  const zone = $('dropZone');
  const VALID_EXT = ['.srt', '.vtt'];
  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
  let resetTimer;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.srt,.vtt';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  zone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
    fileInput.value = '';
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  function handleFile(file) {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!VALID_EXT.includes(ext)) {
      showDropStatus('error', 'Только .srt и .vtt файлы');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showDropStatus('error', 'Файл слишком большой (макс. 2 МБ)');
      return;
    }

    showDropStatus('loading', 'Читаю файл...');

    const reader = new FileReader();
    reader.onload = () => {
      let text = reader.result;

      if (ext === '.srt') {
        text = text.replace(/^\uFEFF/, '');
        text = 'WEBVTT\n\n' + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      }

      showDropStatus('loading', 'Отправляю в очередь...');

      chrome.runtime.sendMessage({
        type: 'submit_file',
        vtt: text,
        title: file.name.replace(/\.[^.]+$/, ''),
      }, (resp) => {
        if (chrome.runtime.lastError || !resp?.ok) {
          const err = resp?.error || chrome.runtime.lastError?.message || 'Ошибка';
          showDropStatus('error', err);
          return;
        }
        const pos = resp.position > 0 ? ` (${resp.position}-я в очереди)` : '';
        showDropStatus('success', `Отправлено${pos}`);
        loadQueue();
      });
    };

    reader.onerror = () => showDropStatus('error', 'Не удалось прочитать файл');
    reader.readAsText(file);
  }

  function showDropStatus(state, text) {
    clearTimeout(resetTimer);
    zone.className = 'drop-zone dev-only ' + state;
    zone.textContent = text;
    if (state === 'success' || state === 'error') {
      resetTimer = setTimeout(() => {
        zone.className = 'drop-zone dev-only';
        zone.textContent = 'Перетащи .srt или .vtt файл';
      }, 3000);
    }
  }
}

// ══════════════════════════════════════════════════
// ── Queue (Translations tab, dev only) ──
// ══════════════════════════════════════════════════

function loadQueue() {
  chrome.runtime.sendMessage({ type: 'get_queue_list', limit: 10 }, (resp) => {
    if (chrome.runtime.lastError || resp?.error || !resp?.jobs) {
      $('queueSection').style.display = 'none';
      return;
    }

    const active = resp.jobs.filter(j => j.status === 'pending' || j.status === 'running');
    if (active.length === 0) {
      $('queueSection').style.display = 'none';
      return;
    }

    $('queueSection').style.display = 'block';
    const list = $('queueList');
    list.replaceChildren();

    for (const job of active) {
      const item = document.createElement('div');
      item.className = 'queue-item';

      const status = document.createElement('span');
      status.className = 'queue-status ' + job.status;
      status.textContent = job.status === 'pending' ? 'ждёт' : 'идёт';

      const title = document.createElement('span');
      title.className = 'queue-title';
      title.textContent = job.title || job.id;

      item.appendChild(status);
      item.appendChild(title);

      if (job.status === 'running' && job.progress_total > 0) {
        const progress = document.createElement('span');
        progress.className = 'queue-progress';
        const pct = Math.round((job.progress_done / job.progress_total) * 100);
        progress.textContent = pct + '%';
        item.appendChild(progress);
      }

      list.appendChild(item);
    }
  });
}

loadQueue();

// ══════════════════════════════════════════════════
// ── Wishlist (Translations tab, dev only) ──
// ══════════════════════════════════════════════════

function loadWishlist() {
  $('wishlistLoading').style.display = 'block';
  $('wishlistEmpty').style.display = 'none';
  $('wishlistList').replaceChildren();

  chrome.runtime.sendMessage({ type: 'get_wishlist', limit: 20 }, (resp) => {
    $('wishlistLoading').style.display = 'none';

    if (chrome.runtime.lastError || resp?.error || !resp?.wishlist) {
      $('wishlistEmpty').style.display = 'block';
      return;
    }

    const items = resp.wishlist;
    if (items.length === 0) {
      $('wishlistEmpty').style.display = 'block';
      return;
    }

    const list = $('wishlistList');
    for (const entry of items) {
      const item = document.createElement('div');
      item.className = 'translation-item';

      const title = document.createElement('a');
      title.className = 'translation-title translation-link';
      title.textContent = entry.title || entry.page_url || '(без названия)';
      title.href = '#';
      title.addEventListener('click', (e) => {
        e.preventDefault();
        if (entry.page_url) chrome.tabs.create({ url: entry.page_url });
      });

      item.appendChild(title);

      if (entry.request_count > 1) {
        const count = document.createElement('span');
        count.className = 'translation-model';
        count.textContent = '\u00d7' + entry.request_count;
        item.appendChild(count);
      }

      list.appendChild(item);
    }
  });
}

// ══════════════════════════════════════════════════
// ── Translations list (Translations tab) ──
// ══════════════════════════════════════════════════

function loadTranslations() {
  $('translationsLoading').style.display = 'block';
  $('translationsEmpty').style.display = 'none';
  $('translationsError').style.display = 'none';

  const link = $('siteLink');
  link.href = 'https://podstr.cc';
  link.style.display = 'block';

  chrome.runtime.sendMessage({
    type: 'get_translations_list',
    limit: 20,
    offset: 0,
  }, (resp) => {
    $('translationsLoading').style.display = 'none';
    translationsLoaded = true;

    if (chrome.runtime.lastError) {
      showTranslationsError('Ошибка связи с расширением');
      return;
    }
    if (resp?.error) {
      showTranslationsError(resp.error);
      return;
    }
    if (!resp?.translations || resp.translations.length === 0) {
      $('translationsEmpty').style.display = 'block';
      return;
    }

    const list = $('translationsList');
    list.replaceChildren();

    for (const t of resp.translations) {
      const item = document.createElement('div');
      item.className = 'translation-item';

      let title;
      if (t.page_url) {
        title = document.createElement('a');
        title.href = t.page_url;
        title.target = '_blank';
        title.className = 'translation-title translation-link';
      } else {
        title = document.createElement('span');
        title.className = 'translation-title';
      }
      title.textContent = t.title || '(без названия)';

      const model = document.createElement('span');
      model.className = 'translation-model';
      model.textContent = formatModelName(t.model);

      const date = document.createElement('span');
      date.className = 'translation-date';
      date.textContent = formatDate(t.updated_at);

      item.appendChild(title);
      item.appendChild(model);
      item.appendChild(date);

      list.appendChild(item);
    }
  });
}

function showTranslationsError(msg) {
  $('translationsError').style.display = 'block';
  $('translationsError').textContent = msg;
}

// ── Helpers ──

function formatModelName(model) {
  if (!model) return '';
  const name = model.includes('/') ? model.split('/').pop() : model;
  return name
    .replace(/^claude-/, '')
    .replace(/^gemini-/, 'Gemini ')
    .replace(/^llama-/, 'Llama ')
    .replace(/-\d{8}$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - day) / 86400000);
  if (diffDays === 0) return 'сегодня';
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return diffDays + 'д назад';
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return d.getDate() + ' ' + months[d.getMonth()];
}

// ══════════════════════════════════════════════════
// ── Target language dropdown (visible to all users) ──
// ══════════════════════════════════════════════════

const TARGET_LANGS_POPUP = [
  { code: 'Russian', label: 'Русский' },
  { code: 'English', label: 'English' },
  { code: 'German', label: 'Deutsch' },
  { code: 'French', label: 'Français' },
  { code: 'Spanish', label: 'Español' },
  { code: 'Italian', label: 'Italiano' },
  { code: 'Portuguese', label: 'Português' },
  { code: 'Japanese', label: '日本語' },
  { code: 'Chinese', label: '中文' },
  { code: 'Korean', label: '한국어' },
];

const targetLangSelect = $('targetLangSelect');
for (const lang of TARGET_LANGS_POPUP) {
  const opt = document.createElement('option');
  opt.value = lang.code;
  opt.textContent = lang.label;
  targetLangSelect.appendChild(opt);
}
chrome.storage.sync.get(['targetLang'], (data) => {
  targetLangSelect.value = data.targetLang || 'Russian';
});
targetLangSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ targetLang: targetLangSelect.value });
});

// ══════════════════════════════════════════════════
// ── Auto-refresh on focus ──
// ══════════════════════════════════════════════════

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  if (activeTab === 'wishlist') loadWishlist();
  if (activeTab === 'translations') { translationsLoaded = false; loadTranslations(); }
});
