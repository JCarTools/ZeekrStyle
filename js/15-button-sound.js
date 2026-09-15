'use strict';

const ButtonSound = (() => {
  const CLICKABLE_SELECTOR = [
    'button',
    '[role="button"]',
    '.cl-btn',
    '.my-slot',
    '.app-item',
    '.settings-segment label',
  ].join(',');

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const MIN_INTERVAL_MS = 45;
  let audioContext = null;
  let noiseBuffer = null;
  let lastPlayedAt = 0;
  let lastTouchAt = 0;

  function getAudioContext() {
    if (!AudioContextClass) return null;
    if (audioContext) return audioContext;
    try {
      audioContext = new AudioContextClass({ latencyHint: 'interactive' });
    } catch (error) {
      try { audioContext = new AudioContextClass(); } catch (fallbackError) { return null; }
    }
    return audioContext;
  }

  function getNoiseBuffer(context) {
    if (noiseBuffer && noiseBuffer.sampleRate === context.sampleRate) return noiseBuffer;
    const frameCount = Math.max(1, Math.round(context.sampleRate * 0.04));
    noiseBuffer = context.createBuffer(1, frameCount, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < frameCount; i += 1) {
      const envelope = 1 - (i / frameCount);
      samples[i] = (Math.random() * 2 - 1) * envelope;
    }
    return noiseBuffer;
  }

  function synthesizeClick(context) {
    const now = context.currentTime;
    const output = context.createGain();
    output.gain.setValueAtTime(0.0001, now);
    output.gain.exponentialRampToValueAtTime(0.18, now + 0.002);
    output.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    output.connect(context.destination);

    const tone = context.createOscillator();
    const toneGain = context.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(1900, now);
    tone.frequency.exponentialRampToValueAtTime(950, now + 0.062);
    toneGain.gain.setValueAtTime(0.68, now);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.062);
    tone.connect(toneGain);
    toneGain.connect(output);

    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = getNoiseBuffer(context);
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(3200, now);
    noiseFilter.Q.setValueAtTime(0.8, now);
    noiseGain.gain.setValueAtTime(0.38, now);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(output);

    tone.start(now);
    noise.start(now);
    tone.stop(now + 0.07);
    noise.stop(now + 0.04);
  }

  function play() {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === 'suspended' && typeof context.resume === 'function') {
      const resumed = context.resume();
      if (resumed && typeof resumed.then === 'function') {
        resumed.then(() => synthesizeClick(context)).catch(() => {});
        return;
      }
    }
    synthesizeClick(context);
  }

  function handlePointerDown(event) {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest(CLICKABLE_SELECTOR);
    if (!control || control.matches(':disabled, [aria-disabled="true"]')) return;
    const now = Date.now();
    if (now - lastPlayedAt < MIN_INTERVAL_MS) return;
    lastPlayedAt = now;
    play();
  }

  function handleTouchStart(event) {
    lastTouchAt = Date.now();
    handlePointerDown(event);
  }

  function handleMouseDown(event) {
    if (event.button !== 0 || Date.now() - lastTouchAt < 800) return;
    handlePointerDown(event);
  }

  document.addEventListener('pointerdown', event => {
    if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.pointerType === 'touch') lastTouchAt = Date.now();
    handlePointerDown(event);
  }, { capture: true, passive: true });
  document.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
  document.addEventListener('mousedown', handleMouseDown, { capture: true, passive: true });

  return { play };
})();

window.ButtonSound = ButtonSound;
