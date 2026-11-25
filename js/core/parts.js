// Reusable small parts: jewels, screws, balance, hairspring, hands, crowns, shock springs.
import * as THREE from 'three';
import * as G from './geometry.js';
import { metal, ruby } from './materials.js';

const TAU = Math.PI * 2;

export function mesh(geo, mat, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = true;
  return m;
}

// Hole jewel, optionally with cap jewel and gold chaton
export function jewel({ r = 0.55, h = 0.28, chaton = false, chatonMat, screwMat, cap = false, gem = 'ruby' } = {}) {
  const g = new THREE.Group();
  if (gem === 'none') {   // pre-jewel era: a brass bush with an oil sink
    const b = mesh(G.ringGeometry({ ro: r * 0.9, ri: r * 0.25, thick: h * 0.5, bevel: 0.03 }), metal('brass'));
    b.position.z = -h * 0.2;
    b.userData.noClash = true;
    g.add(b);
    return g;
  }
  if (chaton) {
    const c = mesh(G.chatonGeometry(r * 1.75, h * 1.0, r * 0.9), chatonMat || metal('gold'));
    c.position.z = -h * 0.3;
    g.add(c);
    // three blued screws holding the chaton
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3 + 0.5;
      const s = screw({ r: r * 0.55, mat: screwMat || metal('blued') });
      s.position.set(Math.cos(a) * r * 2.35, Math.sin(a) * r * 2.35, -0.05);
      s.rotation.z = a * 1.7;
      g.add(s);
    }
  }
  const j = mesh(G.jewelGeometry(r, h), ruby(gem), { shadow: false });
  j.position.z = chaton ? 0.0 : -h * 0.45;
  g.add(j);
  if (cap) {
    const c = mesh(G.cylinderZ(r * 0.8, h * 0.4, 28), ruby(gem), { shadow: false });
    c.position.z = h * 0.5;
    g.add(c);
  }
  return g;
}

export function screw({ r = 0.45, mat, slotAngle = Math.random() * Math.PI } = {}) {
  const g = new THREE.Group();
  const head = mesh(G.screwHeadGeometry(r, r * 0.6), mat || metal('blued'));
  g.add(head);
  const slot = mesh(new THREE.BoxGeometry(r * 2.05, r * 0.22, r * 0.4), new THREE.MeshStandardMaterial({ color: 0x0b0d14, roughness: 0.8 }));
  slot.position.z = r * 0.58;
  slot.userData.noClash = true;
  slot.rotation.z = slotAngle;
  g.add(slot);
  return g;
}

// Balance wheel: rim, arms, optional timing screws / inertia weights, staff, rollers.
export function balanceWheel(o) {
  const g = new THREE.Group();
  const r = o.r, rimW = o.rimW ?? r * 0.12, th = o.rimH ?? Math.max(0.35, r * 0.07);
  const mat = o.mat;
  // rim (taller) and arms (thinner) as two extrusions
  const rim = mesh(G.ringGeometry({ ro: r, ri: r - rimW, thick: th, seg: 120 }), mat);
  g.add(rim);
  const armTh = th * 0.55;
  const armsCount = o.arms ?? 3;
  const arms = mesh(G.ringGeometry({ ro: r - rimW * 0.3, ri: r - rimW * 0.85, thick: armTh, spokes: armsCount, spokeW: Math.max(0.3, r * 0.09), hub: r * 0.16, hole: 0.08 }), mat);
  arms.position.z = 0;
  g.add(arms);
  // compensation-style cut rims on vintage balances (bimetallic): show two cuts
  if (o.cut) {
    for (let i = 0; i < 2; i++) {
      const cut = mesh(new THREE.BoxGeometry(rimW * 1.4, 0.06, th * 1.1), new THREE.MeshBasicMaterial({ color: 0x050505 }));
      const a = i * Math.PI + 0.3;
      cut.position.set(Math.cos(a) * (r - rimW / 2), Math.sin(a) * (r - rimW / 2), th / 2);
      cut.rotation.z = a;
      g.add(cut);
    }
  }
  // timing screws around the rim (screw balance) or inertia weights (free-sprung)
  const screws = o.screws ?? 0;
  const smat = o.screwMat || metal('gold');
  for (let i = 0; i < screws; i++) {
    const a = (i / screws) * TAU + 0.1;
    const s = mesh(G.screwHeadGeometry(Math.min(0.42, r * 0.07), 0.3), smat);
    s.rotation.y = Math.PI / 2;
    const pivot = new THREE.Group();
    pivot.add(s);
    s.position.set(r - 0.02, 0, th / 2);
    pivot.rotation.z = a;
    g.add(pivot);
  }
  if (o.weights) {      // Gyromax / Microstella / masselottes on the inside of the rim
    const n = o.weights;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.PI / n;
      const w = mesh(G.cylinderZ(r * 0.075, th * 0.95, 16), o.weightMat || metal('gold'));
      w.position.set(Math.cos(a) * (r - rimW - r * 0.07), Math.sin(a) * (r - rimW - r * 0.07), 0.02);
      g.add(w);
    }
  }
  // staff
  const staff = mesh(G.cylinderZ(0.11, o.staffLen ?? 3.2, 12), metal('steel'));
  staff.position.z = o.staffBase ?? -1.6;
  g.add(staff);
  // collet
  const collet = mesh(G.cylinderZ(o.colletR ?? 0.42, 0.25, 20), metal('steel'));
  collet.position.z = th + 0.05;
  g.add(collet);
  return g;
}

