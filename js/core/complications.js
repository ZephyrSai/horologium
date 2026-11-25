// Complications / displays. Each receives (movement, cfg) and adds parts + updaters.
import * as THREE from 'three';
import * as G from './geometry.js';
import * as P from './parts.js';
import { metal, ruby, lacquer } from './materials.js';
import { canvasTexture } from './textures.js';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
// world point at clock angle c (radians clockwise from 12, seen from dial) and radius r
const clockPt = (c, r) => [-r * Math.sin(c), r * Math.cos(c)];

// Plane facing the dial side (−z) that shows a canvas correctly from there
function dialPlane(w, h, tex, mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat || new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, roughness: 0.35, clearcoat: 0.6 }));
  m.rotation.y = Math.PI;
  return m;
}
function dialDisc(r, tex, opts = {}) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 96), new THREE.MeshPhysicalMaterial({ map: tex, transparent: !!opts.transparent, roughness: opts.rough ?? 0.3, metalness: opts.metal ?? 0, clearcoat: 0.7, side: THREE.DoubleSide }));
  m.rotation.y = Math.PI;
  return m;
}

// ----------------------------------------------------------------------------- wandering hour
// Three satellite discs, four numerals each, on a carrier turning once every 3 hours.
// The numeral in the 120° window points at the minutes. A fixed pin indexes each satellite's
// four-arm Geneva (star) wheel by 90° as it passes through the hidden part of the dial.
function wanderingHour(mov, c) {
  const R = mov.R;
  const zD = mov.zDial;
  const carrierR = c.carrierR ?? R * 0.52;
  const satR = c.satR ?? R * 0.3;
  const zc = zD + 0.6;             // carrier just behind the dial
  const g = new THREE.Group();
  mov.root.add(g);
  const carrier = new THREE.Group();
  carrier.position.z = zc;
  g.add(carrier);
  // carrier plate: three-armed, openworked
  const arm = P.mesh(G.ringGeometry({ ro: carrierR + satR * 0.35, ri: carrierR + satR * 0.35 - 0.6, thick: 0.25, spokes: 3, spokeW: 1.2, hub: 2.2, hole: 0.85 }), mov.mat(c.carrierMat || 'titanium'));
  arm.position.z = 0.3;
  carrier.add(arm);
  const sats = [];
  const font = c.font || '"Cormorant Garamond", Georgia, serif';
  for (let i = 0; i < 3; i++) {
    const sg = new THREE.Group();
    const ca = i * TAU / 3;
    const [x, y] = clockPt(ca, carrierR);
    sg.position.set(x, y, 0);
    carrier.add(sg);
    const spin = new THREE.Group();
    sg.add(spin);
    const hours = [0, 1, 2, 3].map(j => ((3 * j - i) % 12 + 12) % 12 || 12);
    const tex = canvasTexture(512, 512, (ctx, W, H) => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = c.discColor || 'rgba(20,24,32,0.92)';
      ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, TAU); ctx.fill();
      for (let i = 0; i < 360; i++) {   // circular brushing
        ctx.strokeStyle = `rgba(255,255,255,${0.02 + 0.03 * Math.abs(Math.sin(i * 0.05))})`;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, i * (W / 2) / 360, 0, TAU); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 8, 0, TAU); ctx.stroke();
      ctx.fillStyle = c.numColor || '#f4e7c5';
      ctx.font = `600 ${W * 0.27}px ${font}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let j = 0; j < 4; j++) {
        // numeral j sits at canvas angle pointing "up" after the disc is rotated by −90°·j
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate(-j * Math.PI / 2);
        ctx.fillText(String(hours[j]), 0, -W * 0.27);
        ctx.restore();
      }
    });
    const disc = dialDisc(satR, tex, { transparent: true });
    disc.position.z = -0.05;
    spin.add(disc);
    // star (Geneva) wheel behind the disc
    const star = [];
    for (let k = 0; k < 4; k++) {
      const a = k * TAU / 4;
      star.push([Math.cos(a) * satR * 0.7, Math.sin(a) * satR * 0.7, 0.25]);
      const b = a + TAU / 8;
      star.push([Math.cos(b) * satR * 0.32, Math.sin(b) * satR * 0.32, 0.4]);
    }
    const sw = P.mesh(G.extrudeOutline(G.roundedPolygon(star), 0.3, 0.04), mov.mat(c.starMat || 'glucydur'));
    sw.position.z = 0.15;
    spin.add(sw);
    sats.push({ sg, spin, i, ca });
  }
  // dark backing ring behind the satellites, so the window frames them against black
  const back = P.mesh(G.ringGeometry({ ro: carrierR + satR + 0.8, ri: Math.max(0.5, carrierR - satR - 0.8), thick: 0.1 }), new THREE.MeshPhysicalMaterial({ color: c.backColor || '#07090d', roughness: 0.6, metalness: 0.2 }));
  back.position.z = zc + 0.95;
  g.add(back);
  // fixed indexing pin at 6 o'clock
  const [px, py] = clockPt(Math.PI, carrierR + satR * 0.62);
  const pin = P.mesh(G.cylinderZ(0.3, 1.2, 12), mov.mat('steel'));
  pin.position.set(px, py, zc - 0.2);
  g.add(pin);
  // dial with a 120° window at the top, minute scale 0-60
  const dialR = R + 0.4;
  const dialTex = canvasTexture(2048, 2048, (ctx, W, H) => {
    const S = W / 2 / dialR, cx = W / 2, cy = H / 2;
    ctx.fillStyle = c.dialColor || '#1d2430';
    ctx.fillRect(0, 0, W, H);
    if (c.dialFinish !== false) {
      for (let i = 0; i < 900; i++) {
        const a = i / 900 * TAU;
        ctx.strokeStyle = `rgba(255,255,255,${0.015 + 0.03 * Math.abs(Math.sin(a * 2))})`;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * W, cy + Math.sin(a) * W); ctx.stroke();
      }
    }
    // cut the window: annulus sector from −60° to +60° (canvas angles measured from up)
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    const r0 = (carrierR + satR * 0.12) * S, r1 = (carrierR + satR + 0.25) * S;
    ctx.arc(cx, cy, r1, -Math.PI / 2 - Math.PI / 3, -Math.PI / 2 + Math.PI / 3);
    ctx.arc(cx, cy, r0, -Math.PI / 2 + Math.PI / 3, -Math.PI / 2 - Math.PI / 3, true);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // minute scale along the outer edge of the window
    ctx.strokeStyle = ctx.fillStyle = c.scaleColor || '#e9dcb8';
    const rs = (carrierR + satR + 0.75) * S;
    for (let m = 0; m <= 60; m++) {
      const a = -Math.PI / 2 - Math.PI / 3 + (m / 60) * (2 * Math.PI / 3);
      const l = m % 15 === 0 ? 1.3 : m % 5 === 0 ? 0.8 : 0.4;
      ctx.lineWidth = m % 5 === 0 ? 5 : 2;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * rs, cy + Math.sin(a) * rs); ctx.lineTo(cx + Math.cos(a) * (rs + l * S), cy + Math.sin(a) * (rs + l * S)); ctx.stroke();
      if (m % 15 === 0) {
        ctx.font = `600 ${1.1 * S}px "Inter", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(m), cx + Math.cos(a) * (rs + 2.3 * S), cy + Math.sin(a) * (rs + 2.3 * S));
      }
    }
    if (c.brand) {
      ctx.font = `600 ${1.5 * S}px "Cormorant Garamond", Georgia, serif`; ctx.textAlign = 'center';
      ctx.fillText(c.brand, cx, cy + R * 0.42 * S);
      ctx.font = `400 ${0.7 * S}px "Inter", sans-serif`;
      ctx.fillText(c.subtitle || 'WANDERING HOUR', cx, cy + R * 0.42 * S + 1.5 * S);
    }
  });
  if (mov.dialMat) {
    mov.dialMat.map = dialTex; mov.dialMat.emissiveMap = dialTex; mov.dialMat.emissiveIntensity = 0.08;
    mov.dialMat.alphaTest = 0.5; mov.dialMat.needsUpdate = true;
  }
  mov.hourHand && (mov.hourHand.visible = false);
  mov.minuteHand && (mov.minuteHand.visible = false);
  // drive: carrier gear meshing with the cannon pinion (visual only)
  mov.addPart('wandering', {
    name: 'Wandering-hour carrier & satellites', group: g, layer: -1.5, kind: 'display',
    desc: 'Three satellite discs ride on a carrier that turns once every three hours, so each satellite sweeps the 120° minute window in exactly one hour. The numeral in the window is the hour; its position on the arc is the minutes. While hidden under the dial, each satellite\'s four-armed star wheel hits a fixed pin and turns 90°, bringing up the hour three later. Satellite A shows 1-4-7-10, B 2-5-8-11, C 3-6-9-12. Variants: 17th-century Campani night clocks (lit from behind by an oil lamp), the AP Star Wheel (1991), Urwerk satellites, and Xeric\'s 1/3-dial wandering-hour models.',
    stats: () => 'Carrier: 1 rev / 3 h · satellites index 90° per lap',
  });
  mov.updaters.push((s, H, Hd) => {
    const carrierAng = TAU * Hd / 3 - Math.PI / 3; // clockwise from dial
    carrier.rotation.z = carrierAng;
    for (const st of sats) {
      const a = carrierAng + st.i * TAU / 3;         // clock angle of this satellite (unwrapped)
      const x = (a + Math.PI) / TAU;                   // laps measured from 6 o'clock
      const n = Math.floor(x);
      const frac = x - n;
      // Geneva step happens while passing the pin at 6 o'clock (frac≈0): smooth 90° over ±20°
      const w = 20 / 360;
      let step = n;
      if (frac < w) step = n - 1 + smooth(0.5 + frac / (2 * w));
      else if (frac > 1 - w) step = n + smooth((frac - (1 - w)) / (2 * w));
      // counter-rotate so the numeral keeps pointing outward, then index by quarter turns
      st.spin.rotation.z = st.ca + step * Math.PI / 2;
    }
  });
}

