const el     = id => document.getElementById(id);
const set    = (id, v) => { const e = el(id); if (e) e.textContent = v; };

/** WebView bridge may return number or numeric string (sometimes JSON-wrapped). */
function parseApiNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object') {
    if (typeof value.valueOf === 'function') {
      const boxed = value.valueOf();
      if (typeof boxed === 'number' && Number.isFinite(boxed)) return boxed;
    }
    if (!Array.isArray(value)) {
      const nested = value.value ?? value.volume ?? value.percent ?? value.level;
      if (nested != null) return parseApiNumber(nested);
    }
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'number' && Number.isFinite(parsed)) return parsed;
        if (parsed && typeof parsed === 'object') {
          const nested = parsed.value ?? parsed.volume ?? parsed.percent ?? parsed.level;
          return parseApiNumber(nested);
        }
      } catch (e) { /* fall through */ }
    }
    const n = parseFloat(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** getCarData / runEnum may return a JSON string or a parsed object. */
function parseApiJson(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  return null;
}

let jsReadySent = false;

/** Poll until window.androidApi exists (e.g. injected after script load). */
function waitForAndroidApi(callback, options = {}) {
  const interval = options.interval ?? 500;
  const maxMs = options.maxMs ?? 30000;
  const started = Date.now();
  const tick = () => {
    if (window.androidApi) {
      callback(window.androidApi);
      return;
    }
    if (Date.now() - started >= maxMs) return;
    setTimeout(tick, interval);
  };
  tick();
}

/** True when the Android bridge can accept launcher commands. */
function isAndroidBridgeOperational() {
  const api = window.androidApi;
  if (!api || typeof api.runEnum !== 'function') return false;
  return ensureJsReady();
}

/** Docs: onJsReady(TOKEN) before androidApi commands. */
function ensureJsReady() {
  if (jsReadySent) return true;
  const api = window.androidApi;
  if (!api || typeof api.onJsReady !== 'function') return false;
  try {
    api.onJsReady(TOKEN);
    jsReadySent = true;
    return true;
  } catch (e) {
    return false;
  }
}

function run(cmd) {
  if (!cmd) return false;
  const api = window.androidApi;
  if (!api || typeof api.runEnum !== 'function') return false;
  ensureJsReady();
  try {
    const raw = api.runEnum(TOKEN, cmd);
    return parseApiJson(raw) ?? raw ?? true;
  } catch (e) {
    return false;
  }
}

const runApp = pkg => {
  const api = window.androidApi;
  if (!api || typeof api.runApp !== 'function') return false;
  ensureJsReady();
  try {
    api.runApp(TOKEN, pkg);
    return true;
  } catch (e) {
    return false;
  }
};

const saveLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const loadLS = k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };

/** Inline SVG + currentColor — работает на file:// без CORS (в отличие от mask-image) */
function buildClIcon(icon, extraClass = '') {
  const cls = extraClass ? `cl-icon ${extraClass}` : 'cl-icon';
  if (icon === 'icons/seat-heat.svg' || icon === 'icons/seat-vent.svg') {
    return `<div class="${cls}" aria-hidden="true"><img src="${icon}?v=20260910-2" alt=""></div>`;
  }
  const svg = typeof ICON_SVG !== 'undefined' ? ICON_SVG[icon] : null;
  if (svg) return `<div class="${cls}" aria-hidden="true">${svg}</div>`;
  return `<div class="${cls}"><img src="${icon}" alt=""></div>`;
}

function mountTempIcons() {
  document.querySelectorAll('.temp-btn-icon-minus').forEach(node => {
    const svg = typeof ICON_SVG !== 'undefined' ? ICON_SVG['icons/minus.svg'] : null;
    if (svg) node.innerHTML = svg;
  });
  document.querySelectorAll('.temp-btn-icon-plus').forEach(node => {
    const svg = typeof ICON_SVG !== 'undefined' ? ICON_SVG['icons/plus.svg'] : null;
    if (svg) node.innerHTML = svg;
  });
}

function callVolApi(method, value) {
  const api = window.androidApi;
  if (!api || typeof api[method] !== 'function') return null;
  ensureJsReady();
  try {
    return value === undefined ? api[method](TOKEN) : api[method](TOKEN, value);
  } catch (e) {
    return null;
  }
}

function hasVolReadApi() {
  return typeof window.androidApi?.getvol === 'function'
    || typeof window.androidApi?.getVolume === 'function';
}

function hasVolWriteApi() {
  return typeof window.androidApi?.setvol === 'function'
    || typeof window.androidApi?.setVolume === 'function';
}

function hasVolApi() {
  return hasVolReadApi() && hasVolWriteApi();
}

function clampMediaVolume(value) {
  const n = parseApiNumber(value);
  if (n == null || n < 0) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function getMediaVolume() {
  if (!hasVolReadApi()) return null;
  const raw = callVolApi('getvol') ?? callVolApi('getVolume');
  if (raw === -1) return null;
  return clampMediaVolume(raw);
}

function setMediaVolume(value) {
  if (!hasVolWriteApi()) return null;
  const v = clampMediaVolume(value);
  if (v == null) return null;
  callVolApi('setvol', v) ?? callVolApi('setVolume', v);
  return v;
}

const VOLUME_ENUM_CANDIDATES = {
  up: ['Volume_Up', 'volume_up', 'VOLUME_UP', 'VolumeUp', 'VOL_UP', 'vol_up'],
  down: ['Volume_Down', 'volume_down', 'VOLUME_DOWN', 'VolumeDown', 'VOL_DOWN', 'vol_down'],
};
const volumeEnumCache = { up: null, down: null, loaded: false };

function enumNameOf(item) {
  if (!item || typeof item !== 'object') return String(item || '');
  return String(item.RunEnum ?? item.enumName ?? item.name ?? item.value ?? item.cmd ?? '');
}

function loadVolumeEnums() {
  if (volumeEnumCache.loaded) return;
  volumeEnumCache.loaded = true;
  const api = window.androidApi;
  if (!api || typeof api.getRunEnum !== 'function') return;
  ensureJsReady();
  try {
    const list = parseApiJson(api.getRunEnum(TOKEN));
    const names = Array.isArray(list) ? list.map(enumNameOf) : [];
    volumeEnumCache.up = VOLUME_ENUM_CANDIDATES.up.find(name => names.includes(name)) || null;
    volumeEnumCache.down = VOLUME_ENUM_CANDIDATES.down.find(name => names.includes(name)) || null;
  } catch (e) {}
}

function runVolumeStep(delta) {
  loadVolumeEnums();
  const fallback = delta > 0 ? 'Volume_Up' : 'Volume_Down';
  const cmd = delta > 0
    ? (volumeEnumCache.up || fallback)
    : (volumeEnumCache.down || fallback);
  return run(cmd);
}
