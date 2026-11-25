// Escapements and oscillators. Each builder receives the Movement, the escape arbor record and
// its escapement config, builds geometry, registers parts and returns { update(state,H,dt) }.
//
// Geometry conventions (local escapement frame): escape wheel centre at origin, +x points to the
// pallet pivot P and beyond it to the balance B ("straight-line" Swiss layout).
import * as THREE from 'three';
import * as G from './geometry.js';
import * as P from './parts.js';
import { metal, ruby, silicon, glow, quartzCrystal } from './materials.js';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ----------------------------------------------------------------------------- balance assembly
// Balance wheel + hairspring + rollers + cock + shock setting, centred at local (bx, by).
function buildBalance(mov, parent, cfg, { bx, by, zRoller, worldPos, palletDirLocal, frameRot, palPos, palR }) {
  const L = mov.look;
  const spec = mov.spec;
  const bal = spec.balance || {};
  const r = bal.r ?? 5;
  const zb = cfg.balanceZ ?? zRoller + 0.45;
  const g = new THREE.Group();
  g.position.set(bx, by, 0);
  parent.add(g);
  const spin = new THREE.Group();
  g.add(spin);
  const bm = mov.mat(bal.mat || L.balance);
  const wheel = P.balanceWheel({ r, arms: bal.arms ?? 3, screws: bal.screws ?? 0, weights: bal.weights ?? 0, mat: bm, screwMat: mov.mat(bal.screwMat || 'gold'), weightMat: mov.mat(bal.weightMat || 'gold'), cut: bal.cut, rimH: bal.rimH, staffBase: zRoller - zb - 0.4, staffLen: 3.2 });
  wheel.position.z = zb;
  spin.add(wheel);
  const rimH = bal.rimH ?? Math.max(0.35, r * 0.07);
  // hairspring
  const hsMat = (L.hairspring === 'silicon' ? silicon('#4b2f8f') : mov.mat(L.hairspring)).clone();
  const cockAngleWorld = (cfg.cockDir ?? defaultCockDir(mov, worldPos)) * D2R;
  const cockAngleLocal = cockAngleWorld - frameRot();
  const hs = new P.Hairspring({ r0: 0.45, r1: bal.hsR ?? r * 0.6, coils: bal.coils ?? 13, z: zb + rimH + 0.15, h: bal.hsH ?? 0.14, outerAngle: cockAngleLocal, mat: hsMat, overcoil: bal.overcoil });
  g.add(hs.mesh);
  // stud at the outer end
  const sr = (bal.hsR ?? r * 0.6) + 0.05;
  const stud = P.mesh(new THREE.BoxGeometry(0.45, 0.45, 0.6), mov.mat('steel'));
  stud.position.set(Math.cos(cockAngleLocal) * sr, Math.sin(cockAngleLocal) * sr, zb + rimH + 0.45);
  stud.rotation.z = cockAngleLocal;
  g.add(stud);
  // rollers on the staff, at fork level
  const rollers = new THREE.Group();
  const rroll = cfg._rroll;
  const impR = P.mesh(G.ringGeometry({ ro: rroll * 1.12, ri: 0.13, thick: 0.16 }), mov.mat('steel'));
  impR.position.z = zRoller + 0.18;
  rollers.add(impR);
  const safety = P.mesh(G.ringGeometry({ ro: rroll * 0.62, ri: 0.13, thick: 0.18 }), mov.mat('steel'));
  safety.position.z = zRoller - 0.02;
  rollers.add(safety);
  const pin = P.mesh(G.cylinderZ(Math.max(0.09, rroll * 0.1), 0.42, 16), ruby('pale'));
  pin.position.set(-rroll, 0, zRoller - 0.08);   // points toward the pallet when θ = 0
  rollers.add(pin);
  if (cfg.coaxialRoller) {
    // co-axial: an impulse ruby on a larger roller receives impulse straight from the wheel
    const big = P.mesh(G.ringGeometry({ ro: cfg.coaxialRoller, ri: 0.13, thick: 0.14 }), mov.mat('steel'));
    big.position.z = zRoller - 0.35;
    rollers.add(big);
    const st = P.mesh(new THREE.BoxGeometry(0.42, 0.16, 0.3), ruby());
    st.position.set(-cfg.coaxialRoller + 0.18, 0.3, zRoller - 0.36);
    rollers.add(st);
  }
  if (palletDirLocal !== undefined) rollers.rotation.z = 0;
  spin.add(rollers);

  // cock: blob from the balance centre to a foot outside the rim
  if (cfg.noCock) {
    mov.addPart('balance', { name: 'Balance wheel & hairspring', group: g, layer: 3.4, kind: 'balance', desc: `The balance (${bm.userData.label}) and its hairspring ride inside the cage.`, material: bm.userData.label });
    return { g, spin, hs, rollers, update(theta) { spin.rotation.z = theta; hs.update(theta); } };
  }
  const footD = r + 1.9;
  // swing the foot until its pillar clears every wheel underneath and stays on the plate
  const keep = mov.keepOut().filter(k => Math.hypot(k.x - worldPos[0], k.y - worldPos[1]) > 0.5);
  if (palPos) keep.push({ x: palPos[0], y: palPos[1], r: palR });
  const clear = (a) => {
    const fx = Math.cos(a) * footD + worldPos[0], fy = Math.sin(a) * footD + worldPos[1];
    if (Math.hypot(fx, fy) > mov.R - 1.6) return false;
    return !keep.some(k => Math.hypot(fx - k.x, fy - k.y) < k.r + 1.4);
  };
  let footA = cockAngleWorld;
  for (const off of [0, 12, -12, 24, -24, 36, -36, 50, -50, 65, -65, 80, -80, 100, -100, 120, -120]) {
    const a = cockAngleWorld + off * D2R;
    if (clear(a) && (!cfg.fullBridge || clear(a + Math.PI))) { footA = a; break; }
  }
  // the hairspring stud hangs under the cock arm
  hs.outerAngle = footA - frameRot();
  stud.position.set(Math.cos(hs.outerAngle) * sr, Math.sin(hs.outerAngle) * sr, stud.position.z);
  stud.rotation.z = hs.outerAngle;
  hs.update(0);
  const foot = [Math.cos(footA) * footD + worldPos[0], Math.sin(footA) * footD + worldPos[1]];
  const foot2 = [-Math.cos(footA) * footD + worldPos[0], -Math.sin(footA) * footD + worldPos[1]];
  const zc = zb + rimH + 0.75;
  const th = cfg.cockThick ?? 0.95;
  const circ = [{ x: worldPos[0], y: worldPos[1], r: cfg.cockHeadR ?? 1.9 }, { x: foot[0], y: foot[1], r: cfg.cockFootR ?? 2.6 }];
  if (cfg.fullBridge) circ.unshift({ x: foot2[0], y: foot2[1], r: cfg.cockFootR ?? 2.6 });
  const outline = G.blobOutline(circ, { waist: cfg.fullBridge ? 0.45 : 0.3 })
    .map(([x, y]) => { const rr = Math.hypot(x, y), lim = mov.R - 0.25; return rr > lim ? [x / rr * lim, y / rr * lim] : [x, y]; });
  mov.bridgeShapes.push({ outline, z0: zc, z1: zc + th });
  const cockLook = cfg.cockLook || (mov.look.cock) || mov.look.bridges;
  const cockMat = mov.mat(cockLook);
  const cock = new THREE.Group();
  const cm = P.mesh(G.plateGeometry(outline, [], th, 0.08), cockMat);
  cm.position.z = zc;
  cock.add(cm);
  for (const ft of cfg.fullBridge ? [foot, foot2] : [foot]) {
    const pil = P.mesh(G.cylinderZ(1.4, zc, 24), cockMat);
    pil.position.set(ft[0], ft[1], 0);
    cock.add(pil);
    const sc = P.screw({ r: 0.55, mat: mov.mat(L.screws) });
    sc.position.set(ft[0], ft[1], zc + th);
    cock.add(sc);
  }
  // shock setting / endstone over the balance
  const shock = new THREE.Group();
  shock.position.set(worldPos[0], worldPos[1], zc + th);
  const jw = P.jewel({ r: 0.55, cap: true, chaton: L.chatons, screwMat: mov.mat(L.screws) });
  jw.position.z = 0.05;
  shock.add(jw);
  if (cfg.shock !== false && !L.chatons) shock.add(P.shockSpring(0.85, mov.mat(cfg.shockMat || 'gold')));
  cock.add(shock);
  mov.jewelCount += 4;
  // regulator: index lever + (optional) swan-neck spring and fine adjust screw
  if (cfg.regulator !== false) {
    const reg = new THREE.Group();
    reg.position.set(worldPos[0], worldPos[1], zc + th + 0.02);
    const ra = cockAngleWorld + Math.PI * (cfg.regAngle ?? 0.92);
    const arm = G.strokeOutline([[0, 0], [Math.cos(ra) * 2.2, Math.sin(ra) * 2.2], [Math.cos(ra) * 4.2, Math.sin(ra) * 4.2]], [0.9, 0.35, 0.18]);
    const rm = P.mesh(G.extrudeOutline(arm, 0.14, 0.03, [{ x: 0, y: 0, r: 0.62 }]), mov.mat('steel'));
    reg.add(rm);
    if (cfg.swanNeck) {
      const pts = [];
      for (let i = 0; i <= 50; i++) {
        const t = i / 50;
        const a = ra + 0.5 + t * 2.0;
        const rr = 2.0 + 1.6 * t + 0.4 * Math.sin(t * Math.PI * 3);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr, 0.12]);
      }
      reg.add(P.mesh(G.tubeAlong(pts, 0.07, 100), mov.mat('steel')));
    }
    cock.add(reg);
  }
  if (cfg.engraved) cm.material = mov.mat({ metal: cockLook.metal || 'germanSilver', finish: 'engraving', finishScale: 8 });
  mov.root.add(cock);
  mov.addPart('balanceCock', { name: cfg.fullBridge ? 'Balance bridge' : 'Balance cock', group: cock, layer: 4, kind: 'bridge', desc: 'A cantilevered bridge holding the upper balance pivot in a shock-protected jewel. The regulator index on top shortens or lengthens the active hairspring to fine-tune the rate.' + (cfg.engraved ? ' This one is hand-engraved — no two are alike.' : ''), material: cm.material.userData.label });
  const hsLabel = hsMat.userData.label || '';
  mov.addPart('balance', {
    name: 'Balance wheel & hairspring', group: g, layer: 3.4, kind: 'balance',
    desc: `The timekeeper. The balance (${bm.userData.label}) swings back and forth, pulled back by the hairspring (${hsLabel}); its period does not depend much on how far it swings — that is isochronism. ${spec.specs.vph.toLocaleString()} vibrations per hour = ${(spec.specs.vph / 7200).toFixed(1)} Hz. Each half-swing releases the escape wheel by half a tooth.`,
    stats: () => mov.sim ? `Amplitude ${Math.round(mov.sim.A / D2R)}° · ${(spec.specs.vph / 7200).toFixed(2)} Hz · θ = ${Math.round(mov.sim.state().theta / D2R)}°` : '',
    material: bm.userData.label,
  });
  return {
    g, spin, hs, rollers,
    update(theta) { spin.rotation.z = theta; hs.update(theta); },
  };
}

