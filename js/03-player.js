// ── Плеер ──────────────────────────────────────────────────
let isPlaying = false;
let trackDuration = 0, trackPosition = 0, positionTimestamp = 0;
let progressTimer = null;
let pendingPlayState = null;
let pendingPlayTimer = null;

function setProgress(pos, dur) {
  const pct = dur > 0 ? Math.min(pos / dur * 100, 100) : 0;
  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = pct.toFixed(1) + '%';
  const fmt = ms => { const s = Math.max(0, Math.floor(ms/1000)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); };
  set('time-cur', fmt(pos));
  set('time-dur', fmt(dur));
}

function startProgressTick() {
  stopProgressTick();
  progressTimer = setInterval(() => {
    if (!isPlaying || trackDuration <= 0) return;
    const pos = Math.min(trackPosition + (Date.now() - positionTimestamp), trackDuration);
    setProgress(pos, trackDuration);
  }, 1000);
}

function stopProgressTick() {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
}

function clearPendingPlayState() {
  pendingPlayState = null;
  if (pendingPlayTimer) {
    clearTimeout(pendingPlayTimer);
    pendingPlayTimer = null;
  }
}

function waitForPlayStateConfirm(expected) {
  pendingPlayState = !!expected;
  if (pendingPlayTimer) clearTimeout(pendingPlayTimer);
  pendingPlayTimer = setTimeout(() => {
    pendingPlayState = null;
    pendingPlayTimer = null;
  }, 1500);
}

function setPlayState(playing, options = {}) {
  if (!options.keepPending) clearPendingPlayState();
  isPlaying = !!playing;
  const playIcon = el("icon-play");
  const pauseIcon = el("icon-pause");
  if (playIcon) playIcon.style.display = isPlaying ? "none" : "block";
  if (pauseIcon) pauseIcon.style.display = isPlaying ? "block" : "none";
  if (isPlaying) startProgressTick(); else stopProgressTick();
}

function syncPlayStateFromAndroid(playing) {
  if (playing == null) return;
  const confirmed = !!playing;
  if (pendingPlayState !== null && confirmed !== pendingPlayState) return;
  setPlayState(confirmed);
}

function onPlayBtnClick() {
  const expected = !isPlaying;
  run(isPlaying ? 'MEDIA_PAUSE' : 'MEDIA_PLAY');
  setPlayState(expected, { keepPending: true });
  waitForPlayStateConfirm(expected);
}

const MuteManager = (() => {
  const MUTE_TRANSITION_MS = 1700;

  let userMuted = false;
  let savedVolume = null;
  let restoreTarget = null;
  let toggleLock = false;
  let muteTransition = false;

  function renderVolume(v) {
    const btn = el('btn-mute');
    if (!btn) return;
    const value = userMuted
      ? (savedVolume != null && savedVolume > 0 ? savedVolume : clampMediaVolume(v))
      : clampMediaVolume(v);
    const label = btn.querySelector('.volume-percent');
    if (label) label.textContent = `${value ?? 0}%`;
    btn.classList.toggle('active', userMuted);
    btn.setAttribute('aria-label', userMuted ? 'Включить звук' : 'Без звука');
    btn.setAttribute('aria-pressed', userMuted ? 'true' : 'false');
  }

  function beginMuteTransition() {
    muteTransition = true;
    setTimeout(() => { muteTransition = false; }, MUTE_TRANSITION_MS);
  }

  function toggle() {
    if (toggleLock) return;
    toggleLock = true;
    setTimeout(() => { toggleLock = false; }, 400);
    beginMuteTransition();

    if (userMuted) {
      userMuted = false;
      restoreTarget = savedVolume != null && savedVolume > 0 ? savedVolume : 5;
      if (restoreTarget > 0) {
        VolumeManager.setVolumeNow(restoreTarget);
      }
    } else {
      const current = VolumeManager.getVolume();
      if (current > 0) savedVolume = current;
      userMuted = true;
      restoreTarget = null;
      VolumeManager.setVolumeNow(0);
    }
    renderVolume(userMuted ? savedVolume : VolumeManager.getVolume());
  }

  function syncFromDevice() {
    if (userMuted) return;
    if (VolumeManager.getVolume() === 0) {
      userMuted = true;
      renderVolume(0);
    }
  }

  function onVolumeChange(v) {
    if (!muteTransition && !userMuted && v > 0) {
      savedVolume = v;
    }
    if (userMuted && v > 0 && !muteTransition) {
      userMuted = false;
      restoreTarget = null;
    } else if (!userMuted && v === 0 && !muteTransition) {
      userMuted = true;
    } else if (!userMuted && restoreTarget != null && v === restoreTarget) {
      restoreTarget = null;
    }
    renderVolume(v);
  }

  function init() {
    const btn = el('btn-mute');
    if (!btn || btn.dataset.muteBound === '1') return;
    btn.dataset.muteBound = '1';
    btn.innerHTML = '<span class="volume-percent" aria-hidden="true">50%</span>';
    btn.addEventListener('click', toggle);
    VolumeManager.subscribe(onVolumeChange);
    syncFromDevice();
  }

  return { syncFromDevice, init };
})();

el('btn-prev')?.addEventListener('click', () => run('MEDIA_BLACK'));
el('btn-next').addEventListener('click', () => run('MEDIA_NEXT'));
el('btn-play').addEventListener('click', onPlayBtnClick);
