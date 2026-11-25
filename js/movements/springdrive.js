// Spring Drive-type calibre: mainspring power, quartz regulation, no escapement.
// Train: barrel 90 → second 75/15 → third 80/10 → fourth (centre seconds) 80/10 → fifth 72/8
// → sixth 48/6 → glide wheel pinion 12.   60 → 600 → 7,200 → 28,800 rph = 8 rev/s.
export default {
  id: 'spring-drive',
  name: 'Tri-synchro Glide',
  subtitle: 'Spring Drive-type: mainspring power, quartz regulation',
  category: 'Modern calibres',
  era: '1999 →',
  blurb: 'Seiko engineer Yoshikazu Akahane spent 28 years on this: a mechanical watch with no escapement. The train spins a magnetised glide wheel eight times a second; quartz decides how hard to brake it. The seconds hand glides in silence.',
  swatch: ['#9fc8ff', '#101824'],
  story: [
    'Everything up to the last wheel is a conventional mainspring and gear train. The difference is at the end: instead of a balance and escapement, a rotor with magnets spins between two coils.',
    'The spinning magnets generate a little electricity — enough to run a 32,768 Hz quartz crystal and an IC. Every turn, the IC compares the rotor to the quartz and switches on an electromagnetic brake for just long enough. Mechanical, electrical and electromagnetic energy, synchronised: the "tri-synchro" regulator.',
    'There is nothing to hear and nothing to put on a timegrapher — so this page shows the drift against the reference instead: about a second a day.',
  ],
  specs: { diameter: 30, height: 5.1, jewels: 30, vph: 0, freqText: 'glide wheel 8 rev/s · quartz 32,768 Hz', reserve: 72, lift: 0, amplitude: 0, escapementText: 'None — glide wheel with electromagnetic brake' },
  escapement: 'glide',
  look: {
    plate: { metal: 'rhodium', finish: 'perlage', finishScale: 1.2 },
    bridges: { metal: 'rhodium', finish: 'brushed', finishScale: 3, finishAngle: 0.4 },
    wheels: 'goldWheel', screws: 'steel',
    ratchet: { metal: 'steel', finish: 'snail', finishScale: 9, finishCentered: true },
    rotor: { metal: 'rhodium', finish: 'sunburst', finishScale: 28, finishCentered: true },
  },
  plate: { R: 15, thick: 1.2 },
  train: [
    { id: 'barrel', name: 'Mainspring barrel', type: 'barrel', at: [-4.5, 6.2], wheel: { teeth: 90 }, z: 1.25, h: 1.2, springTurns: 14 },
    { id: 'second', name: 'Second wheel', from: 'barrel', at: [1.0, 6.6], wheel: { teeth: 75 }, pinion: { leaves: 15 }, z: 0.15 },
    { id: 'third', name: 'Third wheel', from: 'second', at: [4.6, 2.0], wheel: { teeth: 80 }, pinion: { leaves: 10 }, z: 0.55 },
    { id: 'fourth', name: 'Fourth wheel (centre seconds)', from: 'third', at: [0, 0], rph: 60, wheel: { teeth: 80 }, pinion: { leaves: 10 }, z: 0.95 },
    { id: 'fifth', name: 'Fifth wheel', from: 'fourth', at: [4.6, -3.2], wheel: { teeth: 72 }, pinion: { leaves: 8 }, z: 1.3, desc: 'Ten turns a minute. Spring Drive trains need extra stages to spin the glide wheel up to 8 rev/s.' },
    { id: 'sixth', name: 'Sixth wheel', from: 'fifth', at: [3.0, -7.6], wheel: { teeth: 48 }, pinion: { leaves: 6 }, z: 1.65, desc: 'Two turns a second.' },
    { id: 'glide', name: 'Glide wheel', from: 'sixth', at: [-1.8, -8.6], pinion: { leaves: 12 }, escapement: { type: 'glide', teeth: 1, r: 2.1, z: 2.0, coilAngle: 110, quartzAt: [-8.0, -4.5] } },
  ],
  bridges: [
    { id: 'barrelBridge', name: 'Barrel bridge', covers: ['barrel', 'second'], padR: 2.6, extra: [[-10.5, 3.5, 2.0]], z: 2.6, thick: 0.85, screwCount: 3 },
    { id: 'trainBridge', name: 'Train bridge', covers: ['third', 'fourth', 'fifth', 'sixth'], padR: 1.8, extra: [[10.5, -1.5, 1.8]], z: 2.35, thick: 0.85, screwCount: 3, waist: 0.15 },
    { id: 'glideBridge', name: 'Glide-wheel bridge', covers: ['glide'], padR: 0.75, extra: [[-6.4, -11.6, 1.3]], z: 3.0, thick: 0.6, screwCount: 1, waist: 0.5 },
  ],
  rotor: { z: 4.7, R: 14.4, rimW: 2.5, rimMat: 'gold', text: 'SPRING DRIVE · 30 JEWELS' },
  motionWorks: { cannon: 12, minute: 36, minutePinion: 10, hour: 40, dir: 230 },
  keyless: { crownAngle: 180, ratchet: 54, crownWheel: 32, z: 3.47, ratchetR: 4.6, crownR: 2.4 },
  dial: { color: '#dfe8f2', ink: '#1b2638', numerals: 'baton', indexColor: '#33415a', hands: 'dauphine', handMat: 'steel', centerSeconds: 'fourth', secondsMat: 'blued', handW: 0.6, brand: 'HOROLOGIUM', subtitle: 'SPRING DRIVE', sunray: true, rough: 0.2, story: 'Watch the seconds hand: no steps at all. A mechanical watch at 4 Hz moves its seconds hand in eight little jumps a second; this one glides.' },
  regulation: { DU: 0.6, DD: 0.6, CU: 0.6, CD: 0.6, CL: 0.6, CR: 0.6, beatError: 0, iso: 0, jitter: 0 },
};
