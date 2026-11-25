// Pocket chronometer with spring-detent escapement (Arnold / Earnshaw, c. 1780s). 14,400 vph.
// Train: barrel 96 → centre 80/12 → third 75/10 → fourth 80/10 → escape 15/10.
// 1 → 8 → 60 → 480 rph; the wheel moves one tooth per oscillation: 480 × 15 = 7,200 osc/h = 14,400 vph.
export default {
  id: 'detent-chronometer',
  name: 'Pocket Chronometer',
  subtitle: 'Spring-detent escapement, half-second beat',
  category: 'Historic',
  era: 'c. 1785 – 1950',
  blurb: 'The escapement that navigated the oceans. The escape wheel is held by a jewel on a hair-thin steel spring and kicks the balance directly, once per oscillation. Precise, oil-free on the impulse — and famously not self-starting.',
  swatch: ['#f0d79a', '#1c2430'],
  story: [
    'John Arnold and Thomas Earnshaw turned the marine chronometer into something a ship could afford, and the spring detent became the standard for precision timekeeping for 150 years.',
    'Listen to it: a loud tick every half second, then silence. On the dead beat the balance just brushes a gold passing spring aside. That single-sided impulse is very efficient but means a jolt at the wrong moment can stop the watch — which is why it lived in gimbals at sea and why wristwatches use the lever.',
  ],
  specs: { diameter: 42, height: 7.5, jewels: 19, vph: 14400, reserve: 36, lift: 40, amplitude: 280, escapementText: 'Earnshaw spring detent, 15 teeth', extra: { Beat: '2 per second (half-seconds)' } },
  escapement: 'detent',
  hacking: false,
  look: {
    plate: { metal: 'gilt', finish: 'frosted', finishScale: 2 },
    bridges: { metal: 'gilt', finish: 'frosted', finishScale: 2 },
    cock: { metal: 'gilt', finish: 'engraving', finishScale: 7 },
    wheels: 'brass', screws: 'blued', balance: 'glucydur', hairspring: 'blued',
    ratchet: { metal: 'steel', finish: 'snail', finishScale: 12, finishCentered: true },
  },
  plate: { R: 21, thick: 1.5 },
  train: [
    { id: 'barrel', name: 'Mainspring barrel', type: 'barrel', at: [-4.5, 8.2], wheel: { teeth: 96 }, z: 0.6, h: 2.3, springTurns: 12 },
    { id: 'center', name: 'Centre wheel', from: 'barrel', at: [0, 0], rph: 1, wheel: { teeth: 80, spokes: 4 }, pinion: { leaves: 12 }, z: 0.15 },
    { id: 'third', name: 'Third wheel', from: 'center', at: [7.2, -2.0], wheel: { teeth: 75, spokes: 4 }, pinion: { leaves: 10 }, z: 0.6 },
    { id: 'fourth', name: 'Fourth (seconds) wheel', from: 'third', at: [4.8, -8.4], wheel: { teeth: 80, spokes: 4 }, pinion: { leaves: 10 }, z: 1.05, desc: 'Turns once a minute; its arbor carries the seconds hand, which jumps in half-seconds.' },
    { id: 'escape', name: 'Escape wheel', from: 'fourth', at: [-0.6, -10.0], pinion: { leaves: 10 }, escapement: { type: 'detent', teeth: 15, r: 3.4, dir: 195, z: 1.55, balanceZ: 2.3, cockDir: 120, lockAngle: 55, engraved: true } },
  ],
  balance: { r: 7.4, arms: 2, rimH: 0.38, screws: 18, cut: true, coils: 9, hsR: 4.2, overcoil: true },
  bridges: [
    { id: 'barrelBridge', name: 'Barrel bridge', covers: ['barrel'], padR: 3.8, extra: [[-14.5, 7.5, 2.4]], z: 3.0, thick: 1.0, screwCount: 3, engraving: 'Pocket chronometer' },
    { id: 'trainBridge', name: 'Train bridge', covers: ['center', 'third', 'fourth', 'escape'], padR: 2.2, extra: [[13.5, 2.0, 2.4]], z: 2.7, thick: 1.0, screwCount: 3, waist: 0.15 },
  ],
  motionWorks: { cannon: 12, minute: 36, minutePinion: 10, hour: 40, dir: 160, module: 0.13 },
  keyless: { crownAngle: 90, ratchet: 64, crownWheel: 36, z: 4.02, ratchetR: 6.2, crownR: 3.2, crownMat: 'gold' },
  dial: { color: '#f7f4ec', ink: '#141414', numerals: 'roman', hands: 'breguet', handMat: 'blued', subSeconds: 'fourth', subR: 4.2, handW: 0.9, brand: 'HOROLOGIUM', subtitle: 'CHRONOMETER', numeralSize: 2.8, clearcoat: 1, rough: 0.08 },
  regulation: { DU: 0.5, DD: 1, CU: -2, CD: -3, CL: -1, CR: 0, beatError: 0, iso: 0.01, jitter: 0.03 },
};
