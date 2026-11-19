// Procedural chiptune music and sound effects (WebAudio, no audio files).

interface Song {
  bpm: number;
  lead: number[];
  bass: number[];
  kick: number[];
  snare: number[];
  hat: number[];
}

const bar = (root: number, pattern: number[]) => pattern.map((n) => (n === 0 ? 0 : root + n - 1));
const repeat = <T>(items: T[], times: number) => Array.from({ length: times }, () => items).flat();

// Offsets are 1-based semitones above the root so 0 can mean "rest".
const LOBBY_BASS = [1, 0, 0, 13, 0, 0, 1, 0, 1, 0, 0, 13, 0, 0, 8, 0];
const LOBBY: Song = {
  bpm: 116,
  lead: [
    72, 0, 76, 0, 79, 0, 76, 0, 84, 0, 79, 0, 76, 0, 79, 0,
    69, 0, 72, 0, 76, 0, 72, 0, 81, 0, 76, 0, 72, 0, 76, 0,
    65, 0, 69, 0, 72, 0, 69, 0, 77, 0, 72, 0, 69, 0, 72, 0,
    67, 0, 71, 0, 74, 0, 71, 0, 79, 0, 77, 0, 74, 0, 71, 0,
  ],
  bass: [...bar(48, LOBBY_BASS), ...bar(45, LOBBY_BASS), ...bar(41, LOBBY_BASS), ...bar(43, LOBBY_BASS)],
  kick: repeat([1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], 4),
  snare: repeat([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], 4),
  hat: repeat([0, 0, 1, 0], 16),
};

const RACE_BASS = [1, 1, 13, 1, 1, 1, 13, 1, 1, 1, 13, 1, 1, 13, 1, 13];
const RACE: Song = {
  bpm: 158,
  lead: [
    69, 72, 76, 81, 76, 72, 69, 72, 76, 81, 84, 81, 76, 72, 76, 72,
    81, 0, 81, 79, 76, 0, 79, 0, 81, 0, 84, 0, 83, 81, 79, 76,
    65, 69, 72, 77, 72, 69, 65, 69, 72, 77, 81, 77, 72, 69, 72, 69,
    67, 71, 74, 79, 74, 71, 67, 71, 74, 79, 83, 79, 80, 0, 80, 0,
  ],
  bass: [...bar(45, RACE_BASS), ...bar(45, RACE_BASS), ...bar(41, RACE_BASS), ...bar(43, RACE_BASS)],
  kick: repeat([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0], 4),
  snare: repeat([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1], 4),
  hat: repeat([1, 0, 1, 1], 16),
};

const SONGS = { lobby: LOBBY, race: RACE };
export type SongName = keyof typeof SONGS;

const MUTE_KEY = "muted";
const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private song: Song | null = null;
  private wanted: SongName | null = null;
  private step = 0;
  private nextTime = 0;
  private timer = 0;
  muted = localStorage.getItem(MUTE_KEY) === "1";

  /** Creates the audio context. Browsers only allow sound after a user gesture, so also retry on the next one. */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.3;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.timer = window.setInterval(() => this.schedule(), 25);
    }
    if (this.ctx.state !== "running") {
      const resume = () => {
        this.ctx?.resume();
        window.removeEventListener("keydown", resume);
        window.removeEventListener("pointerdown", resume);
      };
      this.ctx.resume().catch(() => {});
      window.addEventListener("keydown", resume);
      window.addEventListener("pointerdown", resume);
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  play(name: SongName | null): void {
    if (name === this.wanted) return;
    this.wanted = name;
    this.song = name ? SONGS[name] : null;
    this.step = 0;
    this.nextTime = 0;
  }

  beep(midi: number, dur: number): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    this.tone(freq(midi), this.ctx.currentTime, dur, "square", 0.22);
  }

  bump(): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    this.noise(this.ctx.currentTime, 0.07, 0.25, 900);
  }

  /** Rising sweep when a kart takes off from a ramp. */
  jump(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(980, t + 0.28);
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.34);
  }

  fanfare(): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    [72, 76, 79, 84].forEach((m, i) => this.tone(freq(m), t + i * 0.12, i === 3 ? 0.5 : 0.12, "square", 0.2));
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.song || ctx.state !== "running") return;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    const song = this.song;
    const stepDur = 60 / song.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const i = this.step % song.lead.length;
      const t = this.nextTime;
      if (song.lead[i]) this.tone(freq(song.lead[i]), t, stepDur * 1.6, "square", 0.085);
      if (song.bass[i]) this.tone(freq(song.bass[i]), t, stepDur * 1.8, "triangle", 0.22);
      if (song.kick[i]) this.kick(t);
      if (song.snare[i]) this.noise(t, 0.09, 0.14, 1800);
      if (song.hat[i]) this.noise(t, 0.03, 0.06, 7000);
      this.step++;
      this.nextTime += stepDur;
    }
  }

  private tone(f: number, t: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.11);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  private noise(t: number, dur: number, vol: number, highpass: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = highpass;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}

export const audio = new Audio();
