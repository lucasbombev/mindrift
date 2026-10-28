let ctx = null;
let primed = false;
const listeners = new Set();

function ensureContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  return ctx;
}

export function isSecureForServiceWorker() {
  return (
    typeof window !== 'undefined' &&
    (window.isSecureContext ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1')
  );
}

export async function primeAudio() {
  const audio = ensureContext();
  if (!audio) return false;
  try {
    if (audio.state === 'suspended') await audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    gain.gain.value = 0.00001;
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.02);
    primed = audio.state === 'running';
  } catch {
    primed = false;
  }
  listeners.forEach((fn) => fn(primed));
  return primed;
}

export function audioReady() {
  return primed && ctx?.state === 'running';
}

export function subscribeAudio(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function tone(frequency, startOffset, duration, volume = 0.18, type = 'sine') {
  const audio = ensureContext();
  if (!audio) return;
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  const start = audio.currentTime + startOffset;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

export function playLeadAlert() {
  tone(880, 0, 0.12, 0.2, 'triangle');
  tone(1175, 0.16, 0.16, 0.2, 'triangle');
}

export function playEndAlarm() {
  [0, 0.28, 0.56, 1.1, 1.38, 1.66].forEach((offset, index) => {
    tone(index % 2 === 0 ? 1046 : 784, offset, 0.18, 0.25, 'square');
  });
}

export function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    /* sem suporte */
  }
}

export function alertFeedback(stage) {
  if (stage === 'lead') {
    playLeadAlert();
    vibrate([160, 90, 160]);
  } else {
    playEndAlarm();
    vibrate([500, 160, 500, 160, 500]);
  }
}
