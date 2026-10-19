let ctx = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, ms, volume, type = "sine") {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = a.currentTime;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + ms / 1000 + 0.02);
}

export const playScanBeep = () => tone(1760, 140, 0.35, "square");

// Short filtered noise burst, like the phone keyboard tick
export function playKeyClick() {
  const a = audio();
  if (!a) return;
  const len = Math.floor(a.sampleRate * 0.025);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 3200;
  filter.Q.value = 0.8;
  const gain = a.createGain();
  gain.gain.value = 0.6;
  src.connect(filter).connect(gain).connect(a.destination);
  src.start();
}

export function installKeySounds() {
  const onInput = (e) => {
    const el = e.target;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA") && el.type !== "range") playKeyClick();
  };
  const unlock = () => audio();
  document.addEventListener("input", onInput, true);
  document.addEventListener("touchstart", unlock, { once: true, passive: true });
  document.addEventListener("click", unlock, { once: true });
  return () => document.removeEventListener("input", onInput, true);
}
