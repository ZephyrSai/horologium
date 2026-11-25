import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Movement, rateText } from './core/movement.js';
import { Sim } from './core/sim.js';
import { WatchAudio } from './core/audio.js';
import { Timegrapher, POSITIONS } from './core/timegrapher.js';
import { MOVEMENTS } from './movements/index.js';
import { findClashes } from './core/clash.js';

const TAU = Math.PI * 2;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = (x) => { x = clamp(x, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// ============================================================================ renderer
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
// Dark studio with softboxes: metals show crisp highlight bands instead of a white room.
function studioEnv() {
  const es = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ color: 0x24262a, side: THREE.BackSide }));
  es.add(box);
  const panel = (w, h, color, intensity, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); es.add(m);
  };
  panel(22, 14, 0xfff3e0, 2.6, [-20, 24, 32], [0, 0, 0]);    // key softbox, upper left, off-axis
  panel(26, 4, 0xffffff, 1.4, [16, -10, 40], [0, 0, 0]);     // thin strip giving a highlight band
  panel(8, 46, 0xffffff, 4.0, [-38, 0, 14], [0, 0, 0]);       // left strip
  panel(8, 46, 0xdfe8ff, 3.0, [38, 4, 10], [0, 0, 0]);        // right strip, cool
  panel(30, 10, 0xffe6c0, 1.6, [0, -40, 6], [0, 0, 0]);       // low warm bounce
  panel(22, 14, 0xf0f4ff, 2.0, [14, -16, -36], [0, 0, 0]);   // dial-side softbox
  panel(60, 6, 0xffffff, 1.0, [0, 44, 0], [0, 0, 0]);         // top rim
  const g = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: 0x1c1d20 }));
  g.position.z = -48; es.add(g);
  return pmrem.fromScene(es, 0.02).texture;
}
const envTex = studioEnv();
scene.environment = envTex;

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.5, 3000);
camera.position.set(0, -14, 75);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 6;
controls.maxDistance = 260;
controls.zoomSpeed = 1.1;
controls.rotateSpeed = 0.7;

// lights: environment does most of the work; a key light gives crisp shadows between layers
const key = new THREE.DirectionalLight(0xfff4e2, 1.5);
key.position.set(-30, 40, 90);
key.castShadow = true;
key.shadow.mapSize.set(4096, 4096);
key.shadow.camera.left = key.shadow.camera.bottom = -32;
key.shadow.camera.right = key.shadow.camera.top = 32;
key.shadow.camera.near = 1; key.shadow.camera.far = 400;
key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02;
key.shadow.radius = 4;
scene.add(key, key.target);
const under = new THREE.DirectionalLight(0xf2f4ff, 1.5);
under.position.set(25, -30, -80);
scene.add(under);
const rim = new THREE.DirectionalLight(0xffe0b0, 0.6);
rim.position.set(60, 60, 10);
scene.add(rim);

// workbench mat (story mode only)
const matTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d'); x.fillStyle = '#2d4a3e'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},0.025)`; x.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 8); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const bench = new THREE.Mesh(new THREE.PlaneGeometry(600, 400), new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.95, metalness: 0, color: 0xd7e6dc }));
bench.receiveShadow = true;
scene.add(bench);

// post: outline for hover / selection
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(Math.min(2, window.devicePixelRatio));
composer.addPass(new RenderPass(scene, camera));
const outline = new OutlinePass(new THREE.Vector2(innerWidth, innerHeight), scene, camera);
outline.edgeStrength = 3.2; outline.edgeGlow = 0.6; outline.edgeThickness = 1.2;
outline.visibleEdgeColor.set('#ffd88a'); outline.hiddenEdgeColor.set('#5a4a2a');
outline.enabled = false;
composer.addPass(outline);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  outline.setSize(innerWidth, innerHeight);
});

// ============================================================================ state
const audio = new WatchAudio();
let mov = null, sim = null, tg = null, spec = null;
let mode = 'gallery';
let timeScale = 1;
let H0 = 0, setOffset = 0, handSpeed = 0;
let explodeT = 0, explodeTarget = 0;
let selected = null, hovered = null;
let camTween = null;
let assembly = null; // { order, trayOffsets, chapters }
let storyP = 0;
let storyGhost = false;
let storySmooth = 0;
let scaleNow = 1;
let crownTarget = 0;
let winding = false, windAcc = 0;
let wrist = false;
let isolate = null;
let lastLiveUpdate = 0;

function nowHours() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + (d.getSeconds() + d.getMilliseconds() / 1000) / 3600;
}

// ============================================================================ gallery
function buildIntroList() {
  $('#introList').innerHTML = MOVEMENTS.map(m => `<a class="i-item" href="#/m/${m.id}"><span class="c">${m.category} · ${m.era}</span><span class="n">${m.name}</span><span class="s">${m.subtitle}</span></a>`).join('');
}

function buildGallery() {
  const wrap = $('#cards');
  wrap.innerHTML = '';
  for (const m of MOVEMENTS) {
    const el = document.createElement('div');
    el.className = 'card';
    const s = m.specs;
    el.innerHTML = `<div class="swatch" style="background:radial-gradient(circle at 40% 40%, ${m.swatch?.[0] || '#d9b56c'}, ${m.swatch?.[1] || 'transparent'} 70%)"></div>
      <div class="cat">${m.category}</div><h3>${m.name}</h3><div class="sub">${m.subtitle}</div>
      <div class="blurb">${m.blurb}</div>
      <div class="specs">${s.vph ? `<span>${s.vph.toLocaleString()} vph</span>` : ''}<span>${s.jewels} jewels</span><span>${s.diameter} mm</span><span>${s.reserve} h</span><span>${m.era}</span></div>`;
    el.onclick = () => { location.hash = '#/m/' + m.id; };
    const th = document.createElement('div'); th.className = 'thumb'; el.prepend(th);
    wrap.appendChild(el);
  }
  renderThumbs();
}

