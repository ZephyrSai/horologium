# Horologium

**Live:** https://zephyrsai.github.io/horologium/

An interactive atlas of mechanical watch movements. The landing page explains the five systems that every mechanical watch shares, with a live movement running behind it, and leads into an atlas of eleven calibres. Each movement opens on a **story page**. It starts as a tray of loose parts, and scrolling assembles it piece by piece. The mainspring winds, the balance starts at 1/10 speed and then runs in real time. Then the dial side turns over. After that the movement is yours in the **explorer**, where you can:

- rotate and zoom it
- explode the layers
- x-ray the bridges
- wind it or pull the crown to set the hands
- put it on a timegrapher in six positions

The ticks are synthesised in code, not recorded.

No build step. Three.js 0.160 loads from jsDelivr through the import map in `index.html`.

```bash
python3 -m http.server 8811
```

Then open <http://localhost:8811>. In the explorer, `space` pauses, hold `w` to wind, and `x` toggles x-ray.

## What is simulated

| Thing | How |
|---|---|
| Balance | An oscillator whose phase is integrated over time: θ = A·cos φ. Amplitude follows the mainspring state (`wind` 0..1). It also follows the position factor on the timegrapher. When A falls below half the lift angle the escapement can't unlock and the watch stops. |
| Escapement | Worked out from the phase. Each beat has three stages: unlock (with a little recoil), impulse and drop. The pallet fork angle is `clamp(−(r_roller/L_fork)·θ, ±F)`, so the impulse pin and fork stay geometrically in step. The detent escapement moves its wheel only on every other beat. The verge recoils. The glide wheel turns continuously. |
| Gear train | Each wheel's angular velocity comes from tooth ratios. Mesh phases are solved so teeth interleave. The hands come from the same escape-wheel count, so they tick with it. |
| Time | The watch starts at your local time. The rate error depends on the test position, on amplitude (isochronism) and on the regulator index. A tourbillon turns its vertical-position errors into a once-a-minute wave. The drift against the reference clock is real for the simulation. |
| Sound | Every beat schedules three modal-synthesis transients: unlock, impulse and drop. Their timing is computed from the balance phase, so at 1/10 or 1/50 speed they separate the way a timegrapher microphone shows them. Winding clicks once per ratchet tooth. |

## Adding a movement

Create `js/movements/<name>.js` that exports a spec, then add it to `js/movements/index.js`. The builder in `js/core/movement.js` does the rest:

- solves wheel radii and centre distances
- solves rates and mesh phases
- grows bridges around the pivots they carry
- places jewels and screws
- wires the escapement

```js
export default {
  id: 'my-calibre', name: 'My Calibre', subtitle: '…', category: 'Modern calibres', era: '2026',
  blurb: '…', story: ['paragraph', '…'],
  specs: { diameter: 30, height: 5, jewels: 25, vph: 28800, reserve: 48, lift: 50, amplitude: 300 },
  escapement: 'lever',                 // lever | coaxial | detent | verge | glide | tourbillon
  look: {                              // see js/core/materials.js for METALS and finishes
    plate:   { metal: 'rhodium', finish: 'perlage', finishScale: 1.3 },
    bridges: { metal: 'rhodium', finish: 'cotes', finishScale: 2.2, finishAngle: 0.9 },
    wheels: 'goldWheel', screws: 'blued', balance: 'glucydur', hairspring: 'silicon',
    chatons: false,                    // gold chatons with blued screws on bridge jewels
  },
  plate: { R: 15, thick: 1.2 },
  train: [
    // `at` = pivot position in mm (12 o'clock is +y, 3 o'clock on the dial is −x).
    // Give `from` + `at` and the module is derived from the centre distance, which also sizes the
    // driving wheel. Or give `from` + `dir` (degrees) and an explicit wheel `r`.
    { id: 'barrel', type: 'barrel', at: [-4, 6], wheel: { teeth: 90 }, z: 0.5, h: 2 },
    { id: 'center', from: 'barrel', at: [0, 0], rph: 1, wheel: { teeth: 80 }, pinion: { leaves: 12 }, z: 0.15 },
    { id: 'third',  from: 'center', at: [5, -2], wheel: { teeth: 75 }, pinion: { leaves: 10 }, z: 0.55 },
    { id: 'fourth', from: 'third',  at: [4, -6.5], wheel: { teeth: 80 }, pinion: { leaves: 10 }, z: 0.95 },
    { id: 'escape', from: 'fourth', at: [0.5, -4.5], pinion: { leaves: 8 },
      escapement: { type: 'lever', teeth: 20, r: 2, dir: 200, z: 1.4, balanceZ: 1.9, cockDir: 150 } },
  ],
  balance: { r: 5, arms: 3, screws: 0, weights: 4, coils: 13 },
  bridges: [                           // `covers` = pivots it carries ('pallet' and 'balance' exist too)
    { id: 'trainBridge', covers: ['center', 'third', 'fourth', 'escape'], padR: 1.8, z: 2.4, thick: 0.9 },
    // or an exact shape: sdf: (x, y) => signedDistance, or outline: [[x, y, filletR], …]
  ],
  motionWorks: { cannon: 12, minute: 36, minutePinion: 10, hour: 40, dir: 230 },
  keyless: { crownAngle: 180, ratchet: 54, crownWheel: 32, z: 3.5 },
  rotor: { z: 4.7, R: 14.4 },          // automatics
  dial: { numerals: 'roman', hands: 'breguet', subSeconds: 'fourth', apertures: [[0, -6, 6]] },
  complications: [{ type: 'moonphase' }, { type: 'powerReserve', at: [-8, 1] }],
  regulation: { DU: 2, DD: 3, CU: -3, CD: -6, CL: -2, CR: 0, beatError: 0.3 },
};
```

- **`rph`** fixes one wheel's absolute rate (revolutions per hour) and scales the rest from tooth ratios.
- **Check panel:** the explorer's "Going train" panel recomputes beats per hour as rev/h × teeth × 2 and marks it ✓ or ✗ against `specs.vph`.

**Complications available** (`js/core/complications.js`):

- `wanderingHour`
- `jumpHourRetro`
- `moonphase` (59 or 135 teeth)
- `powerReserve`
- `fusee`
- `reversers`
- `plaque`

**Escapements** (`js/core/escapements.js`):

- `lever`
- `coaxial`
- `detent`
- `verge`
- `glide`
- `tourbillon` (`flying: true` gives a flying tourbillon)

## Sources for the numbers

- **6498-1 going train:** measured; it gives 18,000 vph exactly. Source: watchmaking.io.
- **2824-2 going train:** from a hobbyist's tooth count; it gives 28,800 vph.
- **Other movements:** the trains are constructions that hit the stated beat rate. Their beat rates, jewel counts, reserves and lift angles are the published figures for that class of movement.
- **Displays:**
  - The wandering hour has 3 satellites × 4 numerals, a carrier turning once per 3 h and a 120° arc. This is the AP Star Wheel / Urwerk / Xeric layout.
  - The moon phase uses the 59-tooth or 135-tooth figures.
- **Names:** calibres marked "type" recreate a class of movement. They are not replicas of a brand's design.
