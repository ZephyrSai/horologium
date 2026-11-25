// Procedural geometry for watch parts. All units are millimetres; parts lie in the XY plane and
// are extruded along +Z. Shapes are THREE.Shape so ExtrudeGeometry gives UVs in mm on the caps,
// which the surface-finish textures rely on.
import * as THREE from 'three';

const TAU = Math.PI * 2;
export const deg = (d) => d * Math.PI / 180;

// ---------------------------------------------------------------- tooth outlines

// Horological (ogival / cycloidal-like) profile. Wheels have tall rounded-point teeth,
// pinions have short leaves with semicircular tips. Returns array of [x,y].
export function toothOutline(z, rp, kind = 'wheel', o = {}) {
  const m = (2 * rp) / z;
  const pts = [];
  let ha, hf, thick, tipRound;
  if (kind === 'pinion') {
    ha = o.addendum ?? 0.72 * m; hf = o.dedendum ?? 1.55 * m;
    thick = o.thick ?? (z <= 8 ? 1.05 * m : 1.15 * m); tipRound = 1;
  } else if (kind === 'ratchet') {
    ha = 0.9 * m; hf = 1.1 * m; thick = 0;
  } else if (kind === 'fine') {          // chronograph wheels: fine triangular teeth
    ha = 0.6 * m; hf = 0.8 * m; thick = 1.2 * m; tipRound = 0.2;
  } else {
    ha = o.addendum ?? 1.35 * m; hf = o.dedendum ?? 1.65 * m;
    thick = o.thick ?? 1.41 * m; tipRound = 0.85;
  }
  const ra = rp + ha, rr = rp - hf;
  const step = TAU / z;
  const N = o.res ?? (z > 90 ? 4 : 6);
  for (let i = 0; i < z; i++) {
    const a = i * step;
    if (kind === 'ratchet') {
      // saw-tooth: radial back, sloped front (rotates CCW when wound)
      pts.push(polar(rr, a), polar(ra, a + step * 0.05), polar(rr, a + step * 0.95));
      continue;
    }
    const tw = (thick / 2) / rp;     // half thickness angle at pitch circle
    const rootTw = tw * (kind === 'pinion' ? 1.0 : 1.08);
    // root arc (gap) from previous tooth
    const gapStart = a - step / 2;
    for (let k = 0; k <= 2; k++) pts.push(polar(rr, gapStart + (k / 2) * (step / 2 - rootTw) + 0));
    // leading flank radial up to pitch circle
    pts.push(polar(rr + (rp - rr) * 0.5, a - rootTw * 0.99));
    pts.push(polar(rp, a - tw));
    // ogive tip
    for (let k = 1; k < N; k++) {
      const s = k / N;                // 0..1 up the addendum
      const r = rp + ha * Math.sin(s * Math.PI / 2);
      const w = tw * Math.pow(Math.cos(s * Math.PI / 2), tipRound);
      pts.push(polar(r, a - w));
    }
    pts.push(polar(ra, a));
    for (let k = N - 1; k >= 1; k--) {
      const s = k / N;
      const r = rp + ha * Math.sin(s * Math.PI / 2);
      const w = tw * Math.pow(Math.cos(s * Math.PI / 2), tipRound);
      pts.push(polar(r, a + w));
    }
    pts.push(polar(rp, a + tw));
    pts.push(polar(rr + (rp - rr) * 0.5, a + rootTw * 0.99));
    for (let k = 0; k <= 2; k++) pts.push(polar(rr, a + rootTw + (k / 2) * (step / 2 - rootTw)));
  }
  return pts;
}