// ----------------------------------------------------------------------------- jumping hour + retrograde minutes
function jumpHourRetro(mov, c) {
  const R = mov.R, zD = mov.zDial;
  const g = new THREE.Group(); mov.root.add(g);
  // hour disc behind an aperture at 12
  const discR = c.discR ?? R * 0.62;
  const font = c.font || '"Inter", sans-serif';
  const hTex = canvasTexture(1024, 1024, (ctx, W, H) => {
    ctx.fillStyle = c.discColor || '#f2ede2'; ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2, 0, TAU); ctx.fill();
    ctx.fillStyle = c.numColor || '#14161c';
    ctx.font = `700 ${W * 0.075}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let h = 1; h <= 12; h++) {
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate((h - 1) * TAU / 12);
      ctx.fillText(String(h), 0, -W * 0.42); ctx.restore();
    }
  });
  const disc = dialDisc(discR, hTex);
  const dg = new THREE.Group(); dg.position.z = zD + 0.3; dg.add(disc); g.add(dg);
  // star wheel and jumper (behind the disc)
  const star = P.mesh(G.wheelGeometry({ z: 12, rp: discR * 0.35, thick: 0.25, spokes: 0, kind: 'ratchet', hole: 0.85 }), mov.mat('steel'));
  star.position.z = 0.25; dg.add(star);
  const jumper = new THREE.Group();
  const jp = clockPt(Math.PI * 0.75, discR * 0.35 + 1.8);
  jumper.position.set(jp[0], jp[1], zD + 0.75);
  jumper.add(P.mesh(G.extrudeOutline(G.strokeOutline([[0, 0], [-1.2, 1.4], [-1.7, 1.2]], [0.5, 0.25, 0.3]), 0.25, 0.03), mov.mat('steel')));
  g.add(jumper);
  // snail cam on the cannon arbor + rack
  const snail = [];
  for (let i = 0; i <= 120; i++) { const t = i / 120, a = t * TAU; const r = 1.2 + 2.6 * t; snail.push([Math.cos(a) * r, Math.sin(a) * r]); }
  snail.push([1.2, 0]);
  const sn = P.mesh(G.extrudeOutline(snail, 0.3, 0.03, [{ x: 0, y: 0, r: 0.85 }]), mov.mat('steel'));
  const sng = new THREE.Group(); sng.position.z = zD + 0.85; sng.add(sn); g.add(sng);
  // retrograde hand on a 180° arc in the lower half
  const hc = c.handAt ?? [0, R * 0.08];
  const rh = P.hand('pointer', R * 0.62, 0.45, mov.mat(c.handMat || 'blued'), { tail: 1.2, hub: 0.7 });
  rh.position.set(hc[0], hc[1], zD - 0.3);
  g.add(rh);
  const dialTex = canvasTexture(2048, 2048, (ctx, W, H) => {
    const S = W / 2 / (R + 0.4), cx = W / 2, cy = H / 2;
    ctx.fillStyle = c.dialColor || '#eae5da'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 110; i++) { ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.beginPath(); ctx.arc(cx, cy, i * R * 0.0095 * S, 0, TAU); ctx.stroke(); }
    // aperture at 12 for hour
    const ap = (discR - 0.42 * discR * 0.8);
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    const ax = cx, ay = cy - discR * 0.84 * S;
    ctx.beginPath(); ctx.roundRect(ax - 2.0 * S, ay - 1.5 * S, 4.0 * S, 3.0 * S, 0.5 * S); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#3a3226'; ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect(ax - 2.0 * S, ay - 1.5 * S, 4.0 * S, 3.0 * S, 0.5 * S); ctx.stroke();
    // retrograde fan: 9 o'clock → 6 → 3 o'clock around the hand centre (lower half)
    const hx = cx - hc[0] * S, hy = cy - hc[1] * S, rr = R * 0.7 * S;
    ctx.strokeStyle = ctx.fillStyle = '#1b1b1f';
    for (let m = 0; m <= 60; m++) {
      const a = Math.PI - (m / 60) * Math.PI;  // canvas angle: left → bottom → right
      ctx.lineWidth = m % 5 ? 2 : 6;
      const l = m % 15 === 0 ? 1.4 : m % 5 === 0 ? 0.9 : 0.45;
      ctx.beginPath(); ctx.moveTo(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr); ctx.lineTo(hx + Math.cos(a) * (rr - l * S), hy + Math.sin(a) * (rr - l * S)); ctx.stroke();
      if (m % 15 === 0) { ctx.font = `600 ${1.2 * S}px "Inter", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(m), hx + Math.cos(a) * (rr + 1.4 * S), hy + Math.sin(a) * (rr + 1.4 * S)); }
    }
    if (c.brand) { ctx.font = `600 ${1.3 * S}px "Cormorant Garamond", Georgia, serif`; ctx.textAlign = 'center'; ctx.fillText(c.brand, cx, cy - R * 0.25 * S); }
    const sp = mov.spec.dial?.subSeconds && mov.arbors.get(mov.spec.dial.subSeconds)?.pos;
    if (sp) {
      const sx = cx - sp[0] * S, sy = cy - sp[1] * S, sr = (mov.spec.dial.subR ?? 3) * 0.8 * S;
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.stroke();
      for (let i = 0; i < 60; i += 5) { const a = i / 60 * TAU; ctx.lineWidth = i % 15 ? 2 : 4; ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * sr, sy + Math.sin(a) * sr); ctx.lineTo(sx + Math.cos(a) * (sr - 0.5 * S), sy + Math.sin(a) * (sr - 0.5 * S)); ctx.stroke(); }
    }
  });
  if (mov.dialMat) { mov.dialMat.map = dialTex; mov.dialMat.emissiveMap = dialTex; mov.dialMat.alphaTest = 0.5; mov.dialMat.needsUpdate = true; }
  mov.hourHand && (mov.hourHand.visible = false);
  mov.minuteHand && (mov.minuteHand.visible = false);
  mov.addPart('jumphour', { name: 'Jumping hour & retrograde minutes', group: g, layer: -1.5, kind: 'display', desc: 'The hour disc is held by a 12-point star and a spring jumper; at the top of the hour it snaps forward 30° in a few milliseconds. Minutes are read on a 180° fan: a snail cam turning once an hour pushes a toothed rack, which turns the hand pinion. At 60 the rack falls off the snail step and a spring flicks the hand back to zero.', stats: () => 'Hour disc jumps 30° per hour · hand sweeps 180°/h' });
  mov.updaters.push((s, H, Hd) => {
    const hrs = ((Math.floor(Hd) % 12) + 12) % 12;
    const m = Hd - Math.floor(Hd);
    // jump with overshoot during the first ~0.4% of the hour; retro snap similarly
    const j = Math.min(1, m / 0.0025);
    const over = j < 1 ? Math.sin(j * Math.PI) * 0.12 : 0;
    // numeral h is at angle (h−1)·30° on the disc; to bring it to 12 rotate disc by −that (clockwise from dial is +z)
    const hourShown = (hrs + 11) % 12; // numeral index for hour (1..12 → 0..11)
    const prev = (hourShown + 11) % 12;
    const ang = -(prev + smooth(j) + over) * TAU / 12;
    dg.rotation.z = ang;
    star.rotation.z = 0;
    jumper.rotation.z = j < 1 ? Math.sin(j * Math.PI) * 0.25 : 0;
    sng.rotation.z = TAU * Hd;
    // retrograde: hand angle from −90° (0 min) to +90° (60 min); snap back within ~0.3% of the hour
    let t = m;
    if (m < 0.003) t = 1 - smooth(m / 0.003);
    rh.rotation.z = (270 - 180 * t) * D2R;
  });
}

