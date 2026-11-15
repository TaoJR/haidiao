import * as THREE from 'three';
import { toon, addOutline } from './toon.js';

// rarity: 0 junk, 1 common, 2 uncommon, 3 rare, 4 legendary
export const RARITY = [
  { label: '杂物', mul: 0.2, color: '#9aa4ad' },
  { label: '常见', mul: 1, color: '#8fd3a4' },
  { label: '少见', mul: 1.8, color: '#7cc4ff' },
  { label: '稀有', mul: 3, color: '#c79bff' },
  { label: '传说', mul: 6, color: '#ffd166' },
];

export const SPECIES = [
  { id: 'porgy', name: '鲷鱼', rarity: 1, min: 20, max: 38, strength: 0.2, color: 0xbac3cc, belly: 0xf1f1ec, h: 0.5, w: 0.16, dorsal: 0.1, tail: 1, weights: [22, 30, 16], note: '银色扁身，成群出没，最容易上钩。' },
  { id: 'seabass', name: '黑鲈', rarity: 1, min: 25, max: 50, strength: 0.3, color: 0x2f3742, belly: 0x77818d, h: 0.36, w: 0.2, dorsal: 0.14, tail: 1, weights: [28, 18, 16], note: '深色鳞片，喜欢阴天贴底觅食。' },
  { id: 'searobin', name: '鲂鮄', rarity: 1, min: 25, max: 40, strength: 0.25, color: 0xb9633a, belly: 0xf0d9c0, h: 0.26, w: 0.24, dorsal: 0.1, tail: 0.9, wings: true, weights: [16, 18, 10], note: '胸鳍像翅膀一样张开，出水会咕咕叫。' },
  { id: 'tautog', name: '隆头鱼', rarity: 2, min: 35, max: 60, strength: 0.45, color: 0x3d4239, belly: 0x8e9184, h: 0.42, w: 0.22, dorsal: 0.1, tail: 0.9, weights: [12, 8, 8], note: '嘴硬力气大，咬钩后会往礁石里钻。' },
  { id: 'fluke', name: '比目鱼', rarity: 2, min: 40, max: 65, strength: 0.45, color: 0x7d6c50, belly: 0xf3efe6, h: 0.52, w: 0.07, dorsal: 0.04, tail: 0.8, weights: [8, 12, 8], note: '两只眼睛长在同一侧，平贴海底伏击。' },
  { id: 'bluefish', name: '蓝鱼', rarity: 2, min: 40, max: 75, strength: 0.65, color: 0x4d7f9c, belly: 0xe6eef2, h: 0.28, w: 0.16, dorsal: 0.09, tail: 1.2, weights: [8, 8, 14], note: '牙齿锋利，冲刺凶猛，收线要留力。' },
  { id: 'striper', name: '条纹鲈', rarity: 3, min: 60, max: 100, strength: 0.8, color: 0x6c7b68, belly: 0xf0f0e8, h: 0.3, w: 0.18, dorsal: 0.12, tail: 1.1, weights: [5, 2, 14], note: '身上有深色横纹，黄昏时最活跃。' },
  { id: 'dogfish', name: '角鲨', rarity: 3, min: 70, max: 105, strength: 0.7, color: 0x7d8288, belly: 0xe9e9e6, h: 0.2, w: 0.18, dorsal: 0.17, tail: 1.5, weights: [4, 2, 6], note: '小型鲨鱼，耐力很好，要慢慢磨。' },
  { id: 'tuna', name: '蓝鳍金枪鱼', rarity: 4, min: 110, max: 180, strength: 1.0, color: 0x1f3f6a, belly: 0xdfe6ee, h: 0.34, w: 0.25, dorsal: 0.15, tail: 1.7, weights: [0.6, 0.6, 3.5], note: '海里的跑车。能拉上船的人不多。' },
  { id: 'boot', name: '旧靴子', rarity: 0, min: 28, max: 28, strength: 0.08, color: 0x6a4a35, belly: 0x3a2a20, weights: [5, 5, 4], note: '不知道是谁掉的。' },
];
export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));
const ENV_INDEX = { overcast: 0, sunny: 1, sunset: 2 };

