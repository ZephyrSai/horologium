// Movement builder: turns a declarative spec (see /js/movements/*.js and README) into a scene
// graph plus an update(state) function. The builder solves layout (centre distances from tooth
// counts and pitch radii), angular velocities (from tooth ratios), mesh phases (so teeth
// interleave), bridges (outlines grown around the pivots they carry) and wires the escapement.
import * as THREE from 'three';
import * as G from './geometry.js';
import * as P from './parts.js';
import { metal, ruby, silicon, lacquer, METALS } from './materials.js';
import { canvasTexture } from './textures.js';
import { ESCAPEMENTS } from './escapements.js';
import { COMPLICATIONS } from './complications.js';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const v2 = (a) => [Math.cos(a), Math.sin(a)];

export const DEFAULT_LOOK = {
  plate: { metal: 'rhodium', finish: 'perlage', finishScale: 1.6 },
  bridges: { metal: 'rhodium', finish: 'cotes', finishScale: 2.6, finishAngle: 0.35 },
  wheels: 'goldWheel',
  pinions: 'steel',
  screws: 'blued',
  jewels: 'ruby',
  balance: 'glucydur',
  hairspring: 'nivarox',
  escape: 'steel',
  pallet: 'steel',
  ratchet: { metal: 'steel', finish: 'snail' },
  rotor: { metal: 'rhodium', finish: 'cotes', finishScale: 2.6 },
  chatons: false,
};

export class Movement {
  constructor(spec) {
    this.spec = spec;
    this.look = { ...DEFAULT_LOOK, ...(spec.look || {}) };
    this.root = new THREE.Group();
    this.parts = new Map();     // id -> part record
    this.arbors = new Map();
    this.updaters = [];
    this.pickables = [];
    this.R = spec.plate?.R ?? spec.specs.diameter / 2;
    this.z = { plateTop: 0, plateBottom: -(spec.plate?.thick ?? 1.4) };
    this.jewelCount = 0;
    this.bridgeShapes = [];
    this.labels = [];
    this.solveTrain();
    this.buildPlate();
    this.buildTrain();
    this.buildEscapement();
    this.buildBridges();
    this.buildMotionWorks();
    this.buildKeyless();
    this.buildDial();
    if (spec.rotor) this.buildRotor();
    for (const c of spec.complications || []) {
      const fn = COMPLICATIONS[c.type];
      if (fn) fn(this, c);
      else console.warn('unknown complication', c.type);
    }
    this.root.traverse(o => { if (o.isMesh) { o.castShadow ??= true; o.receiveShadow = true; } });
    this.assignMeshes();
  }

  // Every mesh belongs to its nearest ancestor part group (nested parts keep their own meshes).
  assignMeshes() {
    this.pickables = [];
    const walk = (o, id) => {
      if (o.userData.partGroup) id = o.userData.partId;
      if (o.isMesh || o.isInstancedMesh) { o.userData.partId = id; if (id) this.pickables.push(o); }
      for (const c of o.children) walk(c, id);
    };
    walk(this.root, null);
  }

  // Discs swept by moving parts below the bridges: pillars and screws must avoid them.
  keepOut() {
    const out = [];
    for (const a of this.arbors.values()) {
      if (a.virtual) continue;
      const r = a.escapement ? (a.escapement.r ?? 2) : a.type === 'barrel' ? a.wheel.r : (a.wheel?.r ?? a.pinion?.r ?? 0.5);
      out.push({ x: a.pos[0], y: a.pos[1], r: r + 0.5 });
    }
    const bp = this.arbors.get('balance');
    if (bp) out.push({ x: bp.pos[0], y: bp.pos[1], r: (this.spec.balance?.r ?? 5) + 0.6 });
    const pp = this.arbors.get('pallet');
    if (pp && this.esc) out.push({ x: pp.pos[0], y: pp.pos[1], r: (this.esc.Lf ?? 2) + 0.4 });
    return out;
  }

  // ------------------------------------------------------------------ registry helpers
  mat(name, opts) {
    if (typeof name === 'object' && name.isMaterial) return name;
    if (typeof name === 'object') return metal(name.metal, name);
    if (name === 'silicon') return silicon();
    if (name === 'ruby') return ruby();
    return metal(name, opts);
  }

  addPart(id, { name, desc = '', group, layer = 0, kind = 'part', stats, material, teeth, arbor, focus }) {
    group.userData.partId = id;
    group.userData.partGroup = true;
    const rec = { id, name, desc, group, layer, kind, stats, material, teeth, arbor, baseZ: group.position.z, focus };
    this.parts.set(id, rec);
    return rec;
  }

