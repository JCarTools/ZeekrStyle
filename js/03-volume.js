// ── Громкость (setvol + echo-suppress, fallback runEnum) ───
const VolumeManager = (() => {
  const ECHO_SUPPRESS_MS = 1600;
  const VOL_STEP = 3;
  const ENUM_STEP_MS = 90;
  const DIRECT_COMMIT_MS = 180;
  const POLL_MS = 1000;

  let currentVolume = 50;
  let lastSetValue = null;
  let lastSetTime = 0;
  let mode = null;
  let modeResolved = false;
  let enumTimer = null;
  let commitTimer = null;
  let pendingVolume = null;
  let pollTimer = null;
  let initialized = false;
  let callbacks = [];

  function isSuppressing() {
    return lastSetValue != null && (Date.now() - lastSetTime) < ECHO_SUPPRESS_MS;
  }

  function notify() {
    callbacks.forEach(cb => {
      try { cb(currentVolume); } catch (e) {}
    });
  }

  function readRawVolume() {
    if (!hasVolReadApi()) return null;
    const raw = callVolApi('getvol') ?? callVolApi('getVolume');
    if (raw === -1) return null;
    return clampMediaVolume(raw);
  }

  function applyVolume(v, options = {}) {
    if (v == null) return currentVolume;
    if (!options.force && pendingVolume != null) return currentVolume;
    if (!options.force && isSuppressing() && v !== lastSetValue) return currentVolume;
    if (v !== currentVolume) {
      currentVolume = v;
      notify();
    }
    if (lastSetValue === v) {
      lastSetValue = null;
    }
    return currentVolume;
  }

  function fetchVolume(options = {}) {
    const volume = readRawVolume();
    if (volume == null) return null;
    return applyVolume(volume, options);
  }

  function resolveMode() {
    if (modeResolved) return mode || 'direct';
    const cached = loadLS('lite_vol_mode');
    if (cached === 'direct' || cached === 'enum') {
      mode = cached;
      modeResolved = true;
      return mode;
    }
    mode = 'direct';
    modeResolved = true;
    return mode;
  }

  function setMode(next) {
    if (next !== 'direct' && next !== 'enum') return;
    mode = next;
    modeResolved = true;
    saveLS('lite_vol_mode', next);
  }

  function getMode() {
    return resolveMode();
  }

  function setVolumeDirect(value) {
    const v = clampMediaVolume(value);
    if (v == null) return;
    pendingVolume = v;
    if (v !== currentVolume) {
      currentVolume = v;
      notify();
    }
    if (commitTimer) clearTimeout(commitTimer);
    commitTimer = setTimeout(() => {
      commitTimer = null;
      const target = pendingVolume;
      pendingVolume = null;
      if (target == null) return;
      lastSetValue = target;
      lastSetTime = Date.now();
      callVolApi('setvol', target) ?? callVolApi('setVolume', target);
    }, DIRECT_COMMIT_MS);
  }

  function setVolumeDirectNow(value) {
    const v = clampMediaVolume(value);
    if (v == null) return;
    if (commitTimer) {
      clearTimeout(commitTimer);
      commitTimer = null;
    }
    pendingVolume = null;
    lastSetValue = v;
    lastSetTime = Date.now();
    callVolApi('setvol', v) ?? callVolApi('setVolume', v);
    if (v !== currentVolume) {
      currentVolume = v;
      notify();
    }
  }

  function clearEnumTimer() {
    if (enumTimer) {
      clearTimeout(enumTimer);
      enumTimer = null;
    }
  }

  function enumChange(delta) {
    const step = delta > 0 ? 1 : -1;
    const count = Math.abs(delta);
    for (let i = 0; i < count; i++) runVolumeStep(step);
    const est = clampMediaVolume(currentVolume + delta);
    if (est != null) {
      currentVolume = est;
      notify();
    }
  }

  function stepTowardEnum(target, attemptsLeft) {
    if (attemptsLeft <= 0) {
      clearEnumTimer();
      return;
    }
    const live = readRawVolume();
    const current = live ?? currentVolume;
    if (current === target || (target === 0 && current <= 0)) {
      currentVolume = target;
      notify();
      clearEnumTimer();
      return;
    }
    runVolumeStep(current < target ? 1 : -1);
    enumTimer = setTimeout(() => stepTowardEnum(target, attemptsLeft - 1), ENUM_STEP_MS);
  }

  function setVolume(value) {
    const v = clampMediaVolume(value);
    if (v == null) return;
    if (getMode() === 'enum') {
      clearEnumTimer();
      stepTowardEnum(v, 120);
      return;
    }
    setVolumeDirect(v);
  }

  function volumeUp(step = VOL_STEP) {
    if (getMode() === 'enum') {
      enumChange(step);
      return;
    }
    setVolumeDirect(Math.min(100, currentVolume + step));
  }

  function volumeDown(step = VOL_STEP) {
    if (getMode() === 'enum') {
      enumChange(-step);
      return;
    }
    setVolumeDirect(Math.max(0, currentVolume - step));
  }

  function probeMode() {
    const cached = loadLS('lite_vol_mode');
    if (cached === 'direct' || cached === 'enum') {
      mode = cached;
      modeResolved = true;
      return;
    }
    setMode('direct');
  }

  function handleVolumeFromSystem(volume) {
    const v = clampMediaVolume(volume ?? parseApiNumber(volume));
    if (v == null) return;
    if (pendingVolume != null) return;
    if (isSuppressing() && v !== lastSetValue) return;
    if (v !== currentVolume) {
      currentVolume = v;
      notify();
    }
    if (lastSetValue === v) {
      lastSetValue = null;
    }
  }

  function startPolling() {
    if (pollTimer || !hasVolReadApi()) return;
    pollTimer = setInterval(() => fetchVolume(), POLL_MS);
  }

  function stopPolling() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function init() {
    if (initialized) {
      startPolling();
      return;
    }
    initialized = true;
    probeMode();
    startPolling();
  }

  return {
    init,
    fetchVolume,
    getVolume: () => currentVolume,
    setVolume,
    setVolumeNow: setVolumeDirectNow,
    volumeUp,
    volumeDown,
    handleVolumeFromSystem,
    getMode,
    startPolling,
    stopPolling,
    subscribe(cb) {
      if (typeof cb !== 'function') return () => {};
      callbacks.push(cb);
      cb(currentVolume);
      return () => {
        const i = callbacks.indexOf(cb);
        if (i !== -1) callbacks.splice(i, 1);
      };
    },
  };
})();
