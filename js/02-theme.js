// ── Тема ───────────────────────────────────────────────────
const ThemeManager = (() => {
  const MODES = ['dark', 'light', 'auto'];
  const META = {
    dark: {
      path: 'M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8A9.02 9.02 0 0 0 12 3z'
    },
    light: {
      path: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41'
    },
    auto: {
      svg: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="Roboto, Segoe UI, sans-serif">A</text>'
    }
  };
  const legacyTheme = loadLS('lite_theme');
  let mode = loadLS('lite_theme_mode') || (MODES.includes(legacyTheme) ? legacyTheme : null) || 'dark';
  if (!loadLS('lite_theme_mode') && MODES.includes(legacyTheme)) {
    saveLS('lite_theme_mode', legacyTheme);
  }
  let systemTheme = 'dark';

  function updateThemeButton() {
    document.querySelectorAll('input[name="settings-theme"]').forEach(input => {
      input.checked = input.value === mode;
    });
  }

  const DARK_METHODS = /^(isDark|isDarkMode|getDarkMode|getDark)$/i;
  let pollTimer = null;

  function parseThemeValue(raw, hint) {
    if (raw == null) return null;

    if (typeof raw === 'boolean') {
      return raw ? 'dark' : 'light';
    }

    if (typeof raw === 'number' && Number.isFinite(raw)) {
      if (hint && DARK_METHODS.test(hint)) {
        if (raw === 1) return 'dark';
        if (raw === 0) return 'light';
      }
      const nightBits = raw & 0x30;
      if (nightBits === 0x20) return 'dark';
      if (nightBits === 0x10) return 'light';
      if (raw === 2 || raw === 32) return 'dark';
      if (raw === 1 || raw === 16) return 'light';
      if (raw === 0) return 'light';
      return null;
    }

    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try { return parseThemeValue(JSON.parse(trimmed), hint); } catch(e) {}
      }
      const s = trimmed.toLowerCase();
      if (/(dark|night|ноч|тём|темн)/.test(s)) return 'dark';
      if (/(light|day|день|свет)/.test(s)) return 'light';
      const asNum = Number(trimmed);
      if (trimmed === String(asNum) && Number.isFinite(asNum)) {
        return parseThemeValue(asNum, hint);
      }
      return null;
    }

    if (typeof raw === 'object') {
      const v = raw.value ?? raw.mode ?? raw.theme ?? raw.uiMode ?? raw.nightMode
        ?? raw.isDark ?? raw.dark ?? raw.isNight ?? raw.night;
      if (v !== undefined && v !== null) return parseThemeValue(v, hint);
      return null;
    }

    return null;
  }

  function tryParseApiValue(raw, hint) {
    return parseThemeValue(raw, hint);
  }

  function callApiMethod(api, method) {
    const fn = api[method];
    if (typeof fn !== 'function') return null;
    if (typeof ensureJsReady === 'function') ensureJsReady();
    const argSets = [[TOKEN], []];
    for (const args of argSets) {
      try {
        const parsed = tryParseApiValue(fn.apply(api, args), method);
        if (parsed) return parsed;
      } catch(e) {}
    }
    return null;
  }

  function parseJcThemeEvent(data) {
    if (data == null) return null;
    if (typeof data === 'string') {
      const s = data.trim().toLowerCase();
      if (s === 'dark' || s === 'light') return s;
      try { return parseJcThemeEvent(JSON.parse(data)); } catch(e) { return null; }
    }
    if (typeof data === 'object') {
      if (data.mode != null) {
        return String(data.mode).toLowerCase() === 'dark' ? 'dark' : 'light';
      }
      return parseThemeValue(data);
    }
    return null;
  }

  function readMediaTheme() {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function readAndroidTheme() {
    const api = window.androidApi;
    if (!api) return null;

    const props = ['theme', 'uiMode', 'nightMode', 'systemTheme', 'isDark', 'isDarkMode', 'darkMode'];
    for (const prop of props) {
      if (api[prop] == null || typeof api[prop] === 'function') continue;
      const parsed = tryParseApiValue(api[prop], prop);
      if (parsed) return parsed;
    }

    const methods = [
      'getTheme', 'getUiMode', 'getNightMode', 'getDarkMode',
      'isDarkMode', 'getSystemTheme', 'getDisplayTheme', 'isDark',
      'getDayNightMode', 'getConfiguration'
    ];
    for (const method of methods) {
      const parsed = callApiMethod(api, method);
      if (parsed) return parsed;
    }
    return null;
  }

  function readSystemTheme() {
    if (window.androidApi) {
      const fromAndroid = readAndroidTheme();
      if (fromAndroid) return fromAndroid;
    }
    return readMediaTheme();
  }

  function extractThemePayload(data) {
    if (data == null) return null;
    if (typeof data === 'object') {
      return data.value ?? data.mode ?? data.theme ?? data.uiMode ?? data.nightMode
        ?? data.isDark ?? data.isNight ?? data.dark ?? data.night ?? data;
    }
    return data;
  }

  function handleThemeEvent(type, data) {
    if (typeof type === 'object' && type != null && data === undefined) {
      return handleThemeEvent('theme', type);
    }
    if (typeof type === 'string' && data === undefined) {
      const direct = parseThemeValue(type, 'callback');
      if (direct) {
        setSystemTheme(direct, 'callback');
        return;
      }
    }
    const jc = parseJcThemeEvent(data) ?? parseJcThemeEvent(type);
    if (jc) {
      setSystemTheme(jc, 'jc-theme');
      return;
    }
    const parsed = parseThemeValue(extractThemePayload(data), type);
    if (parsed) setSystemTheme(parsed, type);
  }

  function resolvedTheme() {
    return mode === 'auto' ? systemTheme : mode;
  }

  function apply() {
    const theme = resolvedTheme();
    document.documentElement.dataset.theme = theme;
    updateThemeButton();
    if (typeof applyAccent === 'function') applyAccent(accent);
  }

  function setMode(next) {
    if (!MODES.includes(next)) return;
    mode = next;
    saveLS('lite_theme_mode', mode);
    if (mode === 'auto') {
      systemTheme = readSystemTheme();
      startAutoPoll();
    } else {
      stopAutoPoll();
    }
    apply();
  }

  function cycleMode() {
    setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
  }

  function setSystemTheme(next, hint) {
    const parsed = parseThemeValue(next, hint);
    if (!parsed) return;
    if (parsed === systemTheme) return;
    systemTheme = parsed;
    if (mode === 'auto') apply();
  }

  function refreshSystemTheme() {
    if (mode !== 'auto') return;
    const next = readSystemTheme();
    const changed = next !== systemTheme;
    if (changed) {
      systemTheme = next;
    }
    apply();
  }

  function startAutoPoll() {
    stopAutoPoll();
    if (mode !== 'auto') return;
    pollTimer = setInterval(refreshSystemTheme, 2000);
  }

  function stopAutoPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  systemTheme = readSystemTheme();

  window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener('change', () => {
    if (mode === 'auto') refreshSystemTheme();
  });

  function scheduleThemeRefresh() {
    refreshSystemTheme();
    [100, 500, 1500, 3000, 5000, 10000, 30000].forEach(ms => setTimeout(refreshSystemTheme, ms));
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && mode === 'auto') refreshSystemTheme();
  });

  function routeThemeCallback(type, data) {
    handleThemeEvent(type, data);
  }

  window.onSystemThemeChange = routeThemeCallback;
  window.onThemeChange = routeThemeCallback;
  window.onUiModeChange = routeThemeCallback;
  window.onDayNightChange = routeThemeCallback;

  if (mode === 'auto') startAutoPoll();

  return {
    setMode,
    cycleMode,
    scheduleThemeRefresh,
    handleThemeEvent,
    getMode: () => mode,
  };
})();

