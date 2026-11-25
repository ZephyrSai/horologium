// 11½‴ automatic, 2824 type: indirect centre seconds, 28,800 vph, bidirectional winding.
// Train (hobbyist count of a 2824-2): barrel 101 → second wheel 77/17 → third 90/13 →
// fourth (centre seconds) 108/9 → escape 20/9.  60 rph × 12 × 20 × 2 = 28,800 vph.
export default {
  id: 'eta-2824',
  name: 'Calibre 2824-type',
  subtitle: '11½‴ automatic, centre seconds, 4 Hz',
  category: 'Modern calibres',
  era: '1971 →',
  blurb: 'The tractor engine of Swiss watchmaking: 25.6 mm, 25 jewels, 28,800 beats an hour and a rotor that winds in both directions. Centre seconds are driven "indirectly" so the minutes ride off-centre.',
  swatch: ['#c7ccd4', '#3a2a20'],
  story: [
    'Introduced in 1971 and cloned the world over, it is the reference automatic: robust, serviceable, and fast enough at 4 Hz for a smooth-looking seconds hand.',
    'The fourth wheel sits in the centre and carries the seconds hand directly. The minutes are taken off the third wheel and fed back to the centre through a cannon wheel — the "indirect" layout.',
  ],
  specs: { diameter: 25.6, height: 4.6, jewels: 25, vph: 28800, reserve: 38, lift: 51, amplitude: 300, escapementText: 'Swiss lever, 20 club teeth' },
  escapement: 'lever',
  look: {
    plate: { metal: 'rhodium', finish: 'perlage', finishScale: 1.3 },
    bridges: { metal: 'rhodium', finish: 'cotes', finishScale: 2.2, finishAngle: 0.9 },
    wheels: 'goldWheel', screws: 'blued', balance: 'glucydur', hairspring: 'nivarox',
    ratchet: { metal: 'steel', finish: 'snail', finishScale: 7.5, finishCentered: true },
    rotor: { metal: 'rhodium', finish: 'cotes', finishScale: 2.0, finishAngle: 1.57 },
  },
  plate: { R: 12.8, thick: 1.2 },
  train: [
    { id: 'barrel', name: 'Mainspring barrel', type: 'barrel', at: [-4.6, 5.6], wheel: { teeth: 101 }, z: 1.25, h: 1.1, springTurns: 10 },
    { id: 'second', name: 'Second (intermediate) wheel', from: 'barrel', at: [0.8, 5.9], wheel: { teeth: 77, spokes: 4 }, pinion: { leaves: 17 }, z: 0.15,
      desc: 'An off-centre intermediate wheel turning about once an hour (every 3,554 s). In a "direct" calibre this would be the centre wheel.' },
    { id: 'third', name: 'Third wheel', from: 'second', at: [4.7, 2.2], wheel: { teeth: 90 }, pinion: { leaves: 13 }, z: 0.55,
      desc: 'Turns once every 10 minutes. Its pinion also drives the cannon wheel that carries the minute hand back at the centre.' },
    { id: 'fourth', name: 'Fourth wheel (centre seconds)', from: 'third', at: [0, 0], rph: 60, wheel: { teeth: 108 }, pinion: { leaves: 9 }, z: 0.95,
      desc: 'Sits in the middle of the movement and turns once a minute: its long arbor runs through the hollow cannon pinion to the centre seconds hand.' },
    { id: 'escape', name: 'Escape wheel', from: 'fourth', at: [3.16, -2.65], pinion: { leaves: 9 }, escapement: { type: 'lever', teeth: 20, r: 1.9, dir: -115, z: 1.35, balanceZ: 1.75, cockDir: 210 } },
  ],
  balance: { r: 4.8, arms: 3, rimH: 0.36, coils: 13, hsR: 2.9 },
  bridges: [
    { id: 'barrelBridge', name: 'Barrel bridge', covers: ['barrel', 'second'], padR: 2.4, extra: [[-9.5, 3.5, 2.0]], z: 2.5, thick: 0.85, screwCount: 3 },
    { id: 'trainBridge', name: 'Train wheel bridge', covers: ['third', 'fourth', 'escape'], padR: 1.8, extra: [[8.8, 3.8, 1.8]], z: 2.25, thick: 0.85, screwCount: 2, waist: 0.15 },
    { id: 'palletCock', name: 'Pallet cock', covers: ['pallet'], padR: 0.85, extra: [[4.6, -8.4, 1.3]], z: 2.25, thick: 0.6, screwCount: 1 },
  ],
  rotor: { z: 4.6, R: 12.2, rimW: 2.4, rimMat: 'tungsten', text: 'AUTOMATIC · 25 JEWELS' },
  complications: [{ type: 'reversers', at: [[-1.2, -4.4], [-3.4, -2.5]], z: 3.6 }],
  motionWorks: { cannon: 12, minute: 36, minutePinion: 10, hour: 40, dir: 230 },
  keyless: { crownAngle: 180, ratchet: 50, crownWheel: 30, z: 3.42, ratchetR: 4.0, crownR: 2.2 },
  dial: { color: '#14181f', ink: '#e8e3d6', numerals: 'baton', indexColor: '#e8e3d6', hands: 'dauphine', handMat: 'whiteGold', centerSeconds: 'fourth', secondsMat: 'gold', handW: 0.55, brand: 'HOROLOGIUM', subtitle: 'AUTOMATIC', sunray: true, rough: 0.25, glow: 0.05, story: 'A sunray dial and a centre seconds hand that steps eight times a second — so fast it looks like a sweep.' },
  regulation: { DU: 2, DD: 3, CU: -3, CD: -6, CL: -2, CR: 0, beatError: 0.3 },
};
