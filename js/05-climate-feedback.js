// Реальное состояние климата из JCarTools: async API новых версий + sync fallback.
window.ClimateFeedback = (() => {
  const POLL_MS = 1500;
  const REQUEST_TIMEOUT_MS = 2500;
  const OPTIMISTIC_HOLD_MS = 2500;
  const COMMAND_TO_ID = {
    heat_seat_l: 'cl-seat-l',
    vent_seat_l: 'cl-vent-l',
    heat_seat_r: 'cl-seat-r',
    vent_seat_r: 'cl-vent-r',
    heat_zad_seat_l: 'cl-rear-seat-l',
    vent_zad_seat_l: 'cl-rear-vent-l',
    heat_zad_seat_r: 'cl-rear-seat-r',
    vent_zad_seat_r: 'cl-rear-vent-r',
    heat_wheel_on: 'cl-wheel',
    heat_windshield_on: 'cl-wind',
    heat_rearwindow_on: 'cl-rear',
  };

  let pollTimer = null;
  let pendingRequestId = null;
  let pendingTimer = null;
  let requestSequence = 0;
  const optimistic = Object.create(null);

  function parseJson(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return null;
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'string' ? parseJson(parsed) : parsed;
    } catch (e) {
      return null;
    }
  }

  function firstDefined(...values) {
    return values.find(value => value !== undefined && value !== null);
  }

  // Фактический getCarData("all") этой машины: 1=off, 2..4=levels 1..3.
  function normalizeVehicleLevel(value) {
    if (typeof value === 'boolean') return value ? 1 : 0;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const rounded = Math.round(numeric);
    if (rounded >= 1 && rounded <= 4) return rounded - 1;
    return rounded === 0 ? 0 : null;
  }

  // climateState already contains UI levels 0..3.
  function normalizeUiLevel(value, max = 3) {
    if (typeof value === 'boolean') return value ? 1 : 0;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(max, Math.round(numeric)));
  }

  function normalizeBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'on', 'yes'].includes(normalized)) return true;
      if (['false', '0', 'off', 'no'].includes(normalized)) return false;
    }
    return null;
  }

  function applyLevel(itemId, level) {
    if (level == null || !window.ClimateUI) return false;
    const expected = optimistic[itemId];
    if (expected) {
      if (Date.now() < expected.until && level !== expected.level) return false;
      delete optimistic[itemId];
    }
    return window.ClimateUI.setLevel(itemId, level);
  }

  function noteOptimistic(itemId, level) {
    optimistic[itemId] = {
      level: Number(level) || 0,
      until: Date.now() + OPTIMISTIC_HOLD_MS,
    };
    const exclusiveId = CLIMATE_EXCLUSIVE[itemId];
    if (level > 0 && exclusiveId) {
      optimistic[exclusiveId] = { level: 0, until: Date.now() + OPTIMISTIC_HOLD_MS };
    }
  }

  function unwrapPayload(raw) {
    let payload = parseJson(raw) ?? raw;
    if (!payload || typeof payload !== 'object') return null;
    for (let i = 0; i < 3; i += 1) {
      const nested = parseJson(payload.response) ?? parseJson(payload.data)
        ?? parseJson(payload.result) ?? parseJson(payload.value);
      if (!nested || typeof nested !== 'object') break;
      payload = nested;
    }
    return payload;
  }

  function applySeatPayload(raw) {
    const payload = unwrapPayload(raw);
    if (!payload || payload.error) return false;

    const seats = payload.seats || payload.widgets?.seats || payload.carData?.seats || payload;
    const front = seats.front || seats.frontSeats || payload.frontSeats || seats;
    const rear = seats.rear || seats.rearSeats || payload.rearSeats || {};
    const frontLeft = front.frontLeft || front.left || {};
    const frontRight = front.frontRight || front.right || {};
    const rearLeft = rear.rearLeft || rear.left || {};
    const rearRight = rear.rearRight || rear.right || {};

    const values = {
      'cl-seat-l': firstDefined(frontLeft.heat, front.driverHeatLevel, front.driver_heat_level, payload.heat_seat_l),
      'cl-vent-l': firstDefined(frontLeft.vent, front.driverVentLevel, front.driver_vent_level, payload.vent_seat_l),
      'cl-seat-r': firstDefined(frontRight.heat, front.passengerHeatLevel, front.passenger_heat_level, payload.heat_seat_r),
      'cl-vent-r': firstDefined(frontRight.vent, front.passengerVentLevel, front.passenger_vent_level, payload.vent_seat_r),
      'cl-rear-seat-l': firstDefined(rearLeft.heat, rear.leftHeatLevel, rear.left_heat_level, payload.heat_zad_seat_l),
      'cl-rear-vent-l': firstDefined(rearLeft.vent, rear.leftVentLevel, rear.left_vent_level, payload.vent_zad_seat_l),
      'cl-rear-seat-r': firstDefined(rearRight.heat, rear.rightHeatLevel, rear.right_heat_level, payload.heat_zad_seat_r),
      'cl-rear-vent-r': firstDefined(rearRight.vent, rear.rightVentLevel, rear.right_vent_level, payload.vent_zad_seat_r),
    };

    let recognized = false;
    Object.entries(values).forEach(([itemId, value]) => {
      if (value === undefined || value === null) return;
      recognized = true;
      applyLevel(itemId, normalizeVehicleLevel(value));
    });
    return recognized;
  }

  function applyHeatPayload(raw) {
    const payload = unwrapPayload(raw);
    if (!payload || payload.error) return false;
    const heat = payload.heat || payload.widgets?.heat || payload.carData?.heat || payload;
    const values = {
      'cl-wheel': firstDefined(heat.rulHeat, heat.wheelHeat, heat.steeringWheelHeat),
      'cl-wind': firstDefined(heat.lobHeat, heat.windshieldHeat, heat.frontWindowHeat),
      'cl-rear': firstDefined(heat.zadHeat, heat.rearHeat, heat.rearWindowHeat),
    };

    let recognized = false;
    Object.entries(values).forEach(([itemId, value]) => {
      const enabled = normalizeBoolean(value);
      if (enabled == null) return;
      recognized = true;
      applyLevel(itemId, enabled ? 1 : 0);
    });
    return recognized;
  }

  function handleCarData(raw) {
    const seatsFound = applySeatPayload(raw);
    const heatFound = applyHeatPayload(raw);
    return seatsFound || heatFound;
  }

  function handleClimateState(raw) {
    const payload = unwrapPayload(raw);
    if (!payload) return false;
    let recognized = false;
    Object.entries(COMMAND_TO_ID).forEach(([command, itemId]) => {
      let value = payload[command];
      if (value === undefined && command.endsWith('_on')) {
        const offCommand = command.replace(/_on$/, '_off');
        if (payload[offCommand] !== undefined) value = !normalizeBoolean(payload[offCommand]);
      }
      if (value === undefined) return;
      recognized = true;
      const max = itemId === 'cl-wheel' || itemId === 'cl-wind' || itemId === 'cl-rear' ? 1 : 3;
      applyLevel(itemId, normalizeUiLevel(value, max));
    });
    return recognized;
  }

  function clearPendingRequest() {
    clearTimeout(pendingTimer);
    pendingTimer = null;
    pendingRequestId = null;
  }

  function handleCarResponse(raw) {
    const event = parseJson(raw) ?? raw;
    if (!event || typeof event !== 'object') return false;
    if (event.requestType !== 'data') return false;
    if (pendingRequestId && event.requestId && event.requestId !== pendingRequestId) return false;
    clearPendingRequest();
    const responseRaw = firstDefined(event.response, event.data, event.result, event.value);
    const response = parseJson(responseRaw) ?? responseRaw;
    if (!response || response.error) return false;
    const seatsFound = applySeatPayload(response);
    const heatFound = applyHeatPayload(response);
    if (!seatsFound || !heatFound) setTimeout(requestSyncState, 0);
    return true;
  }

  function requestAsyncState() {
    const api = window.androidApi;
    if (typeof api?.requestCarDataAsync !== 'function' || pendingRequestId) return false;
    ensureJsReady();
    requestSequence = (requestSequence + 1) % 1000000;
    const requestId = `climate_${Date.now()}_${requestSequence}`;
    pendingRequestId = requestId;
    try {
      const accepted = api.requestCarDataAsync(TOKEN, requestId, 'widgets');
      if (accepted !== true && accepted !== 'true') {
        clearPendingRequest();
        return false;
      }
      if (pendingRequestId === requestId) {
        pendingTimer = setTimeout(() => {
          pendingTimer = null;
          pendingRequestId = null;
          requestSyncState();
        }, REQUEST_TIMEOUT_MS);
      }
      return true;
    } catch (e) {
      clearPendingRequest();
      return false;
    }
  }

  // В некоторых версиях JCarTools getCarData возвращает неполные данные,
  // а актуальные уровни приходят отдельным событием climateState.
  function requestClimateState() {
    const api = window.androidApi;
    if (typeof api?.requestClimateState !== 'function') return false;
    ensureJsReady();
    try {
      api.requestClimateState(TOKEN);
      return true;
    } catch (e) {
      return false;
    }
  }

  function getCarData(name) {
    const api = window.androidApi;
    if (typeof api?.getCarData !== 'function') return null;
    ensureJsReady();
    try {
      const result = parseJson(api.getCarData(TOKEN, name));
      return result && !result.error ? result : null;
    } catch (e) {
      return null;
    }
  }

  function requestSyncState() {
    let seatsFound = false;
    let heatFound = false;

    // На этой машине именно "all" сразу возвращает и seats, и heat.
    // Проверяем его первым, чтобы обратная связь появилась без ожидания async API.
    const all = getCarData('all');
    if (all) {
      seatsFound = applySeatPayload(all);
      heatFound = applyHeatPayload(all);
      if (seatsFound && heatFound) return true;
    }

    const widgets = getCarData('widgets');
    if (widgets) {
      if (!seatsFound) seatsFound = applySeatPayload(widgets);
      if (!heatFound) heatFound = applyHeatPayload(widgets);
    }
    if (!seatsFound) {
      const frontSeats = getCarData('frontSeats');
      if (frontSeats) seatsFound = applySeatPayload(frontSeats);
    }
    if (!heatFound) {
      const heat = getCarData('heat');
      if (heat) heatFound = applyHeatPayload(heat);
    }
    return seatsFound || heatFound;
  }

  function poll() {
    if (!window.androidApi) return;
    const syncFound = requestSyncState();
    if (syncFound) return;
    requestClimateState();
    if (pendingRequestId) return;
    requestAsyncState();
  }

  function refreshAfterCommand() {
    [350, 800, 1600, 2800].forEach(ms => setTimeout(poll, ms));
  }

  function start() {
    if (pollTimer) return;
    poll();
    pollTimer = setInterval(poll, POLL_MS);
  }

  function stop() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    clearPendingRequest();
  }

  return {
    start,
    stop,
    poll,
    refreshAfterCommand,
    noteOptimistic,
    handleCarData,
    handleCarResponse,
    handleClimateState,
  };
})();
