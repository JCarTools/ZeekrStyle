// ── Температура салона ─────────────────────────────────────
const TempManager = (() => {
  const CMD = {
    driver: { up: 'Driver_Temp_Up', down: 'Driver_Temp_Down' },
    passenger: { up: 'Passenger_Temp_Up', down: 'Passenger_Temp_Down' },
  };
  const INVALID = -90;
  const MOCK = { driver: 22, passenger: 22.5 };
  let pollTimer = null;
  let apiWaitTimer = null;

  function hasApi() {
    return !!window.androidApi;
  }

  function canFetchCarData() {
    return typeof window.androidApi?.getCarData === 'function';
  }

  function useMock() {
    return !hasApi() && loadLS('lite_temp_mock') === true;
  }

  function mockCarData(name) {
    switch (name) {
      case 'heat':
        return {
          name: 'heat',
          rulHeat: false,
          lobHeat: false,
          zadHeat: false,
          driverTemp: MOCK.driver,
          passengerTemp: MOCK.passenger,
        };
      case 'cabinTemp':
        return {
          name: 'cabinTemp',
          driverTemp: MOCK.driver,
          passengerTemp: MOCK.passenger,
        };
      case 'driverTemp':
        return { name: 'driverTemp', value: MOCK.driver };
      case 'passengerTemp':
        return { name: 'passengerTemp', value: MOCK.passenger };
      case 'all':
        return {
          name: 'all',
          heat: {
            name: 'heat',
            rulHeat: false,
            lobHeat: false,
            zadHeat: false,
            driverTemp: MOCK.driver,
            passengerTemp: MOCK.passenger,
          },
        };
      default:
        return { error: 'unknown_data' };
    }
  }

  function fetchCarDataRaw(name) {
    if (canFetchCarData()) {
      ensureJsReady();
      try {
        return window.androidApi.getCarData(TOKEN, name) ?? null;
      } catch (e) {
        return null;
      }
    }
    if (useMock()) {
      try { return JSON.stringify(mockCarData(name)); } catch (e) { return null; }
    }
    return null;
  }

  function fetchCarData(name) {
    const data = parseApiJson(fetchCarDataRaw(name));
    if (!data) return null;
    if (data.error) return null;
    return data;
  }

  function normalizeTemp(value) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(num) || num <= INVALID) return null;
    return num;
  }

  function formatTemp(value) {
    const temp = normalizeTemp(value);
    if (temp == null) return '—°';
    const rounded = Math.round(temp * 10) / 10;
    if (Math.abs(rounded - Math.round(rounded)) < 0.05) return `${Math.round(rounded)}°`;
    return `${rounded.toFixed(1)}°`;
  }

  function applyTemps(temps) {
    set('temp-driver-value', formatTemp(temps.driver));
    set('temp-passenger-value', formatTemp(temps.passenger));
  }

  function readTemps() {
    ensureJsReady();
    let driver = null;
    let passenger = null;

    // Подтвержденный ответ этой машины: температуры находятся в all.heat.
    const all = fetchCarData('all');
    if (all?.heat) {
      driver = normalizeTemp(all.heat.driverTemp);
      passenger = normalizeTemp(all.heat.passengerTemp);
    }

    if (driver == null || passenger == null) {
      const cabin = fetchCarData('cabinTemp');
      if (cabin) {
        if (driver == null) driver = normalizeTemp(cabin.driverTemp);
        if (passenger == null) passenger = normalizeTemp(cabin.passengerTemp);
      }
    }

    if (driver == null || passenger == null) {
      const heat = fetchCarData('heat');
      if (heat) {
        if (driver == null) driver = normalizeTemp(heat.driverTemp);
        if (passenger == null) passenger = normalizeTemp(heat.passengerTemp);
      }
    }

    if (driver == null) {
      const d = fetchCarData('driverTemp');
      driver = normalizeTemp(d?.value ?? d?.driverTemp);
    }
    if (passenger == null) {
      const p = fetchCarData('passengerTemp');
      passenger = normalizeTemp(p?.value ?? p?.passengerTemp);
    }

    return { driver, passenger };
  }

  function refresh() {
    const temps = readTemps();
    applyTemps(temps);
    return temps;
  }

  function refreshAfterCommand() {
    refresh();
    [120, 350, 700, 1200].forEach(ms => setTimeout(refresh, ms));
  }

  function mockAdjust(side, delta) {
    const clamp = v => Math.max(16, Math.min(32, v));
    const key = side === 'passenger' ? 'passenger' : 'driver';
    MOCK[key] = clamp((MOCK[key] ?? 22) + delta);
  }

  function adjust(side, dir) {
    const cmd = CMD[side]?.[dir];
    if (!cmd) return;
    const delta = dir === 'up' ? 1 : -1;

    if (!hasApi()) {
      if (useMock()) {
        mockAdjust(side, delta);
        refreshAfterCommand();
      }
      return;
    }

    run(cmd);
    refreshAfterCommand();
  }

  function bind() {
    el('btn-driver-temp-down')?.addEventListener('click', () => adjust('driver', 'down'));
    el('btn-driver-temp-up')?.addEventListener('click', () => adjust('driver', 'up'));
    el('btn-passenger-temp-down')?.addEventListener('click', () => adjust('passenger', 'down'));
    el('btn-passenger-temp-up')?.addEventListener('click', () => adjust('passenger', 'up'));
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (apiWaitTimer) {
      clearTimeout(apiWaitTimer);
      apiWaitTimer = null;
    }
  }

  function startPoll() {
    stopPoll();
    refresh();
    if (canFetchCarData()) {
      pollTimer = setInterval(refresh, 3000);
      return;
    }
    if (useMock()) {
      pollTimer = setInterval(refresh, 1000);
      return;
    }
    const waitStarted = Date.now();
    const retry = () => {
      if (canFetchCarData()) {
        pollTimer = setInterval(refresh, 3000);
        return;
      }
      if (useMock()) {
        pollTimer = setInterval(refresh, 1000);
        return;
      }
      if (Date.now() - waitStarted < 30000) {
        apiWaitTimer = setTimeout(retry, 500);
      }
    };
    apiWaitTimer = setTimeout(retry, 500);
  }

  function scheduleRefresh() {
    // Один немедленный запрос вместо серии стартовых опросов Android-моста.
    startPoll();
  }

  bind();
  mountTempIcons();

  return { startPoll, stopPoll, scheduleRefresh };
})();
