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
export const playKeyClick = () => tone(900, 30, 0.12, "triangle");

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