// Render each movement once into an offscreen target for its gallery card.
let thumbsDone = false, thumbsBusy = false;
async function renderThumbs() {
  if (thumbsDone || thumbsBusy) return;
  thumbsBusy = true;
  // Render into the corner of the main canvas (hidden behind the opaque gallery), so tone
  // mapping and colour space match the live view, then copy the pixels to a 2D canvas.
  const W = 480, H = 300;
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.5, 1000);
  const cards = $$('#cards .card');
  const pr = renderer.getPixelRatio();
  for (let i = 0; i < MOVEMENTS.length; i++) {
    await new Promise(r => setTimeout(r, 30));
    if (mode !== 'gallery') { thumbsBusy = false; return; }
    if (renderer.domElement.width < W * pr || renderer.domElement.height < H * pr) {   // not laid out yet
      thumbsBusy = false; setTimeout(renderThumbs, 500); return;
    }
    const sp = MOVEMENTS[i];
    let m;
    try { m = new Movement(sp); } catch (e) { console.warn(e); continue; }
    const s = new Sim({ vph: sp.escapement === 'glide' ? 57600 : sp.specs.vph, lift: sp.specs.lift, amplitude: sp.specs.amplitude, reserve: sp.specs.reserve, continuous: sp.escapement === 'glide' });
    m.sim = s;
    m.update(s.state(), 10.15, 10.15, 0);
    const prevRoot = mov && mov.root;
    if (prevRoot) prevRoot.visible = false;
    const benchVis = bench.visible; bench.visible = false;
    scene.add(m.root);
    const R = m.R;
    cam.position.set(R * 1.0, -R * 2.5, R * 3.0);
    cam.lookAt(R * 0.08, R * 0.12, 0);
    key.target.position.set(0, 0, 0); key.position.set(-30, 40, 90);
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, W, H);
    renderer.setViewport(0, 0, W, H);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    const c = document.createElement('canvas'); c.width = W * pr; c.height = H * pr;
    c.getContext('2d').drawImage(renderer.domElement, 0, renderer.domElement.height - H * pr, W * pr, H * pr, 0, 0, W * pr, H * pr);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
    scene.remove(m.root);
    if (prevRoot) prevRoot.visible = true;
    bench.visible = benchVis;
    const thumb = cards[i] && cards[i].querySelector('.thumb');
    if (thumb) thumb.style.backgroundImage = 'url(' + c.toDataURL('image/webp', 0.86) + ')';
  }
  thumbsDone = true; thumbsBusy = false;
}

// ============================================================================ movement loading
function disposeMovement() {
  if (!mov) return;
  scene.remove(mov.root);
  mov.root.traverse(o => { if (o.isMesh && o.geometry && !o.geometry.userData?.cached) { /* geometries are cached/shared */ } });
  mov = null;
}

function loadMovement(id) {
  const s = MOVEMENTS.find(m => m.id === id) || MOVEMENTS[0];
  if (mov && spec === s) return;
  disposeMovement();
  spec = s;
  mov = new Movement(spec);
  scene.add(mov.root);
  const glide = spec.escapement === 'glide';
  sim = new Sim({ vph: glide ? 8 * 7200 : spec.specs.vph, lift: spec.specs.lift, amplitude: spec.specs.amplitude, reserve: spec.specs.reserve, continuous: glide, beatsPerStep: spec.escapement === 'detent' ? 2 : 1 });
  mov.sim = sim;
  mov.isTourbillon = !!mov.escK;
  audio.kind = spec.escapement === 'verge' ? 'verge' : spec.escapement === 'detent' ? 'detent' : 'lever';
  crownTarget = 0;
  $$('#crownSeg button').forEach((b, i) => b.classList.toggle('on', i === 0));
  $('#setRow').classList.add('hidden');
  $('#windBtn').classList.toggle('hidden', false);
  audio.reset();
  H0 = nowHours();
  setOffset = 0;
  tg = new Timegrapher($('#tg'), mov, sim);
  // base transforms for the assembly / explode system
  for (const rec of mov.parts.values()) {
    rec.baseLocal = rec.group.position.clone();
    rec.baseRot = rec.group.rotation.clone();
    rec.spinSign = Math.random() > 0.5 ? 1 : -1;
    let p = rec.group.parent, pr = null;
    while (p) { if (p.userData.partId && p.userData.partId !== rec.id) { pr = mov.parts.get(p.userData.partId); break; } p = p.parent; }
    rec.parentRec = pr;
    let depth = 0; for (let q = pr; q; q = q.parentRec) depth++;
    rec.depth = depth;
  }
  mov.partList = [...mov.parts.values()].sort((a, b) => a.depth - b.depth);
  // first frame so all transforms are valid
  mov.update(sim.state(), trainHours(sim.state()), H0, 0);
  mov.root.updateMatrixWorld(true);
  computeAssembly();
  buildTrainCalc();
  buildPositions();
  $('#tbTitle').textContent = spec.name;
  $('#exTitle').textContent = `${spec.name} · ${spec.subtitle}`;
  $('#wristRow').classList.toggle('hidden', !mov.rotor);
  document.title = `${spec.name} · Horologium`;
}

function trainHours(st) {
  const a = mov.escArbor;
  const z = a.escapement.teeth ?? 1;
  const k = Math.abs(mov.escK ?? a.k);
  return H0 + st.teeth / (z * k);
}

// ---------------------------------------------------------------------------- assembly layout
const KIND_ORDER = ['plate', 'barrel', 'wheel', 'cage', 'escape', 'pallet', 'balance', 'bridge', 'keyless', 'crown', 'part', 'rotor', 'display', 'dial', 'hands'];

function partBox(rec) {
  const box = new THREE.Box3();
  rec.group.updateWorldMatrix(true, true);
  const stack = [rec.group];
  while (stack.length) {
    const o = stack.pop();
    if (o !== rec.group && o.userData.partId && o.userData.partId !== rec.id && mov.parts.get(o.userData.partId)?.group === o) continue;
    if (o.isMesh || o.isInstancedMesh) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (isFinite(b.min.x)) box.union(b);
    }
    stack.push(...o.children);
  }
  return box;
}

function computeAssembly() {
  const recs = [...mov.parts.values()];
  let order;
  if (spec.assembly) order = spec.assembly.map(id => mov.parts.get(id)).filter(Boolean).concat(recs.filter(r => !spec.assembly.includes(r.id)));
  else {
    const trainIdx = (r) => { const i = spec.train.findIndex(t => t.id === r.id); return i < 0 ? 99 : i; };
    order = recs.slice().sort((a, b) => {
      const ka = KIND_ORDER.indexOf(a.kind), kb = KIND_ORDER.indexOf(b.kind);
      const fa = a.layer < 0 ? 100 : 0, fb = b.layer < 0 ? 100 : 0;   // dial side last
      return (fa + ka) - (fb + kb) || trainIdx(a) - trainIdx(b);
    });
  }
  // shelf-pack the parts on a tray below the movement
  const boxes = new Map(order.map(r => [r.id, partBox(r)]));
  const rowW = 150, gap = 5;
  let x = 0, y = 0, rowH = 0;
  const slots = new Map();
  const rows = [];
  let row = [];
  for (const r of order) {
    const b = boxes.get(r.id); const sz = b.getSize(new THREE.Vector3());
    const w = Math.max(3, sz.x), h = Math.max(3, sz.y);
    if (x + w > rowW && row.length) { rows.push({ row, width: x - gap, h: rowH }); y += rowH + gap; x = 0; rowH = 0; row = []; }
    row.push({ r, x: x + w / 2, y, w, h });
    x += w + gap; rowH = Math.max(rowH, h);
  }
  rows.push({ row, width: x - gap, h: rowH });
  const totalH = y + rowH;
  const trayCenter = new THREE.Vector3(0, -mov.R - 14 - totalH / 2 - 20, -4);
  let yy = 0;
  for (const rw of rows) {
    for (const s of rw.row) {
      const cx = trayCenter.x + s.x - rw.width / 2;
      const cy = trayCenter.y + totalH / 2 - yy - rw.h / 2;
      const b = boxes.get(s.r.id);
      const c = b.getCenter(new THREE.Vector3());
      slots.set(s.r.id, new THREE.Vector3(cx - c.x, cy - c.y, trayCenter.z - b.min.z + 0.05));
    }
    yy += rw.h + gap;
  }
  bench.position.set(0, trayCenter.y + 40, trayCenter.z - 0.02);
  // chapters: group motion works+dial+hands etc. as individual steps
  assembly = { order, slots, trayCenter, boxes, trayH: totalH, trayW: Math.max(...rows.map(r => r.width)) };
  buildChapters();
}

