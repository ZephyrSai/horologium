// Procedural surface finishes used by watchmakers, generated as normal / roughness maps.
// All maps are built once per parameter set and cached.
import * as THREE from 'three';

const cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Build a tangent-space normal map from a Float32 height field (wraps at edges).
function normalFromHeight(hf, w, h, strength) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const ym = (y - 1 + h) % h, yp = (y + 1) % h;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w, xp = (x + 1) % w;
      const dx = (hf[y * w + xp] - hf[y * w + xm]) * strength;
      const dy = (hf[yp * w + x] - hf[ym * w + x]) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      d[i] = (nx / l * 0.5 + 0.5) * 255;
      d[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      d[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function grayCanvas(vals, w, h) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, vals[i] * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function tex(canvas, { srgb = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

// Simple hash noise
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---------- Côtes de Genève: parallel bands, each a shallow cylinder cut by a rotating wheel,
// leaving faint concentric arcs. One period of the texture = one stripe.
function cotes() {
  const w = 256, h = 256;
  const hf = new Float32Array(w * h);
  const rough = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;              // across stripe 0..1
      const v = y / h;
      const c = u * 2 - 1;
      // band: rounded crest with a sharp boundary to the next stripe
      let band = Math.sqrt(Math.max(0, 1 - c * c)) * 0.9;
      // arcs from the cutting wheel; centres far below, repeating along the stripe
      const ry = v * 6 - Math.floor(v * 6);
      const arc = Math.hypot(c * 0.7, (ry - 1.25)) * 38;
      const fine = Math.sin(arc * Math.PI * 2) * 0.012 + (hash(x, y) - 0.5) * 0.01;
      hf[y * w + x] = band + fine;
      rough[y * w + x] = 0.22 + Math.abs(Math.sin(arc * Math.PI)) * 0.12 + Math.abs(c) * 0.06;
    }
  }
  return { normal: tex(normalFromHeight(hf, w, h, 9)), rough: tex(grayCanvas(rough, w, h)) };
}

// ---------- Perlage: overlapping circular grains with spiral micro-grooves.
function perlage() {
  const w = 256, h = 256;
  const N = 4;                 // grains per tile edge
  const cell = w / N;
  const R = cell * 0.78;
  const nx = new Float32Array(w * h), ny = new Float32Array(w * h);
  const rough = new Float32Array(w * h).fill(0.4);
  const centres = [];
  for (let j = 0; j < N * 2; j++)
    for (let i = 0; i < N; i++)
      centres.push([i * cell + (j % 2 ? cell / 2 : 0), j * cell / 2]);
  // later circles overwrite earlier: emulates the stamping order
  for (const [cx, cy] of centres) {
    for (let y = Math.floor(cy - R); y <= cy + R; y++) {
      for (let x = Math.floor(cx - R); x <= cx + R; x++) {
        const dx = x - cx, dy = y - cy;
        const r = Math.hypot(dx, dy);
        if (r > R) continue;
        const px = ((x % w) + w) % w, py = ((y % h) + h) % h;
        const a = Math.atan2(dy, dx);
        const groove = Math.sin(r * 0.9 + a * 2.0);
        // tangential normal tilt -> the swirling sparkle of perlage
        const tx = -Math.sin(a), ty = Math.cos(a);
        const k = 0.55 * groove * (r / R);
        nx[py * w + px] = tx * k + dx / R * 0.25;
        ny[py * w + px] = ty * k + dy / R * 0.25;
        rough[py * w + px] = 0.3 + 0.12 * Math.abs(groove);
      }
    }
  }
  const c = makeCanvas(w, h), ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const l = Math.hypot(nx[i], ny[i], 1);
    img.data[i * 4] = (nx[i] / l * 0.5 + 0.5) * 255;
    img.data[i * 4 + 1] = (ny[i] / l * 0.5 + 0.5) * 255;
    img.data[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { normal: tex(c), rough: tex(grayCanvas(rough, w, h)) };
}

// ---------- Snailing / sunburst: centred on the part, UV 0..1 across its diameter.
function snail(spiral = 1) {
  const w = 512, h = 512;
  const c = makeCanvas(w, h), ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const rough = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x / w - 0.5, dy = y / h - 0.5;
      const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      // snailing: spiral grooves; sunburst (spiral=0): radial brushing
      let nxv, nyv;
      if (spiral) {
        const g = Math.sin((r * 220 + a * 3.5) );
        nxv = Math.cos(a) * g * 0.35; nyv = Math.sin(a) * g * 0.35;
        // anisotropic: tilt tangentially, varies around the circle
        const t = Math.sin(a * 2 + r * 30) * 0.25;
        nxv += -Math.sin(a) * t; nyv += Math.cos(a) * t;
      } else {
        const n = (hash(Math.floor(a * 900), 3) - 0.5);
        nxv = -Math.sin(a) * n * 0.5; nyv = Math.cos(a) * n * 0.5;
      }
      const l = Math.hypot(nxv, nyv, 1);
      const i = (y * w + x) * 4;
      img.data[i] = (nxv / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (nyv / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
      rough[y * w + x] = 0.18 + 0.1 * Math.abs(Math.sin(r * 220));
    }
  }
  ctx.putImageData(img, 0, 0);
  const n = tex(c), ro = tex(grayCanvas(rough, w, h));
  n.wrapS = n.wrapT = ro.wrapS = ro.wrapT = THREE.ClampToEdgeWrapping;
  return { normal: n, rough: ro };
}

// ---------- Hand engraving: floral scrolls cut into the surface (Lange/Glashütte cocks).
function engraving() {
  const w = 512, h = 512;
  const c = makeCanvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#000'; ctx.lineCap = 'round';
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  function scroll(x, y, a, len, width, depth) {
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x, y);
    let curl = (rnd() - 0.5) * 0.12;
    for (let i = 0; i < len; i++) {
      a += curl; curl *= 1.035;
      x += Math.cos(a) * 3; y += Math.sin(a) * 3;
      ctx.lineTo(x, y);
      if (depth > 0 && rnd() < 0.05) {
        ctx.stroke();
        scroll(x, y, a + (rnd() > 0.5 ? 1 : -1) * 0.9, len * 0.55, width * 0.75, depth - 1);
        ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x, y);
      }
      if (i % 9 === 0 && depth < 2) {   // leaves
        ctx.save(); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(x + 5, y, 6, 2.2, a + 1, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
    ctx.stroke();
  }
  for (let i = 0; i < 14; i++) scroll(rnd() * w, rnd() * h, rnd() * 6.28, 60 + rnd() * 50, 3.2, 3);
  // background matte hatching
  ctx.globalAlpha = 0.25; ctx.lineWidth = 0.6;
  for (let i = -h; i < w; i += 4) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke(); }
  const src = ctx.getImageData(0, 0, w, h).data;
  const hf = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) hf[i] = src[i * 4] / 255;
  const rough = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) rough[i] = 0.25 + (1 - hf[i]) * 0.4;
  return { normal: tex(normalFromHeight(hf, w, h, 3)), rough: tex(grayCanvas(rough, w, h)) };
}

// ---------- Frosted (gilt pocket watches) / bead-blasted: fine isotropic grain.
function frosted() {
  const w = 256, h = 256;
  const hf = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) hf[i] = hash(i % w, Math.floor(i / w));
  return { normal: tex(normalFromHeight(hf, w, h, 1.2)), rough: null };
}

// ---------- Straight graining / brushed (sunray dials use snail(0)).
function brushed() {
  const w = 256, h = 256;
  const hf = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = hash(0, y);
    for (let x = 0; x < w; x++) hf[y * w + x] = row * 0.8 + hash(x, y) * 0.05;
  }
  return { normal: tex(normalFromHeight(hf, w, h, 1.5)), rough: null };
}

const builders = { cotes, perlage, snail: () => snail(1), sunburst: () => snail(0), engraving, frosted, brushed };

export function finish(name) {
  if (!builders[name]) return null;
  if (!cache.has(name)) cache.set(name, builders[name]());
  return cache.get(name);
}

// Dial artwork rendered to canvas; returned as an sRGB texture.
export function canvasTexture(w, h, draw) {
  const c = makeCanvas(w, h);
  draw(c.getContext('2d'), w, h);
  const t = tex(c, { srgb: true });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