  // ------------------------------------------------------------------ train solver
  solveTrain() {
    const items = this.spec.train;
    let anchorK = null;
    for (const it of items) {
      const a = { ...it, pos: [0, 0], k: 1 };
      if (it.wheel) a.wheel = { ...it.wheel };
      if (it.pinion) a.pinion = { ...it.pinion };
      if (it.from && it.at) {
        // designer gives both pivot positions: derive the module from the centre distance,
        // which sizes the driving wheel and this pinion together (how calibres are drawn).
        const p = this.arbors.get(it.from);
        const cd = Math.hypot(it.at[0] - p.pos[0], it.at[1] - p.pos[1]);
        const m = 2 * cd / (p.wheel.teeth + a.pinion.leaves);
        p.wheel.r = m * p.wheel.teeth / 2;
        a.pinion.r = m * a.pinion.leaves / 2;
        a.pinion.module = m;
        a.cd = cd;
        a.pos = it.at.slice();
        a.k = -p.k * p.wheel.teeth / a.pinion.leaves;
        a.parent = p.id;
        a.meshDir = Math.atan2(it.at[1] - p.pos[1], it.at[0] - p.pos[0]);
      } else if (it.from) {
        const p = this.arbors.get(it.from);
        const drv = p.wheel;
        const m = 2 * drv.r / drv.teeth;
        a.pinion.r = m * a.pinion.leaves / 2;
        a.pinion.module = m;
        const cd = drv.r + a.pinion.r;
        a.cd = cd;
        const d = v2(it.dir * D2R);
        a.pos = [p.pos[0] + d[0] * cd, p.pos[1] + d[1] * cd];
        a.k = -p.k * drv.teeth / a.pinion.leaves;
        a.parent = p.id;
        a.meshDir = it.dir * D2R;
      } else if (it.at) a.pos = it.at.slice();
      else if (it.fixedTo) { // epicyclic / fixed wheel
        a.pos = this.arbors.get(it.fixedTo).pos.slice();
        a.k = 0;
      }
      if (it.rph !== undefined) anchorK = { id: it.id, rph: it.rph };
      this.arbors.set(it.id, a);
    }
    if (anchorK) {
      const s = anchorK.rph / this.arbors.get(anchorK.id).k;
      for (const a of this.arbors.values()) a.k *= s;    // rev / hour
    }
    // mesh phases
    for (const a of this.arbors.values()) {
      a.wheelPhase = a.wheelPhase ?? 0;
      a.pinionPhase = 0;
      if (a.parent) {
        const p = this.arbors.get(a.parent);
        const beta = a.meshDir;
        // driver tooth points at beta when driven gap points at beta+π
        const zB = a.pinion.leaves;
        a.pinionPhase = beta + Math.PI - Math.PI / zB - (a.k / p.k) * (beta - p.wheelPhase);
      }
    }
    const esc = [...this.arbors.values()].find(a => a.escapement);
    this.escArbor = esc;
    if (esc) {
      const e = esc.escapement;
      this.vphCheck = 2 * Math.abs(esc.k) * e.teeth * (e.type === 'glide' ? 0 : 1);
    }
  }

  // validation text for the info drawer
  trainReport() {
    const lines = [];
    const arr = [...this.arbors.values()];
    for (const a of arr) {
      if (!a.parent) continue;
      const p = this.arbors.get(a.parent);
      lines.push({ from: p.name || p.id, to: a.name || a.id, ratio: `${p.wheel.teeth}/${a.pinion.leaves}`, value: p.wheel.teeth / a.pinion.leaves });
    }
    return lines;
  }

  rph(id) { return this.arbors.get(id)?.k ?? 0; }

  // ------------------------------------------------------------------ plate
  buildPlate() {
    const sp = this.spec.plate || {};
    const thick = -this.z.plateBottom;
    const outline = sp.outline ? G.roundedPolygon(sp.outline) : G.discOutline(this.R);
    const holes = (sp.holes || []).map(h => ({ x: h[0], y: h[1], r: h[2] }));
    const geo = G.plateGeometry(outline, holes, thick, 0.08);
    const m = P.mesh(geo, this.mat(this.look.plate));
    m.position.z = this.z.plateBottom;
    const g = new THREE.Group(); g.add(m);
    this.root.add(g);
    this.plateOutline = outline;
    this.addPart('mainplate', {
      name: 'Main plate (pillar plate)', layer: 0, kind: 'plate', group: g,
      desc: 'The foundation of the movement. Every wheel pivots between a jewel set in this plate and one in a bridge above it. The dial and motion works sit on its other side.',
      material: m.material.userData.label,
    });
  }

  // ------------------------------------------------------------------ train wheels
  buildTrain() {
    const L = this.look;
    for (const a of this.arbors.values()) {
      const g = new THREE.Group();
      g.position.set(a.pos[0], a.pos[1], 0);
      this.root.add(g);
      a.group = g;
      a.rot = new THREE.Group(); g.add(a.rot);
      const zw = a.z ?? 0.8;
      if (a.type === 'barrel') { this.buildBarrel(a); continue; }
      if (a.wheel && !a.escapement) {
        const w = a.wheel;
        const geo = G.wheelGeometry({ z: w.teeth, rp: w.r, thick: w.thick ?? 0.2, spokes: w.spokes ?? 5, curve: w.curve ?? 0, kind: w.kind || 'wheel' });
        const m = P.mesh(geo, this.mat(w.mat || L.wheels));
        m.position.z = zw;
        a.wheelMesh = m;
        a.rot.add(m);
      }
      if (a.noArbor) { this.addPart(a.id + '_x', { name: a.name || a.id, group: g, layer: 1, kind: 'wheel' }); continue; }
      if (a.pinion && a.type !== 'fixed') {
        const p = a.pinion;
        const pz = p.z ?? (this.arbors.get(a.parent)?.z ?? 0.8) - 0.15;
        const len = p.length ?? 0.55;
        const m = P.mesh(G.pinionGeometry({ z: p.leaves, rp: p.r, length: len }), this.mat(L.pinions));
        m.position.z = pz;
        a.pinionMesh = m;
        a.rot.add(m);
        a.pinionZ = pz;
      }
      // arbor between plate and the bridge that carries it
      const carrier = (this.spec.bridges || []).find(b => (b.covers || []).includes(a.id));
      const top = a.top ?? (carrier ? (carrier.z ?? 2.4) : 2.4);
      if (a.type !== 'fixed') {
        const arb = P.mesh(G.cylinderZ(a.arborR ?? 0.16, top - 0.05, 12), this.mat('steel'));
        arb.position.z = 0.05;
        arb.userData.noClash = true;
        a.rot.add(arb);
        // lower jewel in the plate
        const jw = P.jewel({ r: 0.5, gem: this.look.jewels === 'none' ? 'none' : 'ruby' });
        jw.position.z = 0.02;
        g.add(jw);
        this.jewelCount++;
      }
      const isEsc = !!a.escapement;
      if (!isEsc) {
        this.addPart(a.id, {
          name: a.name || a.id, group: g, layer: a.layer ?? 1, kind: 'wheel', arbor: a,
          desc: a.desc || '',
          teeth: a.wheel ? `${a.wheel.teeth} teeth` + (a.pinion ? ` · pinion ${a.pinion.leaves} leaves` : '') : '',
          material: a.wheelMesh?.material.userData.label,
          stats: () => rateText(a.k),
        });
      }
    }
  }

