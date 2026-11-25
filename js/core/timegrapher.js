// Timegrapher: the acoustic watch-timing machine used at every service bench.
// It listens to each beat, compares it to a quartz reference and plots the deviation.
//   Rate (s/d): slope of the trace.  Amplitude: from lift angle and the time between the
//   unlock and drop sounds.  Beat error: time difference between tick and tock (ms).
// This one reads the simulation, where rate errors are modelled per position, by amplitude
// (isochronism) and — for tourbillons — modulated by the cage rotation.

const D2R = Math.PI / 180;

export const POSITIONS = {
  DU: { label: 'Dial up', vertical: false, amp: 1.0 },
  DD: { label: 'Dial down', vertical: false, amp: 0.985 },
  CU: { label: 'Crown up', vertical: true, amp: 0.86, ang: 0 },
  CD: { label: 'Crown down', vertical: true, amp: 0.86, ang: 180 },
  CL: { label: 'Crown left', vertical: true, amp: 0.87, ang: 90 },
  CR: { label: 'Crown right', vertical: true, amp: 0.87, ang: 270 },
};

export class Timegrapher {
  constructor(canvas, mov, sim) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.mov = mov; this.sim = sim;
    const reg = mov.spec.regulation || {};
    this.reg = {
      DU: 2, DD: 3, CU: -4, CD: -7, CL: -3, CR: -1,
      beatError: 0.4, iso: 0.04, jitter: 0.06, ...reg,
    };
    this.pos = 'DU';
    this.index = 0;        // regulator index offset, s/d
    this.dots = [];        // {x, y, tock}
    this.lastBeats = sim.beats;
    this.cum = 0;          // cumulative deviation (ms)
    this.realStart = sim.t; this.beatStart = sim.beats; this.phiStart = sim.phi; this.contStart = sim.contTeeth ?? 0;
    this.cageAngle = 0;
    this.applyPosition();
  }

  setPosition(p) { this.pos = p; this.applyPosition(); this.resetTrace(); }
  setIndex(v) { this.index = v; this.resetTrace(); }
  resetTrace() { this.dots = []; this.cum = 0; this.realStart = this.sim.t; this.beatStart = this.sim.beats; this.phiStart = this.sim.phi; this.contStart = this.sim.contTeeth ?? 0; }

  applyPosition() {
    const p = POSITIONS[this.pos];
    this.sim.posFactor = p.amp;
    this.sim.beatError = this.reg.beatError;
  }

  // instantaneous rate error (s/d) given current amplitude and (for tourbillons) cage angle
  rateNow() {
    const p = POSITIONS[this.pos];
    let r = this.reg[this.pos] + this.index;
    const A = this.sim.A / D2R;
    // isochronism: most watches gain or lose as amplitude falls
    r += (this.reg.iso ?? 0.04) * (280 - Math.min(280, A)) * (this.reg.isoSign ?? 1);
    if (this.mov.isTourbillon && p.vertical) {
      // vertical positional errors become a sinusoid over one cage turn, averaging to the mean
      const vm = (this.reg.CU + this.reg.CD + this.reg.CL + this.reg.CR) / 4;
      const amp = (Math.abs(this.reg.CD - this.reg.CU) + Math.abs(this.reg.CL - this.reg.CR)) / 2 + 2;
      r = vm + this.index + amp * Math.sin((this.mov.cageAngle ?? 0) + (p.ang ?? 0) * D2R) + (this.reg.iso ?? 0.04) * (280 - Math.min(280, A));
    }
    if (this.mov.spec.escapement === 'glide') r = this.reg.DU * 0.1 + this.index * 0.02;
    return r;
  }

  tick() {
    const s = this.sim;
    const rate = this.rateNow();
    s.rateErr = rate;
    const nb = s.beats - this.lastBeats;
    this.lastBeats = s.beats;
    if (nb > 0 && nb < 2000) {
      const period = 1 / (2 * s.f);                 // seconds per beat
      for (let i = 0; i < nb; i++) {
        this.cum += rate / 86400 * period * 1000;   // ms gained per beat
        const tock = (s.beats - nb + i) % 2 === 1;
        const be = (tock ? 0.5 : -0.5) * this.reg.beatError;
        const jit = (Math.random() - 0.5) * this.reg.jitter * 2;
        this.dots.push({ y: this.cum + be + jit, tock });
      }
      if (this.dots.length > 1400) this.dots.splice(0, this.dots.length - 1400);
    }
  }

  readout() {
    const s = this.sim;
    // the balance phase measures watch time continuously (no one-beat quantisation)
    const watchElapsed = s.continuous ? ((s.contTeeth ?? 0) - this.contStart) / s.f : (s.phi - this.phiStart) / (2 * Math.PI * s.f);
    const realElapsed = s.t - this.realStart;
    return {
      rate: this.rateNow(),
      amp: s.A / D2R,
      beatError: this.reg.beatError,
      bph: Math.round(s.f * 7200),
      lift: s.lift / D2R,
      beats: s.beats,
      drift: watchElapsed - realElapsed,
      elapsed: realElapsed,
      stopped: s.stopped,
    };
  }

  draw() {
    const { ctx, cv } = this;
    const W = cv.width, H = cv.height;
    ctx.fillStyle = '#05140d';
    ctx.fillRect(0, 0, W, H);
    // grid
    ctx.strokeStyle = 'rgba(80,255,160,0.08)'; ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(0, i * H / 8); ctx.lineTo(W, i * H / 8); ctx.stroke(); }
    for (let i = 1; i < 12; i++) { ctx.beginPath(); ctx.moveTo(i * W / 12, 0); ctx.lineTo(i * W / 12, H); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(80,255,160,0.2)'; ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    // window of ±window ms wrapping vertically like a paper chart
    const win = 6; // ms half-height
    const n = this.dots.length;
    const perPx = Math.max(1, Math.ceil(n / W));
    const start = Math.max(0, n - W * perPx);
    const base = n ? this.dots[start].y : 0;
    for (let i = start; i < n; i += 1) {
      const d = this.dots[i];
      let y = d.y - base;
      y = ((y + win) % (2 * win) + 2 * win) % (2 * win) - win;
      const x = ((i - start) / perPx);
      ctx.fillStyle = d.tock ? 'rgba(120,255,190,0.9)' : 'rgba(255,220,120,0.9)';
      ctx.fillRect(x, H / 2 - y / win * (H / 2) - 1, 1.6, 1.6);
    }
    ctx.fillStyle = 'rgba(120,255,190,0.5)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`±${win} ms`, 4, 12);
  }
}
