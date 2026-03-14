const $ = id => document.getElementById(id);

// ── i18n: localize static HTML elements ──
function localize() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = chrome.i18n.getMessage(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = chrome.i18n.getMessage(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = chrome.i18n.getMessage(el.dataset.i18nTitle);
  });
}
localize();
document.getElementById('ext-version').textContent = 'v' + chrome.runtime.getManifest().version;

// ── Localize legal links to user's language ──
// TODO: expand when site has more locales (currently only ru + en)
const siteLang = chrome.i18n.getUILanguage().split('-')[0] === 'ru' ? 'ru' : 'en';
document.querySelectorAll('a[href*="podstr.cc/en/"]').forEach(a => {
  a.href = a.href.replace('/en/', '/' + siteLang + '/');
});

// ── API hint banner with pricing link ──
{
  const banner = document.getElementById('apiHintBanner');
  if (banner) {
    const pricingUrl = `https://podstr.cc/${siteLang}/pricing/`;
    const before = chrome.i18n.getMessage('apiHintBefore') || 'Podstrochnik works without a key — on a';
    const linkText = chrome.i18n.getMessage('apiHintPlanLink') || 'free or Pro plan';
    const after = chrome.i18n.getMessage('apiHintAfter') || '. This section is for those who want to set things up themselves: connect your own provider, choose a model, and manage costs directly.';
    const textBefore = document.createTextNode(before + ' ');
    const link = document.createElement('a');
    link.href = pricingUrl;
    link.target = '_blank';
    link.style.cssText = 'color: var(--amber); text-decoration: underline;';
    link.textContent = linkText;
    const textAfter = document.createTextNode(after);
    banner.append(textBefore, link, textAfter);
  }
}

// ══════════════════════════════════════════════════
// ── Per-site toggle ──
// ══════════════════════════════════════════════════

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;

  let origin;
  try {
    const url = new URL(tab.url);
    if (!['http:', 'https:'].includes(url.protocol)) return;
    origin = url.origin;
  } catch { return; }

  const hostname = new URL(origin).hostname;

  chrome.runtime.sendMessage({ type: 'check_site_permission', origin }, (resp) => {
    if (chrome.runtime.lastError || !resp) return;

    const row = $('siteToggleRow');
    const toggle = $('siteToggle');
    const label = $('siteToggleLabel');

    row.style.display = '';
    label.textContent = hostname;
    toggle.checked = resp.status === 'predefined' || resp.status === 'granted';

    toggle.addEventListener('change', () => {
      if (toggle.checked) {
        chrome.runtime.sendMessage({ type: 'site_activated', origin, tabId: tab.id });
      } else {
        chrome.runtime.sendMessage({ type: 'site_deactivated', origin, tabId: tab.id });
      }
    });
  });
})();

// ══════════════════════════════════════════════════
// ── Dev mode toggle (double-click on logo) ──
// ══════════════════════════════════════════════════

let devMode = false;

function applyDevMode(enabled) {
  devMode = enabled;
  document.body.classList.toggle('dev-mode', enabled);

  // If leaving dev mode: switch to first tab + reset provider to openrouter
  if (!enabled) {
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab && activeTab.dataset.tab === 'dev') {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      document.querySelector('.tab-btn[data-tab="subtitles"]').classList.add('active');
      $('tab-subtitles').classList.add('active');
    }
    // Reset provider to openrouter so extension doesn't stay on claude-cli
    chrome.storage.sync.get(['provider'], (data) => {
      if (data.provider === 'claude-cli') {
        chrome.storage.sync.set({ provider: DEFAULT_PROVIDER });
        const radio = document.querySelector(`input[value="${DEFAULT_PROVIDER}"]`);
        if (radio) radio.checked = true;
        onProviderChange(DEFAULT_PROVIDER);
      }
    });
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

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');

    if (btn.dataset.tab === 'dev') {
      loadQueue();
    }
  });
});

// Account "or use API tab" link — switch to API tab
const goToApi = $('accountGoToApi');
if (goToApi) {
  goToApi.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('[data-tab="api"]').click();
  });
}

// ══════════════════════════════════════════════════
// ── Provider / Model / Key (API + Dev tabs) ──
// ══════════════════════════════════════════════════

chrome.storage.sync.get(['provider', 'model', 'cliModel'], (data) => {
  const prov = data.provider || DEFAULT_PROVIDER;
  const mod = data.model || DEFAULT_MODEL;
  const radio = document.querySelector(`input[value="${prov}"]`);
  if (radio) radio.checked = true;
  onProviderChange(prov, mod);
  initApiTab(mod);
});

chrome.storage.local.get(['apiKey'], (data) => {
  if (data.apiKey) $('apiKeyInput').value = data.apiKey;
});

