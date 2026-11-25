// Escapement acoustics, synthesised.
//
// A lever "tick" is three events a few milliseconds apart: unlocking (the pallet stone leaves the
// tooth), impulse (the tooth slides across the impulse face) and the drop/lock (the next tooth
// lands on the other stone — the loudest). Each is a tiny steel-on-ruby impact that rings the
// movement and case. We model that the way acoustic modelling does it: a sub-millisecond
// excitation convolved with a "case impulse response" made of dozens of inharmonic, exponentially
// decaying metal modes. Variants are baked once in OfflineAudioContexts; tick and tock use
// different resonance sets (entry and exit pallets excite the movement differently), and every
// event gets small random changes in level, pitch and timing, like a real recording.
//
// Events are scheduled from the balance phase, so in slow motion the three clicks separate
// exactly as a timegrapher microphone shows them.

const TAU = Math.PI * 2;

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export class WatchAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.volume = 0.7;
    this.stetho = false;
    this.lastScheduled = -Infinity;
    this.kind = 'lever';
    this.ready = false;
  }

  async enable() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      const c = this.ctx;
      // output chain: case-cavity comb → presence EQ → gentle air roll-off → limiter → master
      this.input = c.createGain();
      const cav = c.createDelay(0.01); cav.delayTime.value = 0.00073;
      const fb = c.createGain(); fb.gain.value = 0.28;
      const cavLp = c.createBiquadFilter(); cavLp.type = 'lowpass'; cavLp.frequency.value = 7000;
      this.input.connect(cav); cav.connect(cavLp).connect(fb).connect(cav);
      const sum = c.createGain();
      this.input.connect(sum); cavLp.connect(sum);
      const pres = c.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 3800; pres.Q.value = 0.9; pres.gain.value = 3;
      const air = c.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 10000; air.gain.value = -6;
      this.low = c.createBiquadFilter(); this.low.type = 'lowshelf'; this.low.frequency.value = 900; this.low.gain.value = 0;
      const lim = c.createDynamicsCompressor(); lim.threshold.value = -10; lim.ratio.value = 6; lim.attack.value = 0.001; lim.release.value = 0.05;
      this.master = c.createGain(); this.master.gain.value = this.volume;
      sum.connect(pres).connect(air).connect(this.low).connect(lim).connect(this.master).connect(c.destination);
      // room tone: a faint, slightly coloured noise floor, as in any real recording of a watch
      this.floor = this.makeFloor();
      this.whirr = this.makeWhirr();
    }
    await this.ctx.resume();
    if (!this.ready) { await this.buildBank(); this.ready = true; }
    this.enabled = true;
    this.floor.gain.setTargetAtTime(0.0025, this.ctx.currentTime, 0.3);
  }
  disable() { this.enabled = false; if (this.ctx) { this.floor.gain.value = 0; this.ctx.suspend(); } }
  reset() { this.lastScheduled = -Infinity; }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v * (this.stetho ? 2.2 : 1); }
  setStetho(on) {
    this.stetho = on; this.setVolume(this.volume);
    if (this.low) this.low.gain.value = on ? 7 : 0;      // a stethoscope brings out the body thump
  }

  // ------------------------------------------------------------------ synthesis
  // A random "case" impulse response: inharmonic modes, higher ones dying faster.
  caseIR(seed, { lo = 1300, hi = 15000, n = 38, decay = 1, len = 0.07, bright = 1 } = {}) {
    const r = rng(seed);
    const sr = 48000, N = Math.floor(sr * len);
    const d = new Float32Array(N);
    for (let k = 0; k < n; k++) {
      const f = lo * Math.pow(hi / lo, Math.pow(r(), 0.85));
      const tau = decay * (0.0007 + 0.0055 * Math.pow(lo / f, 0.8) * (0.5 + r()));
      const a = (0.35 + r()) * Math.pow(2200 / f, 0.35 * (2 - bright));
      const ph = r() * TAU;
      const w = TAU * f / sr, dk = Math.exp(-1 / (tau * sr));
      let env = a;
      for (let i = 0; i < N; i++) { d[i] += env * Math.sin(w * i + ph); env *= dk; }
    }
    // a little diffuse noise at the head of the response
    for (let i = 0; i < N; i++) d[i] += (r() * 2 - 1) * 0.6 * Math.exp(-i / (sr * 0.0006));
    let m = 0; for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(d[i]));
    for (let i = 0; i < N; i++) d[i] /= m;
    return d;
  }

  async renderEvent(ir, { exciteMs = 0.12, hp = 700, gain = 1, len = 0.08, extra = null, seed = 1 }) {
    const sr = 48000;
    const oc = new OfflineAudioContext(1, Math.floor(sr * len), sr);
    const r = rng(seed * 7919);
    // excitation: a sharp asymmetric pulse with some grit
    const exN = Math.max(8, Math.floor(sr * exciteMs / 1000 * 4));
    const ex = oc.createBuffer(1, exN, sr);
    const e = ex.getChannelData(0);
    for (let i = 0; i < exN; i++) { const t = i / sr * 1000; e[i] = (Math.exp(-t / exciteMs) * (i < 3 ? 1 : 0.6) + (r() * 2 - 1) * 0.35 * Math.exp(-t / (exciteMs * 0.6))); }
    const src = oc.createBufferSource(); src.buffer = ex;
    const conv = oc.createConvolver(); conv.normalize = false;
    const irb = oc.createBuffer(1, ir.length, sr); irb.copyToChannel(ir, 0); conv.buffer = irb;
    const h = oc.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; h.Q.value = 0.7;
    const g = oc.createGain(); g.gain.value = gain * 0.12;
    src.connect(conv).connect(h).connect(g).connect(oc.destination);
    // direct path: the dry "tsk" of the impact itself
    const dry = oc.createBiquadFilter(); dry.type = 'highpass'; dry.frequency.value = 2500;
    const dg = oc.createGain(); dg.gain.value = gain * 0.35;
    src.connect(dry).connect(dg).connect(oc.destination);
    src.start(0);
    if (extra) extra(oc, conv, sr, r);
    const buf = await oc.startRendering();
    // fade the tail to avoid clicks
    const d = buf.getChannelData(0), n = d.length, fade = Math.floor(n * 0.2);
    for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade;
    return buf;
  }

  async buildBank() {
    const B = this.buffers = {};
    const jobs = [];
    const make = (name, count, irOpts, evOpts) => {
      B[name] = [];
      for (let v = 0; v < count; v++) {
        const seed = (name.length * 131 + v * 17 + (irOpts.seed || 0)) | 0;
        const ir = this.caseIR(seed, irOpts);
        jobs.push(this.renderEvent(ir, { ...evOpts, seed }).then(b => {
          // calibrate: every variant of a sound type peaks at the same level
          const d = b.getChannelData(0); let pk = 0;
          for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
          const k = (evOpts.peak ?? 0.8) / (pk || 1);
          for (let i = 0; i < d.length; i++) d[i] *= k;
          B[name].push(b);
        }));
      }
    };
    // lever escapement — "tick" (entry pallet) and "tock" (exit pallet) resonate a little differently
    for (const side of ['A', 'B']) {
      const s = side === 'A' ? 0 : 1000;
      const shift = side === 'A' ? 1 : 0.93;
      make('unlock' + side, 4, { seed: 11 + s, lo: 1600 * shift, hi: 15000, n: 30, decay: 0.6, bright: 1.2 }, { exciteMs: 0.05, gain: 0.35, len: 0.04, peak: 0.22 });
      make('impulse' + side, 4, { seed: 23 + s, lo: 1200 * shift, hi: 13000, n: 34, decay: 0.8 }, { exciteMs: 0.18, gain: 0.55, len: 0.05, peak: 0.4 });
      make('drop' + side, 5, { seed: 37 + s, lo: 1100 * shift, hi: 14000, n: 42, decay: 1.0, bright: 1.1 }, { exciteMs: 0.07, gain: 1.0, len: 0.07, peak: 0.85 });
    }
    // verge: brass crown wheel, heavier balance, recoil — a duller, longer "clack"
    make('verge', 5, { seed: 501, lo: 650, hi: 7000, n: 36, decay: 1.8, bright: 0.6 }, {
      exciteMs: 0.45, gain: 1.1, len: 0.12, hp: 300, peak: 0.9,
      extra: (oc, conv, sr, r) => {   // recoil scrape ~12 ms later
        const n = Math.floor(sr * 0.012);
        const b = oc.createBuffer(1, n, sr); const d = b.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (r() * 2 - 1) * Math.sin(Math.PI * i / n) * 0.18;
        const s = oc.createBufferSource(); s.buffer = b; s.connect(conv); s.start(0.012);
      },
    });
    // chronometer detent: the wheel strikes the impulse roller directly — loud, crisp, ringing
    make('detent', 5, { seed: 701, lo: 1500, hi: 16000, n: 46, decay: 1.6, bright: 1.3 }, { exciteMs: 0.05, gain: 1.25, len: 0.1, peak: 0.95 });
    make('passing', 3, { seed: 733, lo: 3000, hi: 16000, n: 20, decay: 0.4 }, { exciteMs: 0.03, gain: 0.12, len: 0.03, peak: 0.07 });
    // winding: ratchet click riding over a tooth; crown pull
    make('click', 6, { seed: 901, lo: 1800, hi: 12000, n: 28, decay: 0.7 }, { exciteMs: 0.06, gain: 0.5, len: 0.035, peak: 0.45 });
    make('crown', 2, { seed: 951, lo: 900, hi: 6000, n: 30, decay: 1.2, bright: 0.7 }, { exciteMs: 0.3, gain: 0.9, len: 0.06, hp: 300, peak: 0.7 });
    await Promise.all(jobs);
  }

  makeFloor() {
    const c = this.ctx, sr = c.sampleRate, n = sr * 3;
    const b = c.createBuffer(1, n, sr), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.997 * b0 + w * 0.03; b1 = 0.985 * b1 + w * 0.03; b2 = 0.95 * b2 + w * 0.05; d[i] = (b0 + b1 + b2 + w * 0.02); }
    const s = c.createBufferSource(); s.buffer = b; s.loop = true;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(g).connect(this.master); s.start();
    return g;
  }

  makeWhirr() {
    const c = this.ctx, sr = c.sampleRate, n = sr * 2;
    const b = c.createBuffer(1, n, sr), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { last = last * 0.96 + (Math.random() * 2 - 1) * 0.04; d[i] = last * 4; }
    const s = c.createBufferSource(); s.buffer = b; s.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.8;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(bp).connect(g).connect(this.input); s.start();
    const osc = c.createOscillator(); osc.type = 'sine'; osc.frequency.value = 48;
    const og = c.createGain(); og.gain.value = 0;
    osc.connect(og).connect(this.input); osc.start();
    return { gain: g, filter: bp, hum: og };
  }

  play(name, when, gain = 1) {
    const bank = this.buffers?.[name];
    if (!bank || !bank.length) return;
    const src = this.ctx.createBufferSource();
    src.buffer = bank[(Math.random() * bank.length) | 0];
    src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.03;          // ±1.5 % pitch
    const g = this.ctx.createGain();
    g.gain.value = gain * (0.88 + Math.random() * 0.24);                  // ±12 % level
    src.connect(g).connect(this.input);
    src.start(Math.max(this.ctx.currentTime, when + (Math.random() - 0.5) * 0.00008));
  }

  // Schedule escapement sounds for the coming ~120 ms of wall-clock time.
  schedule(sim, scale) {
    if (!this.enabled || !this.ready) return;
    const now = this.ctx.currentTime;
    const kNow = Math.floor(sim.phi / Math.PI);
    if (this.lastScheduled > kNow + 4 || this.lastScheduled < kNow - 50) this.lastScheduled = kNow - 1;  // new movement / jump
    if (scale <= 0 || sim.hacked) { this.lastScheduled = kNow; return; }
    if (sim.continuous) {
      this.whirr.hum.gain.setTargetAtTime(sim.stopped ? 0 : 0.0015 * Math.min(1, scale), now, 0.2);
      return;
    }
    this.whirr.hum.gain.setTargetAtTime(0, now, 0.1);
    const f = sim.f, w = TAU * f;
    if (sim.stopped || 2 * f * scale > 40) { this.lastScheduled = kNow; return; }
    const look = 0.12 * scale;
    const phiNow = sim.phi, phiEnd = phiNow + w * look;
    const A = Math.max(sim.A, 1e-3), L = sim.lift;
    const dphi = Math.asin(Math.min(1, (L / 2) / A));
    const ampGain = Math.pow(Math.min(1.15, A / sim.Amax), 1.6);
    for (let k = Math.max(this.lastScheduled + 1, kNow); ; k++) {
      const phiC = k * Math.PI + Math.PI / 2;            // balance passes through its centre
      if (phiC - dphi > phiEnd) break;
      const toReal = (phi) => now + (phi - phiNow) / w / scale + 0.03;
      const be = (k % 2 ? 0.5 : -0.5) * (sim.beatError || 0) / 1000 / scale;
      const tU = toReal(phiC - dphi) + be, tI = toReal(phiC - dphi * 0.25) + be, tD = toReal(phiC + dphi) + be;
      this.lastScheduled = k;
      if (tD < now) continue;
      const side = k % 2 ? 'A' : 'B';
      if (this.kind === 'verge') this.play('verge', tI, ampGain);
      else if (this.kind === 'detent') {
        if (k % 2 === 0) { this.play('unlockA', tU, ampGain * 0.5); this.play('detent', tD, ampGain); }
        else this.play('passing', tI, ampGain);
      } else {
        this.play('unlock' + side, tU, ampGain);
        this.play('impulse' + side, tI, ampGain);
        this.play('drop' + side, tD, ampGain);
      }
    }
  }

  rotorWhirr(speed) {
    if (!this.enabled || !this.ready) return;
    const t = this.ctx.currentTime;
    this.whirr.gain.gain.setTargetAtTime(Math.min(0.04, Math.abs(speed) * 0.003), t, 0.05);
    this.whirr.filter.frequency.setTargetAtTime(800 + Math.abs(speed) * 70, t, 0.05);
  }

  click(gain = 0.6) { if (this.enabled && this.ready) this.play('click', this.ctx.currentTime + 0.005, gain); }
  crownClick() { if (this.enabled && this.ready) this.play('crown', this.ctx.currentTime + 0.005, 0.8); }
}