  buildBarrel(a) {
    const L = this.look, w = a.wheel;
    const g = a.group, zb = a.z ?? 0.25;
    // only bridges that pass over the drum constrain its height
    const near = (id) => { const o = this.arbors.get(id); return o && Math.hypot(o.pos[0] - a.pos[0], o.pos[1] - a.pos[1]) < w.r + 3.5; };
    const lowest = Math.min(...(this.spec.bridges || []).filter(b => (b.covers || []).some(near) || b.sdf).map(b => b.z ?? 2.4), 99);
    const h = Math.min(a.h ?? 2.0, lowest - 0.12 - zb);
    const m = 2 * w.r / w.teeth;
    const outerR = w.r - 1.9 * m;
    const drum = new THREE.Group();
    // toothed rim at the bottom of the drum
    const teeth = P.mesh(G.wheelGeometry({ z: w.teeth, rp: w.r, thick: 0.35, spokes: 0, hole: outerR * 0.95 }), this.mat(w.mat || L.wheels));
    teeth.position.z = zb;
    drum.add(teeth);
    const wall = P.mesh(G.ringGeometry({ ro: outerR, ri: outerR - 0.35, thick: h, seg: 96 }), this.mat(w.mat || L.wheels));
    wall.position.z = zb;
    drum.add(wall);
    const floor = P.mesh(G.ringGeometry({ ro: outerR, ri: 0.9, thick: 0.18 }), this.mat(w.mat || L.wheels));
    floor.position.z = zb;
    drum.add(floor);
    // barrel cover (sapphire on some haute horlogerie pieces, metal otherwise)
    const cover = P.mesh(G.ringGeometry({ ro: outerR - 0.1, ri: 0.9, thick: 0.18 }), a.openBarrel ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false }) : this.mat(w.mat || L.wheels));
    cover.position.z = zb + h - 0.18;
    drum.add(cover);
    a.cover = cover;
    a.rot.add(drum);
    // mainspring (visible in x-ray mode or with open barrel)
    const ms = new P.Mainspring({ ra: 0.95, rb: outerR - 0.4, turns: a.springTurns ?? 13, z: zb + 0.25, h: h - 0.55, mat: metal('steelMatte').clone() });
    ms.mesh.visible = !!a.openBarrel;
    g.add(ms.mesh);
    a.mainspring = ms;
    const arbor = P.mesh(G.cylinderZ(0.9, h + 0.6, 24), this.mat('steel'));
    arbor.position.z = zb - 0.2;
    arbor.userData.noClash = true;
    a.arborMesh = arbor;
    g.add(arbor);
    this.addPart(a.id, {
      name: a.name || 'Mainspring barrel', group: g, layer: 1, kind: 'barrel', arbor: a,
      desc: a.desc || 'A toothed drum holding the coiled mainspring. Winding turns the arbor inside; the spring pulls the drum round, and its teeth drive the centre pinion. This is the only source of power in the watch.',
      teeth: `${w.teeth} teeth`, material: teeth.material.userData.label,
      stats: () => rateText(a.k) + ` · ${(this.sim ? this.sim.wind * this.spec.specs.reserve : 0).toFixed(1)} h stored`,
    });
  }

  // ------------------------------------------------------------------ escapement
  buildEscapement() {
    const a = this.escArbor;
    if (!a) return;
    const e = a.escapement;
    const fn = ESCAPEMENTS[e.type];
    this.esc = fn(this, a, e);
    if (this.esc.balancePos) this.arbors.set('balance', { id: 'balance', pos: this.esc.balancePos, virtual: true });
    if (this.esc.palletPos) this.arbors.set('pallet', { id: 'pallet', pos: this.esc.palletPos, virtual: true });
  }

  // ------------------------------------------------------------------ bridges
  buildBridges() {
    const L = this.look;
    const bmat = this.mat(L.bridges);
    const ordered = (this.spec.bridges || []).slice().sort((p, q) => (p.covers?.length ?? 0) - (q.covers?.length ?? 0));
    for (const b of ordered) {
      const circles = [];
      for (const c of b.covers || []) {
        const a = this.arbors.get(c);
        if (!a) { console.warn('bridge covers unknown', c); continue; }
        circles.push({ x: a.pos[0], y: a.pos[1], r: b.padR ?? 1.6, id: c });
      }
      for (const e of b.extra || []) circles.push({ x: e[0], y: e[1], r: e[2] ?? 1.6, break: e[3] });
      if (b.chain === false) circles.forEach(c => c.break = true);
      let outline;
      if (b.sdf) outline = G.sdfOutline(b.sdf, [-this.R, -this.R, this.R, this.R], 0.06);
      else if (b.outline) outline = G.roundedPolygon(b.outline);
      else if (b.shape === 'hull') outline = G.circleHull(circles);
      else outline = G.blobOutline(circles, { waist: b.waist ?? 0.25 });
      // clip to plate circle
      outline = outline.map(([x, y]) => { const r = Math.hypot(x, y), lim = this.R - 0.25; return r > lim ? [x / r * lim, y / r * lim] : [x, y]; });
      const z0 = b.z ?? 2.4, th = b.thick ?? 0.9;
      // carve around bridges/cocks already built at an overlapping height, keeping our own pivots
      const rivals = this.bridgeShapes.filter(o => o.z0 < z0 + th - 0.02 && o.z1 > z0 + 0.02);
      if (rivals.length && !b.noCarve) {
        const own = G.polySDF(outline);
        const rs = rivals.map(o => G.polySDF(o.outline));
        const keep = circles.filter(c => c.id).map(c => ({ x: c.x, y: c.y, r: 0.8 }));
        const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
        const fn = (x, y) => {
          let d = own(x, y);
          for (const r of rs) d = Math.max(d, 0.3 - r(x, y));
          for (const k of keep) d = Math.min(d, Math.hypot(x - k.x, y - k.y) - k.r);
          return d;
        };
        outline = G.sdfOutline(fn, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], 0.08);
      }
      this.bridgeShapes.push({ outline, z0, z1: z0 + th });
      const holes = (b.holes || []).map(h => ({ x: h[0], y: h[1], r: h[2] }));
      const geo = G.plateGeometry(outline, holes, th, b.bevel ?? 0.07);
      const mat = b.look ? this.mat(b.look) : bmat;
      const m = P.mesh(geo, mat);
      const g = new THREE.Group();
      m.position.z = z0;
      g.add(m);
      // jewels for carried pivots
      for (const c of circles) {
        if (!c.id) continue;
        const a = this.arbors.get(c.id);
        if (a?.noJewel) continue;
        const isBal = c.id === 'balance';
        if (isBal) continue; // balance has its own shock setting
        const jw = P.jewel({ r: 0.5, chaton: L.chatons && (b.chatons ?? true), screwMat: this.mat(L.screws), gem: L.jewels === 'none' ? 'none' : 'ruby' });
        jw.position.set(c.x, c.y, z0 + th + 0.01);
        g.add(jw);
        this.jewelCount++;
      }
      // screws, auto-placed far from pivots, plus pillars down to the plate
      const scr = b.screws ?? autoScrews(outline, circles, b.screwCount ?? 2, z0 > 0.3 ? this.keepOut() : []);
      for (const [sx, sy] of scr) {
        const s = P.screw({ r: 0.5, mat: this.mat(L.screws) });
        s.position.set(sx, sy, z0 + th);
        g.add(s);
        if (z0 > 0.3) {
          const pil = P.mesh(G.cylinderZ(0.55, z0, 16), mat);
          pil.position.set(sx, sy, 0);
          g.add(pil);
        }
      }
      if (b.engraving) {
        // gilt engraved lettering on bridges
        this.engraveText(g, b.engraving, z0 + th + 0.005, outline, b.engravingAt);
      }
      this.root.add(g);
      this.addPart(b.id, { name: b.name || b.id, group: g, layer: b.layer ?? 3, kind: 'bridge', desc: b.desc || 'A bridge carries the upper pivots of the wheels below it, set in jewels.', material: mat.userData.label });
      if (b.under) this.parts.get(b.id).under = true;
    }
  }

  engraveText(g, text, z, outline, at) {
    const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
    let cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    if (at) [cx, cy] = at;
    const w = 9, h = 1.4;
    const t = canvasTexture(1024, 160, (ctx, W, H) => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#e8c878';
      let fs = 92;
      ctx.font = `600 ${fs}px "Cormorant Garamond", Georgia, serif`;
      const tw = ctx.measureText(text.toUpperCase()).width;
      if (tw > W * 0.94) { fs *= W * 0.94 / tw; ctx.font = `600 ${fs}px "Cormorant Garamond", Georgia, serif`; }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text.toUpperCase(), W / 2, H / 2 + 6);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, metalness: 1, roughness: 0.25, depthWrite: false }));
    m.position.set(cx, cy, z);
    g.add(m);
  }

  // ------------------------------------------------------------------ motion works (dial side)
  buildMotionWorks() {
    const mw = this.spec.motionWorks;
    if (!mw) return;
    const c = mw.at ? mw.at : (this.arbors.get(mw.on || 'center')?.pos || [0, 0]);
    const zc = this.z.plateBottom;
    const mod = mw.module ?? 0.11;
    const cannon = { teeth: mw.cannon ?? 12 }, minute = { teeth: mw.minute ?? 36, pinion: mw.minutePinion ?? 10 }, hour = { teeth: mw.hour ?? 40 };
    const rc = mod * cannon.teeth / 2, rm = mod * minute.teeth / 2, rmp = mod * 1.2 * minute.pinion / 2, rh = mod * 1.2 * hour.teeth / 2;
    const cd1 = rc + rm;
    const d = v2((mw.dir ?? 200) * D2R);
    const mpos = [c[0] + d[0] * cd1, c[1] + d[1] * cd1];
    const mwg = new THREE.Group();
    this.root.add(mwg);
    // cannon pinion
    const cg = new THREE.Group(); cg.position.set(c[0], c[1], 0);
    const cannonMesh = P.mesh(G.pinionGeometry({ z: cannon.teeth, rp: rc, length: 0.45 }), this.mat('steel'));
    cannonMesh.position.z = zc - 0.55;
    const tube = P.mesh(G.cylinderZ(0.42, 1.6, 20), this.mat('steel'));
    tube.position.z = zc - 1.9;
    cg.add(cannonMesh, tube);
    mwg.add(cg);
    // minute wheel + pinion
    const mg = new THREE.Group(); mg.position.set(mpos[0], mpos[1], 0);
    const mwm = P.mesh(G.wheelGeometry({ z: minute.teeth, rp: rm, thick: 0.18, spokes: 0 }), this.mat(this.look.wheels));
    mwm.position.z = zc - 0.5;
    const mpm = P.mesh(G.pinionGeometry({ z: minute.pinion, rp: rmp, length: 0.4 }), this.mat('steel'));
    mpm.position.z = zc - 0.95;
    mg.add(mwm, mpm);
    mwg.add(mg);
    // hour wheel
    const hg = new THREE.Group(); hg.position.set(c[0], c[1], 0);
    const hwm = P.mesh(G.wheelGeometry({ z: hour.teeth, rp: rh, thick: 0.16, spokes: 0, hole: 0.55 }), this.mat(this.look.wheels));
    hwm.position.z = zc - 0.9;
    const hpipe = P.mesh(G.ringGeometry({ ro: 0.62, ri: 0.46, thick: 1.0 }), this.mat(this.look.wheels));
    hpipe.position.z = zc - 1.75;
    hg.add(hwm, hpipe);
    mwg.add(hg);
    // phases so the teeth interleave
    const beta = (mw.dir ?? 200) * D2R;
    const kC = 1, kM = -cannon.teeth / minute.teeth, kH = -kM * minute.pinion / hour.teeth;
    const phM = beta + Math.PI - Math.PI / minute.teeth - (kM / kC) * beta;
    const phH = (beta + Math.PI) + Math.PI - Math.PI / hour.teeth - (kH / kM) * (beta + Math.PI - (phM));
    this.motion = { cg, mg, hg, kM, kH, phM, phH, center: c, cannon, minute, hour };
    const desc = `Cannon pinion ${cannon.teeth} → minute wheel ${minute.teeth}, minute pinion ${minute.pinion} → hour wheel ${hour.teeth}: (${minute.teeth}/${cannon.teeth}) × (${hour.teeth}/${minute.pinion}) = ${(minute.teeth / cannon.teeth * hour.teeth / minute.pinion).toFixed(0)} : 1.`;
    this.addPart('motionworks', {
      name: 'Motion works', group: mwg, layer: -1, kind: 'wheel',
      desc: 'Under the dial. The cannon pinion rides on the centre arbor with a friction fit, so the hands can be set without moving the train. It drives the hour wheel 12 times slower. ' + desc,
      teeth: desc, stats: () => 'Cannon pinion 1 rev/h · hour wheel 1 rev/12 h',
    });
  }

  // ------------------------------------------------------------------ keyless works / crown
  buildKeyless() {
    const kw = this.spec.keyless;
    if (!kw) return;
    const ang = (kw.crownAngle ?? 180) * D2R;   // world angle of crown direction (3 o'clock = 180°)
    const L = this.look;
    const g = new THREE.Group();
    this.root.add(g);
    const crownMat = this.mat(kw.crownMat || 'steel');
    const cr = P.crown(kw.crownR ?? 2.4, 2.4, crownMat);
    const crownDist = this.R + (kw.crownGap ?? 1.4);
    cr.position.set(Math.cos(ang) * crownDist, Math.sin(ang) * crownDist, this.z.plateBottom / 2);
    cr.rotation.z = ang;
    const crOuter = new THREE.Group();   // part container (moved by assembly); cr slides inside it
    crOuter.add(cr);
    g.add(crOuter);
    this.crown = { group: cr, ang, dist: crownDist, pos: 0, spin: 0 };
    this.addPart('crown', { name: 'Crown & winding stem', group: crOuter, layer: 0, kind: 'crown', desc: 'Turn to wind the mainspring through the winding pinion, crown wheel and ratchet wheel. Pull out to set the hands: the sliding pinion shifts to the setting wheels, and on hacking calibres a lever stops the balance.' });

    // ratchet wheel concentric with the barrel arbor, on top of the barrel bridge, plus crown wheel
    const barrel = this.arbors.get(kw.barrel || 'barrel');
    if (barrel) {
      const zt = kw.z ?? 3.35;
      const rr = kw.ratchetR ?? Math.min(5.5, barrel.wheel.r * 0.72);
      const kg = new THREE.Group();   // whole keyless top assembly (one part)
      g.add(kg);
      const rg = new THREE.Group(); rg.position.set(barrel.pos[0], barrel.pos[1], 0);
      const ratchet = P.mesh(G.wheelGeometry({ z: kw.ratchet ?? 56, rp: rr, thick: 0.4, spokes: 0, kind: 'wheel', hole: 0.6 }), this.mat(L.ratchet));
      ratchet.position.z = zt;
      const rs = new THREE.Group(); rs.add(ratchet);
      const scr = P.screw({ r: 0.9, mat: this.mat(L.screws) });
      scr.position.z = zt + 0.4;
      rs.add(scr);
      rg.add(rs);
      kg.add(rg);
      // crown wheel toward the crown
      const rcw = kw.crownWheelR ?? rr * 0.55;
      const cd = rr + rcw;
      let cwAng = ang + (kw.crownWheelOffset ?? 0) * D2R;
      // place along the line toward the crown
      const dx = Math.cos(ang) * this.R - barrel.pos[0], dy = Math.sin(ang) * this.R - barrel.pos[1];
      cwAng = Math.atan2(dy, dx) + (kw.crownWheelOffset ?? 0) * D2R;
      const cwp = [barrel.pos[0] + Math.cos(cwAng) * cd, barrel.pos[1] + Math.sin(cwAng) * cd];
      const cwg = new THREE.Group(); cwg.position.set(cwp[0], cwp[1], 0);
      const cwm = P.mesh(G.wheelGeometry({ z: kw.crownWheel ?? 35, rp: rcw, thick: 0.4, spokes: 0, hole: 0.4 }), this.mat(L.ratchet));
      cwm.position.z = zt;
      const cws = new THREE.Group(); cws.add(cwm);
      const s2 = P.screw({ r: 0.6, mat: this.mat(L.screws) }); s2.position.z = zt + 0.4; cws.add(s2);
      cwg.add(cws);
      kg.add(cwg);
      // click (pawl) + spring
      const ca = cwAng + 1.4;
      const clickPos = [barrel.pos[0] + Math.cos(ca) * (rr + 0.9), barrel.pos[1] + Math.sin(ca) * (rr + 0.9)];
      const click = P.mesh(G.extrudeOutline(G.strokeOutline([[0, 0], [-1.2, 0.25], [-1.8, 0.05]], [0.45, 0.3, 0.12]), 0.35, 0.04), this.mat(L.ratchet.metal ? { metal: 'steel' } : 'steel'));
      const clickG = new THREE.Group(); clickG.position.set(clickPos[0], clickPos[1], zt);
      clickG.rotation.z = ca + Math.PI / 2;
      clickG.add(click);
      kg.add(clickG);
      const kz = [-(kw.crownWheel ?? 35) / (kw.ratchet ?? 56)];
      this.keyless = { rs, cws, ratio: (kw.ratchet ?? 56) / (kw.crownWheel ?? 35), clickG, ca, cwAngPhase: cwAng };
      this.addPart('ratchet', { name: 'Ratchet wheel & crown wheel', group: kg, layer: 4, kind: 'keyless', desc: `Winding: crown → winding pinion → crown wheel (${kw.crownWheel ?? 35}) → ratchet wheel (${kw.ratchet ?? 56}) on the barrel arbor. The click stops the spring unwinding backwards — that is the "zzzt" you feel when winding.`, teeth: `Ratchet ${kw.ratchet ?? 56} · crown wheel ${kw.crownWheel ?? 35}`, material: ratchet.material.userData.label });
    }
  }

  // ------------------------------------------------------------------ dial & hands
  buildDial() {
    const d = this.spec.dial;
    if (!d) return;
    const zDial = this.z.plateBottom - (d.gap ?? 2.2);
    const R = d.R ?? this.R + 0.4;
    const g = new THREE.Group();
    this.root.add(g);
    const sub = d.subSeconds ? this.arbors.get(d.subSeconds)?.pos : null;
    const tex = canvasTexture(2048, 2048, (ctx, W, H) => drawDial(ctx, W, H, R, d, sub, this));
    const mat = new THREE.MeshPhysicalMaterial({ alphaTest: d.apertures ? 0.5 : 0, map: tex, roughness: d.rough ?? 0.35, metalness: d.metal ?? 0, clearcoat: d.clearcoat ?? 0.8, clearcoatRoughness: 0.08, transparent: true, side: THREE.FrontSide, envMapIntensity: 1.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: d.glow ?? 0.18 });
    const geo = new THREE.CircleGeometry(R, 160);
    const dial = new THREE.Mesh(geo, mat);
    dial.rotation.y = Math.PI;
    dial.position.z = zDial;
    dial.receiveShadow = true;
    g.add(dial);
    // back of dial (visible from movement side through gaps)
    const back = new THREE.Mesh(new THREE.CircleGeometry(R, 120), this.mat('brass', { roughness: 0.6 }));
    if (d.apertures || this.spec.complications?.some(c => ['wanderingHour', 'jumpHourRetro'].includes(c.type))) { back.visible = false; mat.side = THREE.DoubleSide; }
    back.position.z = zDial + 0.01;
    g.add(back);
    this.dialMat = mat;
    this.addPart('dial', { name: 'Dial', group: g, layer: -2, kind: 'dial', desc: d.desc || 'The dial. Toggle it off to look at the motion works beneath.' });
    // hands
    const hm = this.mat(d.handMat || 'blued');
    const hands = new THREE.Group();
    const hl = R * (d.hourLen ?? 0.55), ml = R * (d.minuteLen ?? 0.86);
    const style = d.hands || 'leaf';
    this.hourHand = P.hand(style, hl, d.handW ?? 0.7, hm, { tail: 0, hub: 0.95 });
    this.hourHand.position.set(this.motion?.center[0] ?? 0, this.motion?.center[1] ?? 0, zDial - 0.25);
    this.minuteHand = P.hand(style, ml, (d.handW ?? 0.7) * 0.75, hm, { tail: 0, hub: 0.75 });
    this.minuteHand.position.set(this.motion?.center[0] ?? 0, this.motion?.center[1] ?? 0, zDial - 0.45);
    hands.add(this.hourHand, this.minuteHand);
    if (d.subSeconds) {
      const p = this.arbors.get(d.subSeconds).pos;
      this.secondsHand = P.hand('needle', (d.subR ?? 3.2) * 0.95, 0.22, hm, { tail: 0.8, hub: 0.38 });
      this.secondsHand.position.set(p[0], p[1], zDial - 0.25);
      this.secondsArbor = d.subSeconds;
      hands.add(this.secondsHand);
    } else if (d.centerSeconds) {
      this.secondsHand = P.hand('needle', R * 0.92, 0.2, this.mat(d.secondsMat || d.handMat || 'blued'), { tail: R * 0.2, hub: 0.45 });
      this.secondsHand.position.set(0, 0, zDial - 0.65);
      this.secondsArbor = d.centerSeconds;
      hands.add(this.secondsHand);
    }
    if (d.noHands) { this.hourHand.visible = this.minuteHand.visible = false; }
    g.add(hands);
    this.zDial = zDial;
    this.addPart('hands', { name: 'Hands', group: hands, layer: -3, kind: 'hands', desc: `Hour and minute hands on the hour wheel pipe and cannon pinion. Material: ${hm.userData.label}.` });
  }

  // ------------------------------------------------------------------ automatic rotor
  buildRotor() {
    const r = this.spec.rotor;
    const g = new THREE.Group();
    const R = r.R ?? this.R - 0.6;
    const z = r.z ?? 4.0;
    const at = r.at ?? [0, 0];
    g.position.set(at[0], at[1], z);
    const spin = new THREE.Group();
    g.add(spin);
    // half-disc oscillating weight
    const pts = [];
    const a0 = -Math.PI * 0.08, a1 = Math.PI * 1.08;
    for (let i = 0; i <= 64; i++) { const a = a0 + (a1 - a0) * i / 64; pts.push([Math.cos(a) * R, Math.sin(a) * R]); }
    for (let i = 64; i >= 0; i--) { const a = a0 + (a1 - a0) * i / 64; pts.push([Math.cos(a) * (R * 0.2), Math.sin(a) * (R * 0.2)]); }
    const plate = P.mesh(G.extrudeOutline(G.roundedPolygon(pts.map(p => [...p, 0]), 2), 0.5, 0.05, (r.cutouts || []).map(c => ({ x: c[0], y: c[1], r: c[2] }))), this.mat(r.look || this.look.rotor));
    spin.add(plate);
    // heavy rim segment (tungsten or gold)
    const segPts = [];
    for (let i = 0; i <= 64; i++) { const a = a0 + (a1 - a0) * i / 64; segPts.push([Math.cos(a) * R, Math.sin(a) * R]); }
    for (let i = 64; i >= 0; i--) { const a = a0 + (a1 - a0) * i / 64; segPts.push([Math.cos(a) * (R - (r.rimW ?? 2.2)), Math.sin(a) * (R - (r.rimW ?? 2.2))]); }
    const rim = P.mesh(G.extrudeOutline(segPts, 1.1, 0.08), this.mat(r.rimMat || 'gold'));
    rim.position.z = -0.6;
    spin.add(rim);
    // ball-bearing hub: outer race, balls, inner race and three screws
    const race = P.mesh(G.ringGeometry({ ro: R * 0.2, ri: R * 0.15, thick: 0.75, bevel: 0.05 }), this.mat('steel'));
    race.position.z = -0.1;
    g.add(race);
    const inner = P.mesh(G.ringGeometry({ ro: R * 0.1, ri: R * 0.04, thick: 0.8, bevel: 0.04 }), this.mat('steel'));
    inner.position.z = -0.1;
    g.add(inner);
    for (let i = 0; i < 10; i++) {
      const a = i * TAU / 10;
      const ball = P.mesh(new THREE.SphereGeometry(R * 0.022, 12, 8), this.mat('steel'));
      ball.position.set(Math.cos(a) * R * 0.125, Math.sin(a) * R * 0.125, 0.45);
      spin.add(ball);
    }
    for (let i = 0; i < 3; i++) {
      const s = P.screw({ r: 0.32, mat: this.mat(this.look.screws) });
      const a = i * TAU / 3;
      s.position.set(Math.cos(a) * R * 0.075, Math.sin(a) * R * 0.075, 0.72);
      g.add(s);
    }
    if (r.text) this.engraveText(spin, r.text, 0.51, [[-R * 0.8, R * 0.2], [R * 0.8, R * 0.2], [R * 0.8, R * 0.85], [-R * 0.8, R * 0.85]]);
    this.root.add(g);
    this.rotor = { g, spin, angle: 0, vel: 0 };
    this.addPart('rotor', { name: 'Oscillating weight (rotor)', group: g, layer: 6, kind: 'rotor', desc: r.desc || 'The rotor swings with every movement of the wrist. Through reversing wheels it winds the mainspring in both directions of rotation.', material: plate.material.userData.label });
  }

  // ------------------------------------------------------------------ per-frame update
  // H: train hours (float). setOffset: hand setting offset (hours). state: sim state.
  update(state, H, Hd, dt) {
    for (const a of this.arbors.values()) {
      if (!a.rot || a.virtual) continue;
      const ang = TAU * a.k * H;
      if (a.wheelMesh) a.wheelMesh.rotation.z = ang + a.wheelPhase;
      if (a.pinionMesh) a.pinionMesh.rotation.z = ang + a.pinionPhase;
      if (a.type === 'barrel') {
        a.rot.rotation.z = ang;
        const reserveTurns = this.spec.specs.reserve / Math.abs(1 / a.k);
        const arborAng = ang + Math.sign(a.k) * state.wind * reserveTurns * TAU;
        a.arborMesh.rotation.z = arborAng;
        a.mainspring.update(state.wind, arborAng);
        this.barrelArborAngle = arborAng;
      } else if (!a.wheelMesh && !a.pinionMesh) a.rot.rotation.z = ang;
      else {
        // arbor itself (non-symmetric details) follows the wheel
        a.rot.children.forEach(c => { if (c !== a.wheelMesh && c !== a.pinionMesh) c.rotation.z = ang; });
      }
    }
    if (this.esc) this.esc.update(state, H, dt);
    // motion works & hands
    if (this.motion) {
      const m = this.motion;
      const ac = TAU * Hd;
      m.cg.rotation.z = ac;
      m.mg.rotation.z = ac * m.kM + m.phM;
      m.hg.rotation.z = ac * m.kH + m.phH;
    }
    // hands: clockwise as seen from the dial side (−z) is a +z rotation
    if (this.minuteHand) this.minuteHand.rotation.z = TAU * Hd;
    if (this.hourHand) this.hourHand.rotation.z = TAU * Hd / 12;
    if (this.secondsHand) {
      const k = this.arbors.get(this.secondsArbor)?.k ?? 60;
      this.secondsHand.rotation.z = TAU * k * H;
    }
    // keyless
    if (this.keyless && this.barrelArborAngle !== undefined) {
      this.keyless.rs.rotation.z = this.barrelArborAngle;
      this.keyless.cws.rotation.z = -this.barrelArborAngle * this.keyless.ratio;
    }
    if (this.crown) {
      const c = this.crown;
      const out = c.pos * 1.0;
      c.group.position.set(Math.cos(c.ang) * (c.dist + out), Math.sin(c.ang) * (c.dist + out), this.z.plateBottom / 2);
      c.group.children[0].rotation.x = c.spin;
    }
    for (const u of this.updaters) u(state, H, Hd, dt);
  }
}

