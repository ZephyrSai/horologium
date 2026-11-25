// Timekeeping simulation. The balance is modelled as an isochronous oscillator whose phase is
// integrated over time; the escapement state (which beat, how far through the lift) is derived
// from that phase, so the whole train is deterministic at any time-scale.
//
//   θ(t) = A · cos φ(t),   φ' = 2π f
//   one beat (vibration) = half an oscillation = φ advancing by π
//
// Mainspring state `wind` (0..1) drives amplitude; when the spring is let down the balance
// amplitude decays and the escapement can no longer unlock: the watch stops.

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

export class Sim {
  constructor(cfg) {
    this.cfg = cfg;
    this.f = cfg.vph / 7200;                 // oscillation frequency, Hz
    this.lift = (cfg.lift ?? 50) * D2R;       // total lift angle
    this.Amax = (cfg.amplitude ?? 295) * D2R; // dial-up, fully wound
    this.reserve = (cfg.reserve ?? 42) * 3600;
    this.wind = 0.85;
    this.phi = Math.random() * Math.PI;      // balance phase
    this.A = this.Amax * 0.95;
    this.beats = 0;                          // completed beats since start (counts escape steps)
    this.hacked = false;
    this.continuous = !!cfg.continuous;      // spring drive: no beats
    this.beatsPerStep = cfg.beatsPerStep ?? 1; // detent: escape wheel advances every 2nd beat
    this.posFactor = 1;                      // amplitude factor for position (vertical lower)
    this.rateErr = 0;                        // s/day, applied to frequency
    this.stopped = false;
    this.t = 0;
    this.onBeat = null;
  }

  amplitudeTarget() {
    if (this.wind <= 0) return 0;
    const s = Math.min(1, this.wind);
    const curve = 1 - Math.pow(1 - s, 4);
    return (this.Amax * 0.55 + this.Amax * 0.45 * curve) * this.posFactor;
  }

  step(dt) {
    this.t += dt;
    // spring energy use (only while running)
    if (!this.hacked && !this.stopped) this.wind = Math.max(0, this.wind - dt / this.reserve);
    const tgt = this.hacked ? 0 : this.amplitudeTarget();
    // amplitude responds within a few seconds (Q ~ 200-300 for a real balance)
    const tau = tgt < this.A ? (this.wind <= 0 ? 6 : 3) : 1.2;
    this.A += (tgt - this.A) * (1 - Math.exp(-dt / tau));
    if (this.hacked) { this.A = 0; }

    const halfLift = this.lift / 2;
    const wasStopped = this.stopped;
    this.stopped = !this.continuous && this.A < halfLift * 1.02;
    if (wasStopped && !this.stopped) {
      // restart: give the balance a kick (like shaking a stopped watch)
      // keep beat parity aligned with the balance phase
      let k = Math.floor(this.phi / Math.PI);
      if ((k - this.beats) % 2 !== 0) k += 1;
      this.phi = k * Math.PI;
    }
    const f = this.f * (1 + this.rateErr / 86400);
    if (this.hacked) return;
    if (this.continuous) {
      // spring drive: glide wheel turns smoothly while there is power
      const run = this.wind > 0 ? 1 : 0;
      this.glideSpeed = (this.glideSpeed ?? 1) + (run - (this.glideSpeed ?? 1)) * (1 - Math.exp(-dt / 0.5));
      this.contTeeth = (this.contTeeth ?? 0) + f * dt * this.glideSpeed;
      this.stopped = this.glideSpeed < 0.01;
      return;
    }
    if (this.stopped) {
      // free decaying oscillation without beats: freeze beat counter
      this.phi += TAU * f * dt;
      return;
    }
    const prevK = Math.floor(this.phi / Math.PI);
    this.phi += TAU * f * dt;
    const k = Math.floor(this.phi / Math.PI);
    if (k !== prevK) {
      const n = k - prevK;
      this.beats += n;
      if (this.onBeat && n < 4) this.onBeat(n);
    }
  }

  // Escapement state for drawing.
  state() {
    const theta = this.A * Math.cos(this.phi);
    const k = Math.floor(this.phi / Math.PI);
    const L = this.lift;
    // progress through the lift for the current vibration (0 before, 1 after)
    let q = (k % 2 === 0) ? (L / 2 - theta) / L : (theta + L / 2) / L;
    if (this.stopped) q = Math.min(q, 0.2);
    // escape-wheel motion within one beat: recoil on unlocking, impulse, then drop
    let P;
    if (q <= 0) P = 0;
    else if (q < 0.22) P = -0.06 * Math.sin(Math.PI * q / 0.22);
    else if (q < 1) { const u = (q - 0.22) / 0.78; P = 0.82 * (u * u * (3 - 2 * u)); }
    else P = 0.82 + 0.18 * Math.min(1, (q - 1) / 0.05);
    if (this.stopped) P = 0;
    // escape-wheel progress in teeth. Lever: half a tooth per beat. Detent: a whole tooth on
    // every second beat (the "dead" beat only flexes the passing spring).
    let teeth;
    if (this.continuous) teeth = this.contTeeth ?? 0;
    else if (this.beatsPerStep === 2) {
      teeth = (this.beats % 2 === 0) ? this.beats / 2 + P : (this.beats + 1) / 2;
    } else teeth = (this.beats + P) / 2;
    return { theta, A: this.A, k, q, P, teeth, beats: this.beats, stopped: this.stopped, phi: this.phi, wind: this.wind, hacked: this.hacked, active: this.beats % 2 === 0 };
  }
}