// Swiss lever escape wheel: club teeth leaning in the direction of rotation (+1 = CCW).
export function clubToothOutline(z, R, dir = 1, o = {}) {
  const pts = [];
  const step = TAU / z;
  const rr = R * (o.root ?? 0.72);
  const h = R - rr;
  for (let i = 0; i < z; i++) {
    const a0 = dir * i * step;   // walk the teeth in the direction of the lean
    const s = (t) => a0 + dir * t * step;
    // back of the tooth rises in a curve and leans forward to the locking corner
    pts.push(polar(rr, s(0.0)));
    pts.push(polar(rr + h * 0.3, s(0.14)));
    pts.push(polar(rr + h * 0.6, s(0.27)));
    pts.push(polar(rr + h * 0.85, s(0.38)));
    pts.push(polar(R, s(0.46)));                 // locking corner (tip)
    pts.push(polar(R * 0.975, s(0.58)));         // club impulse face
    pts.push(polar(R * 0.94, s(0.63)));          // heel of the club
    pts.push(polar(rr + h * 0.62, s(0.6)));      // front face, slightly undercut
    pts.push(polar(rr + h * 0.3, s(0.64)));
    pts.push(polar(rr, s(0.78)));
  }
  if (dir < 0) pts.reverse();
  return pts;
}

// Pointed (ratchet-like) teeth: English lever, detent and cylinder-type escape wheels.
export function pointedToothOutline(z, R, dir = 1, o = {}) {
  const pts = [];
  const step = TAU / z;
  const rr = R * (o.root ?? 0.7);
  for (let i = 0; i < z; i++) {
    const a0 = dir * i * step;   // walk the teeth in the direction of the lean
    const s = (t) => a0 + dir * t * step;
    pts.push(polar(rr, s(0)));
    pts.push(polar(rr + (R - rr) * 0.45, s(0.35)));
    pts.push(polar(R, s(0.72)));               // sharp point, leaning forward
    pts.push(polar(R * 0.97, s(0.70)));
    pts.push(polar(rr + (R - rr) * 0.3, s(0.78)));
    pts.push(polar(rr, s(0.88)));
  }
  if (dir < 0) pts.reverse();
  return pts;
}

function polar(r, a) { return [r * Math.cos(a), r * Math.sin(a)]; }

function ensureCCW(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return s < 0 ? pts.slice().reverse() : pts;
}

function shapeFrom(pts) {
  pts = ensureCCW(pts);
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}

function circlePath(x, y, r, cw = true) {
  const p = new THREE.Path();
  p.absarc(x, y, r, 0, TAU, cw);
  return p;
}

// Crossings (spokes) cut into a wheel: n spokes, rim inner radius r1, hub radius r0.
function crossingHoles(n, r0, r1, spokeW, curve = 0) {
  const holes = [];
  if (n <= 0 || r1 - r0 < 0.25) return holes;
  for (let i = 0; i < n; i++) {
    const a1 = (i / n) * TAU, a2 = ((i + 1) / n) * TAU;
    const p = new THREE.Path();
    const ho = (spokeW / 2) / r1, hi = (spokeW / 2) / r0;
    const fi = Math.min(hi, (a2 - a1) / 2 - 0.05);
    const steps = 14;
    const pts = [];
    for (let k = 0; k <= steps; k++) pts.push(polar(r1, a1 + ho + curve + (a2 - a1 - 2 * ho) * k / steps));
    for (let k = steps; k >= 0; k--) pts.push(polar(r0, a1 + fi + (a2 - a1 - 2 * fi) * k / steps));
    p.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) p.lineTo(pts[k][0], pts[k][1]);
    p.closePath();
    holes.push(p);
  }
  return holes;
}

// ---------------------------------------------------------------- wheels

const geoCache = new Map();
function cached(key, fn) {
  if (!geoCache.has(key)) geoCache.set(key, fn());
  return geoCache.get(key);
}