// apply world-space offsets to part groups (handles nested parts)
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
function applyOffsets(fn) {
  mov.root.updateMatrixWorld(true);
  const offs = new Map();
  for (const rec of mov.partList) {
    const o = fn(rec) || _zero;
    offs.set(rec.id, o);
    const parent = rec.group.parent;
    if (!rec.parentRec) {
      rec.group.position.copy(rec.baseLocal).add(o);
    } else {
      const po = offs.get(rec.parentRec.id) || _zero;
      _w.copy(rec.baseLocal);
      parent.localToWorld(_w);           // where it would be with the parent displaced
      _w.sub(po).add(o);
      parent.worldToLocal(_w);
      rec.group.position.copy(_w);
    }
    rec.group.updateMatrixWorld(true);
  }
}
const _zero = new THREE.Vector3();

// ============================================================================ story
function chapterDefs() {
  const defs = [];
  defs.push({ type: 'hero' });
  const order = assembly.order;
  const custom = spec.chapters || {};
  order.forEach((r, i) => {
    const c = custom[r.id] || {};
    defs.push({ type: 'part', part: r, title: c.title || r.name, text: c.text || r.desc, idx: i });
  });
  defs.push({ type: 'wind' });
  defs.push({ type: 'alive' });
  defs.push({ type: 'realtime' });
  if (spec.dial) defs.push({ type: 'dial' });
  defs.push({ type: 'explore' });
  return defs;
}

function buildChapters() {
  const wrap = $('#chapters');
  wrap.innerHTML = '';
  const defs = chapterDefs();
  assembly.defs = defs;
  const s = spec.specs;
  defs.forEach((d, i) => {
    const el = document.createElement('section');
    el.className = 'chapter' + (d.type === 'hero' ? ' hero' : '');
    let html = '';
    if (d.type === 'hero') {
      html = `<div class="num">${spec.category.toUpperCase()} · ${spec.era}</div><h2>${spec.name}</h2>
        <p><em style="color:var(--gold2);font-family:var(--serif);font-size:19px">${spec.subtitle}</em></p>
        ${(spec.story || []).map(p => `<p>${p}</p>`).join('')}
        <table class="spec-table">
          <tr><td>Diameter × height</td><td>${s.diameter} × ${s.height} mm</td></tr>
          <tr><td>Frequency</td><td>${s.vph ? `${s.vph.toLocaleString()} vph · ${(s.vph / 7200).toFixed(1)} Hz` : s.freqText}</td></tr>
          <tr><td>Jewels</td><td>${s.jewels}</td></tr>
          <tr><td>Power reserve</td><td>${s.reserve} h</td></tr>
          <tr><td>Escapement</td><td>${s.escapementText || spec.escapement}</td></tr>
          ${s.extra ? Object.entries(s.extra).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('') : ''}
        </table>
        <div class="scrollhint">Scroll to assemble · ${assembly.order.length} parts on the tray ↓</div>`;
    } else if (d.type === 'part') {
      const r = d.part;
      html = `<div class="num">STEP ${String(d.idx + 1).padStart(2, '0')} / ${assembly.order.length}</div><h2>${d.title}</h2><p>${d.text}</p>
        <div class="facts">${r.teeth ? `<span>${r.teeth}</span>` : ''}${r.material ? `<span>${r.material}</span>` : ''}${r.arbor && r.arbor.k ? `<span>${rateText(r.arbor.k).split(' · ')[1]}</span>` : ''}</div>`;
    } else if (d.type === 'wind') {
      html = `<div class="num">POWER</div><h2>Wind the mainspring</h2><p>Turning the crown turns the ratchet wheel on top of the barrel arbor, coiling the mainspring tight around it. The click holds it there — listen for it. Fully wound, this calibre holds about ${s.reserve} hours of energy.</p><p class="hint">Keep scrolling to wind.</p>`;
    } else if (d.type === 'alive') {
      html = `<div class="num">ONE TENTH SPEED</div><h2>It comes alive</h2><p>${escText()}</p><p>${spec.escapement === 'glide' ? '' : 'With sound on you can hear each beat split into three: the pallet <b>unlocking</b>, the <b>impulse</b>, and the <b>drop</b> onto the next stone. A timegrapher measures the time between them to compute amplitude.'}</p>`;
    } else if (d.type === 'realtime') {
      html = `<div class="num">REAL TIME</div><h2>${s.vph ? `${(s.vph / 3600).toFixed(0)} beats a second` : 'A gliding second'}</h2><p>${s.vph ? `At full speed the balance swings ${(s.vph / 7200).toFixed(1)} times a second through about ${s.amplitude ?? 290}° each way. The escape wheel steps half a tooth per beat; the gear train multiplies those steps down to the hands.` : 'The glide wheel turns eight times a second and is braked smoothly, so the seconds hand never ticks.'}</p><p>${trainSentence()}</p>`;
    } else if (d.type === 'dial') {
      html = `<div class="num">THE OTHER SIDE</div><h2>The dial</h2><p>${spec.dial?.story || 'Turned over, all that work becomes three hands. The time shown is your local time; the watch now runs on its own simulated mainspring.'}</p>`;
    } else if (d.type === 'explore') {
      html = `<div class="num">YOURS</div><h2>Take it apart yourself</h2><p>Rotate, zoom into the jewels, explode the layers, x-ray the bridges, wind it, pull the crown, and put it on the timegrapher in six positions.</p><button class="cta" id="enterExplore">Open the explorer →</button>`;
    }
    el.innerHTML = `<div class="card2">${html}</div>`;
    wrap.appendChild(el);
  });
  $('#enterExplore')?.addEventListener('click', () => enterExplore());
  wrap.scrollTop = 0;
}

