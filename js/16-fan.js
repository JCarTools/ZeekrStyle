'use strict';

window.FanManager = (() => {
  const MIN_LEVEL = 0;
  const MAX_LEVEL = 7;
  const STORAGE_KEY = 'zeekr.fan.level';
  const SET_COMMANDS = ['CMD_AC_BLOW_SPEED_LEVEL', 'SET_BLOW_LEVEL', 'BLOW_SPEED_LEVEL'];
  const STEP_COMMANDS = {
    up: ['CMD_AC_BLOW_LEVEL_STEP_UP', 'BLOW_LEVEL_UP', 'FAN_UP', 'AC_BLOW_UP'],
    down: ['CMD_AC_BLOW_LEVEL_STEP_DOWN', 'BLOW_LEVEL_DOWN', 'FAN_DOWN', 'AC_BLOW_DOWN'],
  };
  let initialized = false;
  let supportedCommands = null;
  let level = clamp(loadLS(STORAGE_KEY) ?? 0);

  function clamp(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return MIN_LEVEL;
    return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(numeric)));
  }

  function render() {
    const display = el('fan-speed-display');
    const icon = display?.querySelector('.fan-speed-icon');
    if (display) {
      display.dataset.level = String(level);
      display.setAttribute('aria-label', `Скорость вентилятора: ${level}`);
    }
    if (icon) icon.classList.toggle('is-running', level > 0);
    document.querySelectorAll('#fan-speed-bars i').forEach((bar, index) => {
      bar.classList.toggle('on', index < level);
    });
    const down = el('btn-fan-down');
    const up = el('btn-fan-up');
    if (down) down.disabled = level <= MIN_LEVEL;
    if (up) up.disabled = level >= MAX_LEVEL;
  }

  function commit(next) {
    level = clamp(next);
    saveLS(STORAGE_KEY, level);
    render();
  }

  function commandName(item) {
    if (!item || typeof item !== 'object') return String(item || '');
    return String(item.RunEnum ?? item.enumName ?? item.name ?? item.value ?? item.cmd ?? '');
  }

  function loadSupportedCommands() {
    if (supportedCommands !== null) return supportedCommands;
    const api = window.androidApi;
    if (!api || typeof api.getRunEnum !== 'function') return null;
    ensureJsReady();
    try {
      const parsed = parseApiJson(api.getRunEnum(TOKEN));
      const list = Array.isArray(parsed)
        ? parsed
        : (Array.isArray(parsed?.items) ? parsed.items : (Array.isArray(parsed?.data) ? parsed.data : []));
      supportedCommands = new Map();
      list.forEach(item => {
        const name = commandName(item).trim();
        if (name) supportedCommands.set(name.toLowerCase(), name);
      });
    } catch (e) {
      supportedCommands = new Map();
    }
    return supportedCommands;
  }

  function supportedName(candidates) {
    const commands = loadSupportedCommands();
    if (!commands?.size) return null;
    for (const candidate of candidates) {
      const actual = commands.get(candidate.toLowerCase());
      if (actual) return actual;
    }
    return null;
  }

  function resultRejected(result) {
    if (result === false || result == null) return true;
    if (typeof result === 'object') {
      return result.ok === false || result.success === false || Boolean(result.error);
    }
    if (typeof result === 'string') {
      return /(?:error|unknown|unsupported|not[ _-]?found|не поддерж|ошиб)/i.test(result);
    }
    return false;
  }

  function sendStep(direction, target) {
    const setName = supportedName(SET_COMMANDS);
    if (setName) {
      const setResult = run(`${setName}:${target}`);
      if (!resultRejected(setResult)) return true;
    }

    const candidates = direction > 0 ? STEP_COMMANDS.up : STEP_COMMANDS.down;
    const stepName = supportedName(candidates) || candidates[0];
    return !resultRejected(run(stepName));
  }

  function step(direction) {
    const target = clamp(level + direction);
    if (target === level) return;
    commit(target);
    sendStep(direction, target);
  }

  function init() {
    if (initialized) return;
    const down = el('btn-fan-down');
    const up = el('btn-fan-up');
    const display = el('fan-speed-display');
    if (!down || !up || !display) return;
    initialized = true;
    render();
    bindVolumeRepeat(down, () => step(-1));
    bindVolumeRepeat(up, () => step(1));
    loadSupportedCommands();
  }

  return { init, getLevel: () => level };
})();

window.FanManager.init();
