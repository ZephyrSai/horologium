// Material library: metals, platings, gems and finishes found in real movements.
import * as THREE from 'three';
import { finish } from './textures.js';

const C = (hex) => new THREE.Color(hex);

// Base metal definitions. Colours are linear-ish approximations of real platings under daylight.
export const METALS = {
  rhodium:      { color: '#d6d8db', roughness: 0.30, metalness: 1, label: 'Rhodium-plated brass' },
  rhodiumDark:  { color: '#9a9ea4', roughness: 0.35, metalness: 1, label: 'Ruthenium / dark rhodium' },
  gilt:         { color: '#d8b56a', roughness: 0.38, metalness: 1, label: 'Fire-gilt brass' },
  germanSilver: { color: '#e4d6b6', roughness: 0.36, metalness: 0.95, label: 'Untreated German silver (maillechort)' },
  brass:        { color: '#e2c071', roughness: 0.26, metalness: 1, label: 'Gilded brass' },
  goldWheel:    { color: '#f0cd7d', roughness: 0.18, metalness: 1, label: 'Gold-plated brass' },
  gold:         { color: '#f3c766', roughness: 0.14, metalness: 1, label: '18k yellow gold' },
  roseGold:     { color: '#efb59a', roughness: 0.16, metalness: 1, label: '18k pink gold' },
  whiteGold:    { color: '#e9e9e6', roughness: 0.14, metalness: 1, label: '18k white gold' },
  steel:        { color: '#c9ccd0', roughness: 0.16, metalness: 1, label: 'Hardened, polished steel' },
  steelMatte:   { color: '#b4b8bd', roughness: 0.42, metalness: 1, label: 'Grained steel' },
  blued:        { color: '#2a49b8', roughness: 0.18, metalness: 0.9, label: 'Thermally blued steel (≈290 °C)', clearcoat: 0.6 },
  glucydur:     { color: '#dcb978', roughness: 0.24, metalness: 1, label: 'Glucydur (beryllium bronze)' },
  nivarox:      { color: '#c2bcb2', roughness: 0.22, metalness: 1, label: 'Nivarox hairspring alloy' },
  parachrom:    { color: '#4767d4', roughness: 0.2, metalness: 0.85, label: 'Paramagnetic blue alloy', clearcoat: 0.6 },
  tungsten:     { color: '#8f9297', roughness: 0.3, metalness: 1, label: 'Tungsten / platinum mass' },
  copper:       { color: '#c87a4a', roughness: 0.3, metalness: 1, label: 'Copper coil wire' },
  titanium:     { color: '#a5a7aa', roughness: 0.4, metalness: 1, label: 'Grade 5 titanium' },
  black:        { color: '#222', roughness: 0.4, metalness: 0.6, label: 'Black polished steel' },
  redAnodized:  { color: '#b3202c', roughness: 0.32, metalness: 0.7, label: 'Red-anodised reversing wheel' },
  blackPolish:  { color: '#15161a', roughness: 0.05, metalness: 1, label: 'Black-polished steel (mirror)' },
};

const matCache = new Map();

export function metal(name, opts = {}) {
  const key = name + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const def = METALS[name] || METALS.rhodium;
  const m = new THREE.MeshPhysicalMaterial({
    color: C(opts.color || def.color),
    metalness: def.metalness,
    roughness: opts.roughness ?? def.roughness,
    clearcoat: def.clearcoat || 0,
    clearcoatRoughness: 0.15,
    envMapIntensity: 0.85,
  });
  if (opts.finish) applyFinish(m, opts.finish, opts.finishScale || 1, opts.finishAngle || 0, opts.finishCentered);
  m.userData.label = def.label + (opts.finish ? ' · ' + FINISH_LABEL[opts.finish] : '');
  matCache.set(key, m);
  return m;
}

export const FINISH_LABEL = {
  cotes: 'Côtes de Genève', perlage: 'perlage (circular graining)', snail: 'snailing (escargotage)',
  sunburst: 'sunray brushing', engraving: 'hand engraving', frosted: 'frosted / gilt grain', brushed: 'straight graining',
};

// Finishes are applied with UVs in millimetres (ExtrudeGeometry caps use shape coordinates).
function applyFinish(m, name, scale, angle, centered) {
  const f = finish(name);
  if (!f) return;
  const n = f.normal.clone(); n.needsUpdate = true;
  const set = (t) => {
    if (centered) {           // UV 0..1 across a part of diameter `scale` centred on origin
      t.repeat.set(1 / scale, 1 / scale);
      t.offset.set(0.5, 0.5);
    } else {
      t.repeat.set(1 / scale, 1 / scale);
      t.rotation = angle;
    }
  };
  set(n);
  m.normalMap = n;
  m.normalScale = new THREE.Vector2(0.35, 0.35);
  if (f.rough) {
    const r = f.rough.clone(); r.needsUpdate = true; set(r);
    m.roughnessMap = r;
    m.roughness = 1;
  }
}

// Synthetic ruby (corundum, Cr-doped). Transmissive, high IOR, deep pinkish red.
export function ruby(kind = 'ruby') {
  const key = 'gem:' + kind;
  if (matCache.has(key)) return matCache.get(key);
  const colors = {
    ruby: ['#e0204a', '#8a0020'],
    deep: ['#b0102e', '#5a0010'],
    sapphire: ['#e8eef8', '#c8d6ee'],
    pale: ['#f05a7a', '#b02040'],
  }[kind] || ['#e0204a', '#8a0020'];
  const m = new THREE.MeshPhysicalMaterial({
    color: C(colors[0]),
    roughness: 0.04,
    metalness: 0,
    transmission: 0.55,
    thickness: 0.35,
    ior: 1.77,
    attenuationColor: C(colors[1]),
    attenuationDistance: 0.25,
    specularIntensity: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    sheen: 0.2, sheenColor: C('#ff6080'),
  });
  m.userData.label = kind === 'sapphire' ? 'Synthetic sapphire' : 'Synthetic ruby (Al₂O₃:Cr), 9 Mohs';
  matCache.set(key, m);
  return m;
}

// Silicon (Si) parts: escape wheels, pallet forks and hairsprings. Oxide layer gives a thin-film
// interference colour from violet to blue.
export function silicon(tint = '#3a2a74') {
  const key = 'si:' + tint;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshPhysicalMaterial({
    color: C(tint), metalness: 0.55, roughness: 0.12,
    iridescence: 1, iridescenceIOR: 1.46, iridescenceThicknessRange: [180, 520],
    clearcoat: 1, clearcoatRoughness: 0.05,
  });
  m.userData.label = 'Silicon with oxide coating (Silinvar-type)';
  matCache.set(key, m);
  return m;
}

export function lacquer(color = '#f4f1ea', rough = 0.25, label = 'Lacquered dial') {
  const m = new THREE.MeshPhysicalMaterial({ color: C(color), roughness: rough, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  m.userData.label = label;
  return m;
}

export function glass() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.02, transmission: 1, thickness: 1.2, ior: 1.77,
    transparent: true, opacity: 0.25, depthWrite: false,
  });
  m.userData.label = 'Sapphire crystal';
  return m;
}

export function quartzCrystal() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0.9, thickness: 0.4, ior: 1.54, transparent: true, opacity: 0.6 });
  m.userData.label = 'Quartz tuning fork in vacuum capsule';
  return m;
}

export function glow(color = '#58a6ff') {
  return new THREE.MeshBasicMaterial({ color: C(color), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
}
