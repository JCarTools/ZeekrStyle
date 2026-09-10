'use strict';

// Наружная температура по данным бортового компьютера.
const OutsideTempManager = (() => {
  const POLL_MS = 30000;
  const API_WAIT_MS = 30000;
  let pollTimer = null;
  let apiWaitTimer = null;

  function normalize(value) {
    const parsed = parseApiJson(value) ?? value;
    const raw = parsed && typeof parsed === 'object'
      ? (parsed.outTemp ?? parsed.outsideTemp ?? parsed.outsideTemperature ?? parsed.temperature ?? parsed.value)
      : parsed;
    const number = Number(raw);
    return Number.isFinite(number) && number >= -60 && number <= 80 ? number : null;
  }

  function format(value) {
    const rounded = Math.round(value * 10) / 10;
    const text = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(Math.abs(rounded));
    const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
    return `За бортом ${sign}${text}°`;
  }

  function apply(value) {
    const temperature = normalize(value);
    if (temperature == null) return false;
    set('outside-temp', format(temperature));
    return true;
  }

  function refresh() {
    const api = window.androidApi;
    if (!api || typeof api.getCarData !== 'function' || document.hidden) return false;
    ensureJsReady();
    try {
      return apply(api.getCarData(TOKEN, 'outTemp'));
    } catch (e) {
      return false;
    }
  }

  function stop() {
    if (pollTimer) clearInterval(pollTimer);
    if (apiWaitTimer) clearTimeout(apiWaitTimer);
    pollTimer = null;
    apiWaitTimer = null;
  }

  function start() {
    stop();
    const startedAt = Date.now();
    const connect = () => {
      const api = window.androidApi;
      if (api && typeof api.getCarData === 'function') {
        refresh();
        pollTimer = setInterval(refresh, POLL_MS);
        return;
      }
      if (Date.now() - startedAt < API_WAIT_MS) apiWaitTimer = setTimeout(connect, 500);
    };
    connect();
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });

  return { apply, refresh, start, stop };
})();

window.OutsideTempManager = OutsideTempManager;
document.addEventListener('DOMContentLoaded', OutsideTempManager.start, { once: true });
window.addEventListener('beforeunload', OutsideTempManager.stop);
