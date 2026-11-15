// All sound is synthesised with WebAudio; there are no audio files.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.reelOn = false;
    this.reelT = 0;
  }

  // Must be called from a user gesture.
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Sea ambience: two slowly breathing bands of filtered noise.
    for (const [freq, q, gain, rate] of [[420, 0.6, 0.11, 0.11], [1500, 0.8, 0.035, 0.17]]) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const lg = ctx.createGain();
      lg.gain.value = gain * 0.6;
      lfo.connect(lg).connect(g.gain);
      src.connect(f).connect(g).connect(this.master);
      src.start();
      lfo.start();
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = 0 } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  burst(dur, { freq = 1200, q = 0.8, vol = 0.3, type = 'bandpass', sweep = 1, at = 0 } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loopStart = Math.random();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  play(name, { size = 0.6, gain = 1 } = {}) {
    if (!this.ctx || this.muted) return;
    const v = gain;
    switch (name) {
      case 'cast': this.burst(0.38, { freq: 700, sweep: 5, q: 1.4, vol: 0.22 * v }); break;
      case 'splash':
        this.burst(0.25 + size * 0.3, { freq: 1800, sweep: 0.35, q: 0.5, vol: (0.1 + size * 0.2) * v });
        this.tone(170, 0.14, { vol: 0.12 * size * v, slide: 0.5 });
        break;
      case 'nibble': this.tone(620, 0.07, { vol: 0.06 * v, type: 'triangle' }); break;
      case 'bite':
        this.tone(1040, 0.12, { vol: 0.28 * v, type: 'triangle' });
        this.tone(1560, 0.2, { vol: 0.26 * v, type: 'triangle', at: 0.1 });
        break;
      case 'hook': this.tone(330, 0.2, { vol: 0.2 * v, type: 'square', slide: 2 }); break;
      case 'snap':
        this.burst(0.12, { freq: 3500, q: 2, vol: 0.5 * v });
        this.tone(520, 0.4, { vol: 0.2 * v, type: 'sawtooth', slide: 0.25 });
        break;
      case 'lost':
        this.tone(440, 0.22, { vol: 0.16 * v, type: 'triangle', slide: 0.7 });
        this.tone(330, 0.32, { vol: 0.16 * v, type: 'triangle', slide: 0.7, at: 0.2 });
        break;
      case 'catch':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.28, { vol: 0.2 * v, type: 'triangle', at: i * 0.09 }));
        break;
      case 'rare':
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.4, { vol: 0.2 * v, type: 'triangle', at: i * 0.1 }));
        this.tone(2093, 0.9, { vol: 0.12 * v, at: 0.6 });
        break;
      case 'gull':
        [0, 0.22, 0.42].forEach((at, i) => this.tone(1900 - i * 120, 0.2, { vol: 0.09 * v, type: 'sawtooth', slide: 0.62, at }));
        break;
      case 'click': this.burst(0.02, { freq: 2600 + size * 1800, q: 4, vol: 0.14 * v }); break;
    }
  }

  // Ratchet clicks while winding; pitch rises with line tension.
  reel(on, tension, dt) {
    if (!on) { this.reelT = 0; return; }
    this.reelT -= dt;
    if (this.reelT <= 0) {
      this.reelT = 0.075;
      this.play('click', { size: tension });
    }
  }
}