// ----------------------------------------------------------------------------- helpers
export function rateText(k) {
  const a = Math.abs(k);
  if (a === 0) return 'Stationary (fixed wheel)';
  const per = 3600 / a;
  const perTxt = per >= 3600 ? (per / 3600).toFixed(per >= 36000 ? 1 : 2) + ' h' : per >= 60 ? (per / 60).toFixed(2) + ' min' : per.toFixed(per < 10 ? 2 : 1) + ' s';
  return `${a >= 100 ? a.toFixed(0) : a.toFixed(a < 1 ? 4 : 2)} rev/h · one turn every ${perTxt} · ${k > 0 ? 'clockwise' : 'anticlockwise'} (from dial)`;
}

function autoScrews(outline, circles, n, keepOut = []) {
  const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const cands = [];
  for (let x = minX; x <= maxX; x += 0.35) for (let y = minY; y <= maxY; y += 0.35) {
    if (!G.insidePoly(outline, x, y)) continue;
    const de = G.distToPoly(outline, x, y);
    if (de < 0.75) continue;
    const dp = Math.min(...circles.filter(c => c.id).map(c => Math.hypot(x - c.x, y - c.y)), 99);
    if (dp < 1.4) continue;
    if (keepOut.some(k => Math.hypot(x - k.x, y - k.y) < k.r + 0.55)) continue;   // pillar would hit a wheel
    cands.push([x, y, Math.min(de, 1.2) + Math.min(dp, 3) * 0.4]);
  }
  const out = [];
  for (let i = 0; i < n && cands.length; i++) {
    let best = null, bs = -1;
    for (const c of cands) {
      const sep = out.length ? Math.min(...out.map(o => Math.hypot(o[0] - c[0], o[1] - c[1]))) : 10;
      const s = c[2] + Math.min(sep, 8) * 0.6;
      if (sep > 2.2 && s > bs) { bs = s; best = c; }
    }
    if (best) out.push([best[0], best[1]]);
  }
  return out;
}