// ----------------------------------------------------------------------------- moonphase
function moonphase(mov, c) {
  const R = mov.R, zD = mov.zDial;
  const at = c.at ?? [0, -R * 0.42];
  const teeth = c.teeth ?? 59;
  const discR = c.r ?? R * 0.42;
  const g = new THREE.Group(); mov.root.add(g);
  const dg = new THREE.Group(); dg.position.set(at[0], at[1] - discR * 0.55, zD + 0.25); g.add(dg);
  const tex = canvasTexture(1024, 1024, (ctx, W, H) => {
    const grd = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W / 2);
    grd.addColorStop(0, '#1a2a6c'); grd.addColorStop(1, '#0a1238');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2, 0, TAU); ctx.fill();
    for (let i = 0; i < 160; i++) { ctx.fillStyle = `rgba(255,240,200,${Math.random() * 0.8})`; const a = Math.random() * TAU, r = Math.random() * W / 2; ctx.fillRect(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r, 2, 2); }
    for (const yy of [0.22, 0.78]) {
      const mg = ctx.createRadialGradient(W / 2 - 20, H * yy - 20, 10, W / 2, H * yy, W * 0.13);
      mg.addColorStop(0, '#fff6d8'); mg.addColorStop(1, '#d9b35c');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(W / 2, H * yy, W * 0.13, 0, TAU); ctx.fill();
    }
  });
  dg.add(dialDisc(discR, tex));
  const wheel = P.mesh(G.wheelGeometry({ z: teeth, rp: discR * 0.92, thick: 0.2, spokes: 0, hole: 0.3 }), mov.mat('brass'));
  wheel.position.z = 0.2; dg.add(wheel);
  mov.addPart('moon', { name: `Moon-phase disc (${teeth} teeth)`, group: g, layer: -1.6, kind: 'display', desc: teeth === 59 ? 'A 59-tooth disc carrying two moons, pushed one tooth each night by a finger on the 24-hour wheel: 59 ÷ 2 = 29.5 days per lunation against the true 29.530589. It drifts one day every 2 years 8 months.' : `A ${teeth}-tooth disc driven through an intermediate reduction. Error: one day in about 122 years.`, stats: () => `Moon age ${((mov._days ?? 0) % 29.530589).toFixed(1)} days` });
  mov.updaters.push((s, H, Hd) => {
    const days = (c.epochDays ?? 0) + Hd / 24;
    mov._days = days;
    const steps = Math.floor(days) + smooth((days % 1 - 0.96) / 0.04);
    dg.rotation.z = -steps * TAU / teeth;
  });
}

