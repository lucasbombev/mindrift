let ctx = null;
let primed = false;
const listeners = new Set();
const buffers = new Map();
const loading = new Map();

export const SOUND_OPTIONS = [
  { value: 'beep', label: 'Beep' },
  { value: 'sino', label: 'Sino' },
  { value: 'alarme', label: 'Alarme' },
  { value: 'bipe-duplo', label: 'Bipe duplo' },
  { value: 'apito', label: 'Apito' },
  { value: 'campainha', label: 'Campainha' },
];
export const SOUND_NAMES = SOUND_OPTIONS.map((item) => item.value);

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

async function loadBuffer(name) {
  if (buffers.has(name)) return buffers.get(name);
  if (loading.has(name)) return loading.get(name);
  const task = (async () => {
    const audio = ensureContext();
    const res = await fetch(`/sounds/${name}.wav`, { cache: 'force-cache' });
    if (!res.ok) throw new Error('Som não encontrado.');
    const bytes = await res.arrayBuffer();
    const buffer = await audio.decodeAudioData(bytes);
    buffers.set(name, buffer);
    return buffer;
  })();
  loading.set(name, task);
  try {
    return await task;
  } finally {
    loading.delete(name);
  }
}

export async function preloadSounds() {
  await Promise.all(SOUND_NAMES.map((name) => loadBuffer(name).catch(() => null)));
}

/**
 * Toca um som local usando Web Audio. volume em 0..100.
 * Retorna true se conseguiu iniciar.
 */
export async function playSound(name, { volume = 70 } = {}) {
  const safeName = SOUND_NAMES.includes(name) ? name : 'beep';
  const audio = ensureContext();
  if (!audio) return false;
  try {
    if (audio.state === 'suspended') await audio.resume();
    primed = audio.state === 'running';
    listeners.forEach((fn) => fn(primed));
    if (!primed) return false;
    const buffer = await loadBuffer(safeName);
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    source.buffer = buffer;
    gain.gain.value = Math.max(0, Math.min(100, Number(volume) || 0)) / 100 * 0.9;
    source.connect(gain);
    gain.connect(audio.destination);
    source.start();
    return true;
  } catch {
    return false;
  }
}

export function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    /* sem suporte */
  }
}

export function playLeadAlert() {
  playSound('beep', { volume: 70 });
}

export function playEndAlarm(name = 'alarme', volume = 80) {
  playSound(name, { volume });
}

export function alertFeedback(stage) {
  if (stage === 'lead') {
    playSound('beep', { volume: 70 });
    vibrate([160, 90, 160]);
  } else {
    playSound('alarme', { volume: 85 });
    vibrate([500, 160, 500, 160, 500]);
  }
}