// Flat hairspring (Archimedean spiral). Updates every frame: inner end turns with the balance,
// outer end fixed at the stud, so the coils "breathe".
export class Hairspring {
  constructor({ r0, r1, coils, z, h = 0.12, outerAngle = 0, mat, overcoil = false }) {
    Object.assign(this, { r0, r1, coils, z, h, outerAngle, overcoil });
    this.geo = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.material.side = THREE.DoubleSide;
    this.mesh.castShadow = true;
    this.N = Math.floor(coils * 90);
    this.pts = new Array(this.N + (overcoil ? 40 : 0));
    this.update(0);
  }
  update(theta) {
    const { r0, r1, coils, N } = this;
    // outer end fixed at outerAngle; spiral unwinds outward clockwise
    const start = this.outerAngle - coils * TAU; // inner end angle at rest
    let i = 0;
    for (; i <= N - 1; i++) {
      const s = i / (N - 1);              // 0 inner .. 1 outer
      const tw = theta * (1 - s);         // twist distributed along length
      const a = start + s * coils * TAU + tw;
      // spacing breathes slightly: coils open when wound one way, close the other
      const r = r0 + (r1 - r0) * s + Math.sin(Math.PI * s) * theta * 0.025 * (r1 - r0);
      this.pts[i] = [r * Math.cos(a), r * Math.sin(a)];
    }
    if (this.overcoil) {
      // Breguet overcoil drawn in-plane as a terminal curve bending inward
      const a1 = this.outerAngle;
      for (let k = 0; k < 40; k++) {
        const s = k / 39;
        const a = a1 + s * 1.6;
        const r = r1 - Math.sin(s * Math.PI * 0.7) * (r1 - r0) * 0.25;
        this.pts[i + k] = [r * Math.cos(a), r * Math.sin(a)];
      }
    }
    G.ribbonUpdate(this.geo, this.pts.filter(Boolean), this.z, this.h);
  }
}

// Mainspring inside a barrel: packed against the arbor when wound, against the wall when let down
export class Mainspring {
  constructor({ ra, rb, turns = 12, z, h, mat }) {
    Object.assign(this, { ra, rb, turns, z, h });
    this.geo = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.material.side = THREE.DoubleSide;
    this.update(0.5, 0);
  }
  update(wind, arborAngle) {
    const { ra, rb, turns } = this;
    const th = (rb - ra) / (turns * 2.4);   // strip thickness spacing when packed
    const pts = [];
    const N = turns * 60;
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1);
      const rWound = ra + 0.1 + s * turns * th;
      const rDown = rb - 0.05 - (1 - s) * turns * th;
      const r = rWound * wind + rDown * (1 - wind);
      const a = arborAngle + s * turns * TAU * (0.75 + 0.5 * wind);
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    G.ribbonUpdate(this.geo, pts, this.z, this.h);
  }
}