export function rollSpecies(envName, rnd = Math.random) {
  const k = ENV_INDEX[envName] ?? 1;
  const total = SPECIES.reduce((a, s) => a + s.weights[k], 0);
  let r = rnd() * total;
  for (const s of SPECIES) { r -= s.weights[k]; if (r <= 0) return s; }
  return SPECIES[0];
}

export function rollSize(sp, rnd = Math.random) {
  const t = Math.pow(rnd(), 1.6); // big ones are rarer
  return Math.round(sp.min + (sp.max - sp.min) * t);
}

export function scoreFor(sp, size) {
  return Math.round(size * RARITY[sp.rarity].mul);
}

function tri(points, mat) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

// Unit-length fish with its mouth at the origin, body trailing along -X.
export function makeFishModel(sp) {
  const g = new THREE.Group();
  if (sp.id === 'boot') {
    const leather = toon(sp.color, { rim: 0.3 });
    const sole = toon(sp.belly);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.55, 12), leather);
    shaft.position.set(-0.3, 0, 0);
    shaft.rotation.z = Math.PI / 2;
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), leather);
    foot.scale.set(1, 1.9, 0.9);
    foot.position.set(-0.56, 0.16, 0);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.6, 0.3), sole);
    base.position.set(-0.72, 0.14, 0);
    g.add(shaft, foot, base);
    for (const o of [shaft, foot, base]) { o.castShadow = true; addOutline(o, 0.012); }
    return g;
  }
  const skin = toon(sp.color, { rim: 0.5 });
  const belly = toon(sp.belly, { rim: 0.4 });
  const fin = toon(new THREE.Color(sp.color).multiplyScalar(0.8), { side: THREE.DoubleSide });
  const { h, w } = sp;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), skin);
  body.scale.set(0.84, h, w);
  body.position.x = -0.42;
  body.castShadow = true;
  addOutline(body, 0.012);
  const under = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12), belly);
  under.scale.set(0.76, h * 0.8, w * 0.94);
  under.position.set(-0.42, -h * 0.11, 0);
  g.add(body, under);
  const ty = 0.3 * sp.tail;
  g.add(tri([[-0.78, 0, 0], [-1.0, ty, 0], [-0.9, 0, 0], [-0.78, 0, 0], [-0.9, 0, 0], [-1.0, -ty, 0]], fin));
  const top = h * 0.5;
  g.add(tri([[-0.2, top * 0.93, 0], [-0.62, top * 0.7, 0], [-0.45, top + sp.dorsal, 0]], fin));
  g.add(tri([[-0.5, -top * 0.75, 0], [-0.68, -top * 0.55, 0], [-0.62, -top - 0.05, 0]], fin));
  for (const s of [-1, 1]) {
    const span = sp.wings ? 0.3 : 0.11;
    const p = tri([[-0.26, -h * 0.1, s * w * 0.42], [-0.45, -h * 0.05, s * (w * 0.45 + span)], [-0.46, -h * 0.3, s * (w * 0.4 + span * 0.5)]],
      sp.wings ? toon(0xe58a3c, { side: THREE.DoubleSide }) : fin);
    g.add(p);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: 0xf4f4f0 }));
    eye.position.set(-0.13, h * 0.12, s * w * 0.33);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    pupil.position.set(-0.125, h * 0.12, s * (w * 0.33 + 0.018));
    g.add(eye, pupil);
  }
  return g;
}

let shadowTex;
// Soft dark fish silhouette, laid just above the water to read as a shape beneath it.
export function makeFishShadow() {
  if (!shadowTex) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d');
    g.filter = 'blur(5px)';
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(150, 64, 78, 30, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(84, 64); g.lineTo(26, 26); g.lineTo(44, 64); g.lineTo(26, 102);
    g.fill();
    shadowTex = new THREE.CanvasTexture(c);
  }
  const mat = new THREE.MeshBasicMaterial({
    map: shadowTex, color: 0x04121c, transparent: true, opacity: 0.42, depthWrite: false,
  });
  const geo = new THREE.PlaneGeometry(1, 0.5);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 5;
  return m;
}
