'use strict';

// Временный экранный журнал RPM. Данные хранятся только в памяти до перезапуска.
const RpmEventLog = (() => {
  const MAX_SAMPLES = 600;
  const RENDER_DELAY_MS = 200;
  const LONG_GAP_MS = 500;
  const POLL_MS = 200;
  const RPM_SOURCES = ['rpm', 'engineRpm', 'engine_rpm', 'engineSpeed', 'all'];
  const RPM_KEYS = new Set([
    'rpm', 'enginerpm', 'enginespeed', 'motorrpm', 'motorspeed',
    'crankshaftspeed', 'crankshaftrpm', 'revs', 'revolutionsperminute',
  ]);

  const statusNode = document.getElementById('rpm-log-status');
  const outputNode = document.getElementById('rpm-log-output');
  const samples = [];
  let totalCount = 0;
  let invalidCount = 0;
  let lastTimestamp = null;
  let lastRpm = null;
  let firstPayload = '';
  let renderTimer = null;
  let pollTimer = null;
  let activeSource = null;
  let probeIndex = 0;
  let lastProbeText = '';
  let lastEventRpmAt = 0;

  function nowMonotonic() {
    return window.performance && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  function formatClock(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
  }

  function payloadText(data) {
    if (typeof data === 'string') return data.trim();
    try { return JSON.stringify(data); }
    catch (e) { return String(data); }
  }

  function normalizeKey(key) {
    return String(key || '').toLowerCase().replace(/[^a-z0-9а-яё]/g, '');
  }

  function isRpmType(type) {
    const normalized = normalizeKey(type);
    return normalized.includes('rpm') || normalized.includes('enginespeed');
  }

  function isRpmKey(key) {
    const normalized = normalizeKey(key);
    if (RPM_KEYS.has(normalized)) return true;
    if (/^(rpm|enginerpm|motorrpm|crankshaftrpm)(value|current|actual)?$/.test(normalized)) return true;
    return /^(engine|motor|crankshaft)speed(value|current|actual)?$/.test(normalized);
  }

  function findNestedRpm(data, depth = 0, seen = new Set()) {
    if (!data || typeof data !== 'object' || depth > 6 || seen.has(data)) return null;
    seen.add(data);
    const entries = Object.entries(data);
    for (const [key, value] of entries) {
      if (!isRpmKey(key)) continue;
      const rpm = parseApiNumber(value);
      if (rpm != null) return rpm;
    }
    for (const [, value] of entries) {
      const rpm = findNestedRpm(value, depth + 1, seen);
      if (rpm != null) return rpm;
    }
    return null;
  }

  function extractRpm(data, type = '') {
    if (data == null) return null;
    const parsed = typeof data === 'string' ? (parseApiJson(data) ?? data) : data;
    if (parsed && typeof parsed === 'object') {
      const nested = findNestedRpm(parsed);
      if (nested != null) return nested;
      if (isRpmType(type)) return parseApiNumber(parsed.value ?? parsed.data?.value);
      return null;
    }
    return isRpmType(type) ? parseApiNumber(parsed) : null;
  }

  function calculateGapStats() {
    const gaps = samples.map(sample => sample.gap).filter(Number.isFinite);
    if (!gaps.length) return null;
    const sum = gaps.reduce((result, value) => result + value, 0);
    return {
      min: Math.round(Math.min(...gaps)),
      average: Math.round(sum / gaps.length),
      max: Math.round(Math.max(...gaps)),
      long: gaps.filter(value => value >= LONG_GAP_MS).length,
    };
  }

  function render() {
    renderTimer = null;
    if (!outputNode || !statusNode || !samples.length) return;

    const wasNearBottom = outputNode.scrollHeight - outputNode.scrollTop - outputNode.clientHeight < 50;
    const latest = samples[samples.length - 1];
    const stats = calculateGapStats();
    const intervalText = stats
      ? `Δt мин/ср/макс: ${stats.min}/${stats.average}/${stats.max} мс · пауз ≥${LONG_GAP_MS}: ${stats.long}`
      : 'Ожидание второго события для расчёта интервала';
    statusNode.textContent = `Записей: ${totalCount} · RPM: ${latest.rpm ?? '?'} · ${intervalText}`;
    statusNode.dataset.state = latest.rpm == null ? 'error' : 'success';

    const lines = [
      `Первое событие: ${firstPayload || '—'}`,
      `Ошибок чтения RPM: ${invalidCount}`,
      '',
      '№     время          Δt,мс   RPM     ΔRPM   тип',
      ...samples.map(sample => {
        const number = String(sample.number).padStart(4, '0');
        const gap = sample.gap == null ? '—'.padStart(6) : String(Math.round(sample.gap)).padStart(6);
        const rpm = sample.rpm == null ? '?'.padStart(6) : String(sample.rpm).padStart(6);
        const change = sample.change == null
          ? '—'.padStart(6)
          : `${sample.change >= 0 ? '+' : ''}${sample.change}`.padStart(6);
        return `${number}  ${sample.clock}  ${gap}  ${rpm}  ${change}  ${sample.type}`;
      }),
    ];
    outputNode.textContent = lines.join('\n');
    if (wasNearBottom || totalCount <= 2) outputNode.scrollTop = outputNode.scrollHeight;
  }

  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(render, RENDER_DELAY_MS);
  }

  function capture(type, data) {
    const timestamp = nowMonotonic();
    const rpm = extractRpm(data, type);
    const roundedRpm = rpm == null ? null : Math.round(rpm);
    if (roundedRpm != null && String(type).startsWith('event:')) {
      lastEventRpmAt = Date.now();
    }
    totalCount += 1;
    if (roundedRpm == null) invalidCount += 1;
    if (!firstPayload) firstPayload = `${type}: ${payloadText(data)}`;

    samples.push({
      number: totalCount,
      clock: formatClock(new Date()),
      gap: lastTimestamp == null ? null : timestamp - lastTimestamp,
      rpm: roundedRpm,
      change: roundedRpm == null || lastRpm == null ? null : roundedRpm - lastRpm,
      type: String(type || 'rpm'),
    });
    if (samples.length > MAX_SAMPLES) samples.shift();
    lastTimestamp = timestamp;
    if (roundedRpm != null) lastRpm = roundedRpm;
    scheduleRender();
    return roundedRpm != null;
  }

  function captureIfPresent(type, data) {
    if (extractRpm(data, type) == null) return false;
    return capture(type, data);
  }

  function showProbeStatus(message) {
    if (samples.length) return;
    if (statusNode) {
      statusNode.textContent = message;
      statusNode.dataset.state = 'waiting';
    }
    if (outputNode) {
      outputNode.textContent = lastProbeText
        ? `Активный опрос RPM запущен.\n\nПоследний ответ:\n${lastProbeText}`
        : 'Активный опрос RPM запущен. Ожидание Android API…';
    }
  }

  function readCarData(source) {
    const api = window.androidApi;
    if (typeof api?.getCarData !== 'function') return null;
    ensureJsReady();
    try {
      const raw = api.getCarData(TOKEN, source);
      if (raw == null || raw === '' || raw === '{}' || raw === 'null' || raw === 'undefined') return null;
      return parseApiJson(raw) ?? raw;
    } catch (e) {
      return null;
    }
  }

  function poll() {
    // Если JCarTools сам присылает RPM, не смешиваем поток событий с опросом.
    if (Date.now() - lastEventRpmAt < 2500) return;
    if (!window.androidApi) {
      showProbeStatus('Ожидание Android API для опроса RPM…');
      return;
    }
    if (typeof window.androidApi.getCarData !== 'function') {
      showProbeStatus('getCarData недоступен; ожидаю событие RPM…');
      return;
    }

    const sources = activeSource
      ? [activeSource]
      : [RPM_SOURCES[probeIndex++ % RPM_SOURCES.length]];
    let receivedAny = false;
    for (const source of sources) {
      const data = readCarData(source);
      if (data == null) continue;
      receivedAny = true;
      lastProbeText = `${source}: ${payloadText(data).slice(0, 1800)}`;
      if (captureIfPresent(`poll:${source}`, data)) {
        activeSource = source;
        return;
      }
    }
    if (activeSource) activeSource = null;
    showProbeStatus(receivedAny
      ? 'Ответ getCarData есть, ищу поле оборотов…'
      : 'getCarData пока не вернул данные RPM…');
  }

  function start() {
    if (pollTimer) return;
    poll();
    pollTimer = setInterval(poll, POLL_MS);
  }

  function stop() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function clear() {
    samples.length = 0;
    totalCount = 0;
    invalidCount = 0;
    lastTimestamp = null;
    lastRpm = null;
    lastEventRpmAt = 0;
    firstPayload = '';
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = null;
    if (statusNode) {
      statusNode.textContent = 'Ожидание событий оборотов…';
      statusNode.dataset.state = 'waiting';
    }
    if (outputNode) outputNode.textContent = 'Данные появятся после первого события rpm от JCarTools.';
  }

  return {
    capture,
    captureIfPresent,
    start,
    stop,
    clear,
    exportText: () => outputNode?.textContent || '',
  };
})();

window.RpmEventLog = RpmEventLog;
RpmEventLog.start();