function defaultCockDir(mov, pos) {
  // foot pointing away from the movement centre would leave the plate; aim sideways-inward
  const a = Math.atan2(pos[1], pos[0]);
  return (a + Math.PI * 0.62) / D2R;
}

// ----------------------------------------------------------------------------- Swiss lever
export function buildLever(mov, arbor, cfg, frame) {
  const L = mov.look;
  const z = cfg.teeth, R = cfg.r, step = TAU / z;
  const sigma = frame?.sigma ?? Math.sign(arbor.k || 1);
  const alpha = ((cfg.span ?? 2.5) / 2) * step;
  const d = R / Math.cos(alpha);
  const Lf = cfg.forkLen ?? R * 1.2;
  const F = (cfg.forkAngle ?? 10) * D2R;
  const lift = (mov.spec.specs.lift ?? 50) * D2R;
  const rroll = Lf * F / (lift / 2);
  cfg._rroll = rroll;
  const ze = cfg.z ?? 1.1;
  const dirA = frame ? frame.rot : cfg.dir * D2R;
  const parent = frame ? frame.parent : mov.root;
  const origin = frame ? frame.origin : arbor.pos;

  const F0 = new THREE.Group();
  F0.position.set(origin[0], origin[1], 0);
  F0.rotation.z = dirA;
  parent.add(F0);

  // --- escape wheel
  const ewMat = cfg.silicon ? silicon() : mov.mat(cfg.mat || L.escape);
  const ew = new THREE.Group();
  const ewm = P.mesh(G.escapeWheelGeometry({ z, R, dir: sigma, thick: 0.15, spokes: cfg.spokes ?? 5 }), ewMat);
  ewm.position.z = ze;
  ew.add(ewm);
  if (cfg.coaxial) {
    // second tier: small impulse wheel with pointed teeth
    const t2 = P.mesh(G.escapeWheelGeometry({ z, R: R * 0.62, dir: sigma, thick: 0.15, style: 'pointed', spokes: 0 }), ewMat);
    t2.position.z = ze - 0.32;
    ew.add(t2);
  }
  F0.add(ew);
  const delta = (R * 0.065) / R;
  const W0 = alpha - sigma * delta - sigma * (0.46 - 0.5) * step;

  // --- pallet fork (origin at P)
  const pal = new THREE.Group();
  pal.position.set(d, 0, 0);
  F0.add(pal);
  const ls = R * 0.5, ws = R * 0.13;
  const stones = [];
  const mounts = [];
  const stoneAngles = cfg.coaxial ? [alpha, -alpha] : [alpha, -alpha];
  for (const sa of stoneAngles) {
    const ux = Math.cos(sa), uy = Math.sin(sa);
    const cxp = (R * 0.985 + ls / 2) * ux - d, cyp = (R * 0.985 + ls / 2) * uy;
    const st = P.mesh(new THREE.BoxGeometry(ls, ws, 0.22), ruby('deep'));
    st.position.set(cxp, cyp, ze + 0.075);
    st.rotation.z = sa;
    pal.add(st);
    stones.push(st);
    mounts.push({ x: (R + ls * 0.85) * ux - d, y: (R + ls * 0.85) * uy, r: ws * 1.05 });
  }
  const hornL = Lf + rroll * 0.18;
  const circles = [
    mounts[0], { x: 0, y: 0, r: R * 0.13 }, { ...mounts[1], break: true },
    { x: 0, y: 0, r: R * 0.11 }, { x: Lf * 0.55, y: 0, r: R * 0.055 }, { x: Lf * 0.84, y: 0, r: R * 0.07 },
    { x: hornL, y: R * 0.13, r: R * 0.04, break: true },
    { x: Lf * 0.84, y: 0, r: R * 0.07 }, { x: hornL, y: -R * 0.13, r: R * 0.04, break: true },
  ];
  const palOutline = G.blobOutline(circles, { waist: 0.08, res: 0.015, pad: 0.3, k: R * 0.06 });
  const palMat = cfg.silicon ? silicon('#2f2a6a') : mov.mat(cfg.palletMat || L.pallet);
  const palBody = P.mesh(G.extrudeOutline(palOutline, 0.2, 0.03, [{ x: 0, y: 0, r: 0.09 }]), palMat);
  palBody.position.z = ze + 0.25;
  pal.add(palBody);
  if (cfg.coaxial) {
    // central impulse pallet stone engaged by the lower tier
    const st = P.mesh(new THREE.BoxGeometry(ls * 0.8, ws, 0.2), ruby('deep'));
    st.position.set(-d + R * 0.62 + ls * 0.4, 0, ze - 0.25);
    pal.add(st);
  }
  const guard = P.mesh(G.cylinderZ(0.06, 0.4, 8), mov.mat('steel'));
  guard.position.set(Lf * 0.9, 0, ze - 0.15);
  pal.add(guard);
  const staff = P.mesh(G.cylinderZ(0.1, frame ? 1.2 : ze + 0.9, 10), mov.mat('steel'));
  staff.position.set(0, 0, frame ? ze - 0.5 : 0.05);
  pal.add(staff);
  // banking pins
  for (const s of [1, -1]) {
    const bp = P.mesh(G.cylinderZ(0.12, frame ? 0.6 : ze + 0.32, 10), mov.mat('steel'));
    const a = s * (F + 0.04);
    bp.position.set(d + Math.cos(a) * Lf * 0.6 + 0, Math.sin(a) * Lf * 0.6 + s * R * 0.12, frame ? ze - 0.1 : 0);
    F0.add(bp);
  }

  // --- balance
  const bx = d + Lf + rroll;
  const rot = () => F0.rotation.z + (frame?.extraRot?.() ?? 0);
  const worldB = frame ? frame.worldB : [origin[0] + Math.cos(dirA) * bx, origin[1] + Math.sin(dirA) * bx];
  const worldP = frame ? null : [origin[0] + Math.cos(dirA) * d, origin[1] + Math.sin(dirA) * d];
  let balance;
  if (!cfg.noBalance) {
    cfg.coaxialRoller = cfg.coaxial ? rroll * 1.6 : 0;
    balance = buildBalance(mov, F0, cfg, { bx, by: 0, zRoller: ze + 0.25, worldPos: worldB, palPos: worldP, palR: Lf * 0.9 + 1.4, frameRot: () => dirA + (frame?.cageRot ?? 0) });
  }
  if (!frame) {
    mov.addPart('escape', {
      name: cfg.coaxial ? 'Co-axial escape wheel' : 'Escape wheel', group: F0, layer: 2.2, kind: 'escape', arbor,
      desc: cfg.coaxial
        ? 'Two tiers on one arbor. The large wheel locks on the pallet stones and pushes the balance roller directly; the small wheel pushes the central pallet stone. Impulses are delivered radially instead of by sliding, so the escapement needs almost no oil.'
        : `Club-tooth escape wheel, ${z} teeth. The last wheel of the train: the pallet fork lets it advance half a tooth per vibration, and its teeth push back on the pallet stones to keep the balance swinging.`,
      teeth: `${z} teeth · pinion ${arbor.pinion?.leaves} leaves`, material: ewMat.userData.label,
      stats: () => `${(Math.abs(arbor.k) / 60).toFixed(2)} rev/min · ${(Math.abs(arbor.k) * z * 2).toLocaleString()} beats/h`,
    });
    // register pallet as its own part so it can be inspected
    const palPart = new THREE.Group(); // proxy (the pallet lives inside the escapement frame)
    mov.addPart('pallet', { name: cfg.coaxial ? 'Co-axial lever (3 pallet stones)' : 'Pallet fork (lever)', group: pal, layer: 2.6, kind: 'pallet', desc: 'The anchor-shaped lever rocks between two banking pins. Its ruby pallet stones alternately lock the escape wheel; the fork at the other end is kicked by the impulse jewel on the balance roller and kicks back.', material: palMat.userData.label, stats: () => `Lever angle ${(F / D2R * 2).toFixed(1)}° total · lift ${(lift / D2R).toFixed(0)}°` });
  }

  return {
    F0, balancePos: worldB, palletPos: worldP, D: bx, d, Lf, rroll, ze, sigma, W0, balance, stones,
    update(s) {
      const theta = s.theta;
      const fork = clamp(-(rroll / Lf) * theta, -F, F);
      pal.rotation.z = fork;
      ewm.rotation.z = W0 + sigma * step * s.teeth;
      if (cfg.coaxial) ew.children[1].rotation.z = ewm.rotation.z;
      if (balance) balance.update(theta);
    },
  };
}