function escText() {
  return {
    lever: 'The balance swings; its ruby impulse pin kicks the pallet fork, which unlocks the escape wheel. The wheel turns half a tooth, pushing the fork back against the pin — a tiny push that keeps the balance going — and then locks on the other pallet stone.',
    coaxial: 'In the co-axial escapement, the escape wheel pushes the balance roller directly in one direction and through the lever in the other. Locking and impulse are separated: the stones are pressed, not rubbed.',
    detent: 'The chronometer escapement: the wheel is held by a stone on a spring detent. Once per oscillation the balance flicks the detent aside and the wheel kicks the impulse roller directly. On the return swing nothing happens at all.',
    verge: 'The verge: two flags on the balance staff catch the top and bottom teeth of the crown wheel. Watch the wheel recoil — the balance is never free.',
    glide: 'No ticking at all. The glide wheel spins smoothly, braked by electromagnets that a quartz-regulated IC switches thousands of times per second.',
    tourbillon: 'Watch the whole escapement ride round in its cage, the escape pinion rolling on the fixed fourth wheel. The cage itself is the seconds hand.',
  }[spec.escapement] || '';
}

function trainSentence() {
  const lines = mov.trainReport();
  const vals = lines.map(l => `${l.ratio}`).join(' × ');
  return `Going train: ${vals}. ` + (spec.trainNote || '');
}

function storyProgress() {
  const wrap = $('#chapters');
  const els = wrap.children;
  const mid = wrap.scrollTop + innerHeight * 0.55;
  let p = 0;
  for (let i = 0; i < els.length; i++) {
    const e = els[i];
    if (mid >= e.offsetTop) p = i + clamp((mid - e.offsetTop) / e.offsetHeight, 0, 0.999);
  }
  return p;
}

function storyFrame(dtReal) {
  const target = storyProgress();
  if (Math.abs(target - storySmooth) > 3) storySmooth = target;          // jumps (replay, skip)
  storySmooth += (target - storySmooth) * (1 - Math.exp(-dtReal * 6));
  const p = storyP = storySmooth;
  const defs = assembly.defs;
  const ci = Math.floor(p), cf = p - ci;
  $$('.chapter').forEach((el, i) => el.classList.toggle('active', i === ci));
  $('#progBar').style.width = (p / (defs.length - 1) * 100).toFixed(1) + '%';
  // assembly progress per part
  const partStart = 1;
  const n = assembly.order.length;
  const done = new Map();
  assembly.order.forEach((r, i) => done.set(r.id, ease((p - (partStart + i) + 0.05) / 0.55)));
  // top-level parts tumble a little in flight and settle with a soft bounce
  for (const rec of mov.partList) {
    if (rec.parentRec || !rec.baseRot) continue;
    const t = done.get(rec.id) ?? 1;
    const k = Math.sin(Math.PI * clamp(t, 0, 1));
    rec.group.rotation.set(rec.baseRot.x + k * 0.42 * rec.spinSign, rec.baseRot.y + k * 0.22, rec.baseRot.z + k * 0.35 * rec.spinSign);
  }
  applyOffsets((rec) => {
    const t = done.get(rec.id) ?? 1;
    if (t >= 1) return null;
    const slot = assembly.slots.get(rec.id);
    const o = slot.clone().multiplyScalar(1 - t);
    o.z += Math.sin(Math.PI * t) * (14 + mov.R * 0.4) + (rec.layer < 0 ? -Math.sin(Math.PI * t) * 30 : 0);
    o.z += Math.max(0, Math.sin(Math.PI * clamp((t - 0.82) / 0.18, 0, 1))) * 0.6;   // settle
    return o;
  });
  // mechanics by chapter
  const idx = (type) => defs.findIndex(d => d.type === type);
  const iW = idx('wind'), iA = idx('alive'), iR = idx('realtime');
  if (p < iW) { timeScale = 0; sim.wind = 0.0; }
  else if (p < iA) {
    timeScale = 0;
    const w = clamp((p - iW - 0.1) / 0.75, 0, 1);
    windTo(w * 0.95);
  } else if (p < iR) { timeScale = 0.1; if (sim.wind < 0.9) sim.wind = 0.95; }
  else timeScale = 1;
  if (p >= iA && sim.stopped && sim.wind > 0) { sim.A = sim.amplitudeTarget(); }
  // barrel x-ray while winding; bridges ghosted while the escapement is explained
  setBarrelOpen(p >= iW - 0.3 && p < iA + 0.2);
  const ghost = p >= iA - 0.25 && p < iR + 0.3;
  if (ghost !== storyGhost) { storyGhost = ghost; setXray(ghost); }
  bench.visible = true;
  // camera
  const cams = defs.map((d, i) => chapterCamera(d, i));
  const a = cams[ci], b = cams[Math.min(ci + 1, cams.length - 1)];
  const k = smooth((cf - 0.35) / 0.6);
  const pos = a.pos.clone().lerp(b.pos, k), tgt = a.tgt.clone().lerp(b.tgt, k);
  camera.position.lerp(pos, 1 - Math.exp(-dtReal * 4));
  controls.target.lerp(tgt, 1 - Math.exp(-dtReal * 4));
  camera.lookAt(controls.target);
  // highlight current part
  const cur = defs[ci];
  setOutline(cur?.type === 'part' ? cur.part : null);
}

function windTo(w) {
  const prev = sim.wind;
  sim.wind = w;
  if (w > prev) ratchetClicks(w - prev);
}

function ratchetClicks(dw) {
  const teeth = spec.keyless?.ratchet ?? 56;
  const barrel = mov.arbors.get(spec.keyless?.barrel || 'barrel');
  const turns = barrel ? spec.specs.reserve * Math.abs(barrel.k) : 6;
  windAcc += dw * turns * teeth;
  let n = 0;
  while (windAcc >= 1 && n < 6) { windAcc -= 1; n++; audio.click(0.45); }
  if (windAcc > 6) windAcc = 0;
  if (mov.crown) mov.crown.spin += dw * turns * 2 * TAU;
}