accent = loadLS('lite_accent') || '#675CFF';

function applyAccent(color) {
  accent = color;
  const r = parseInt(color.slice(1,3),16), g = parseInt(color.slice(3,5),16), b = parseInt(color.slice(5,7),16);
  const channel = value => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const accentIsLight = luminance > 0.48;
  document.body.style.setProperty('--accent', color);
  document.body.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  document.body.style.setProperty('--accent-contrast', accentIsLight ? '#111318' : '#ffffff');
  document.body.style.setProperty('--accent-icon-filter', accentIsLight ? 'brightness(0)' : 'brightness(0) invert(1)');
  document.body.style.setProperty('--accent-18', `rgba(${r},${g},${b},0.18)`);
  document.body.style.setProperty('--accent-20', `rgba(${r},${g},${b},0.16)`);
  document.body.style.setProperty('--accent-24', `rgba(${r},${g},${b},0.24)`);
  document.body.style.setProperty('--accent-30', `rgba(${r},${g},${b},0.24)`);
  document.body.style.setProperty('--accent-50', `rgba(${r},${g},${b},0.42)`);
  document.querySelectorAll('.accent-dot').forEach(d => d.classList.toggle('active', d.dataset.color === color));
  const swatch = el('accent-swatch');
  if (swatch) swatch.style.background = color;
  saveLS('lite_accent', color);
}

(function initAccent() {
  const container = el('accent-btns');
  if (!container) return;
  ACCENTS.forEach(color => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'accent-dot';
    dot.dataset.color = color;
    dot.style.background = color;
    dot.addEventListener('click', () => {
      applyAccent(color);
    });
    container.appendChild(dot);
  });
  applyAccent(accent);
})();

ThemeManager.setMode(ThemeManager.getMode());

const ScaleManager = (() => {
  const MODES = ['l', 'm', 's'];
  const LABELS = { l: 'L', m: 'M', s: 'S' };
  let mode = loadLS('lite_ui_scale') || 'l';
  if (!MODES.includes(mode)) mode = 'l';

  function updateButton() {
    document.querySelectorAll('input[name="settings-scale"]').forEach(input => {
      input.checked = input.value === mode;
    });
  }

  function apply() {
    document.documentElement.dataset.uiScale = mode;
    updateButton();
    if (typeof updateAppsLayout === 'function') updateAppsLayout();
  }

  function setMode(next) {
    if (!MODES.includes(next)) return;
    mode = next;
    saveLS('lite_ui_scale', mode);
    apply();
  }

  function cycleMode() {
    setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
  }

  apply();

  return { setMode, cycleMode, getMode: () => mode };
})();

(function initSettingsInputs() {
  document.querySelectorAll('input[name="settings-theme"]').forEach(input => {
    input.addEventListener('change', () => {
      if (input.checked) ThemeManager.setMode(input.value);
    });
  });
  document.querySelectorAll('input[name="settings-scale"]').forEach(input => {
    input.addEventListener('change', () => {
      if (input.checked) ScaleManager.setMode(input.value);
    });
  });
})();

function updateClock() {
  const n = new Date();
  set("clock", String(n.getHours()).padStart(2,"0") + ":" + String(n.getMinutes()).padStart(2,"0"));
  set("date", n.getDate() + " " + MONTHS[n.getMonth()] + " · " + WEEKDAYS[n.getDay()]);
}
setInterval(updateClock, 10000);
updateClock();
