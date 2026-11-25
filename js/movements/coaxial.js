// Co-axial automatic (George Daniels' escapement, industrialised 1999). 25,200 vph.
// Train: barrel 90 → second 75/15 → third 80/10 → fourth (centre seconds) 84/10 → escape 15/6.
// 1/6 → 1 → 7.5 → 60 → 840 rph × 15 × 2 = 25,200 vph.
export default {
  id: 'coaxial',
  name: 'Co-Axial Calibre',
  subtitle: 'Free-sprung automatic with Daniels co-axial escapement',
  category: 'Modern calibres',
  era: '1999 →',
  blurb: 'George Daniels spent decades on an escapement that needs no oil on its impulse faces. Two-tier escape wheel, three pallet stones, a free-sprung balance under a full bridge, and an iridescent silicon hairspring.',
  swatch: ['#e9a58c', '#2a1a14'],
  story: [
    'In a Swiss lever, the escape wheel slides across the pallet stones — that friction needs oil, and oil ages. Daniels\' co-axial escapement gives impulse by pushing radially, so the surfaces barely slide.',
    'This calibre also drops the regulator index: the balance is free-sprung and adjusted by small gold weights on its rim, under a bridge held at both ends.',
  ],
  specs: { diameter: 29, height: 5.5, jewels: 39, vph: 25200, reserve: 60, lift: 38, amplitude: 290, escapementText: 'Co-axial, 3 pallet stones', extra: { Hairspring: 'Silicon, free-sprung' } },
  escapement: 'coaxial',
  look: {
    plate: { metal: 'rhodium', finish: 'perlage', finishScale: 1.2 },
    bridges: { metal: 'rhodium', finish: 'cotes', finishScale: 1.9, finishAngle: 2.2 },
    cock: { metal: 'roseGold', finish: 'cotes', finishScale: 1.9, finishAngle: 2.2 },
    wheels: 'roseGold', screws: 'steel', balance: 'glucydur', hairspring: 'silicon',
    ratchet: { metal: 'steel', finish: 'snail', finishScale: 9, finishCentered: true },
    rotor: { metal: 'roseGold', finish: 'cotes', finishScale: 1.9, finishAngle: 0.3 },
  },
  plate: { R: 14.5, thick: 1.2 },
  train: [
    { id: 'barrel', name: 'Mainspring barrel', type: 'barrel', at: [-4.0, 6.0], wheel: { teeth: 90 }, z: 1.25, h: 1.2, springTurns: 13 },
    { id: 'second', name: 'Second wheel', from: 'barrel', at: [2.6, 7.6], wheel: { teeth: 75, spokes: 5 }, pinion: { leaves: 15 }, z: 0.15 },
    { id: 'third', name: 'Third wheel', from: 'second', at: [4.2, 2.5], wheel: { teeth: 80 }, pinion: { leaves: 10 }, z: 0.55 },
    { id: 'fourth', name: 'Fourth wheel (centre seconds)', from: 'third', at: [0, 0], rph: 60, wheel: { teeth: 84 }, pinion: { leaves: 10 }, z: 0.95 },
    { id: 'escape', name: 'Co-axial escape wheel', from: 'fourth', at: [3.0, -3.0], pinion: { leaves: 6 }, escapement: { type: 'coaxial', teeth: 15, r: 2.1, dir: -120, z: 1.55, balanceZ: 2.0, cockDir: 180, fullBridge: true, regulator: false, shockMat: 'steel' } },
  ],
  balance: { r: 4.9, arms: 2, rimH: 0.4, weights: 4, weightMat: 'gold', coils: 11, hsR: 3.0 },
  bridges: [
    { id: 'barrelBridge', name: 'Barrel bridge', covers: ['barrel', 'second'], padR: 2.6, extra: [[-10.2, 3.6, 2.0]], z: 2.6, thick: 0.85, screwCount: 3 },
    { id: 'trainBridge', name: 'Train bridge', covers: ['third', 'fourth', 'escape'], padR: 1.9, extra: [[9.6, 2.8, 1.8]], z: 2.35, thick: 0.85, screwCount: 2, waist: 0.15 },
    { id: 'palletCock', name: 'Lever bridge', covers: ['pallet'], padR: 1.0, extra: [[6.4, -5.2, 1.3]], z: 2.35, thick: 0.6, screwCount: 1 },
  ],
  rotor: { z: 4.9, R: 13.9, rimW: 2.6, rimMat: 'roseGold', text: 'CO-AXIAL · CHRONOMETER' },
  complications: [{ type: 'reversers', at: [[-2.0, -3.8], [-4.4, -2.2]], z: 3.75, mat: 'steel' }],
  motionWorks: { cannon: 12, minute: 36, minutePinion: 10, hour: 40, dir: 230 },
  keyless: { crownAngle: 180, ratchet: 54, crownWheel: 32, z: 3.47, ratchetR: 4.6, crownR: 2.4 },
  dial: { color: '#e9e6df', ink: '#1a2a4a', numerals: 'baton', indexColor: '#1a2a4a', hands: 'leaf', handMat: 'blued', centerSeconds: 'fourth', secondsMat: 'blued', handW: 0.6, brand: 'HOROLOGIUM', subtitle: 'CO-AXIAL', guilloche: true },
  regulation: { DU: 1, DD: 2, CU: -1, CD: -3, CL: 0, CR: 1, beatError: 0.1 },
};