export function wheelGeometry({ z, rp, thick = 0.18, spokes = 5, kind = 'wheel', hole = 0.15, rimW, hubR, curve = 0, bevel = false }) {
  const key = ['w', z, rp, thick, spokes, kind, hole, rimW, hubR, curve, bevel].join(':');
  return cached(key, () => {
    const m = 2 * rp / z;
    const outline = toothOutline(z, rp, kind);
    const s = shapeFrom(outline);
    const rr = rp - (kind === 'pinion' ? 1.55 : 1.65) * m;
    const rim = rimW ?? Math.max(0.28, rp * 0.1);
    const hub = hubR ?? Math.max(0.45, rp * 0.16);
    if (spokes > 0 && rr - rim > hub + 0.3) s.holes.push(...crossingHoles(spokes, hub, rr - rim, Math.max(0.22, rp * 0.07), curve));
    if (hole > 0) s.holes.push(circlePath(0, 0, hole));
    const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: bevel, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 12 });
    g.computeVertexNormals();
    return g;
  });
}

export function pinionGeometry({ z, rp, length = 0.6 }) {
  const key = ['p', z, rp, length].join(':');
  return cached(key, () => {
    const s = shapeFrom(toothOutline(z, rp, 'pinion'));
    return new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false, curveSegments: 6 });
  });
}

export function escapeWheelGeometry({ z, R, dir, thick = 0.14, style = 'club', spokes = 5, hub = 0.4 }) {
  const key = ['e', z, R, dir, thick, style, spokes].join(':');
  return cached(key, () => {
    const outline = style === 'pointed' ? pointedToothOutline(z, R, dir) : clubToothOutline(z, R, dir);
    const s = shapeFrom(outline);
    const rr = R * (style === 'pointed' ? 0.7 : 0.72);
    s.holes.push(...crossingHoles(spokes, hub, rr - R * 0.09, Math.max(0.12, R * 0.07), dir * 0.25));
    s.holes.push(circlePath(0, 0, 0.12));
    return new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 8 });
  });
}

// Plain disc / ring with optional spokes (balance arms, rotor ring, cages)
export function ringGeometry({ ro, ri = 0, thick = 0.2, spokes = 0, spokeW = 0.4, hub = 0.5, hole = 0, seg = 96, bevel = 0 }) {
  const key = ['r', ro, ri, thick, spokes, spokeW, hub, hole, bevel].join(':');
  return cached(key, () => {
    const s = new THREE.Shape();
    s.absarc(0, 0, ro, 0, TAU, false);
    if (spokes > 0) s.holes.push(...crossingHoles(spokes, hub, ri, spokeW));
    else if (ri > 0) s.holes.push(circlePath(0, 0, ri));
    if (hole > 0 && spokes > 0) s.holes.push(circlePath(0, 0, hole));
    return new THREE.ExtrudeGeometry(s, {
      depth: thick, curveSegments: seg,
      bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
    });
  });
}

// ---------------------------------------------------------------- plates & bridges

