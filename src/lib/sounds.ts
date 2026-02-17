// Web Audio API sound effects — no external audio files needed

let ctx: AudioContext | null = null;
let _muted = typeof localStorage !== 'undefined' && localStorage.getItem('lc_muted') === 'true';

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export const isMuted = () => _muted;
export function setMuted(val: boolean) {
  _muted = val;
  localStorage.setItem('lc_muted', String(val));
  if (val) stopLobbyMusic();
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, delay = 0) {
  if (_muted) return;
  const c = getCtx();
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

export const playCorrect = () => { tone(523, 0.15); tone(659, 0.25, 'sine', 0.3, 0.1); };
export const playWrong = () => { tone(185, 0.35, 'sawtooth', 0.1); tone(165, 0.35, 'sawtooth', 0.1, 0.05); };
export const playTick = () => tone(900, 0.06, 'square', 0.08);
export const playUrgentTick = () => tone(1200, 0.08, 'square', 0.12);
export const playSubmit = () => { tone(440, 0.08, 'sine', 0.2); tone(660, 0.08, 'sine', 0.2, 0.06); tone(880, 0.12, 'sine', 0.2, 0.12); };
export const playJoin = () => { tone(660, 0.1, 'sine', 0.12); tone(880, 0.12, 'sine', 0.12, 0.08); };
export const playPodium = () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'sine', 0.2, i * 0.15)); };

// --- Lobby Music: gentle ambient chord loop ---
let lobbyTimer: ReturnType<typeof setInterval> | null = null;
let beat = 0;
const CHORDS = [
  [261.6, 329.6, 392.0], // C major
  [220.0, 261.6, 329.6], // A minor
  [174.6, 220.0, 261.6], // F major
  [196.0, 246.9, 293.7], // G major
];

function playChord() {
  if (_muted) return;
  const c = getCtx();
  const now = c.currentTime;
  const chord = CHORDS[beat % CHORDS.length];
  // Pad tones
  chord.forEach((freq) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.04, now + 0.4);
    g.gain.setValueAtTime(0.04, now + 2.2);
    g.gain.linearRampToValueAtTime(0, now + 2.8);
    osc.connect(g).connect(c.destination);
    osc.start(now);
    osc.stop(now + 2.9);
  });
  // Bass note
  const bass = c.createOscillator();
  const bg = c.createGain();
  bass.type = 'sine';
  bass.frequency.setValueAtTime(chord[0] / 2, now);
  bg.gain.setValueAtTime(0, now);
  bg.gain.linearRampToValueAtTime(0.05, now + 0.2);
  bg.gain.setValueAtTime(0.05, now + 2.2);
  bg.gain.linearRampToValueAtTime(0, now + 2.8);
  bass.connect(bg).connect(c.destination);
  bass.start(now);
  bass.stop(now + 2.9);
  beat++;
}

export function startLobbyMusic() {
  if (lobbyTimer) return;
  beat = 0;
  playChord();
  lobbyTimer = setInterval(playChord, 3000);
}

export function stopLobbyMusic() {
  if (lobbyTimer) { clearInterval(lobbyTimer); lobbyTimer = null; }
}