// ----------------------------------------------------------------------------- power reserve indicator
function powerReserve(mov, c) {
  const at = c.at;
  const hand = P.hand('pointer', c.len ?? 2.6, 0.3, mov.mat(c.handMat || 'blued'), { tail: 0.4, hub: 0.35 });
  hand.position.set(at[0], at[1], mov.zDial - 0.25);
  mov.root.add(hand);
  mov.addPart('reserve', { name: 'Power-reserve indicator', group: hand, layer: -3, kind: 'hands', desc: 'A differential compares the barrel arbor (winding) with the barrel drum (running) and moves this hand to show how much energy is left in the mainspring.', stats: () => mov.sim ? `${(mov.sim.wind * mov.spec.specs.reserve).toFixed(1)} h of ${mov.spec.specs.reserve} h` : '' });
  mov.updaters.push((s) => { hand.rotation.z = (-(c.sweep ?? 120) / 2 + (c.sweep ?? 120) * s.wind) * D2R; });
}

// ----------------------------------------------------------------------------- fusee and chain
// The fusee arbor (train item `fusee`) carries the great wheel; the mainspring barrel sits beside it
// with no teeth. A chain wraps the barrel (when let down) or the fusee cone (when wound). The cone
// gives the weak, let-down spring a long lever and the strong, fully wound spring a short one.
function fusee(mov, c) {
  const fa = mov.arbors.get(c.fusee || 'fusee');
  const bp = c.barrelAt;
  const g = new THREE.Group(); mov.root.add(g);
  const z0 = c.z ?? 0.6, h = c.h ?? 3.2;
  const rMin = c.rMin ?? 1.2, rMax = c.rMax ?? 3.0, turns = c.turns ?? 6;
  // cone with helical groove
  const prof = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const r = rMax - (rMax - rMin) * Math.pow(t, 0.8) - 0.08 * Math.abs(Math.sin(t * turns * Math.PI));
    prof.push(new THREE.Vector2(Math.max(0.3, r), z0 + 0.4 + t * h));
  }
  prof.unshift(new THREE.Vector2(0.3, z0 + 0.4));
  const cone = P.mesh(new THREE.LatheGeometry(prof, 64), mov.mat('gilt', {}));
  const fg = new THREE.Group(); fg.position.set(fa.pos[0], fa.pos[1], 0);
  const fspin = new THREE.Group(); fspin.add(cone); fg.add(fspin);
  g.add(fg);
  // barrel (no teeth)
  const bR = c.barrelR ?? 3.6;
  const bg = new THREE.Group(); bg.position.set(bp[0], bp[1], 0);
  const bspin = new THREE.Group();
  const drum = P.mesh(G.ringGeometry({ ro: bR, ri: 0.6, thick: h + 0.4, seg: 96 }), mov.mat('gilt'));
  drum.position.z = z0 + 0.2;
  bspin.add(drum);
  for (let i = 0; i < 6; i++) { const ln = P.mesh(new THREE.BoxGeometry(0.05, 0.6, 0.05), mov.mat('steel')); ln.position.set(bR * 0.6, 0, z0 + h + 0.62); ln.rotation.z = i; bspin.add(ln); }
  bg.add(bspin);
  g.add(bg);
  // chain: instanced links along a path that we rebuild each frame
  const linkGeo = new THREE.BoxGeometry(0.34, 0.1, 0.22);
  const N = 520;
  const chain = new THREE.InstancedMesh(linkGeo, mov.mat('blued'), N);
  chain.castShadow = true;
  g.add(chain);
  const dummy = new THREE.Object3D();
  mov.addPart('fusee', { name: 'Fusee & chain', group: g, layer: 1.2, kind: 'barrel', desc: 'Used from the 15th century to the 1900s (and revived by Lange in 1994). A fully wound spring pulls hard, a let-down spring weakly. The chain pulls on the cone\'s small end when the spring is strong and on its large end when it is weak, so the torque reaching the train stays nearly constant — essential for the verge, whose rate depends on its driving force.', stats: () => mov.sim ? `Chain on fusee: ${(mov.sim.wind * turns).toFixed(1)} of ${turns} turns` : '' });
  const pathPts = [];
  mov.updaters.push((s, H) => {
    const w = s.wind;
    const fAng = TAU * fa.k * H;
    fspin.rotation.z = fAng;
    bspin.rotation.z = -fAng * 0.6 + w * 6;
    // build path: helix on fusee (wound part) then tangent to barrel, then wraps on barrel
    pathPts.length = 0;
    const onF = w * turns;
    const nF = Math.floor(onF * 40);
    for (let i = 0; i < nF; i++) {
      const t = i / (turns * 40);
      const r = rMax - (rMax - rMin) * Math.pow(t, 0.8) + 0.05;
      const a = -t * turns * TAU + fAng;
      pathPts.push([fa.pos[0] + Math.cos(a) * r, fa.pos[1] + Math.sin(a) * r, z0 + 0.45 + t * h]);
    }
    const onB = (1 - w) * turns * (rMax / bR) * 1.2 + 0.3;
    const nB = Math.floor(onB * 30);
    const zb = z0 + 0.5 + (1 - w) * h * 0.2;
    const ang0 = Math.atan2(fa.pos[1] - bp[1], fa.pos[0] - bp[0]) + Math.PI / 2;
    for (let i = 0; i < nB; i++) {
      const a = ang0 + i / 30 * TAU + bspin.rotation.z * 0.1;
      pathPts.push([bp[0] + Math.cos(a) * (bR + 0.06), bp[1] + Math.sin(a) * (bR + 0.06), zb + (i / Math.max(1, nB)) * h * 0.7]);
    }
    let n = 0;
    for (let i = 0; i < pathPts.length - 1 && n < N; i++) {
      const a = pathPts[i], b = pathPts[i + 1];
      dummy.position.set(a[0], a[1], a[2]);
      dummy.rotation.set(0, 0, Math.atan2(b[1] - a[1], b[0] - a[0]) + (n % 2 ? 0 : 0.0));
      dummy.updateMatrix();
      chain.setMatrixAt(n++, dummy.matrix);
    }
    // straight run between them
    if (pathPts.length && nF > 0 && nB > 0) {
      const a = pathPts[nF - 1], b = pathPts[nF];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.floor(L / 0.3);
      for (let i = 0; i < k && n < N; i++) {
        const t = i / k;
        dummy.position.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
        dummy.rotation.set(0, 0, Math.atan2(b[1] - a[1], b[0] - a[0]));
        dummy.updateMatrix(); chain.setMatrixAt(n++, dummy.matrix);
      }
    }
    chain.count = n;
    chain.instanceMatrix.needsUpdate = true;
  });
}