function chapterCamera(d, i) {
  const R = mov.R;
  const back = (tgt, dist, tilt = 0.35, side = 0) => ({ tgt, pos: tgt.clone().add(new THREE.Vector3(Math.sin(side) * dist * 0.4, -dist * tilt, dist)) });
  const front = (tgt, dist) => ({ tgt, pos: tgt.clone().add(new THREE.Vector3(0, -dist * 0.25, -dist)) });
  const right = innerWidth > 900 ? 1 : 0;
  const shift = (v, s) => v.clone().add(new THREE.Vector3(-s * right, 0, 0)); // keep the subject right of the text card
  switch (d.type) {
    case 'hero': {
      // frame the whole tray, leaving the left third for the text card
      const tc = assembly.trayCenter.clone();
      const w = assembly.trayW + 20, h = assembly.trayH + 20;
      const card = document.querySelector('.chapter .card2');
      const cardR = card ? card.getBoundingClientRect().right : 0;
      const vis = right ? Math.max(0.35, 1 - (cardR + 24) / innerWidth) : 1;   // fraction of screen width left of the card
      const fovV = camera.fov * Math.PI / 180;
      const distH = (h / 2) / Math.tan(fovV / 2);
      const distW = (w / 2) / (Math.tan(fovV / 2) * camera.aspect * vis);
      const dist = Math.max(distH, distW) * 1.05;
      const offX = right ? -(w / vis) * (1 - vis) / 2 : 0;
      const tgt = new THREE.Vector3(tc.x + offX, tc.y, tc.z);
      return { tgt, pos: tgt.clone().add(new THREE.Vector3(0, -dist * 0.28, dist)) };
    }
    case 'part': {
      const r = d.part;
      const b = assembly.boxes.get(r.id);
      const c = b.getCenter(new THREE.Vector3());
      const size = b.getSize(new THREE.Vector3()).length();
      const dist = clamp(size * 2.2, 26, 95) + mov.R * 0.9;
      // mid-way between tray and movement while the part flies, then the movement
      const t = c.clone(); t.z = Math.max(t.z, 0);
      if (r.layer < 0) return front(shift(new THREE.Vector3(c.x * 0.4, c.y * 0.4, c.z), -dist * 0.18), dist * 1.1 + 20);
      return back(shift(new THREE.Vector3(c.x * 0.5, c.y * 0.5 - 6, 1.5), dist * 0.22), dist + 28, 0.45, 0.4);
    }
    case 'wind': {
      const bp = mov.arbors.get(spec.keyless?.barrel || 'barrel')?.pos || [0, 0];
      return back(shift(new THREE.Vector3(bp[0], bp[1], 2), 6), 34, 0.5);
    }
    case 'alive': {
      const bp = mov.esc?.balancePos || mov.arbors.get('balance')?.pos || mov.escArbor?.pos || [0, 0];
      const pp = mov.esc?.palletPos || bp;
      return back(shift(new THREE.Vector3((bp[0] + pp[0] * 2) / 3, (bp[1] + pp[1] * 2) / 3, 1.5), 5), 30, 0.5);
    }
    case 'realtime': return back(shift(new THREE.Vector3(0, 0, 1), R * 0.35), R * 3.2, 0.4, 0.6);
    case 'dial': return front(shift(new THREE.Vector3(0, 0, -2), -R * 0.35), R * 3.4);
    default: return back(new THREE.Vector3(0, 0, 0), R * 3.6, 0.3);
  }
}

function setBarrelOpen(on) {
  for (const a of mov.arbors.values()) {
    if (a.type === 'barrel' && a.mainspring) {
      a.mainspring.mesh.visible = on || a.openBarrel || $('#xray').checked;
      if (a.cover) a.cover.visible = !(on || $('#xray').checked) || a.openBarrel;
    }
  }
}

// ============================================================================ explorer
function enterStory() {
  mode = 'story';
  storyGhost = false;
  storySmooth = 0;
  $('#gallery').classList.add('hidden');
  $('#intro').classList.add('hidden');
  $('#explorer').classList.add('hidden');
  $('#story').classList.remove('hidden');
  controls.enabled = false;
  $('#chapters').scrollTop = 0;
  sim.wind = 0;
  resetExplorerToggles();
}

function enterExplore() {
  mode = 'explore';
  $('#gallery').classList.add('hidden');
  $('#intro').classList.add('hidden');
  $('#story').classList.add('hidden');
  $('#explorer').classList.remove('hidden');
  controls.enabled = true;
  for (const rec of mov.partList) if (rec.baseRot) rec.group.rotation.copy(rec.baseRot);
  applyOffsets(() => null);
  bench.visible = false;
  setBarrelOpen(false);
  if (sim.wind < 0.3) sim.wind = 0.9;
  if (sim.stopped) sim.A = sim.amplitudeTarget();
  setSpeed(1);
  flyTo('back');
  setOutline(null);
  $('#info').innerHTML = `<h3>${spec.name}</h3><p>${spec.blurb}</p><p class="hint">Click any part to inspect it. Double-click to fly to it.</p>`;
}

function resetExplorerToggles() {
  $('#explode').value = 0; explodeTarget = 0;
  $('#xray').checked = false; setXray(false);
  $('#dialChk').checked = true; setDial(true);
  isolate = null;
}

function setSpeed(s) {
  timeScale = s;
  $$('#speedSeg button').forEach(b => b.classList.toggle('on', +b.dataset.s === s));
}

function flyTo(view) {
  const R = mov.R;
  let tgt = new THREE.Vector3(), pos;
  if (view === 'back') pos = new THREE.Vector3(0, -R * 0.9, R * 3.6);
  else if (view === 'dial') pos = new THREE.Vector3(0, -R * 0.7, -R * 3.6);
  else if (view === 'side') pos = new THREE.Vector3(R * 3.2, -R * 0.6, R * 0.35);
  else if (view === 'esc') {
    const bp = mov.esc?.palletPos || mov.esc?.balancePos || mov.escArbor?.pos || [0, 0];
    tgt.set(bp[0], bp[1], 1.5);
    pos = tgt.clone().add(new THREE.Vector3(0, -9, 26));
    if (!$('#xray').checked) { $('#xray').checked = true; setXray(true); }
  } else if (view.isVector3) { tgt = view; pos = tgt.clone().add(camera.position.clone().sub(controls.target).normalize().multiplyScalar(18)); }
  camTween = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: tgt };
}

function setXray(on) {
  for (const rec of mov.parts.values()) {
    if (!['bridge', 'rotor'].includes(rec.kind)) continue;
    rec.group.traverse(o => {
      if (!o.isMesh) return;
      if (on) {
        if (!o.userData.mat0) o.userData.mat0 = o.material;
        o.material = xrayMat(o.userData.mat0);
      } else if (o.userData.mat0) o.material = o.userData.mat0;
    });
  }
  setBarrelOpen(false);
}
const xrayCache = new Map();
function xrayMat(m) {
  if (!xrayCache.has(m)) {
    const x = m.clone();
    x.transparent = true; x.opacity = 0.16; x.depthWrite = false; x.normalMap = null; x.roughnessMap = null; x.roughness = 0.2;
    xrayCache.set(m, x);
  }
  return xrayCache.get(m);
}
function setDial(on) {
  for (const rec of mov.parts.values()) if (['dial', 'hands', 'display'].includes(rec.kind)) rec.group.visible = on;
}

