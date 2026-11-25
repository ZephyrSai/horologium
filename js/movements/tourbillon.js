// One-minute tourbillon, Breguet's 1801 invention. 21,600 vph.
// Train: barrel 80 → centre 80/12 → third 75/10 → cage pinion 10 (60 rph).
// In the cage the escape pinion (8) rolls on a fixed 96-tooth wheel: 60 × 96/8 = 720 rph × 15 × 2.
const make = (flying) => ({
  id: flying ? 'flying-tourbillon' : 'tourbillon',
  name: flying ? 'Flying Tourbillon' : 'One-Minute Tourbillon',
  subtitle: flying ? 'Cantilevered cage, no upper bridge (Helwig, 1920)' : 'Breguet\'s whirlwind, with a lyre-shaped bridge',
  category: 'Haute horlogerie',
  era: flying ? '1920 →' : '1801 →',
  blurb: flying
    ? 'Alfred Helwig\'s Glashütte refinement: the cage is held only from below, so nothing blocks the view of the balance as the whole escapement turns once a minute.'
    : 'The escape wheel, lever and balance ride in a steel cage that turns once a minute, its escape pinion rolling around a fixed wheel. Watch the cage itself act as the seconds hand.',
  swatch: flying ? ['#f0d79a', '#2a1a10'] : ['#cfd6e0', '#1a1e28'],
  story: [
    'A pocket watch spends its day upright in a waistcoat pocket. In that position any imbalance in the balance pulls it fast or slow. Abraham-Louis Breguet\'s answer (patent 1801) was to rotate the whole escapement, so those errors cancel out over each turn.',
    'On the timegrapher, pick a vertical position: instead of a steady error you will see the rate wave up and down once a minute around a much smaller average — the tourbillon at work.',
  ],
  specs: { diameter: 32, height: 6.0, jewels: 21, vph: 21600, reserve: 70, lift: 52, amplitude: 280, escapementText: flying ? 'Swiss lever in a flying one-minute cage' : 'Swiss lever in a one-minute cage', extra: { 'Cage rotation': '60 s', 'Fixed wheel': '96 teeth' } },
  escapement: 'tourbillon',
  look: flying ? {
    plate: { metal: 'gold', finish: 'frosted', finishScale: 2 },
    bridges: { metal: 'gold', finish: 'cotes', finishScale: 2.8, finishAngle: 0.6 },
    wheels: 'gold', screws: 'blued', balance: 'glucydur', hairspring: 'blued',
    ratchet: { metal: 'gold', finish: 'snail', finishScale: 11, finishCentered: true },
  } : {
    plate: { metal: 'rhodiumDark', finish: 'perlage', finishScale: 1.4 },
    bridges: { metal: 'rhodium', finish: 'cotes', finishScale: 2.8, finishAngle: 0.6 },
    wheels: 'goldWheel', screws: 'blued', balance: 'glucydur', hairspring: 'nivarox',
    ratchet: { metal: 'steel', finish: 'snail', finishScale: 11, finishCentered: true },
  },
  plate: { R: 16, thick: 1.3, holes: [[0, -6.4, 5.0]] },
  train: [
    { id: 'barrel', name: 'Mainspring barrel', type: 'barrel', at: [3.5, 6.5], wheel: { teeth: 80 }, z: 0.6, h: 2.0, springTurns: 15 },
    { id: 'center', name: 'Centre wheel', from: 'barrel', at: [0, 0], rph: 1, wheel: { teeth: 80, spokes: 5 }, pinion: { leaves: 12 }, z: 0.45 },
    { id: 'third', name: 'Third wheel', from: 'center', at: [-4.6, -3.0], wheel: { teeth: 75 }, pinion: { leaves: 10 }, z: 0.15,
      desc: 'Drives the pinion under the tourbillon cage, turning it once a minute.' },
    { id: 'cage', name: 'Tourbillon cage', from: 'third', at: [0, -6.4], pinion: { leaves: 10, z: 0.0 }, top: 1.0,
      escapement: { type: 'tourbillon', teeth: 15, r: 1.25, fixedTeeth: 96, escPinion: 8, escAngle: 205, z: 1.6, balanceZ: 2.45, cageTop: 4.3, flying, cageMat: flying ? 'gold' : 'steel', bridgeAngle: 20, fixedMat: flying ? 'gold' : 'steel' } },
  ],
  balance: { r: 4.3, arms: 3, rimH: 0.35, screws: flying ? 12 : 0, coils: 11, hsR: 2.6 },
  bridges: [
    { id: 'barrelBridge', name: 'Barrel bridge', covers: ['barrel'], padR: 3.6, extra: [[11.5, 6.5, 2.2]], z: 2.7, thick: 0.9, screwCount: 3, engraving: flying ? 'Flying tourbillon' : 'Tourbillon' },
    { id: 'trainBridge', name: 'Train bridge', covers: ['center', 'third'], padR: 2.2, extra: [[-11.5, 3.5, 2.2]], z: 2.4, thick: 0.9, screwCount: 2, waist: 0.2 },
  ],
  motionWorks: { cannon: 12, minute: 36, minutePinion: 10, hour: 40, dir: 120 },
  keyless: { crownAngle: 180, ratchet: 60, crownWheel: 34, z: 3.62, ratchetR: 5.0, crownR: 2.6, crownMat: flying ? 'gold' : 'steel' },
  dial: {
    color: flying ? '#1b1b22' : '#efece4', ink: flying ? '#f0d79a' : '#1d2333', numerals: 'roman', hands: 'breguet', handMat: flying ? 'gold' : 'blued', handW: 0.75,
    brand: 'HOROLOGIUM', subtitle: flying ? 'FLYING TOURBILLON' : 'TOURBILLON', apertures: [[0, -6.4, 4.9]], numeralSize: 2.2, guilloche: !flying,
    story: 'An aperture at six o\'clock shows the cage turning. There is no seconds hand: the cage is the seconds hand.',
  },
  regulation: { DU: 1, DD: 2, CU: -6, CD: -10, CL: -4, CR: 2, beatError: 0.2 },
});

export const tourbillon = make(false);
export const flyingTourbillon = make(true);