// Convex hull of circles [{x,y,r}], sampled, returns CCW points.
export function circleHull(circles, samples = 40) {
  const pts = [];
  for (const c of circles) for (let i = 0; i < samples; i++) {
    const a = (i / samples) * TAU;
    pts.push([c.x + c.r * Math.cos(a), c.y + c.r * Math.sin(a)]);
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// "Waisted" bridge: a chain of circles joined by tangent segments that pinch inward between
// circles (like a Glashütte finger bridge). Built as union of capsules approximated by hull
// pairs, then traced. For simplicity we offset the pairwise hulls and use the polygon union
// via sampling a signed-distance field and marching squares.
export function blobOutline(circles, { waist = 0.35, res = 0.08, pad = 1.2, k: kOpt } = {}) {
  pad = Math.max(pad, 0.5) + res * 3;
  const minX = Math.min(...circles.map(c => c.x - c.r)) - pad, maxX = Math.max(...circles.map(c => c.x + c.r)) + pad;
  const minY = Math.min(...circles.map(c => c.y - c.r)) - pad, maxY = Math.max(...circles.map(c => c.y + c.r)) + pad;
  const W = Math.ceil((maxX - minX) / res), H = Math.ceil((maxY - minY) / res);
  // smooth-min SDF of capsules between consecutive circles (and all circles)
  const sd = (x, y) => {
    let d = 1e9;
    const k = kOpt ?? Math.min(0.9, Math.min(...circles.map(c => c.r)) * 1.1);
    const smin = (a, b) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
    for (let i = 0; i < circles.length; i++) {
      const c = circles[i];
      d = smin(d, Math.hypot(x - c.x, y - c.y) - c.r);
      const n = circles[i + 1];
      if (n && !c.break) {
        // tapered capsule
        const vx = n.x - c.x, vy = n.y - c.y, L2 = vx * vx + vy * vy;
        let t = ((x - c.x) * vx + (y - c.y) * vy) / L2; t = Math.max(0, Math.min(1, t));
        const px = c.x + vx * t, py = c.y + vy * t;
        const rr = (c.r * (1 - t) + n.r * t) * (1 - waist * Math.sin(Math.PI * t));
        d = smin(d, Math.hypot(x - px, y - py) - rr);
      }
    }
    return d;
  };
  const f = new Float32Array((W + 1) * (H + 1));
  for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) {
    const edge = i === 0 || j === 0 || i === W || j === H;
    f[j * (W + 1) + i] = edge ? 1 : sd(minX + i * res, minY + j * res);
  }
  return marchingOutline(f, W, H, minX, minY, res);
}

// Outline of an arbitrary signed-distance function (negative inside) within bounds.
export function sdfOutline(fn, [minX, minY, maxX, maxY], res = 0.08) {
  minX -= res * 3; minY -= res * 3; maxX += res * 3; maxY += res * 3;
  const W = Math.ceil((maxX - minX) / res), H = Math.ceil((maxY - minY) / res);
  const f = new Float32Array((W + 1) * (H + 1));
  for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) {
    const edge = i === 0 || j === 0 || i === W || j === H;
    f[j * (W + 1) + i] = edge ? 1 : fn(minX + i * res, minY + j * res);
  }
  return marchingOutline(f, W, H, minX, minY, res);
}

// Marching squares, returns the longest closed contour of f<0.
function marchingOutline(f, W, H, ox, oy, res) {
  const segs = [];
  const v = (i, j) => f[j * (W + 1) + i];
  const interp = (i1, j1, i2, j2) => {
    const a = v(i1, j1), b = v(i2, j2), t = a / (a - b);
    return [ox + (i1 + (i2 - i1) * t) * res, oy + (j1 + (j2 - j1) * t) * res];
  };
  // each crossing point is identified by the grid edge it lies on, so neighbouring cells agree
  const pts = new Map();
  const pt = (id, i1, j1, i2, j2) => { if (!pts.has(id)) pts.set(id, interp(i1, j1, i2, j2)); return id; };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const c = (v(i, j) < 0 ? 1 : 0) | (v(i + 1, j) < 0 ? 2 : 0) | (v(i + 1, j + 1) < 0 ? 4 : 0) | (v(i, j + 1) < 0 ? 8 : 0);
    if (c === 0 || c === 15) continue;
    const e = [
      () => pt(`h${i},${j}`, i, j, i + 1, j),
      () => pt(`v${i + 1},${j}`, i + 1, j, i + 1, j + 1),
      () => pt(`h${i},${j + 1}`, i, j + 1, i + 1, j + 1),
      () => pt(`v${i},${j}`, i, j, i, j + 1),
    ];
    const table = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[2, 0]], 10: [[0, 1], [2, 3]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]] };
    for (const [a, b] of table[c]) segs.push([e[a](), e[b]()]);
  }
  const adj = new Map();
  const add = (k, si) => { if (!adj.has(k)) adj.set(k, []); adj.get(k).push(si); };
  segs.forEach((s, i) => { add(s[0], i); add(s[1], i); });
  const usedSeg = new Uint8Array(segs.length);
  let bestIds = [];
  const walk = (from, loop) => {
    let p = from;
    for (let guard = 0; guard < segs.length; guard++) {
      const next = (adj.get(p) || []).find(si => !usedSeg[si]);
      if (next === undefined) break;
      usedSeg[next] = 1;
      const s = segs[next];
      p = s[0] === p ? s[1] : s[0];
      loop.push(p);
    }
  };
  for (let start = 0; start < segs.length; start++) {
    if (usedSeg[start]) continue;
    usedSeg[start] = 1;
    const fwd = [segs[start][1]], back = [];
    walk(segs[start][1], fwd);
    walk(segs[start][0], back);
    const loop = back.reverse().concat([segs[start][0]], fwd);
    if (loop.length > bestIds.length) bestIds = loop;
  }
  const best = bestIds.map(id => pts.get(id));
  // light smoothing
  const out = best.map((p, i) => {
    const a = best[(i - 1 + best.length) % best.length], b = best[(i + 1) % best.length];
    return [(a[0] + p[0] * 2 + b[0]) / 4, (a[1] + p[1] * 2 + b[1]) / 4];
  });
  return ensureCCW(out);
}