function buildTrainCalc() {
  const el = $('#trainCalc');
  const lines = mov.trainReport();
  const esc = mov.escArbor;
  let html = lines.map(l => `<div><span>${l.from} → ${l.to}</span><span>${l.ratio} = ${l.value.toFixed(3).replace(/\.?0+$/, '')}</span></div>`).join('');
  const rows = [];
  for (const a of mov.arbors.values()) if (!a.virtual && a.k) rows.push(`<div><span>${a.name || a.id}</span><span>${Math.abs(a.k) >= 100 ? Math.abs(a.k).toFixed(0) : Math.abs(a.k).toFixed(Math.abs(a.k) < 1 ? 3 : 2)} rev/h</span></div>`);
  html += '<div style="border-top:1px solid var(--line);margin-top:4px"></div>' + rows.join('');
  if (esc && spec.specs.vph) {
    const z = esc.escapement.teeth;
    const k = Math.abs(mov.escK ?? esc.k);
    const per = spec.escapement === 'detent' ? 1 : 2;
    const vph = k * z * per * (spec.escapement === 'detent' ? 2 : 1);
    const ok = Math.abs(vph - spec.specs.vph) < 1;
    html += `<div class="${ok ? 'ok' : 'bad'}"><span>Check: ${k.toFixed(0)} rev/h × ${z} teeth × 2</span><span>${Math.round(vph).toLocaleString()} vph ${ok ? '✓' : '✗'}</span></div>`;
  }
  el.innerHTML = html;
}

function buildPositions() {
  const seg = $('#posSeg');
  seg.innerHTML = '';
  for (const [k, v] of Object.entries(POSITIONS)) {
    const b = document.createElement('button');
    b.textContent = k; b.title = v.label;
    if (k === tg.pos) b.classList.add('on');
    b.onclick = () => { tg.setPosition(k); $$('#posSeg button').forEach(x => x.classList.toggle('on', x === b)); };
    seg.appendChild(b);
  }
}

function showInfo(rec) {
  if (!rec) return;
  const el = $('#info');
  el.innerHTML = `<h3>${rec.name}</h3><p>${rec.desc}</p>
    ${rec.teeth ? `<div class="row"><b>Teeth</b>${rec.teeth}</div>` : ''}
    ${rec.material ? `<div class="row"><b>Material</b>${rec.material}</div>` : ''}
    <div class="live" id="liveStats"></div>
    <div class="btns"><button class="pill" id="isoBtn">${isolate === rec.id ? 'Show all' : 'Isolate'}</button><button class="pill" id="flyBtn">Fly to</button></div>`;
  $('#isoBtn').onclick = () => { isolate = isolate === rec.id ? null : rec.id; applyIsolate(); showInfo(rec); };
  $('#flyBtn').onclick = () => flyToPart(rec);
  updateLive();
}
function updateLive() {
  const el = $('#liveStats');
  if (el && selected?.stats) el.textContent = selected.stats();
}
function flyToPart(rec) {
  const b = partBox(rec);
  const c = b.getCenter(new THREE.Vector3());
  const size = b.getSize(new THREE.Vector3()).length();
  const dir = camera.position.clone().sub(controls.target).normalize();
  camTween = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: c.clone().add(dir.multiplyScalar(clamp(size * 1.6, 10, 120))), t1: c };
}
function applyIsolate() {
  for (const rec of mov.parts.values()) {
    if (!isolate) { rec.group.visible = true; continue; }
    let keep = rec.id === isolate;
    for (let p = mov.parts.get(isolate).parentRec; p; p = p.parentRec) if (p === rec) keep = true;
    rec.group.visible = keep;
  }
  if (!isolate) setDial($('#dialChk').checked);
  // nested part inside an isolated ancestor: hide siblings handled by own visibility
  if (isolate) {
    const iso = mov.parts.get(isolate);
    for (const rec of mov.parts.values()) if (rec !== iso && rec.parentRec && isDesc(rec, iso)) rec.group.visible = false;
    // children of an ancestor that are not the isolated part
    for (let p = iso.parentRec; p; p = p.parentRec) {
      p.group.traverse(o => { if (o.isMesh && o.userData.partId === p.id) o.visible = false; });
    }
  } else {
    mov.root.traverse(o => { if (o.isMesh) o.visible = true; });
  }
}
function isDesc(rec, anc) { for (let p = rec.parentRec; p; p = p.parentRec) if (p === anc) return true; return false; }

function setOutline(rec) {
  const objs = [];
  if (rec) objs.push(rec.group, ...(rec.extraGroups || []));
  if (hovered && hovered !== rec && mode === 'explore') objs.push(hovered.group);
  outline.selectedObjects = objs;
  outline.enabled = objs.length > 0;
}

// ---------------------------------------------------------------------------- picking
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downXY = null;
function pick(e) {
  if (!mov) return null;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(mov.pickables, false);
  for (const h of hits) {
    let o = h.object, vis = true;
    while (o) { if (!o.visible) { vis = false; break; } o = o.parent; }
    if (!vis) continue;
    if (h.object.material?.opacity < 0.3 && $('#xray').checked) continue;
    return mov.parts.get(h.object.userData.partId);
  }
  return null;
}
canvas.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (mode !== 'explore' || !downXY) return;
  if (Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 5) return;
  const r = pick(e);
  selected = r;
  setOutline(r);
  if (r) showInfo(r);
});
canvas.addEventListener('dblclick', (e) => { if (mode !== 'explore') return; const r = pick(e); if (r) flyToPart(r); });
let hoverPending = null;
canvas.addEventListener('pointermove', (e) => { hoverPending = e; });
function doHover() {
  if (!hoverPending || mode !== 'explore') return;
  const e = hoverPending; hoverPending = null;
  if (e.buttons) { $('#tooltip').classList.add('hidden'); return; }
  const r = pick(e);
  hovered = r;
  const tt = $('#tooltip');
  if (r) { tt.textContent = r.name; tt.style.left = e.clientX + 'px'; tt.style.top = e.clientY + 'px'; tt.classList.remove('hidden'); }
  else tt.classList.add('hidden');
  setOutline(selected);
}