function lever(mov, arbor, cfg) {
  const lv = buildLever(mov, arbor, cfg);
  // escape arbor (pinion) itself is handled by the train; the wheel lives in the frame
  return { ...lv, update: (s) => lv.update(s) };
}

// ----------------------------------------------------------------------------- tourbillon
function tourbillon(mov, arbor, cfg) {
  const L = mov.look;
  const pos = arbor.pos;
  const cageG = new THREE.Group();
  cageG.position.set(pos[0], pos[1], 0);
  mov.root.add(cageG);
  const spin = new THREE.Group();
  cageG.add(spin);
  // Lever geometry first (needs rroll etc.): place escape wheel so that balance is on the cage axis.
  const z = cfg.teeth, R = cfg.r, step = TAU / z;
  const alpha = ((cfg.span ?? 2.5) / 2) * step;
  const d = R / Math.cos(alpha);
  const Lf = cfg.forkLen ?? R * 1.2;
  const F = (cfg.forkAngle ?? 10) * D2R;
  const lift = (mov.spec.specs.lift ?? 50) * D2R;
  const rroll = Lf * F / (lift / 2);
  const D = d + Lf + rroll;
  const zF = cfg.fixedTeeth ?? 80, n = cfg.escPinion ?? 8;
  const m = 2 * D / (zF + n);
  const rf = m * zF / 2, rpn = m * n / 2;
  const sigma = Math.sign(arbor.k || 1);
  // fixed (fourth) wheel, screwed to the plate, coaxial with the cage
  const fixed = P.mesh(G.wheelGeometry({ z: zF, rp: rf, thick: 0.22, spokes: 0, hole: 0.9 }), mov.mat(cfg.fixedMat || L.wheels));
  fixed.position.set(pos[0], pos[1], cfg.fixedZ ?? (cfg.z ?? 1.1) - 0.85);
  mov.root.add(fixed);
  // if the plate is open under the cage (dial-side aperture), carry the fixed wheel on a spoked
  // lower bridge spanning the hole, as real tourbillons do
  const hole = (mov.spec.plate?.holes || []).find(h => Math.hypot(h[0] - pos[0], h[1] - pos[1]) < 0.5);
  if (hole) {
    const spider = P.mesh(G.ringGeometry({ ro: hole[2] + 0.4, ri: hole[2] - 0.5, thick: 0.45, spokes: 3, spokeW: 0.7, hub: 1.6, hole: 0.4, bevel: 0.05 }), mov.mat(mov.look.plate));
    spider.position.set(pos[0], pos[1], mov.z.plateBottom - 0.45);   // screwed to the dial-side face
    spider.rotation.z = Math.PI / 6;
    mov.root.add(spider);
    const post = P.mesh(G.cylinderZ(1.0, (cfg.fixedZ ?? (cfg.z ?? 1.1) - 0.85) - mov.z.plateBottom, 24), mov.mat(mov.look.plate));
    post.position.set(pos[0], pos[1], mov.z.plateBottom);
    mov.root.add(post);
    const lowerJewel = P.jewel({ r: 0.5 });
    lowerJewel.position.set(pos[0], pos[1], mov.z.plateBottom - 0.45);
    lowerJewel.rotation.x = Math.PI;
    mov.root.add(lowerJewel);
    mov.addPart('lowerBridge', { name: 'Lower tourbillon bridge', group: spider, layer: 0.2, kind: 'bridge', desc: 'The plate is cut away under the cage so it can be seen from the dial. This three-armed bridge spans the opening and carries the fixed wheel and the cage\'s lower jewel.' });
  }
  mov.addPart('fixedWheel', { name: 'Fixed (fourth) wheel', group: fixed, layer: 1, kind: 'wheel', desc: `Screwed to the plate and never turns. The escape pinion rolls around its ${zF} teeth as the cage rotates, which is what drives the escapement.`, teeth: `${zF} teeth` });
  // escapement inside the cage; frame origin at escape wheel, pointing at the cage centre
  const eAng = cfg.escAngle ?? 200; // where the escape wheel sits in the cage (deg)
  const eLocal = [Math.cos(eAng * D2R) * D, Math.sin(eAng * D2R) * D];
  const frameRot = Math.atan2(-eLocal[1], -eLocal[0]);
  const lv = buildLever(mov, arbor, { ...cfg, z: cfg.z ?? 1.1, balanceZ: cfg.balanceZ, cockDir: 0, regulator: false, shock: false, noBalance: false, noCock: true }, {
    parent: spin, origin: eLocal, rot: frameRot, sigma, worldB: pos, cageRot: 0,
  });
  // escape pinion inside cage
  const pin = P.mesh(G.pinionGeometry({ z: n, rp: rpn, length: 0.55 }), mov.mat('steel'));
  pin.position.set(eLocal[0], eLocal[1], cfg.fixedZ ?? (cfg.z ?? 1.1) - 0.85);
  spin.add(pin);
  const beta = eAng * D2R;
  const pinPhase = beta + Math.PI - Math.PI / n + (zF / n) * beta;
  // cage: lower and upper frames with three arms, pillars
  const cageR = Math.max(D + R + 0.5, (mov.spec.balance?.r ?? 4) + 0.6);
  const cmat = mov.mat(cfg.cageMat || 'steel');
  const cz0 = (cfg.z ?? 1.1) - 0.5, cz1 = (cfg.cageTop ?? 4.6);
  { const circ = []; for (let i = 0; i < 64; i++) { const a = i / 64 * TAU; circ.push([pos[0] + Math.cos(a) * (cageR + 0.35), pos[1] + Math.sin(a) * (cageR + 0.35)]); } mov.bridgeShapes.push({ outline: circ, z0: cz0, z1: cz1 + 0.3 }); }
  const low = P.mesh(G.ringGeometry({ ro: cageR, ri: cageR - 0.45, thick: 0.25, spokes: 3, spokeW: 0.55, hub: 0.9, hole: 0.3 }), cmat);
  low.position.z = cz0;
  spin.add(low);
  const top = cfg.flying ? null : P.mesh(G.ringGeometry({ ro: cageR * 0.98, ri: cageR * 0.98 - 0.4, thick: 0.22, spokes: 3, spokeW: 0.5, hub: 0.8, hole: 0.3 }), cmat);
  if (top) { top.position.z = cz1; top.rotation.z = Math.PI / 3; spin.add(top); }
  for (let i = 0; i < 3; i++) {
    const a = i * TAU / 3 + Math.PI / 6;
    const pl = P.mesh(G.cylinderZ(0.22, cz1 - cz0, 12), cmat);
    pl.position.set(Math.cos(a) * (cageR - 0.25), Math.sin(a) * (cageR - 0.25), cz0);
    spin.add(pl);
    const sc = P.screw({ r: 0.32, mat: mov.mat(L.screws) });
    sc.position.set(Math.cos(a) * (cageR - 0.25), Math.sin(a) * (cageR - 0.25), cz1 + 0.22);
    if (top) spin.add(sc);
  }
  // seconds pointer on the cage
  const ptr = P.mesh(G.extrudeOutline([[-0.12, 0], [0.12, 0], [0.05, cageR * 0.95], [-0.05, cageR * 0.95]], 0.1), mov.mat('blued'));
  ptr.position.z = cz1 + 0.25;
  if (top) spin.add(ptr);
  // cage pinion is the arbor's pinion (driven by third wheel): train handles its mesh
  // upper tourbillon bridge (lyre-like) unless flying
  if (!cfg.flying) {
    const br = new THREE.Group();
    const ang = (cfg.bridgeAngle ?? 90) * D2R;
    const pts = [];
    const span = cageR + 2.5;
    for (let i = 0; i <= 40; i++) {
      const t = i / 40 * 2 - 1;
      pts.push([t * span, Math.cos(t * Math.PI / 2) * 1.2]);
    }
    const outline = G.strokeOutline([[-span, 0], [-span * 0.45, 0.9], [0, 0], [span * 0.45, -0.9], [span, 0]], [1.3, 0.55, 1.25, 0.55, 1.3]);
    const bm = P.mesh(G.extrudeOutline(outline, 0.55, 0.06, [{ x: 0, y: 0, r: 0.55 }]), mov.mat(cfg.bridgeLook || L.bridges));
    bm.position.z = cz1 + 0.6;
    br.add(bm);
    for (const s of [-1, 1]) {
      const pil = P.mesh(G.cylinderZ(0.9, cz1 + 0.6, 20), mov.mat(cfg.bridgeLook || L.bridges));
      pil.position.set(s * span, 0, 0);
      br.add(pil);
      const sc = P.screw({ r: 0.5, mat: mov.mat(L.screws) }); sc.position.set(s * span, 0, cz1 + 1.15); br.add(sc);
    }
    const jw = P.jewel({ r: 0.5, cap: true, chaton: L.chatons });
    jw.position.z = cz1 + 1.16;
    br.add(jw);
    br.position.set(pos[0], pos[1], 0);
    br.rotation.z = ang;
    mov.root.add(br);
    mov.addPart('tbridge', { name: 'Tourbillon bridge', group: br, layer: 5, kind: 'bridge', desc: 'Holds the upper pivot of the rotating cage.' });
  }
  const kCage = arbor.k;   // rev/h (60 for a one-minute tourbillon)
  // H mapping: teeth progress relative to cage
  mov.escK = kCage * zF / n;
  mov.addPart('cage', {
    name: cfg.flying ? 'Flying tourbillon cage' : 'Tourbillon cage', group: cageG, layer: 3, kind: 'cage', arbor,
    desc: `The whole escapement — escape wheel, lever and balance — rides in a cage that turns once every ${(60 / kCage).toFixed(1)} minutes. Breguet's 1801 idea: in a pocket watch hanging vertically, the balance's poise errors in each position average out over one rotation.` + (cfg.flying ? ' Supported from below only (Helwig, Glashütte 1920) — no bridge above, so you see straight in.' : ''),
    stats: () => rateText2(kCage),
  });
  return {
    balancePos: pos,
    update(s, H) {
      const C = TAU * kCage * H;
      spin.rotation.z = C;
      mov.cageAngle = C;
      // escapement relative to cage
      lv.update(s);
      pin.rotation.z = lv.W0 * 0 + sigma * (TAU / n) * 0 + (zF / n) * C + pinPhase;
      // keep escape wheel consistent with pinion (both relative to cage)
      lv.F0.children[0].children[0].rotation.z = lv.W0 + sigma * step * s.teeth;
    },
  };
}
function rateText2(k) { return `${(k / 60).toFixed(2)} rev/min`; }

