// Interference checker (debug). Casts vertical rays through the movement on a grid; for every
// closed mesh the hits pair up into solid z-intervals. Overlapping intervals that belong to
// different parts are collisions. Thin decorative bits (jewels, screws, ribbons) are skipped.
import * as THREE from 'three';

export function findClashes(mov, { res = 0.35, minDepth = 0.06, skip = [], only = null, box = null } = {}) {
  mov.root.updateMatrixWorld(true);
  const meshes = [];
  mov.root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh) return;
    let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; }
    if (!vis) return;
    const m = o.material;
    if (!m || m.transmission > 0 || m.blending === THREE.AdditiveBlending) return;   // rubies, glows
    const g = o.geometry;
    if (g.type === 'LatheGeometry' || g.type === 'TubeGeometry' || !g.index && !g.attributes.position) return;
    if (!g.getIndex() && g.type === 'BufferGeometry') return;                            // ribbons
    if (g.type === 'PlaneGeometry' || g.type === 'CircleGeometry' || g.type === 'BoxGeometry' && maxDim(o) < 0.6) return;
    if (o.userData.noClash) return;
    const id = partOf(o);
    if (!id || skip.includes(id) || (only && !only.includes(id))) return;
    meshes.push({ o, id, side: m.side });
  });
  for (const e of meshes) e.o.material.side = THREE.DoubleSide;
  const ray = new THREE.Raycaster();
  ray.firstHitOnly = false;
  const R = mov.R + 4;
  const objs = meshes.map(e => e.o);
  const idOf = new Map(meshes.map(e => [e.o, e.id]));
  const pairs = new Map();
  const down = new THREE.Vector3(0, 0, -1);
  const [x0, y0, x1, y1] = box || [-R, -R, R, R];
  for (let x = x0; x <= x1; x += res) for (let y = y0; y <= y1; y += res) {
    ray.set(new THREE.Vector3(x, y, 60), down);
    const hits = ray.intersectObjects(objs, false);
    // group hits per mesh -> intervals
    const per = new Map();
    for (const h of hits) { if (!per.has(h.object)) per.set(h.object, []); per.get(h.object).push(60 - h.distance); }
    const iv = [];
    for (const [o, zs] of per) {
      zs.sort((a, b) => b - a);
      for (let i = 0; i + 1 < zs.length; i += 2) iv.push({ id: idOf.get(o), top: zs[i], bot: zs[i + 1], name: o.parent?.userData?.partId });
    }
    for (let i = 0; i < iv.length; i++) for (let j = i + 1; j < iv.length; j++) {
      const a = iv[i], b = iv[j];
      if (a.id === b.id) continue;
      const d = Math.min(a.top, b.top) - Math.max(a.bot, b.bot);
      if (d > minDepth) {
        const k = [a.id, b.id].sort().join(' × ');
        const p = pairs.get(k) || { n: 0, depth: 0, at: null, z: null };
        p.n++; if (d > p.depth) { p.depth = d; p.at = [x.toFixed(1), y.toFixed(1)]; p.z = [Math.max(a.bot, b.bot).toFixed(2), Math.min(a.top, b.top).toFixed(2)]; }
        pairs.set(k, p);
      }
    }
  }
  for (const e of meshes) e.o.material.side = e.side;
  return [...pairs.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k}: ${v.n} pts, depth ${v.depth.toFixed(2)} at (${v.at}) z ${v.z}`);
}

function partOf(o) { for (let p = o; p; p = p.parent) if (p.userData.partId) return p.userData.partId; return null; }
function maxDim(o) { const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); const s = g.boundingBox.getSize(new THREE.Vector3()); return Math.max(s.x, s.y, s.z); }