document.querySelectorAll('input[name="provider"]').forEach(r => {
  r.addEventListener('change', (e) => {
    const newProv = e.target.value;
    // Models stored separately: 'model' for openrouter, 'cliModel' for claude-cli
    // Just switch provider — background.js reads the right model via getActiveModel()
    chrome.storage.sync.set({ provider: newProv });
    onProviderChange(newProv);
  });
});

// Dev tab provider change (openrouter vs claude-cli) — only affects Dev tab UI
function onProviderChange() {
  // Provider-specific UI updates can be added here
}

// API tab: load saved model into input
function initApiTab(savedModel) {
  const input = $('modelInput');
  if (!input) return;
  if (savedModel) input.value = savedModel;
}

// ══════════════════════════════════════════════════
// ── API provider auto-detect by key prefix ──
// ══════════════════════════════════════════════════

const isRu = chrome.i18n.getUILanguage().startsWith('ru');

// Build API key label with clickable provider links
(function buildApiKeyLabel() {
  const el = $('apiKeyLabel');
  if (!el) return;
  const label = chrome.i18n.getMessage('labelApiKeyPrefix') || 'API Key';
  el.textContent = '';
  el.appendChild(document.createTextNode(label + ' ('));
  const orLink = document.createElement('a');
  orLink.href = API_PROVIDERS.openrouter.getKeyUrl;
  orLink.target = '_blank';
  orLink.textContent = 'OpenRouter';
  orLink.className = 'label-link';
  el.appendChild(orLink);
  if (isRu) {
    el.appendChild(document.createTextNode(' / '));
    const pzLink = document.createElement('a');
    pzLink.href = API_PROVIDERS.polza.getKeyUrl;
    pzLink.target = '_blank';
    pzLink.textContent = 'Polza';
    pzLink.title = chrome.i18n.getMessage('polzaPaymentHint') || 'Payment in ₽';
    pzLink.className = 'label-link';
    el.appendChild(pzLink);
    el.appendChild(document.createTextNode(' ₽'));
  }
  el.appendChild(document.createTextNode(')'));
})();

function validateApiKey(key) {
  if (!key) return null;
  if (key.startsWith(API_PROVIDERS.openrouter.keyPrefix) || key.startsWith(API_PROVIDERS.polza.keyPrefix)) return null;
  return chrome.i18n.getMessage('apiKeyFormatWarning') || 'Key should start with sk-or- (OpenRouter) or pza_ (Polza)';
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
    const warning = validateApiKey(val);
    const el = $('apiKeyWarning');
    if (el) {
      el.textContent = warning || '';
      el.style.display = warning ? '' : 'none';
    }
  }, 500);
});

$('toggleKey').addEventListener('click', () => {
  const inp = $('apiKeyInput');
  inp.type = inp.type === 'password' ? 'text' : 'password';
});

// Model input (debounced)
let modelTimer;
$('modelInput').addEventListener('input', function() {
  clearTimeout(modelTimer);
  const val = this.value.trim();
  modelTimer = setTimeout(() => {
    if (val) {
      chrome.storage.sync.set({ model: val });
    }
  }, 500);
});


// ══════════════════════════════════════════════════
// ── Toggle (Player tab) ──
// ══════════════════════════════════════════════════

chrome.storage.sync.get(['hideSDH'], (data) => {
  $('toggleHideSDH').checked = !!data.hideSDH;
});
$('toggleHideSDH').addEventListener('change', () => {
  chrome.storage.sync.set({ hideSDH: $('toggleHideSDH').checked });
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
  $('styleFontSizeVal').textContent = v < 14 ? chrome.i18n.getMessage('fontSizeAuto') : v + 'px';
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
// ── Drop zone (Library tab, dev only) ──
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
      showDropStatus('error', chrome.i18n.getMessage('dropZoneOnlySrtVtt'));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showDropStatus('error', chrome.i18n.getMessage('dropZoneTooBig'));
      return;
    }

    showDropStatus('loading', chrome.i18n.getMessage('dropZoneReading'));

    const reader = new FileReader();
    reader.onload = () => {
      let text = reader.result;

      if (ext === '.srt') {
        text = text.replace(/^\uFEFF/, '');
        text = 'WEBVTT\n\n' + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      }

      showDropStatus('loading', chrome.i18n.getMessage('dropZoneSubmitting'));

      chrome.runtime.sendMessage({
        type: 'submit_file',
        vtt: text,
        title: file.name.replace(/\.[^.]+$/, ''),
      }, (resp) => {
        if (chrome.runtime.lastError || !resp?.ok) {
          const err = resp?.error || chrome.runtime.lastError?.message || chrome.i18n.getMessage('errorGeneric');
          showDropStatus('error', err);
          return;
        }
        const pos = resp.position > 0 ? ' ' + chrome.i18n.getMessage('dropZonePosition', [String(resp.position)]) : '';
        showDropStatus('success', chrome.i18n.getMessage('dropZoneSent') + pos);
        loadQueue();
      });
    };

    reader.onerror = () => showDropStatus('error', chrome.i18n.getMessage('dropZoneReadError'));
    reader.readAsText(file);
  }

  function showDropStatus(state, text) {
    clearTimeout(resetTimer);
    zone.className = 'drop-zone ' + state;
    zone.textContent = text;
    if (state === 'success' || state === 'error') {
      resetTimer = setTimeout(() => {
        zone.className = 'drop-zone';
        zone.textContent = chrome.i18n.getMessage('dropZoneDefault');
      }, 3000);
    }
  }
}