// Dial artwork. Canvas x right = dial 3 o'clock = world −x.
function drawDial(ctx, W, H, R, d, sub, mov) {
  const S = W / 2 / R;
  const cx = W / 2, cy = H / 2;
  const toC = (x, y) => [cx - x * S, cy - y * S];
  // base
  const base = d.color || '#f3efe6';
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
  if (d.sunray) {
    for (let i = 0; i < 720; i++) {
      const a = i / 720 * TAU;
      ctx.strokeStyle = `rgba(255,255,255,${0.04 + 0.05 * Math.abs(Math.sin(a * 2))})`;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * W, cy + Math.sin(a) * W); ctx.stroke();
    }
  }
  if (d.guilloche) {
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 90; i++) {
      ctx.beginPath();
      for (let k = 0; k <= 360; k++) {
        const a = k / 360 * TAU;
        const r = (R * 0.1 + i * R * 0.0075) * S * (1 + 0.04 * Math.sin(a * 24 + i * 0.3));
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
  const ink = d.ink || '#1b1b1f';
  ctx.fillStyle = ink; ctx.strokeStyle = ink;
  const rr = (R - 1.3) * S;
  if (!d.noTrack) {
    // railway minute track
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, rr - 0.8 * S, 0, TAU); ctx.stroke();
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * TAU - Math.PI / 2;
      ctx.lineWidth = i % 5 ? 2 : 6;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); ctx.lineTo(cx + Math.cos(a) * (rr - 0.8 * S), cy + Math.sin(a) * (rr - 0.8 * S)); ctx.stroke();
    }
  }
  if (d.numerals !== 'none') {
    const roman = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    const arabic = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
    const nr = rr - (d.numerals === 'roman' ? 3.0 : 2.6) * S;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU - Math.PI / 2;
      if (sub && i === 9 && mov && Math.hypot(sub[0], sub[1]) > 3) {
        // skip numeral if covered by subdial (simple check)
      }
      const x = cx + Math.cos(a) * nr, y = cy + Math.sin(a) * nr;
      if (subCovers(sub, R, a, nr / S, d.subR)) continue;
      if ((d.apertures || []).some(([ax, ay, ar]) => subCovers([ax, ay], R, a, nr / S, ar - 1.0))) continue;
      if (d.numerals === 'baton') {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
        ctx.fillStyle = d.indexColor || ink;
        ctx.fillRect(-0.28 * S, -1.2 * S, 0.56 * S, 2.4 * S);
        ctx.restore();
      } else {
        ctx.save(); ctx.translate(x, y);
        if (d.numerals === 'roman') ctx.rotate(a + Math.PI / 2);
        ctx.font = `${d.numerals === 'roman' ? 400 : 500} ${(d.numeralSize ?? 2.4) * S}px ${d.font || '"Cormorant Garamond", Georgia, serif'}`;
        ctx.fillText((d.numerals === 'roman' ? roman : arabic)[i], 0, 0);
        ctx.restore();
      }
    }
  }
  if (sub) {
    const [sx, sy] = toC(sub[0], sub[1]);
    const sr = (d.subR ?? 3.2) * S;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.stroke();
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * TAU - Math.PI / 2;
      const l = i % 5 ? 0.35 : 0.7;
      ctx.lineWidth = i % 5 ? 1.5 : 3;
      ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * sr, sy + Math.sin(a) * sr); ctx.lineTo(sx + Math.cos(a) * (sr - l * S), sy + Math.sin(a) * (sr - l * S)); ctx.stroke();
    }
    ctx.font = `500 ${0.75 * S}px ${d.font || 'Georgia, serif'}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [60, 15, 30, 45].forEach((n, i) => { const a = i / 4 * TAU - Math.PI / 2; ctx.fillText(String(n), sx + Math.cos(a) * (sr - 1.4 * S), sy + Math.sin(a) * (sr - 1.4 * S)); });
  }
  if (d.brand) {
    ctx.font = `600 ${1.25 * S}px "Cormorant Garamond", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = ink;
    ctx.fillText(d.brand, cx, cy - R * 0.35 * S);
    if (d.subtitle) { ctx.font = `400 ${0.65 * S}px "Inter", sans-serif`; ctx.fillText(d.subtitle, cx, cy - R * 0.35 * S + 1.4 * S); }
  }
  if (d.extra) d.extra(ctx, W, H, S, toC);
  for (const [ax, ay, ar] of d.apertures || []) {
    const [px, py] = toC(ax, ay);
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(px, py, ar * S, 0, TAU); ctx.fill(); ctx.restore();
    ctx.strokeStyle = d.apertureRing || '#b8955a'; ctx.lineWidth = 0.25 * S;
    ctx.beginPath(); ctx.arc(px, py, ar * S + 0.12 * S, 0, TAU); ctx.stroke();
  }
}

function subCovers(sub, R, a, nr, subR = 3.2) {
  if (!sub) return false;
  const x = -Math.cos(a) * nr, y = -Math.sin(a) * nr; // canvas->world: x flips, canvas y down -> world y up
  return Math.hypot(x - sub[0], y - sub[1]) < subR + 1.5;
}