// ----------------------------------------------------------------------------- hands
export function handGeometry(style, length, width, tail = 0) {
  const L = length, w = width;
  let pts;
  if (style === 'breguet') {
    // "pomme": thin shaft with an open moon ring near the tip
    const ring = L * 0.72, rr = w * 1.7;
    const holeR = rr * 0.55;
    pts = [[-w * 0.35, -tail], [w * 0.35, -tail], [w * 0.28, ring - rr], [rr, ring], [w * 0.28, ring + rr * 0.95], [w * 0.12, L], [-w * 0.12, L], [-w * 0.28, ring + rr * 0.95], [-rr, ring], [-w * 0.28, ring - rr]];
    return G.extrudeOutline(G.roundedPolygon(pts.map(p => [...p, 0.05]), 4), 0.08, 0, [{ x: 0, y: ring, r: holeR }]);
  }
  if (style === 'dauphine') {
    pts = [[-w, w], [0, L], [w, w], [w * 0.5, -tail], [-w * 0.5, -tail]];
  } else if (style === 'leaf') {
    pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([w * Math.sin(Math.PI * Math.pow(t, 0.75)) * 1.1, t * L]); }
    for (let i = 12; i >= 0; i--) { const t = i / 12; pts.push([-w * Math.sin(Math.PI * Math.pow(t, 0.75)) * 1.1, t * L]); }
    pts.push([-w * 0.3, -tail], [w * 0.3, -tail]);
    return G.extrudeOutline(pts, 0.08);
  } else if (style === 'needle') {
    pts = [[-w * 0.5, -tail], [w * 0.5, -tail], [w * 0.18, L], [-w * 0.18, L]];
  } else if (style === 'pointer') {   // triangular tipped pointer (retrograde, sub-dials)
    pts = [[-w * 0.5, -tail], [w * 0.5, -tail], [w * 0.35, L * 0.85], [0, L], [-w * 0.35, L * 0.85]];
  } else { // baton
    pts = [[-w, -tail], [w, -tail], [w, L], [-w, L]];
  }
  return G.extrudeOutline(pts, 0.08);
}

export function hand(style, length, width, mat, { tail = 0, hub = 0 } = {}) {
  const g = new THREE.Group();
  const m = mesh(handGeometry(style, length, width, tail), mat);
  g.add(m);
  const h = mesh(G.cylinderZ(hub || Math.max(0.35, width * 1.2), 0.12, 24), mat);
  h.position.z = -0.02;
  g.add(h);
  return g;
}

// Incabloc-style lyre spring over a cap jewel
export function shockSpring(r = 0.9, mat) {
  const g = new THREE.Group();
  const ring = mesh(G.ringGeometry({ ro: r * 1.15, ri: r * 0.95, thick: 0.12, seg: 40 }), metal('steel'));
  g.add(ring);
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = -Math.PI * 0.85 + t * Math.PI * 1.7;
    const lobe = 1 + 0.25 * Math.cos(3 * (a + Math.PI / 2));
    pts.push([Math.cos(a) * r * 0.75 * lobe, Math.sin(a) * r * 0.75 * lobe, 0.14]);
  }
  g.add(mesh(G.tubeAlong(pts, 0.045, 80), mat || metal('gold')));
  return g;
}

// Knurled crown with stem
export function crown(r = 2.6, len = 2.4, mat) {
  const g = new THREE.Group();
  const knurl = mesh(G.wheelGeometry({ z: 36, rp: r, thick: len, spokes: 0, kind: 'fine', hole: 0 }), mat);
  knurl.rotation.y = Math.PI / 2;
  knurl.position.x = 0;
  g.add(knurl);
  const cap = mesh(G.cylinderZ(r * 0.85, 0.25, 40), mat);
  cap.rotation.y = Math.PI / 2;
  cap.position.x = len;
  g.add(cap);
  const stem = mesh(new THREE.CylinderGeometry(0.45, 0.45, 9, 12), metal('steel'));
  stem.rotation.z = Math.PI / 2;
  stem.position.x = -4.5;
  g.add(stem);
  return g;
}

// Text label sprite helper for dials/discs is in movement.js (canvas based).