// ---------------------------------------------------------------------------- UI bindings
$$('#speedSeg button').forEach(b => b.onclick = () => setSpeed(+b.dataset.s));
$$('.vbtn').forEach(b => b.onclick = () => flyTo(b.dataset.view));
$('#explode').oninput = (e) => { explodeTarget = e.target.value / 100; };
$('#xray').onchange = (e) => { setXray(e.target.checked); setBarrelOpen(false); };
$('#dialChk').onchange = (e) => setDial(e.target.checked);
$('#rotorChk').onchange = (e) => { const r = mov.parts.get('rotor'); if (r) r.group.visible = e.target.checked; };
$('#autoRot').onchange = (e) => { controls.autoRotate = e.target.checked; controls.autoRotateSpeed = 0.8; };
$('#wristChk').onchange = (e) => { wrist = e.target.checked; };
$('#vol').oninput = (e) => audio.setVolume(e.target.value / 100);
$('#stetho').onchange = (e) => audio.setStetho(e.target.checked);
$('#regSlider').oninput = (e) => { tg.setIndex(+e.target.value / 2); $('#regTxt').textContent = `${(+e.target.value / 2 >= 0 ? '+' : '')}${(+e.target.value / 2).toFixed(1)} s/d`; };
$$('#crownSeg button').forEach(b => b.onclick = () => {
  const c = +b.dataset.c;
  $$('#crownSeg button').forEach(x => x.classList.toggle('on', x === b));
  crownTarget = c === 2 ? 1.6 : 0;
  const hacks = spec.hacking !== false;
  if (c === 2) { if (hacks) sim.hacked = true; }
  else { if (sim.hacked) { sim.hacked = false; sim.A = sim.amplitudeTarget(); } }
  $('#setRow').classList.toggle('hidden', c !== 2);
  $('#windBtn').classList.toggle('hidden', c === 2);
  audio.crownClick();
});
const sl = $('#setSlider');
sl.oninput = () => { setSpeed_hands(+sl.value); };
sl.onpointerup = sl.onchange = () => { sl.value = 0; setSpeed_hands(0); };
function setSpeed_hands(v) { handSpeed = (v / 100) * Math.abs(v / 100) * 3; }
const wb = $('#windBtn');
const startWind = (e) => { e.preventDefault(); winding = true; wb.classList.add('on'); };
const stopWind = () => { winding = false; wb.classList.remove('on'); };
wb.addEventListener('pointerdown', startWind);
addEventListener('pointerup', stopWind);
wb.addEventListener('pointerleave', stopWind);
$('#skipBtn').onclick = () => enterExplore();
$('#replayBtn').onclick = () => { location.hash = '#/m/' + spec.id; enterStory(); };
async function toggleSound() {
  if (audio.enabled) audio.disable(); else await audio.enable();
  const t = audio.enabled ? '🔊 Sound on' : '🔇 Sound off';
  $('#soundBtn').textContent = t; $('#soundBtn2').textContent = t;
}
$('#soundBtn').onclick = toggleSound;
$('#soundBtn2').onclick = toggleSound;
addEventListener('keydown', (e) => {
  if (mode !== 'explore') return;
  if (e.key === ' ') { setSpeed(timeScale ? 0 : 1); e.preventDefault(); }
  if (e.key === 'w') { winding = true; }
  if (e.key === 'x') { $('#xray').click(); }
});
addEventListener('keyup', (e) => { if (e.key === 'w') winding = false; });