// ----------------------------------------------------------------------------- engraved / decorative extras
function plaque(mov, c) {
  mov.engraveText(mov.root, c.text, c.z ?? 3.4, c.box);
}

// ----------------------------------------------------------------------------- automatic reversing wheels
function reversers(mov, c) {
  const g = new THREE.Group(); mov.root.add(g);
  const wheels = c.at.map(([x, y], i) => {
    const w = new THREE.Group(); w.position.set(x, y, c.z ?? 3.5);
    const m = P.mesh(G.wheelGeometry({ z: 24, rp: c.r ?? 1.35, thick: 0.3, spokes: 0, hole: 0.2 }), mov.mat(c.mat || 'redAnodized'));
    const p = P.mesh(G.pinionGeometry({ z: 8, rp: 0.45, length: 0.4 }), mov.mat('steel'));
    p.position.z = 0.3;
    w.add(m, p); g.add(w);
    return w;
  });
  mov.addPart('reversers', { name: 'Reversing wheels', group: g, layer: 5, kind: 'part', desc: 'Two wheels with internal click pawls: whichever way the rotor swings, one of them drives and the other freewheels, so the mainspring is always wound in the same direction.' });
  mov.updaters.push(() => {
    const a = mov.rotor ? mov.rotor.angle : 0;
    wheels[0].rotation.z = a * 3.1;
    if (wheels[1]) wheels[1].rotation.z = -Math.abs(a) * 3.1;
  });
}

export const COMPLICATIONS = { reversers, wanderingHour, jumpHourRetro, moonphase, powerReserve, fusee, plaque };