// ----------------------------------------------------------------------------- detent (chronometer)
function detent(mov, arbor, cfg) {
  const L = mov.look;
  const z = cfg.teeth, R = cfg.r, step = TAU / z;
  const sigma = Math.sign(arbor.k || 1);
  const dirA = cfg.dir * D2R;
  const F0 = new THREE.Group();
  F0.position.set(arbor.pos[0], arbor.pos[1], 0);
  F0.rotation.z = dirA;
  mov.root.add(F0);
  const ze = cfg.z ?? 1.1;
  const ewMat = mov.mat(cfg.mat || 'brass');
  const ewm = P.mesh(G.escapeWheelGeometry({ z, R, dir: sigma, thick: 0.18, style: 'pointed', spokes: 4 }), ewMat);
  ewm.position.z = ze;
  F0.add(ewm);
  // balance at distance R + impulse roller radius along +x
  const rImp = R * 0.42;
  const bx = R + rImp - R * 0.08;
  const lift = (mov.spec.specs.lift ?? 40) * D2R;
  cfg._rroll = rImp * 0.45;
  const worldB = [arbor.pos[0] + Math.cos(dirA) * bx, arbor.pos[1] + Math.sin(dirA) * bx];
  const balance = buildBalance(mov, F0, { ...cfg, regulator: false }, { bx, by: 0, zRoller: ze, worldPos: worldB, frameRot: () => dirA });
  // impulse roller with impulse pallet (the wheel pushes this directly)
  const impRoller = P.mesh(G.ringGeometry({ ro: rImp, ri: 0.15, thick: 0.18 }), mov.mat('steel'));
  impRoller.position.z = ze;
  const impStone = P.mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), ruby('deep'));
  impStone.position.set(-rImp + 0.15, 0.05, ze + 0.08);
  balance.rollers.add(impRoller, impStone);
  // discharging roller (small) with discharging pallet
  const disR = rImp * 0.45;
  const dis = P.mesh(G.ringGeometry({ ro: disR, ri: 0.12, thick: 0.15 }), mov.mat('steel'));
  dis.position.z = ze + 0.55;
  const disStone = P.mesh(new THREE.BoxGeometry(0.3, 0.1, 0.2), ruby('deep'));
  disStone.position.set(-disR - 0.08, 0, ze + 0.6);
  balance.rollers.add(dis, disStone);
  // detent: long thin spring blade from a foot that stands clear of the train, to the locking
  // stone at the wheel and on to the horn by the discharging roller
  const lockA = -(cfg.lockAngle ?? 50) * D2R;   // wheel angle where the locking stone sits
  const lockPt = [Math.cos(lockA) * R, Math.sin(lockA) * R];
  const toW = (p) => [arbor.pos[0] + Math.cos(dirA) * p[0] - Math.sin(dirA) * p[1], arbor.pos[1] + Math.sin(dirA) * p[0] + Math.cos(dirA) * p[1]];
  const keep = mov.keepOut().filter(k => Math.hypot(k.x - arbor.pos[0], k.y - arbor.pos[1]) > 0.3);
  const bladeL = R * 1.7;
  let footPt = null;
  for (const off of [0, 15, -15, 30, -30, 45, -45, 60, -60, 80, -80, 100, -100]) {
    const t = Math.PI + lockA * 0.3 + off * D2R;
    const fp = [lockPt[0] + Math.cos(t) * bladeL, lockPt[1] + Math.sin(t) * bladeL];
    const w = toW(fp);
    if (Math.hypot(w[0], w[1]) > mov.R - 1.2) continue;
    if (keep.some(k => Math.hypot(w[0] - k.x, w[1] - k.y) < k.r + 0.8)) continue;
    footPt = fp; break;
  }
  footPt ||= [lockPt[0] - bladeL, lockPt[1]];
  const det = new THREE.Group();
  det.position.set(footPt[0], footPt[1], 0);
  F0.add(det);
  const rel = (p) => [p[0] - footPt[0], p[1] - footPt[1]];
  const lockRel = rel([lockPt[0] + 0.25, lockPt[1] - 0.25]);
  const hornRel = rel([bx - disR - 0.25, -0.15]);
  const blade = G.strokeOutline([[0, 0], [lockRel[0] * 0.35, lockRel[1] * 0.35], lockRel, hornRel], [0.5, 0.1, 0.22, 0.12]);
  const bladeM = P.mesh(G.extrudeOutline(blade, 0.2, 0.02), mov.mat('steel'));
  bladeM.position.z = ze + 0.5;
  det.add(bladeM);
  const lockStone = P.mesh(new THREE.BoxGeometry(0.18, 0.55, 0.5), ruby('deep'));
  const ls = rel([lockPt[0] + 0.08, lockPt[1] - 0.15]);
  lockStone.position.set(ls[0], ls[1], ze + 0.15);
  det.add(lockStone);
  // passing spring: gold foil alongside the blade, at the same height
  const pa = [lockRel[0] * 0.55, lockRel[1] * 0.55 + 0.14];
  const passing = P.mesh(G.extrudeOutline(G.strokeOutline([pa, [hornRel[0] + 0.4, hornRel[1] + 0.14]], [0.05, 0.05]), 0.12), mov.mat('gold'));
  passing.position.z = ze + 0.52;
  det.add(passing);
  const footBlk = P.mesh(new THREE.BoxGeometry(1.2, 1.0, ze + 0.9), mov.mat(L.bridges));
  footBlk.position.set(0, 0, (ze + 0.9) / 2);
  det.add(footBlk);
  const sc = P.screw({ r: 0.4, mat: mov.mat(L.screws) }); sc.position.set(0, 0, ze + 0.9); det.add(sc);
  const W0 = lockA - sigma * 0.02 - sigma * 0.72 * step;
  mov.addPart('escape', { name: 'Chronometer escape wheel', group: F0, layer: 2.2, kind: 'escape', arbor, desc: `${z} pointed teeth. It locks on a jewel carried by the spring detent and gives impulse straight to the balance roller — no lever, no sliding, no oil on the impulse faces. It moves only once per full oscillation.`, teeth: `${z} teeth`, stats: () => `${(Math.abs(arbor.k) / 60).toFixed(2)} rev/min` });
  mov.addPart('detent', { name: 'Spring detent & passing spring', group: det, layer: 2.6, kind: 'pallet', desc: 'The detent is a thin steel blade. On one swing the discharging pallet on the balance pushes the gold passing spring, which lifts the detent and frees the wheel. On the return swing the passing spring simply flexes aside and the detent stays put. That "dead" beat is why chronometers tick in half-seconds and why they can stop if jolted (they are not self-starting).' });
  return {
    balancePos: worldB,
    update(s) {
      ewm.rotation.z = W0 + sigma * step * s.teeth;
      balance.update(s.theta);
      // detent lifted only during the active beat's lift window
      const lifting = s.active && s.q > 0 && s.q < 1 ? Math.sin(Math.PI * clamp(s.q * 1.8, 0, 1)) : 0;
      det.rotation.z = -0.045 * lifting;
      const passingFlex = !s.active && s.q > 0 && s.q < 1 ? Math.sin(Math.PI * s.q) : 0;
      passing.rotation.z = 0.04 * passingFlex;
    },
  };
}