// Rounded polygon from vertices [x,y,filletR]
export function roundedPolygon(verts, seg = 8) {
  const out = [];
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const [px, py] = verts[(i - 1 + n) % n], [cx, cy, r = 0.5] = verts[i], [nx, ny] = verts[(i + 1) % n];
    if (!r) { out.push([cx, cy]); continue; }
    const v1 = norm([px - cx, py - cy]), v2 = norm([nx - cx, ny - cy]);
    const ang = Math.acos(Math.max(-1, Math.min(1, v1[0] * v2[0] + v1[1] * v2[1])));
    const t = r / Math.tan(ang / 2);
    const a = [cx + v1[0] * t, cy + v1[1] * t], b = [cx + v2[0] * t, cy + v2[1] * t];
    const bis = norm([v1[0] + v2[0], v1[1] + v2[1]]);
    const d = r / Math.sin(ang / 2);
    const o = [cx + bis[0] * d, cy + bis[1] * d];
    let a0 = Math.atan2(a[1] - o[1], a[0] - o[0]), a1 = Math.atan2(b[1] - o[1], b[0] - o[0]);
    let da = a1 - a0; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
    for (let k = 0; k <= seg; k++) { const aa = a0 + da * k / seg; out.push([o[0] + r * Math.cos(aa), o[1] + r * Math.sin(aa)]); }
  }
  return ensureCCW(out);
}
function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }

// Build an extruded plate / bridge from an outline, with circular holes [{x,y,r}].
export function plateGeometry(outline, holes = [], thick = 0.8, bevel = 0.06) {
  const s = shapeFrom(outline);
  for (const h of holes) s.holes.push(circlePath(h.x, h.y, h.r));
  const g = new THREE.ExtrudeGeometry(s, {
    depth: thick - 2 * bevel, curveSegments: 24,
    bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 2,
  });
  g.translate(0, 0, bevel);
  return g;
}

export function discOutline(R, seg = 160) {
  const pts = [];
  for (let i = 0; i < seg; i++) pts.push(polar(R, (i / seg) * TAU));
  return pts;
}

// Point-in-polygon
export function insidePoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// Signed distance to a polygon (negative inside), on a decimated copy for speed.
export function polySDF(pts, maxPts = 160) {
  const step = Math.max(1, Math.floor(pts.length / maxPts));
  const q = pts.filter((_, i) => i % step === 0);
  const xs = q.map(p => p[0]), ys = q.map(p => p[1]);
  const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  return (x, y) => {
    // cheap bound outside the box
    const dx = Math.max(bb[0] - x, 0, x - bb[2]), dy = Math.max(bb[1] - y, 0, y - bb[3]);
    if (dx > 3 || dy > 3) return Math.hypot(dx, dy);
    const d = distToPoly(q, x, y);
    return insidePoly(q, x, y) ? -d : d;
  };
}

