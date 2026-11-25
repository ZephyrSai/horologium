// English verge fusee pocket watch, c. 1780. Full-plate, fire-gilt, key-wound.
// Fusee great wheel 48 → centre 54/12 → third 48/6 → contrate 45/6 → crown-wheel pinion 5,
// crown wheel 13 teeth: 1 → 9 → 72 → 648 rph × 13 × 2 = 16,848 vph.
export default {
  id: 'verge-fusee',
  name: 'Verge Fusee',
  subtitle: 'English full-plate pocket watch, c. 1780',
  category: 'Historic',
  era: 'c. 1675 – 1830',
  blurb: 'The oldest escapement — a crown wheel and a two-flag verge — driven through a chain and a cone-shaped fusee that evens out the mainspring\'s pull. Fire-gilt plates, a pierced and engraved balance cock, a blued steel hairspring.',
  swatch: ['#e0b860', '#2a1a08'],
  story: [
    'Before the lever escapement, every watch used the verge: the escapement of medieval tower clocks shrunk into a pocket. It never lets the balance swing free, so its rate depends on the driving force — and a mainspring pulls harder when wound than when run down.',
    'The fix was the fusee, a stepped cone linked to the barrel by a tiny chain of over 500 links. When the spring is strong the chain pulls on the cone\'s narrow end; when it is weak, on the wide end. The torque reaching the train hardly changes.',
    'The crown wheel\'s arbor lies flat, at right angles to the rest of the train, driven by a contrate wheel whose teeth stand up like a crown.',
  ],
  specs: { diameter: 38, height: 9, jewels: 1, vph: 16848, reserve: 30, lift: 30, amplitude: 52, escapementText: 'Verge, 13-tooth crown wheel', extra: { Winding: 'Key, through the dial', Power: 'Fusee and chain' } },
  escapement: 'verge',
  hacking: false,
  look: {
    plate: { metal: 'gilt', finish: 'frosted', finishScale: 2 },
    bridges: { metal: 'gilt', finish: 'frosted', finishScale: 2 },
    wheels: 'brass', pinions: 'steel', screws: 'blued', balance: 'gilt', hairspring: 'blued', jewels: 'none',
  },
  plate: { R: 19, thick: 1.3 },
  train: [
    { id: 'fusee', name: 'Fusee great wheel', at: [-6.0, 7.0], wheel: { teeth: 48, spokes: 4 }, z: 0.3, top: 4.2,
      desc: 'The great wheel is screwed to the bottom of the fusee cone and drives the centre pinion.' },
    { id: 'center', name: 'Centre wheel', from: 'fusee', at: [0, 0], rph: 1, wheel: { teeth: 54, spokes: 4 }, pinion: { leaves: 12 }, z: 0.8, top: 4.2 },
    { id: 'third', name: 'Third wheel', from: 'center', at: [6.0, -3.5], wheel: { teeth: 48, spokes: 4 }, pinion: { leaves: 6 }, z: 1.3, top: 4.2 },
    { id: 'contrate', name: 'Contrate wheel', from: 'third', at: [1.5, -8.5], wheel: { teeth: 45, r: 4.5, spokes: 4 }, pinion: { leaves: 6 }, z: 1.75, top: 4.2,
      desc: 'Its teeth stand up at right angles, like a crown, to drive the horizontal crown-wheel pinion.' },
    { id: 'crown', name: 'Crown wheel', from: 'contrate', dir: 160, pinion: { leaves: 5 }, noArbor: true, escapement: { type: 'verge', teeth: 13, r: 2.0, dir: 160, arborZ: 2.4, arborLen: 5.2 } },
  ],
  balance: { r: 6.0 },
  bridges: [
    { id: 'backPlate', name: 'Top (pillar) plate', sdf: (x, y) => Math.hypot(x, y) - 18.4, covers: ['fusee', 'center', 'third', 'contrate'], z: 4.6, thick: 1.0, screwCount: 4, engraving: 'Horologium · London', engravingAt: [6.5, -10.5],
      desc: 'Full-plate construction: a second solid plate held on four turned pillars. Everything lives between the plates except the balance, which sits on top under its cock.' },
  ],
  complications: [{ type: 'fusee', fusee: 'fusee', barrelAt: [6.8, 8.2], barrelR: 4.2, rMin: 1.6, rMax: 4.2, turns: 6, z: 0.6, h: 3.4 }],
  motionWorks: { cannon: 12, minute: 36, minutePinion: 10, hour: 40, dir: 250, module: 0.13 },
  dial: { color: '#f8f5ee', ink: '#151515', numerals: 'roman', hands: 'leaf', handMat: 'gold', handW: 0.9, gap: 1.6, numeralSize: 2.8, clearcoat: 1, rough: 0.08, story: 'A white vitreous enamel dial, fired in a kiln, with gold "beetle and poker"-era hands simplified to leaves. No seconds hand — verge watches were lucky to keep to a minute a day.' },
  regulation: { DU: 25, DD: 35, CU: -40, CD: -60, CL: -30, CR: -20, beatError: 2.5, iso: 0.6, jitter: 0.6 },
};