// ----------------------------------------------------------------------------- verge (crown wheel)
function verge(mov, arbor, cfg) {
  const L = mov.look;
  const z = cfg.teeth, R = cfg.r, step = TAU / z;
  // the contrate wheel (parent) has axial teeth; the crown-wheel arbor lies flat, radial to it
  const parent = mov.arbors.get(arbor.parent);
  const u = cfg.dir * D2R;
  const rc = parent.wheel.r;
  const zArb = cfg.arborZ ?? 2.3;
  const g = new THREE.Group();
  g.position.set(parent.pos[0], parent.pos[1], 0);
  g.rotation.z = u;
  mov.root.add(g);
  // horizontal arbor along +x from the contrate rim
  const len = cfg.arborLen ?? 5.5;
  const arb = new THREE.Group();
  arb.position.set(rc - 0.5, 0, zArb);
  g.add(arb);
  const spinA = new THREE.Group();
  arb.add(spinA);
  const shaft = P.mesh(new THREE.CylinderGeometry(0.15, 0.15, len, 10), mov.mat('steel'));
  shaft.rotation.z = Math.PI / 2; shaft.position.x = len / 2;
  spinA.add(shaft);
  const pinR = arbor.pinion.r;
  const pin = P.mesh(G.pinionGeometry({ z: arbor.pinion.leaves, rp: pinR, length: 0.8 }), mov.mat('steel'));
  pin.rotation.y = Math.PI / 2; pin.position.x = 0.1;
  spinA.add(pin);
  // crown wheel: ring with saw teeth pointing along +x (axial)
  const cw = new THREE.Group();
  const ring = P.mesh(G.ringGeometry({ ro: R, ri: R - 0.35, thick: 0.6, spokes: 4, spokeW: 0.3, hub: 0.4 }), mov.mat(cfg.mat || 'brass'));
  cw.add(ring);
  const toothGeo = new THREE.BufferGeometry();
  {
    const tw = step * 0.9, th = 0.7, rin = R - 0.35;
    const vs = [];
    for (let i = 0; i < z; i++) {
      const a0 = i * step, a1 = a0 + tw;
      const p = (a, r, zz) => [Math.cos(a) * r, Math.sin(a) * r, zz];
      // triangular prism tooth (outer face + inner face + slopes)
      const A = p(a0, R, 0.6), B = p(a1, R, 0.6), C = p(a1, R, 0.6 + th);
      const A2 = p(a0, rin, 0.6), B2 = p(a1, rin, 0.6), C2 = p(a1, rin, 0.6 + th);
      vs.push(...A, ...B, ...C, ...A2, ...C2, ...B2, ...A, ...C, ...C2, ...A, ...C2, ...A2, ...B, ...B2, ...C2, ...B, ...C2, ...C);
    }
    toothGeo.setAttribute('position', new THREE.Float32BufferAttribute(vs, 3));
    toothGeo.computeVertexNormals();
  }
  const teethM = P.mesh(toothGeo, mov.mat(cfg.mat || 'brass'));
  teethM.material = teethM.material.clone(); teethM.material.side = THREE.DoubleSide;
  cw.add(teethM);
  cw.rotation.y = Math.PI / 2;   // axis along +x
  const cwHolder = new THREE.Group();
  cwHolder.position.x = len - 0.8;
  cwHolder.add(cw);
  spinA.add(cwHolder);
  // verge staff: vertical, just beyond the teeth tips, crossing the wheel diameter
  const vx = rc - 0.5 + len - 0.8 + 0.6 + 0.7 + 0.25;
  const vstaff = new THREE.Group();
  vstaff.position.set(vx, 0, 0);
  g.add(vstaff);
  const vspin = new THREE.Group(); vstaff.add(vspin);
  const vs = P.mesh(G.cylinderZ(0.14, zArb + R + 4.2, 10), mov.mat('steel'));
  vs.position.z = 0.2;
  vspin.add(vs);
  // two pallet flags, top and bottom of the crown wheel, ~100° apart
  for (const [zz, ang] of [[zArb + R - 0.3, 50], [zArb - R + 0.3, -50]]) {
    const flag = P.mesh(new THREE.BoxGeometry(0.9, 0.08, 0.45), mov.mat('steel'));
    flag.geometry.translate(-0.45, 0, 0);
    const fg = new THREE.Group(); fg.position.z = zz; fg.rotation.z = Math.PI + ang * D2R;
    fg.add(flag);
    vspin.add(fg);
  }
  mov.vergeTop = zArb + R + 4.4;
  // balance (no hairspring in the earliest; here a hairspring, as in post-1675 verges)
  const worldB = [parent.pos[0] + Math.cos(u) * vx, parent.pos[1] + Math.sin(u) * vx];
  cfg._rroll = 0.3;
  const balG = new THREE.Group();
  balG.position.set(vx, 0, 0);
  g.add(balG);
  const balSpec = mov.spec.balance || {};
  const r = balSpec.r ?? 6;
  const bz = cfg.balanceZ ?? zArb + R + 2.4;
  const bwheel = P.balanceWheel({ r, arms: 3, mat: mov.mat(balSpec.mat || 'gilt'), rimH: 0.35, staffBase: -bz + 0.2, staffLen: bz + 1 });
  bwheel.position.z = bz;
  vspin.add(bwheel);
  const hs = new P.Hairspring({ r0: 0.45, r1: r * 0.55, coils: 4.5, z: bz + 0.45, h: 0.12, outerAngle: Math.PI * 0.6, mat: mov.mat('blued').clone() });
  balG.add(hs.mesh);
  // pierced & engraved balance cock (the glory of 18th-century watches)
  const cockR = r + 0.9;
  const cockOut = G.blobOutline([{ x: 0, y: 0, r: cockR }, { x: Math.cos(Math.PI * 0.6) * (cockR + 1.2), y: Math.sin(Math.PI * 0.6) * (cockR + 1.2), r: 2.2 }], { waist: 0.1 });
  const holes = [];
  for (let i = 0; i < 9; i++) { const a = i * TAU / 9 + 0.2; holes.push({ x: Math.cos(a) * r * 0.62, y: Math.sin(a) * r * 0.62, r: r * 0.17 }); }
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6; holes.push({ x: Math.cos(a) * r * 0.3, y: Math.sin(a) * r * 0.3, r: r * 0.09 }); }
  const cockM = P.mesh(G.plateGeometry(cockOut, holes, 0.5, 0.05), mov.mat({ metal: 'gilt', finish: 'engraving', finishScale: 6 }));
  cockM.position.z = bz + 1.1;
  balG.add(cockM);
  const cj = P.jewel({ r: 0.55, cap: false });
  cj.position.z = bz + 1.62;
  balG.add(cj);
  mov.addPart('verge', { name: 'Crown wheel & verge', group: g, layer: 2.4, kind: 'escape', arbor, desc: `The oldest mechanical escapement (13th-century tower clocks). The crown wheel has ${z} saw teeth standing up like a crown; the vertical verge staff carries two flag-shaped pallets ~100° apart that catch the top and bottom teeth alternately. There is no free swing: the balance is always being pushed or pushed back (recoil), so rate depends heavily on power — hence the fusee.`, teeth: `${z} teeth (odd, so top and bottom teeth alternate)`, stats: () => 'Recoil escapement · balance arc ≈ ±55°' });
  mov.addPart('balance', { name: 'Balance & pierced cock', group: balG, layer: 4, kind: 'balance', desc: 'A plain gilt three-arm balance with a short blued hairspring under a pierced, hand-engraved cock — the showpiece of English and French verge watches.' });
  const sigma = 1;
  return {
    balancePos: worldB,
    update(s) {
      // recoil: the crown wheel advances, then is pushed back slightly before the drop
      const rot = sigma * step * s.teeth;
      spinA.rotation.x = rot * (z / arbor.pinion.leaves) * 0 + rot;
      pin.rotation.z = 0;
      vspin.rotation.z = s.theta;
      hs.update(s.theta);
    },
  };
}