export function distToPoly(pts, x, y) {
  let d = 1e9;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    const vx = bx - ax, vy = by - ay;
    let t = ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1);
    t = Math.max(0, Math.min(1, t));
    d = Math.min(d, Math.hypot(x - ax - vx * t, y - ay - vy * t));
  }
  return d;
}

// ---------------------------------------------------------------- small parts (lathe)

export function jewelGeometry(r = 0.55, h = 0.32, hole = 0.06) {
  return cached('jw' + r + h, () => {
    // profile (radius, z): flat underside, domed top with oil sink cone
    const p = [
      [hole, 0], [r * 0.96, 0], [r, h * 0.12], [r, h * 0.7], [r * 0.9, h * 0.95],
      [r * 0.62, h], [r * 0.3, h * 0.82], [hole, h * 0.7],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(p, 40);
  });
}

export function chatonGeometry(r = 0.95, h = 0.3, ri = 0.5) {
  return cached('ch' + r + h + ri, () => {
    const p = [[ri, 0], [r, 0], [r, h * 0.8], [r * 0.95, h], [ri + 0.06, h], [ri, h * 0.8]].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(p, 48);
  });
}

export function screwHeadGeometry(r = 0.45, h = 0.28) {
  return cached('sc' + r + h, () => {
    const p = [];
    p.push(new THREE.Vector2(0, 0));
    p.push(new THREE.Vector2(r, 0));
    p.push(new THREE.Vector2(r, h * 0.45));
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI / 2;
      p.push(new THREE.Vector2(r * Math.cos(a) * 0.98, h * 0.45 + Math.sin(a) * h * 0.55));
    }
    return new THREE.LatheGeometry(p, 32);
  });
}

export function cylinderZ(r, h, seg = 20) {
  return cached('cz' + r + h + seg, () => {
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, h / 2);
    return g;
  });
}

// Ribbon along a centre line of [x,y] points at height z..z+h (hairspring, mainspring, gongs).
export function ribbonUpdate(geo, pts, z, h) {
  const n = pts.length;
  let pos = geo.getAttribute('position');
  if (!pos || pos.count !== n * 2) {
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    pos = geo.getAttribute('position');
  }
  const nor = geo.getAttribute('normal');
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i];
    const [x0, y0] = pts[Math.max(0, i - 1)], [x1, y1] = pts[Math.min(n - 1, i + 1)];
    let tx = x1 - x0, ty = y1 - y0; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    pos.setXYZ(i * 2, x, y, z); pos.setXYZ(i * 2 + 1, x, y, z + h);
    nor.setXYZ(i * 2, ty, -tx, 0); nor.setXYZ(i * 2 + 1, ty, -tx, 0);
  }
  pos.needsUpdate = true; nor.needsUpdate = true;
  geo.computeBoundingSphere();
}

// Tube along 3D points (lyre springs, click springs, levers in wire)
export function tubeAlong(points3, r = 0.05, seg = 64) {
  const curve = new THREE.CatmullRomCurve3(points3.map(p => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, seg, r, 6, false);
}

// Generic extruded outline (levers, cocks, hands)
export function extrudeOutline(pts, thick, bevel = 0, holes = []) {
  const s = shapeFrom(pts);
  for (const h of holes) s.holes.push(circlePath(h.x, h.y, h.r));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, thick - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 16 });
  if (bevel) g.translate(0, 0, bevel);
  return g;
}

// Thick stroke outline of a polyline (for levers made of arms)
export function strokeOutline(path, w) {
  // capsule union via blob
  return blobOutline(path.map(([x, y], i) => ({ x, y, r: Array.isArray(w) ? w[i] : w })), { waist: 0, res: 0.03, pad: 0.3 });
}
