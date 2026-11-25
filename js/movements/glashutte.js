// Glashütte-school hand-wound calibre: untreated German-silver three-quarter plate, screwed gold
// chatons, hand-engraved balance cock, screw balance with swan-neck fine adjustment.
// Train: barrel 96 → centre 80/12 → third 75/10 → fourth 72/10 → escape 15/6.
// 1 → 8 → 60 → 720 rph × 15 × 2 = 21,600 vph.
const B = [-6, -7];        // balance
const P = [-1.89, -5.5];   // pallet (derived from the escapement; used for the cut-out)
const R = 15.3;
const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;

export default {
  id: 'glashutte-34',
  name: 'Three-Quarter Plate',
  subtitle: 'Glashütte-school hand-wound calibre',
  category: 'Haute horlogerie',
  era: '1864 → today',
  blurb: 'A single German-silver plate covers three-quarters of the movement for rigidity. Gold chatons held by blued screws, a hand-engraved balance cock, a screw balance and a swan-neck regulator: Saxon watchmaking in one view.',
  swatch: ['#e8d8b2', '#5a3a1c'],
  story: [
    'Ferdinand Adolph Lange introduced the three-quarter plate in Glashütte in 1864: one rigid plate instead of several bridges, so the train stays perfectly aligned. It is harder to assemble — every wheel must be threaded into place at once.',
    'German silver (a copper-nickel-zinc alloy) is left untreated; it slowly develops a warm golden patina. Each balance cock is engraved by hand, so no two movements are the same.',
  ],
  specs: { diameter: 30.6, height: 5.9, jewels: 31, vph: 21600, reserve: 72, lift: 52, amplitude: 300, escapementText: 'Swiss lever, 15 teeth', extra: { 'Gold chatons': '6, with blued screws' } },
  escapement: 'lever',
  look: {
    plate: { metal: 'germanSilver', finish: 'perlage', finishScale: 1.4 },
    bridges: { metal: 'germanSilver', finish: 'cotes', finishScale: 3.2, finishAngle: 0.0 },
    cock: { metal: 'germanSilver', finish: 'engraving', finishScale: 7 },
    wheels: 'gold', screws: 'blued', balance: 'glucydur', hairspring: 'nivarox',
    ratchet: { metal: 'steel', finish: 'snail', finishScale: 11, finishCentered: true },
    chatons: true,
  },
  plate: { R, thick: 1.3 },
  train: [
    { id: 'barrel', name: 'Mainspring barrel', type: 'barrel', at: [-3.5, 5.7], wheel: { teeth: 96 }, z: 0.6, h: 2.0, springTurns: 15 },
    { id: 'center', name: 'Centre wheel', from: 'barrel', at: [0, 0], rph: 1, wheel: { teeth: 80, spokes: 4, curve: 0.25 }, pinion: { leaves: 12 }, z: 0.15 },
    { id: 'third', name: 'Third wheel', from: 'center', at: [5.6, -2.2], wheel: { teeth: 75, curve: 0.25 }, pinion: { leaves: 10 }, z: 0.55 },
    { id: 'fourth', name: 'Fourth (seconds) wheel', from: 'third', at: [4.5, -6.5], wheel: { teeth: 72, curve: 0.25 }, pinion: { leaves: 10 }, z: 0.95,
      desc: 'Once a minute. Its arbor carries the small seconds hand.' },
    { id: 'escape', name: 'Escape wheel', from: 'fourth', at: [0.93, -4.48], pinion: { leaves: 6 }, escapement: { type: 'lever', teeth: 15, r: 2.6, dir: 200, z: 1.4, balanceZ: 1.95, cockDir: 150, swanNeck: true, engraved: true, regAngle: 0.75 } },
  ],
  balance: { r: 5.5, arms: 2, rimH: 0.42, screws: 16, coils: 13, hsR: 3.4, overcoil: true },
  bridges: [
    {
      id: 'plate34', name: 'Three-quarter plate', covers: ['barrel', 'center', 'third', 'fourth', 'escape'],
      sdf: (x, y) => Math.max(Math.hypot(x, y) - (R - 0.35), -sdCircle(x, y, B[0], B[1], 6.4), -sdCircle(x, y, P[0], P[1], 2.2)),
      z: 2.5, thick: 1.25, screwCount: 4, engraving: 'Adjusted · five positions',
      desc: 'One plate carries the upper pivots of the barrel and the whole going train. Its rigidity keeps every wheel perfectly upright; its weakness is that the watchmaker must align every pivot at once when closing it.',
    },
    { id: 'palletCock', name: 'Pallet cock', covers: ['pallet'], padR: 1.2, extra: [[-0.6, -9.2, 1.4]], z: 2.5, thick: 0.7, screwCount: 1, look: { metal: 'germanSilver', finish: 'cotes', finishScale: 3.2 } },
  ],
  motionWorks: { cannon: 12, minute: 36, minutePinion: 10, hour: 40, dir: 160 },
  keyless: { crownAngle: 180, ratchet: 60, crownWheel: 34, z: 3.77, ratchetR: 4.8, crownR: 2.6, crownMat: 'gold' },
  dial: {
    color: '#ece6d6', ink: '#2a2620', numerals: 'roman', hands: 'leaf', handMat: 'gold', subSeconds: 'fourth', subR: 3.4, handW: 0.75,
    brand: 'HOROLOGIUM', subtitle: 'GLASHÜTTE · SA', numeralSize: 2.2,
    story: 'A solid silver dial with gold leaf hands, small seconds over the fourth wheel, and a power-reserve fan at three o\'clock reading the 72-hour mainspring.',
    extra: (ctx, W, H, S, toC) => {
      const [cx, cy] = toC(-8.6, 1.2);
      ctx.strokeStyle = ctx.fillStyle = '#2a2620';
      ctx.lineWidth = 3;
      for (let i = 0; i <= 12; i++) {
        const a = (-60 + i * 10) * Math.PI / 180 - Math.PI / 2;
        const r0 = 2.2 * S, r1 = (i % 3 ? 2.6 : 2.9) * S;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
      }
      ctx.font = `500 ${0.6 * S}px Inter, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText('AB', cx - 1.7 * S, cy + 0.2 * S); ctx.fillText('AUF', cx + 1.7 * S, cy + 0.2 * S);
    },
  },
  complications: [{ type: 'powerReserve', at: [-8.6, 1.2], len: 2.7, sweep: 120, handMat: 'blued' }],
  regulation: { DU: 1, DD: 2, CU: -2, CD: -4, CL: -1, CR: 0, beatError: 0.2 },
};
