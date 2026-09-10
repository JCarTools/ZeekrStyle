function resetControlUI(itemId) {
  const btn = el(itemId);
  if (!btn || (climateState[itemId] || 0) === 0) return;
  climateState[itemId] = 0;
  btn.querySelectorAll('.cl-dot').forEach(d => d.classList.remove('on'));
  btn.classList.remove('active');
}

function applyClimateControlLevel(itemId, level) {
  const btn = el(itemId);
  if (!btn) return false;
  const max = Math.max(1, parseInt(btn.dataset.max, 10) || 1);
  const numeric = Number(level);
  if (!Number.isFinite(numeric)) return false;
  const next = Math.max(0, Math.min(max, Math.round(numeric)));

  climateState[itemId] = next;
  btn.querySelectorAll('.cl-dot').forEach(d => {
    d.classList.toggle('on', parseInt(d.dataset.lv, 10) <= next);
  });
  btn.classList.toggle('active', next > 0);

  if (next > 0) {
    const exclusiveId = CLIMATE_EXCLUSIVE[itemId];
    if (exclusiveId) resetControlUI(exclusiveId);
  }
  return true;
}

function reportClimateCommand(itemId, level) {
  const feedback = window.ClimateFeedback;
  if (!feedback) return;
  feedback.noteOptimistic(itemId, level);
  feedback.refreshAfterCommand();
}

function mountControl(item, grid) {
  const btn = document.createElement('div');
  btn.className = 'cl-btn';
  btn.id = item.id;

  if (item.memory) {
	  
    btn.classList.add('cl-btn-memory');
    btn.innerHTML = item.memory.map((_, i) =>
      `<button type="button" class="cl-memory-seg" data-lv="${i + 1}">${i + 1}</button>`
    ).join('');

    const updateMemoryUI = (level) => {
      btn.querySelectorAll('.cl-memory-seg').forEach(seg => {
        seg.classList.toggle('active', parseInt(seg.dataset.lv, 10) === level);
      });
    };

    updateMemoryUI(climateState[item.id] || 0);

    btn.querySelectorAll('.cl-memory-seg').forEach(seg => {
      seg.addEventListener('click', (e) => {
        e.stopPropagation();
        const level = parseInt(seg.dataset.lv, 10);
        climateState[item.id] = level;
        updateMemoryUI(level);
        run(item.memory[level - 1]);
      });
    });

    grid.appendChild(btn);
	
    return;
  }

  const max = parseInt(item.max) || 1;
  btn.dataset.on = item.on;
  btn.dataset.off = item.off;
  btn.dataset.max = String(max);
  const dots = Array.from({length: max}, (_, i) => `<div class="cl-dot" data-lv="${i+1}"></div>`).join('');
  btn.innerHTML = `${buildClIcon(item.icon, item.iconMirrorX ? 'cl-icon-mirror-x' : '')}<div class="cl-dots">${dots}</div>`;

  btn.addEventListener('click', () => {
    const next = ((climateState[item.id] || 0) + 1) % (max + 1);
    applyClimateControlLevel(item.id, next);
    run(next === 0 ? btn.dataset.off : (max > 1 ? btn.dataset.on + '_' + next : btn.dataset.on));
    reportClimateCommand(item.id, next);
  });

  if (max > 1) {
    let lt;
    const sl = () => { lt = setTimeout(() => { if ((climateState[item.id]||0) > 0) { applyClimateControlLevel(item.id, 0); run(btn.dataset.off); reportClimateCommand(item.id, 0); btn.blur(); btn.classList.add('force-release'); setTimeout(()=>btn.classList.remove('force-release'),50); } }, 600); };
    const cl = () => clearTimeout(lt);
    btn.addEventListener('touchstart', sl, {passive:true});
    btn.addEventListener('touchend', cl);
    btn.addEventListener('touchcancel', cl);
    btn.addEventListener('mousedown', sl);
    btn.addEventListener('mouseup', cl);
    btn.addEventListener('mouseleave', cl);
  }

  grid.appendChild(btn);
}

function buildDriverControls() {
  const leftControls = el('top-left-climate-controls');
  const seatStaging = el('driver-seat-staging');
  if (!leftControls || !seatStaging) return;
  leftControls.innerHTML = '';
  seatStaging.innerHTML = '';

  const leftIds = new Set(['cl-wheel', 'cl-wind', 'cl-rear']);
  DRIVER_CONTROLS.forEach(item => {
    mountControl(item, leftIds.has(item.id) ? leftControls : seatStaging);
  });
}

