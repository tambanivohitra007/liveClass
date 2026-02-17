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

// --- Lobby Music: multiple synthesized tracks ---
let lobbyTimer: ReturnType<typeof setInterval> | null = null;
let beat = 0;
let currentTrack = 'chill';

interface MusicTrack {
  label: string;
  chords: number[][];
  oscType: OscillatorType;
  padVol: number;
  bassVol: number;
  interval: number;
  dur: number;
}

export const MUSIC_TRACKS: Record<string, MusicTrack> = {
  chill: {
    label: 'Chill',
    chords: [[261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]],
    oscType: 'sine', padVol: 0.04, bassVol: 0.05, interval: 3000, dur: 2.8,
  },
  upbeat: {
    label: 'Upbeat',
    chords: [[329.6, 415.3, 523.3], [349.2, 440.0, 523.3], [293.7, 370.0, 440.0], [329.6, 392.0, 493.9]],
    oscType: 'triangle', padVol: 0.05, bassVol: 0.06, interval: 2000, dur: 1.8,
  },
  retro: {
    label: 'Retro',
    chords: [[261.6, 311.1, 392.0], [233.1, 293.7, 349.2], [207.7, 261.6, 311.1], [220.0, 277.2, 329.6]],
    oscType: 'square', padVol: 0.02, bassVol: 0.03, interval: 2500, dur: 2.2,
  },
  dreamy: {
    label: 'Dreamy',
    chords: [[293.7, 370.0, 440.0], [261.6, 329.6, 415.3], [246.9, 311.1, 370.0], [277.2, 349.2, 440.0]],
    oscType: 'sine', padVol: 0.03, bassVol: 0.04, interval: 4000, dur: 3.5,
  },
};

function playChord() {
  if (_muted) return;
  const track = MUSIC_TRACKS[currentTrack] || MUSIC_TRACKS.chill;
  const c = getCtx();
  const now = c.currentTime;
  const chord = track.chords[beat % track.chords.length];
  chord.forEach((freq) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = track.oscType;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(track.padVol, now + 0.4);
    g.gain.setValueAtTime(track.padVol, now + track.dur - 0.6);
    g.gain.linearRampToValueAtTime(0, now + track.dur);
    osc.connect(g).connect(c.destination);
    osc.start(now);
    osc.stop(now + track.dur + 0.1);
  });
  const bass = c.createOscillator();
  const bg = c.createGain();
  bass.type = 'sine';
  bass.frequency.setValueAtTime(chord[0] / 2, now);
  bg.gain.setValueAtTime(0, now);
  bg.gain.linearRampToValueAtTime(track.bassVol, now + 0.2);
  bg.gain.setValueAtTime(track.bassVol, now + track.dur - 0.6);
  bg.gain.linearRampToValueAtTime(0, now + track.dur);
  bass.connect(bg).connect(c.destination);
  bass.start(now);
  bass.stop(now + track.dur + 0.1);
  beat++;
}

export function setLobbyTrack(trackId: string) {
  currentTrack = trackId;
  if (lobbyTimer) {
    stopLobbyMusic();
    startLobbyMusic();
  }
}

export function getLobbyTrack() {
  return currentTrack;
}

export function startLobbyMusic() {
  if (lobbyTimer) return;
  beat = 0;
  playChord();
  const track = MUSIC_TRACKS[currentTrack] || MUSIC_TRACKS.chill;
  lobbyTimer = setInterval(playChord, track.interval);
}

export function stopLobbyMusic() {
  if (lobbyTimer) { clearInterval(lobbyTimer); lobbyTimer = null; }
}