// ----------------------------------------------------------------------------- spring drive glide wheel
function glide(mov, arbor, cfg) {
  const g = new THREE.Group();
  g.position.set(arbor.pos[0], arbor.pos[1], 0);
  mov.root.add(g);
  const ze = cfg.z ?? 1.1;
  const R = cfg.r ?? 2.0;
  const spin = new THREE.Group(); g.add(spin);
  // glide wheel: rotor with magnets
  const disc = P.mesh(G.ringGeometry({ ro: R, ri: R * 0.75, thick: 0.25, spokes: 6, spokeW: 0.3, hub: 0.35, hole: 0.1 }), mov.mat('steel'));
  disc.position.z = ze;
  spin.add(disc);
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6;
    const mg = P.mesh(new THREE.BoxGeometry(0.5, 0.35, 0.3), mov.mat(i % 2 ? 'black' : 'tungsten'));
    mg.position.set(Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88, ze + 0.27);
    mg.rotation.z = a;
    spin.add(mg);
  }
  // coils (copper) on either side
  const coils = new THREE.Group();
  const glows = [];
  for (const s of [1, -1]) {
    const c = new THREE.Group();
    const core = P.mesh(new THREE.BoxGeometry(1.2, 2.8, 0.7), mov.mat('steel'));
    const wind = P.mesh(new THREE.CylinderGeometry(0.75, 0.75, 2.3, 24), mov.mat('copper'));
    wind.position.z = 0;
    c.add(core, wind);
    const gl = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), glow('#7cc4ff'));
    c.add(gl); glows.push(gl);
    c.position.set(s * (R + 1.0), 0, ze);
    coils.add(c);
  }
  coils.rotation.z = (cfg.coilAngle ?? 30) * D2R;
  g.add(coils);
  // quartz capsule & IC somewhere nearby
  const qpos = cfg.quartzAt ?? [arbor.pos[0] + 4.5, arbor.pos[1] - 3];
  const q = new THREE.Group();
  q.position.set(qpos[0], qpos[1], 2.6);
  const cap = P.mesh(new THREE.CapsuleGeometry(0.75, 3.6, 6, 18), mov.mat('steel'));
  cap.rotation.z = Math.PI / 2;
  q.add(cap);
  const ic = P.mesh(new THREE.BoxGeometry(2.2, 2.2, 0.35), new THREE.MeshPhysicalMaterial({ color: 0x18181c, roughness: 0.35, metalness: 0.2, clearcoat: 1 }));
  ic.position.set(0.4, 2.6, -0.1);
  q.add(ic);
  mov.root.add(q);
  mov.addPart('glide', {
    name: 'Glide wheel & Tri-synchro regulator', group: g, layer: 2.5, kind: 'escape', arbor,
    desc: 'No balance, no escapement. The last wheel of the train is a magnetised rotor spinning 8 times a second between two coils. It generates a tiny current that powers a quartz crystal (32,768 Hz) and an IC; the IC compares the rotor against the quartz and applies a gentle electromagnetic brake. The seconds hand glides without ticks. The blue glow shows the brake pulses.',
    stats: () => '8 rev/s · regulated against 32,768 Hz',
  });
  mov.addPart('quartz', { name: 'Quartz oscillator & IC', group: q, layer: 4, kind: 'part', desc: 'Powered entirely by the glide wheel: there is no battery. The IC needs about 25 nanowatts.' });
  let t = 0;
  return {
    update(s, H, dt) {
      spin.rotation.z = Math.sign(arbor.k) * TAU * s.teeth;
      t += dt || 0;
      const pulse = s.stopped ? 0 : 0.25 + 0.2 * Math.max(0, Math.sin(t * 9.3)) * Math.max(0, Math.sin(t * 2.1 + 1));
      glows.forEach(g2 => g2.material.opacity = pulse * (mov.showGlow === false ? 0 : 1));
    },
  };
}

export const ESCAPEMENTS = {
  lever, coaxial: (m, a, c) => lever(m, a, { ...c, coaxial: true }), detent, verge, glide, tourbillon,
};