// ============================================================================ router
function route() {
  const h = location.hash || '#/';
  const m = h.match(/^#\/m\/([\w-]+)/);
  if (m) {
    $('#loading').classList.remove('off');
    setTimeout(() => {
      loadMovement(m[1]);
      if (h.includes('/explore')) { enterExplore(); } else enterStory();
      $('#loading').classList.add('off');
    }, 40);
  } else {
    const atlas = h.startsWith('#/atlas');
    mode = atlas ? 'gallery' : 'intro';
    document.title = atlas ? 'Atlas · Horologium' : 'Horologium';
    if (atlas) setTimeout(renderThumbs, 200);
    $('#story').classList.add('hidden');
    $('#explorer').classList.add('hidden');
    $('#gallery').classList.toggle('hidden', !atlas);
    $('#intro').classList.toggle('hidden', atlas);
    if (!atlas) $('#intro').scrollTop = 0;
    $('#loading').classList.add('off');
    controls.enabled = false;
    restPose();
  }
}

// Put the current movement back together (after leaving a story mid-assembly) for the backdrop.
function restPose() {
  if (!mov) return;
  for (const rec of mov.partList || []) if (rec.baseRot) rec.group.rotation.copy(rec.baseRot);
  if (mov.partList) applyOffsets(() => null);
  if (storyGhost) { storyGhost = false; setXray(false); }
  if ($('#xray').checked) { $('#xray').checked = false; setXray(false); }
  setBarrelOpen(false);
  bench.visible = false;
  setOutline(null);
  if (sim) { sim.hacked = false; if (sim.wind < 0.3) sim.wind = 0.9; if (sim.stopped) sim.A = sim.amplitudeTarget(); }
  timeScale = 1;
}
addEventListener('hashchange', route);

// ============================================================================ loop
let last = performance.now();
let galleryIdx = 0;
function frame(now, manual) {
  if (!manual) requestAnimationFrame(frame);
  const dtReal = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  if (mode === 'gallery' || mode === 'intro') {
    // backdrop: the running movement, slowly turning in the light (visible behind the intro hero)
    if (!mov) { loadMovement(MOVEMENTS[0].id); sim.wind = 0.9; document.title = mode === 'gallery' ? 'Atlas · Horologium' : 'Horologium'; }
    bench.visible = false;
    if (mode === 'intro' && $('#intro').scrollTop > innerHeight * 1.2) return;   // hero off screen: save GPU
    if (mode === 'intro' && $('#liveName').dataset.id !== spec.id) { $('#liveName').dataset.id = spec.id; $('#liveName').textContent = `Live: ${spec.name}, running in real time`; }
    const a = now / 11000;
    const R = mov.R, wide = innerWidth > 900;
    // place the movement centred in the space the hero copy leaves free, sized to fit it
    const copy = mode === 'intro' ? $('.i-copy') : null;
    const copyFrac = wide && copy ? Math.min(0.62, (copy.getBoundingClientRect().right + 30) / innerWidth) : 0;
    const t = Math.tan(camera.fov * Math.PI / 360);
    const D = Math.max(R * 1.2 / t, R * 1.12 / (t * camera.aspect * Math.max(0.3, 1 - copyFrac)));
    const halfW = D * t * camera.aspect;
    const f = wide ? (1 + copyFrac) / 2 : 0.5;
    // phones: movement in the top band above the copy
    const look = new THREE.Vector3(-(2 * f - 1) * halfW, wide ? 0 : -0.55 * D * t, 0);
    camera.position.set(look.x + Math.sin(a) * D * 0.22, look.y - D * 0.42, D * 0.9);
    camera.lookAt(look);
    controls.target.copy(look);
    key.target.position.set(0, 0, 0); key.position.set(-30, 40, 90);
    stepSim(dtReal, 1);
    if (mode === 'intro') audio.schedule(sim, 1);
    renderer.render(scene, camera);
    return;
  }
  if (!mov) return;
  if (mode === 'story') storyFrame(dtReal);
  // controls / camera tween
  if (camTween) {
    camTween.t = Math.min(1, camTween.t + dtReal / 1.1);
    const k = ease(camTween.t);
    camera.position.lerpVectors(camTween.p0, camTween.p1, k);
    controls.target.lerpVectors(camTween.t0, camTween.t1, k);
    if (camTween.t >= 1) camTween = null;
  }
  if (mode === 'explore') {
    controls.update();
    // winding by button
    if (winding && crownTarget === 0) {
      const dw = Math.min(1 - sim.wind, dtReal * 0.09);
      if (dw > 0) { sim.wind += dw; ratchetClicks(dw); if (sim.stopped) sim.A = sim.amplitudeTarget(); }
    }
    if (handSpeed && sim) {
      setOffset += handSpeed * dtReal;
      if (mov.crown) mov.crown.spin += handSpeed * dtReal * 6;
    }
    // explode
    explodeT += (explodeTarget - explodeT) * (1 - Math.exp(-dtReal * 6));
    if (explodeT > 0.001 || explodeT !== 0) {
      const e = explodeT;
      applyOffsets((rec) => (e > 0.001 ? new THREE.Vector3(0, 0, rec.layer * 4.2 * e) : null));
    }
  }
  // ease the time scale: the watch visibly slows down / speeds up instead of snapping
  if (timeScale <= 0) { scaleNow *= Math.exp(-dtReal * 7); if (scaleNow < 1e-3) scaleNow = 0; }
  else if (scaleNow <= 0) scaleNow = timeScale * 0.08;
  else scaleNow = Math.exp(Math.log(scaleNow) + (Math.log(timeScale) - Math.log(scaleNow)) * (1 - Math.exp(-dtReal * 5)));
  if (mov.crown) mov.crown.pos += (crownTarget - mov.crown.pos) * (1 - Math.exp(-dtReal * 12));
  stepSim(dtReal, scaleNow);
  rotorStep(dtReal);
  doHover();
  // key light follows target for tight shadows
  key.target.position.copy(controls.target);
  key.position.copy(controls.target).add(new THREE.Vector3(-30, 40, 90));
  if (mode === 'explore' && now - lastLiveUpdate > 120) {
    lastLiveUpdate = now;
    updateLive();
    updateHUD();
    tg.draw();
  }
  composer.render();
}

function stepSim(dtReal, scale) {
  if (!sim) return;
  const dt = dtReal * scale;
  // sub-step the oscillator at moderate speeds so beat counting stays exact
  if (dt > 0) sim.step(dt);
  const st = sim.state();
  const H = trainHours(st);
  mov.update(st, H, H + setOffset, dt);
  if (tg) tg.tick();
  if (mode !== 'gallery') audio.schedule(sim, scale);
}

function rotorStep(dt) {
  const r = mov?.rotor;
  if (!r) return;
  // gravity: screen-down direction projected on the movement plane
  const e = camera.matrixWorld.elements;
  const up = new THREE.Vector3(e[4], e[5], e[6]);
  let gx = -up.x, gy = -up.y;
  let gm = Math.hypot(gx, gy);
  let gAng = Math.atan2(gy, gx);
  if (wrist) { gAng += 1.4 * Math.sin(performance.now() / 700) + 0.7 * Math.sin(performance.now() / 290 + 1); gm = Math.max(gm, 0.8); }
  const massAng = r.angle + Math.PI / 2;
  let d = gAng - massAng; d = Math.atan2(Math.sin(d), Math.cos(d));
  const acc = 55 * gm * Math.sin(d) - 1.6 * r.vel;
  r.vel += acc * dt;
  const da = r.vel * dt;
  r.angle += da;
  r.spin.rotation.z = r.angle;
  if (sim && Math.abs(da) > 0) {
    const dw = Math.abs(da) / (TAU * 260);
    sim.wind = Math.min(1, sim.wind + dw);
  }
  audio.rotorWhirr(r.vel);
}

function fmt(h) {
  h = ((h % 24) + 24) % 24;
  const H = Math.floor(h), M = Math.floor((h - H) * 60), S = Math.floor(((h - H) * 60 - M) * 60);
  return [H, M, S].map(x => String(x).padStart(2, '0')).join(':');
}

function updateHUD() {
  const st = sim.state();
  const H = trainHours(st) + setOffset;
  $('#watchTime').textContent = fmt(H);
  $('#refTime').textContent = fmt(H0 + sim.t / 3600);
  $('#reserveBar').style.width = (sim.wind * 100).toFixed(1) + '%';
  $('#reserveTxt').textContent = `${(sim.wind * spec.specs.reserve).toFixed(1)} h of ${spec.specs.reserve} h` + (sim.stopped ? ' · stopped' : '') + (sim.hacked ? ' · hacked' : '');
  const r = tg.readout();
  const glide = spec.escapement === 'glide';
  $('#tgRate').textContent = `${r.rate >= 0 ? '+' : ''}${r.rate.toFixed(1)} s/d`;
  $('#tgAmp').textContent = glide ? '—' : (r.stopped ? '0°' : `${Math.round(r.amp)}°`);
  $('#tgBE').textContent = glide ? '—' : `${r.beatError.toFixed(1)} ms`;
  $('#tgBph').textContent = glide ? 'glide' : `${r.bph.toLocaleString()} vph`;
  $('#tgLift').textContent = glide ? '—' : `${r.lift.toFixed(0)}°`;
  $('#tgBeats').textContent = r.beats.toLocaleString();
  const days = r.elapsed / 86400;
  $('#tgDrift').textContent = `${r.drift >= 0 ? '+' : ''}${r.drift.toFixed(2)} s over ${r.elapsed < 3600 ? (r.elapsed / 60).toFixed(1) + ' min' : (r.elapsed / 3600).toFixed(1) + ' h'}`;
}

// ============================================================================ go
buildGallery();
buildIntroList();
route();
requestAnimationFrame(frame);
// debug hook: advance frames manually (useful when the tab is in the background)
let manualNow = 0;
window.__horo = {
  get mov() { return mov; }, get sim() { return sim; }, get mode() { return mode; }, audio, camera, controls, scene, renderer,
  clash(opts) { return findClashes(mov, opts); },
  cams() { return assembly.defs.map((d, i) => { const c = chapterCamera(d, i); return d.type + ' ' + [c.pos.x, c.pos.y, c.pos.z, c.tgt.x, c.tgt.y, c.tgt.z].map(v => v.toFixed(1)).join(','); }); },
  tick(n = 1, ms = 16.7) { manualNow = Math.max(manualNow, last); for (let i = 0; i < n; i++) { manualNow += ms; frame(manualNow, true); } },
};