function buildPassengerControls() {
  const grid = el('passenger-seat-staging');
  if (!grid) return;
  grid.innerHTML = '';
  PASSENGER_CONTROLS.forEach(item => mountControl(item, grid));
}

buildDriverControls();
buildPassengerControls();

window.ClimateUI = {
  setLevel: applyClimateControlLevel,
  getLevel: itemId => climateState[itemId] || 0,
};

function buildShutterControls() {
  const wrap = el('top-left-shutter-controls');
  if (!wrap) return;
  wrap.innerHTML = '';
  SHUTTER_CONTROLS.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cl-btn cl-btn-vol';
    btn.id = item.id;
    btn.setAttribute('aria-label', item.aria);
    btn.innerHTML = buildClIcon(item.icon);
    btn.addEventListener('click', () => run(item.cmd));
    wrap.appendChild(btn);
  });
}

buildShutterControls();

function bindVolumeRepeat(btn, changeVolume) {
  const HOLD_DELAY_MS = 700;
  const REPEAT_MS = 220;
  let holdTimer = null;
  let repeatTimer = null;
  let resetClickTimer = null;
  let pressing = false;
  let suppressClick = false;
  let lastTouchAt = 0;

  const runStep = () => changeVolume();

  const clearTimers = () => {
    if (holdTimer) clearTimeout(holdTimer);
    if (repeatTimer) clearInterval(repeatTimer);
    holdTimer = null;
    repeatTimer = null;
  };

  const finishPress = () => {
    if (!pressing) return;
    pressing = false;
    clearTimers();
    if (resetClickTimer) clearTimeout(resetClickTimer);
    resetClickTimer = setTimeout(() => {
      suppressClick = false;
      resetClickTimer = null;
    }, 700);
  };

  const startPress = event => {
    if (pressing) return;
    if (event.type === 'mousedown' && event.button !== 0) return;
    event.preventDefault();
    pressing = true;
    suppressClick = true;
    runStep();
    holdTimer = setTimeout(() => {
      if (!pressing) return;
      runStep();
      repeatTimer = setInterval(runStep, REPEAT_MS);
    }, HOLD_DELAY_MS);
  };

  if ('PointerEvent' in window) {
    btn.addEventListener('pointerdown', event => {
      if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
      startPress(event);
      try { btn.setPointerCapture(event.pointerId); } catch (e) {}
    });
    btn.addEventListener('pointerup', finishPress);
    btn.addEventListener('pointercancel', finishPress);
    btn.addEventListener('lostpointercapture', finishPress);
  } else {
    btn.addEventListener('touchstart', event => {
      lastTouchAt = Date.now();
      startPress(event);
    }, { passive: false });
    btn.addEventListener('touchend', finishPress);
    btn.addEventListener('touchcancel', finishPress);
    btn.addEventListener('mousedown', event => {
      if (Date.now() - lastTouchAt < 800) return;
      startPress(event);
    });
    window.addEventListener('mouseup', finishPress);
    btn.addEventListener('mouseleave', finishPress);
  }

  btn.addEventListener('click', event => {
    if (suppressClick) {
      event.preventDefault();
      suppressClick = false;
      if (resetClickTimer) clearTimeout(resetClickTimer);
      resetClickTimer = null;
      return;
    }
    runStep();
  });
  btn.addEventListener('contextmenu', event => event.preventDefault());
}

function buildCenterVolumeControls() {
  const wrap = el('volume-controls');
  if (!wrap) return;
  wrap.innerHTML = '';
  VOLUME_CENTER_CONTROLS.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cl-btn cl-btn-vol cl-btn-vol-media';
    btn.id = item.id;
    btn.setAttribute('aria-label', item.aria);
    btn.innerHTML = buildClIcon(item.icon);
    if (item.action === 'up') {
      bindVolumeRepeat(btn, () => VolumeManager.volumeUp());
    } else if (item.action === 'down') {
      bindVolumeRepeat(btn, () => VolumeManager.volumeDown());
    }
    wrap.appendChild(btn);
  });
  MuteManager.init();
}

buildCenterVolumeControls();
