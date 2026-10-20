'use strict';

// Мини-карта и HUD-данные, поступающие из JCarTools.
const MiniMapPanel = (() => {
  const STREAM_WATCHDOG_MS = 2500;
  const STREAM_STALE_MS = 10000;
  const PANEL_TRANSITION_MS = 340;
  const button = el('btn-mini-map');
  const panel = el('mini-map-panel');
  const sidePanel = el('top-left');
  const image = el('mini-map-image');
  const placeholderText = el('mini-map-placeholder-text');
  const navigation = el('mini-map-navigation');
  const turnIcon = el('mini-map-turn-icon');
  const turnDistance = el('mini-map-turn-distance');
  const remainDistance = el('mini-map-remain-distance');
  const nextRoad = el('mini-map-next-road');
  const speedLimit = el('mini-map-speed-limit');
  const speedLimitValue = el('mini-map-speed-limit-value');
  const radar = el('mini-map-radar');
  const radarDistance = el('mini-map-radar-distance');
  const radarLimit = el('mini-map-radar-limit');
  const gps = el('mini-map-gps');
  const gpsText = el('mini-map-gps-text');

  const TURN_SYMBOLS = {
    2: '↰',
    3: '↱',
    4: '↖',
    5: '↗',
    6: '⬅',
    7: '➡',
    8: '↶',
    9: '↑',
    14: '⚠',
    15: '⚑',
    19: '↷',
    24: '⟳',
    49: '⛴',
    55: '↗',
  };

  let opened = false;
  let subscribed = false;
  let waitingForApi = false;
  let lastFrameTimestamp = 0;
  let lastFrameReceivedAt = 0;
  let subscriptionStartedAt = 0;
  let watchdogTimer = null;
  let reconnectTimer = null;
  let closeTimer = null;

  function syncPanelGeometry() {
    if (!panel || !sidePanel) return;
    const sideRect = sidePanel.getBoundingClientRect();
    const panelStyle = getComputedStyle(sidePanel);
    const uiScale = Number.parseFloat(panelStyle.getPropertyValue('--ui-scale')) || 1;
    const gap = 12 * uiScale;

    panel.style.left = `${sideRect.right + gap}px`;
    panel.style.right = 'auto';
    panel.style.bottom = `${Math.max(0, window.innerHeight - sideRect.bottom)}px`;
    panel.style.width = `${sideRect.height}px`;
    panel.style.height = `${sideRect.height}px`;
  }

  function asObject(raw) {
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return null;
    return parseApiJson(raw);
  }

  function asBoolean(value, fallback = false) {
    if (value == null) return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'on', 'yes'].includes(normalized)) return true;
    if (['0', 'false', 'off', 'no'].includes(normalized)) return false;
    return fallback;
  }

  function formatDistance(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return '—';
    if (number < 1000) return `${Math.round(number)} м`;
    const km = number / 1000;
    return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} км`;
  }

  function normalizeLimit(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
  }

  function currentMapTheme() {
    return document.documentElement.dataset.theme === 'light' ? 'day' : 'night';
  }

  function updateMapTheme() {
    if (!opened) return;
    const api = window.androidApi;
    if (!api || typeof api.setMiniMapTheme !== 'function') return;
    try {
      ensureJsReady();
      api.setMiniMapTheme(TOKEN, currentMapTheme());
    } catch (e) {}
  }

  function subscribe() {
    if (!opened || subscribed) return subscribed;
    const api = window.androidApi;
    if (!api || typeof api.subscribeMiniMap !== 'function') {
      if (placeholderText) placeholderText.textContent = 'Ожидание MiniMap API JCarTools…';
      if (!waitingForApi) {
        waitingForApi = true;
        waitForAndroidApi(() => {
          waitingForApi = false;
          if (opened) subscribe();
        });
      }
      return false;
    }

    try {
      ensureJsReady();
      updateMapTheme();
      const result = api.subscribeMiniMap(TOKEN);
      if (result === false || result === 'false') {
        subscribed = false;
        return false;
      }
      subscribed = true;
      subscriptionStartedAt = Date.now();
      if (placeholderText) placeholderText.textContent = 'Ожидание данных карты…';
      return true;
    } catch (e) {
      if (placeholderText) placeholderText.textContent = 'Не удалось включить мини-карту';
      return false;
    }
  }

  function unsubscribe() {
    const api = window.androidApi;
    if (subscribed && api && typeof api.unsubscribeMiniMap === 'function') {
      try {
        ensureJsReady();
        api.unsubscribeMiniMap(TOKEN);
      } catch (e) {}
    }
    subscribed = false;
    subscriptionStartedAt = 0;
  }

  function reconnect() {
    if (!opened || reconnectTimer) return;
    unsubscribe();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (opened) subscribe();
    }, 250);
  }

  function startWatchdog() {
    if (watchdogTimer) return;
    watchdogTimer = setInterval(() => {
      if (!opened) return;
      if (!subscribed) {
        subscribe();
        return;
      }
      const referenceTime = lastFrameReceivedAt || subscriptionStartedAt;
      if (referenceTime && Date.now() - referenceTime >= STREAM_STALE_MS) reconnect();
    }, STREAM_WATCHDOG_MS);
  }

  function stopWatchdog() {
    if (watchdogTimer) clearInterval(watchdogTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    watchdogTimer = null;
    reconnectTimer = null;
  }

  function setOpen(value) {
    const nextOpened = !!value;
    if (nextOpened && typeof window.closeDrawer === 'function') window.closeDrawer();
    opened = nextOpened;
    if (!panel || !button) return;
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    panel.setAttribute('aria-hidden', opened ? 'false' : 'true');
    button.classList.toggle('active', opened);
    button.setAttribute('aria-pressed', opened ? 'true' : 'false');
    button.setAttribute('aria-label', opened ? 'Скрыть мини-карту' : 'Показать мини-карту');
    document.body.classList.toggle('mini-map-open', opened);
    if (opened) {
      panel.hidden = false;
      panel.classList.remove('is-open');
      syncPanelGeometry();
      panel.getBoundingClientRect();
      requestAnimationFrame(() => {
        if (opened) panel.classList.add('is-open');
      });
      lastFrameReceivedAt = 0;
      subscribe();
      startWatchdog();
    } else {
      panel.classList.remove('is-open');
      closeTimer = setTimeout(() => {
        closeTimer = null;
        if (!opened) panel.hidden = true;
      }, PANEL_TRANSITION_MS);
      stopWatchdog();
      unsubscribe();
    }
  }

  function imageSource(value) {
    if (typeof value !== 'string') return null;
    const source = value.trim();
    if (!source) return null;
    if (/^(data:image\/|blob:|file:|https?:)/i.test(source)) return source;
    if (source.length > 256 && /^[A-Za-z0-9+/=\r\n]+$/.test(source)) {
      return `data:image/png;base64,${source.replace(/\s+/g, '')}`;
    }
    return null;
  }

  function applyFrame(raw) {
    const data = asObject(raw) || {};
    const source = imageSource(data.image ?? data.src ?? data.frame);
    const timestamp = Number(data.timestamp ?? Date.now());
    if (!source || !image) return false;
    // Не отбрасываем кадры по timestamp: разные версии JCarTools используют
    // Unix-время, счётчик с запуска или вообще присылают его не во всех кадрах.
    lastFrameTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now();
    lastFrameReceivedAt = Date.now();
    image.onload = () => panel?.classList.add('has-frame');
    image.onerror = () => panel?.classList.remove('has-frame');
    image.src = source;
    return true;
  }

  function renderNavigation(data) {
    const hasRouteData = Number(data.turnDist) > 0
      || Number(data.remainDist) > 0
      || Number(data.turnType) > 0
      || String(data.nextRoad || '').trim().length > 0;
    const enabled = asBoolean(data.naviOn, hasRouteData);
    if (navigation) navigation.hidden = !enabled;
    navigation?.classList.toggle('is-inactive', !enabled);
    if (!enabled) {
      if (turnDistance) turnDistance.textContent = '—';
      if (remainDistance) remainDistance.textContent = '';
      if (nextRoad) nextRoad.textContent = 'Маршрут не запущен';
      if (speedLimit) speedLimit.hidden = true;
      panel?.classList.remove('navigation-urgent');
      return;
    }

    if (turnIcon) turnIcon.textContent = TURN_SYMBOLS[Number(data.turnType)] || '↑';
    if (turnDistance) turnDistance.textContent = formatDistance(data.turnDist);
    if (remainDistance) {
      const remaining = formatDistance(data.remainDist);
      remainDistance.textContent = remaining === '—' ? '' : `Осталось ${remaining}`;
    }
    if (nextRoad) nextRoad.textContent = String(data.nextRoad || 'Двигайтесь по маршруту');

    const limitValue = normalizeLimit(data.speedLimit);
    if (speedLimit) speedLimit.hidden = limitValue == null;
    if (speedLimitValue && limitValue != null) speedLimitValue.textContent = String(limitValue);
    panel?.classList.toggle('navigation-urgent', Number(data.turnDist) < 80);
  }

  function renderRadar(data) {
    const enabled = asBoolean(data.aradarOn, true);
    if (radar) radar.hidden = !enabled;
    if (!enabled) return;
    if (radarDistance) radarDistance.textContent = formatDistance(data.remainDist);
    const limitValue = normalizeLimit(data.speedLimit);
    if (radarLimit) {
      radarLimit.textContent = limitValue == null ? 'Ограничение —' : `Ограничение ${limitValue}`;
    }
    radar?.classList.toggle('urgent', Number(data.remainDist) < 250);
  }

  function handleHud(raw) {
    const data = asObject(raw);
    if (!data) return false;
    const sender = String(data.hudSenderType || '').trim().toUpperCase();
    if (sender === 'NAVI' || data.naviOn != null) {
      renderNavigation(data);
      return true;
    }
    if (sender === 'ARAD' || data.aradarOn != null) {
      renderRadar(data);
      return true;
    }
    return false;
  }

  function handleGpsSignal(raw) {
    const data = asObject(raw);
    const value = Number(data?.updateSignalQuality ?? data?.quality ?? data?.value ?? raw);
    if (!gps) return false;
    if (!Number.isFinite(value)) {
      gps.hidden = true;
      delete gps.dataset.level;
      return false;
    }

    let level = 5;
    if (value < 14) level = 0;
    else if (value < 30) level = 1;
    else if (value < 50) level = 2;
    else if (value < 70) level = 3;
    else if (value < 80) level = 4;
    gps.hidden = false;
    gps.dataset.level = String(level);
    if (gpsText) gpsText.textContent = level === 0 ? 'GPS слабый' : `GPS ${Math.round(value)}`;
    return true;
  }

  button?.addEventListener('click', () => setOpen(!opened));
  window.addEventListener('resize', syncPanelGeometry);
  if (sidePanel && typeof ResizeObserver === 'function') {
    new ResizeObserver(syncPanelGeometry).observe(sidePanel);
  }
  window.addEventListener('beforeunload', () => {
    if (closeTimer) clearTimeout(closeTimer);
    stopWatchdog();
    unsubscribe();
  });

  if (typeof MutationObserver === 'function') {
    new MutationObserver(updateMapTheme).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  setOpen(false);

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!opened),
    isOpen: () => opened,
    applyFrame,
    handleHud,
    handleGpsSignal,
    updateMapTheme,
  };
})();

window.MiniMapPanel = MiniMapPanel;
window.setLauncherMiniMapFrame = (image, timestamp = Date.now()) => {
  MiniMapPanel.applyFrame({ image, timestamp });
};