// ══════════════════════════════════════════════════
// ── Queue (Library tab, dev only) ──
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
      status.textContent = job.status === 'pending' ? chrome.i18n.getMessage('queuePending') : chrome.i18n.getMessage('queueRunning');

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
// ── API tab visibility and account state ──
// ══════════════════════════════════════════════════

// Track magic link state (not persisted — only lives while popup is open)
let magicLinkSent = false;
let resendTimer = null;

function updateApiTabVisibility(apiKey, user) {
  const btn = $('tabBtnApi');
  if (!btn) return;
  const plan = user?.plan;
  const exhausted = user && (user.quota_used >= user.quota_limit);
  // Hide API tab for Pro users with quota remaining
  if (plan === 'pro' && !exhausted && !apiKey) {
    btn.style.display = 'none';
    if (btn.classList.contains('active')) {
      document.querySelector('[data-tab="subtitles"]').click();
    }
  } else {
    btn.style.display = '';
  }
}


function formatResetDate(isoDate) {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString(chrome.i18n.getUILanguage(), { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function updateAccountBlock() {
  const notLogged = $('accountNotLoggedIn');
  const magicLinkDiv = $('accountMagicLinkSent');
  const logged = $('accountLoggedIn');
  const byokDiv = $('accountByok');
  if (!notLogged) return;

  chrome.storage.local.get(['apiKey', 'session_token', 'user'], (data) => {
    const { apiKey, session_token, user } = data;

    // Hide all states
    notLogged.style.display = 'none';
    magicLinkDiv.style.display = 'none';
    logged.style.display = 'none';
    byokDiv.style.display = 'none';

    // Update dependent UI
    updateApiTabVisibility(apiKey, user);
    // State 7: BYOK — has API key (highest priority)
    if (apiKey) {
      byokDiv.style.display = '';
      return;
    }

    // State 2: Magic link sent (transient, popup-lifetime only)
    if (magicLinkSent && !session_token) {
      magicLinkDiv.style.display = '';
      return;
    }

    // States 3-6: Logged in
    if (session_token && user) {
      logged.style.display = '';
      $('accountEmailDisplay').textContent = user.email || '';

      const plan = user.plan || 'free';
      const planLabel = plan === 'pro'
        ? chrome.i18n.getMessage('accountProPlan')
        : chrome.i18n.getMessage('accountFreePlan');
      $('accountPlanBadge').textContent = planLabel;

      const used = user.quota_used || 0;
      const limit = user.quota_limit || 5;
      const exhausted = used >= limit;

      // Quota bar
      const pct = Math.min(Math.round((used / limit) * 100), 100);
      $('accountQuotaFill').style.width = pct + '%';
      $('accountQuotaFill').style.background = exhausted ? 'var(--red)' : 'var(--amber)';
      $('accountQuotaText').textContent = chrome.i18n.getMessage('accountQuotaText', [String(used), String(limit)]);

      // Action button: Upgrade (free) or Manage (pro)
      const actionEl = $('accountAction');
      if (plan === 'pro') {
        actionEl.textContent = chrome.i18n.getMessage('accountManageSubscription');
        actionEl.href = `https://podstr.cc/${siteLang}/account/`;
      } else {
        actionEl.textContent = chrome.i18n.getMessage('accountUpgrade');
        actionEl.href = `https://podstr.cc/${siteLang}/pricing/`;
      }

      // Exhausted state
      const exhaustedEl = $('accountQuotaExhausted');
      const resetsEl = $('accountQuotaResets');
      const useKeyEl = $('accountUseOwnKey');

      if (exhausted) {
        // Show exhausted message
        if (exhaustedEl) {
          exhaustedEl.style.display = '';
          exhaustedEl.textContent = chrome.i18n.getMessage('accountQuotaExhausted', [String(limit)]);
        }
        if (resetsEl && user.quota_resets_at) {
          resetsEl.style.display = '';
          resetsEl.textContent = chrome.i18n.getMessage('accountQuotaResets', [formatResetDate(user.quota_resets_at)]);
        }
        if (useKeyEl) useKeyEl.style.display = '';
      } else {
        if (exhaustedEl) exhaustedEl.style.display = 'none';
        if (resetsEl) resetsEl.style.display = 'none';
        if (useKeyEl) useKeyEl.style.display = 'none';
      }

      return;
    }

    // State 1: Not logged in
    notLogged.style.display = '';
  });
}

// ── Sign In button ──
$('accountSignIn').addEventListener('click', () => {
  const email = $('accountEmail').value.trim();
  if (!email || !email.includes('@')) return;

  $('accountSignIn').disabled = true;
  const uiLang = chrome.i18n.getUILanguage().split('-')[0];

  chrome.runtime.sendMessage({
    type: 'auth_login',
    email,
    language: uiLang,
  }, (resp) => {
    $('accountSignIn').disabled = false;
    if (chrome.runtime.lastError || resp?.error) {
      const err = resp?.error || chrome.runtime.lastError?.message || chrome.i18n.getMessage('accountLoginError');
      $('accountEmail').style.borderColor = 'var(--red)';
      // Show error text briefly below the form
      const hint = $('accountNotLoggedIn').querySelector('[data-i18n="accountOrApiKey"]')?.parentElement;
      if (hint) {
        const origNodes = Array.from(hint.childNodes).map(n => n.cloneNode(true));
        hint.style.color = 'var(--red)';
        hint.textContent = err;
        setTimeout(() => { hint.replaceChildren(...origNodes); hint.style.color = ''; $('accountEmail').style.borderColor = ''; }, 3000);
      } else {
        setTimeout(() => { $('accountEmail').style.borderColor = ''; }, 2000);
      }
      console.warn('[podstr.cc] Login error:', err);
      return;
    }
    // Switch to magic link sent state
    magicLinkSent = true;
    startResendTimer();
    updateAccountBlock();
  });
});

// Enter key in email field
$('accountEmail').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('accountSignIn').click();
});

// ── Resend timer (60s cooldown) ──
function startResendTimer() {
  let seconds = 60;
  const resendLink = $('accountResend');
  const timerSpan = $('accountResendTimer');
  if (resendLink) resendLink.style.display = 'none';

  clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    seconds--;
    if (timerSpan) timerSpan.textContent = chrome.i18n.getMessage('accountResendIn', [String(seconds)]);
    if (seconds <= 0) {
      clearInterval(resendTimer);
      if (timerSpan) timerSpan.textContent = '';
      if (resendLink) resendLink.style.display = '';
    }
  }, 1000);
  if (timerSpan) timerSpan.textContent = chrome.i18n.getMessage('accountResendIn', [String(seconds)]);
}

