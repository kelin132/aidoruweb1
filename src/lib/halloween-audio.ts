export type HalloweenAudioScene = "silent" | "loading" | "start" | "map" | "sailing" | "playing" | "won" | "lost";
export type HalloweenSoundEffect = "shot" | "slash" | "damage" | "pickup" | "rescue" | "crate" | "heal";
let context: AudioContext | null = null; let master: GainNode | null = null; let enabled = false; let scene: HalloweenAudioScene = "silent";
let sceneNodes: Array<AudioNode & { stop?: () => void }> = []; let musicTimer: number | null = null; let musicStep = 0;
function ensureContext() {
  if (typeof window === "undefined" || !window.AudioContext) return null;
  if (!context) { context = new window.AudioContext(); master = context.createGain(); master.gain.value = 0.55; master.connect(context.destination); }
  return context;
}
function stopScene() {
  if (musicTimer !== null && typeof window !== "undefined") { window.clearInterval(musicTimer); musicTimer = null; }
  for (const node of sceneNodes) { try { node.stop?.(); } catch { /* already stopped */ } try { node.disconnect(); } catch { /* already disconnected */ } }
  sceneNodes = [];
}
function keep(node: AudioNode & { stop?: () => void }) { sceneNodes.push(node); return node; }
function envelope(gain: GainNode, start: number, duration: number, volume: number) { gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.015); gain.gain.exponentialRampToValueAtTime(0.0001, start + duration); }
function playTone(frequency: number, duration: number, volume: number, wave: OscillatorType = "triangle", start?: number, endFrequency?: number) {
  const ctx = ensureContext(); if (!ctx || !master || !enabled) return; const when = start ?? ctx.currentTime; const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
  oscillator.type = wave; oscillator.frequency.setValueAtTime(Math.max(30, frequency), when); if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), when + duration);
  envelope(gain, when, duration, volume); oscillator.connect(gain).connect(master); oscillator.start(when); oscillator.stop(when + duration + 0.025); oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}
function playOcean() {
  const ctx = ensureContext(); if (!ctx || !master) return; const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate); const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
  const waves = ctx.createBufferSource(); waves.buffer = buffer; waves.loop = true; const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 520;
  const surf = ctx.createGain(); surf.gain.value = 0.09; const swell = ctx.createOscillator(); swell.type = "sine"; swell.frequency.value = scene === "sailing" ? 0.12 : 0.075;
  const swellDepth = ctx.createGain(); swellDepth.gain.value = 0.055; swell.connect(swellDepth).connect(surf.gain); waves.connect(filter).connect(surf).connect(master);
  keep(waves); keep(filter); keep(surf); keep(swell); keep(swellDepth); waves.start(); swell.start();
}
function scheduleMusic() {
  const ctx = ensureContext(); if (!ctx || ctx.state !== "running" || !enabled) return;
  const melody = [293.66, 349.23, 440, 523.25, 440, 349.23, 329.63, 293.66, 261.63, 329.63, 392, 440, 392, 329.63, 293.66, 261.63];
  const bass = [73.42, 87.31, 65.41, 98];
  const step = musicStep % melody.length;
  const when = ctx.currentTime + 0.035;
  if (step % 4 === 0) playTone(bass[Math.floor(step / 4) % bass.length]!, 0.38, 0.085, "sine", when);
  playTone(melody[step]!, 0.19, 0.05, "triangle", when);
  if (step % 4 === 2) playTone(melody[step]! * 2, 0.1, 0.016, "sine", when + 0.07);
  musicStep += 1;
}
export async function enableHalloweenAudio() {
  enabled = true;
  const ctx = ensureContext();
  if (!ctx) { enabled = false; return false; }
  try { await ctx.resume(); } catch { /* browser may request a gesture again */ }
  return ctx.state === "running";
}
export function setHalloweenAudioScene(nextScene: HalloweenAudioScene) {
  scene = nextScene; stopScene(); if (!enabled) return; const ctx = ensureContext(); if (!ctx || ctx.state !== "running") return;
  if (scene === "loading" || scene === "sailing") { playOcean(); return; }
  if (scene === "playing") { musicStep = 0; scheduleMusic(); musicTimer = window.setInterval(scheduleMusic, 260); }
}
export function playHalloweenSound(effect: HalloweenSoundEffect) {
  if (!enabled) return;
  if (effect === "shot") playTone(720,0.11,0.08,"sawtooth",undefined,145);
  else if (effect === "slash") playTone(410,0.12,0.045,"triangle",undefined,125);
  else if (effect === "damage") playTone(190,0.18,0.09,"square",undefined,72);
  else if (effect === "pickup") { playTone(720,0.09,0.045,"sine"); playTone(980,0.12,0.04,"sine",(context?.currentTime ?? 0) + 0.08); }
  else if (effect === "rescue") { playTone(523.25,0.16,0.055,"sine"); playTone(783.99,0.2,0.05,"sine",(context?.currentTime ?? 0) + 0.12); }
  else if (effect === "crate") { playTone(392,0.1,0.05,"triangle"); playTone(587.33,0.17,0.055,"triangle",(context?.currentTime ?? 0) + 0.09); }
  else if (effect === "heal") playTone(660,0.15,0.035,"sine",undefined,990);
}