// ── Resend click ──
if ($('accountResend')) {
  $('accountResend').addEventListener('click', (e) => {
    e.preventDefault();
    const email = $('accountEmail').value.trim();
    if (!email) return;
    const uiLang = chrome.i18n.getUILanguage().split('-')[0];
    chrome.runtime.sendMessage({ type: 'auth_login', email, language: uiLang });
    startResendTimer();
  });
}

// ── Logout ──
$('accountLogout').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.sendMessage({ type: 'auth_logout' });
  magicLinkSent = false;
  updateAccountBlock();
});

// ── BYOK → Sign In link ──
if ($('accountByokSignIn')) {
  $('accountByokSignIn').addEventListener('click', (e) => {
    e.preventDefault();
    // Clear API key to show login form
    // (User explicitly wants to switch to managed mode)
    // Don't clear API key — just switch to the login form view temporarily
    $('accountByok').style.display = 'none';
    $('accountNotLoggedIn').style.display = '';
  });
}

// ── "Use own API key" link (from exhausted state) ──
if ($('accountUseOwnKeyLink')) {
  $('accountUseOwnKeyLink').addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('[data-tab="api"]').click();
  });
}

// ── Storage change listener — auto-update popup ──
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.session_token || changes.user || changes.apiKey)) {
    updateAccountBlock();
  }
});

// ── Session refresh on popup open ──
chrome.runtime.sendMessage({ type: 'refresh_session' }, () => {
  if (chrome.runtime.lastError) return;
  updateAccountBlock();
});

// Initialize account block from current storage
updateAccountBlock();


// ══════════════════════════════════════════════════
// ── Target language dropdown (visible to all users) ──
// ══════════════════════════════════════════════════

const targetLangSelect = $('targetLangSelect');
for (const lang of TARGET_LANGS) {
  const opt = document.createElement('option');
  opt.value = lang.code;
  opt.textContent = lang.label;
  targetLangSelect.appendChild(opt);
}
chrome.storage.sync.get(['targetLang'], (data) => {
  targetLangSelect.value = data.targetLang || getDefaultTargetLang();
});
targetLangSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ targetLang: targetLangSelect.value });
});

