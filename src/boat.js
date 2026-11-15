import * as THREE from 'three';
import { toon } from './toon.js';

export const DECK_Y = 1.15;
export const RAIL_H = 0.88;
const BEAM = 2.9;
const Z_STERN = -11;
const Z_BOW = 11;

export function hullHalfWidth(z) {
  const t = THREE.MathUtils.clamp((z - 2) / 9, 0, 1);
  return BEAM * (1 - Math.pow(t, 2.2));
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function shadowed(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

// Quad strip between two polylines; each strip owns its vertices so edges stay crisp.
function ribbon(a, b, mat) {
  const pos = [];
  const idx = [];
  for (let i = 0; i < a.length; i++) pos.push(a[i].x, a[i].y, a[i].z, b[i].x, b[i].y, b[i].z);
  for (let i = 0; i < a.length - 1; i++) {
    const k = i * 2;
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return shadowed(new THREE.Mesh(geo, mat));
}

function pipe(a, b, r, mat, seg = 8) {
  const d = b.clone().sub(a);
  const len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  return shadowed(m);
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return shadowed(m);
}

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 352;
  const g = c.getContext('2d');
  g.fillStyle = '#f3f1ea';
  g.fillRect(0, 0, c.width, c.height);
  g.font = '900 150px Georgia, "Times New Roman", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  ['CAPTREE', 'PRINCESS'].forEach((line, i) => {
    const y = 96 + i * 158;
    g.lineWidth = 12;
    g.strokeStyle = '#1b1b1b';
    g.strokeText(line, 512, y);
    g.fillStyle = '#c8a437';
    g.fillText(line, 512, y);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function hazardTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#f2c230';
  g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#1c1c1c';
  for (let x = -64; x < 600; x += 64) {
    g.beginPath();
    g.moveTo(x, 64); g.lineTo(x + 32, 64); g.lineTo(x + 96, 0); g.lineTo(x + 64, 0);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A standing rod: tapered blank, wraps, reel. Origin at the butt, pointing +Y.
export function makeRod(length = 2.5) {
  const g = new THREE.Group();
  const dark = toon(0x1d1a1c);
  const red = toon(0xa3271f);
  const cork = toon(0x2b2b30);
  const steel = toon(0xaeb6c0);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.55, 8), cork);
  handle.position.y = 0.275;
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.55, 8), red);
  lower.position.y = 0.55 + 0.275;
  const blankLen = length - 1.1;
  const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.013, blankLen, 6), dark);
  blank.position.y = 1.1 + blankLen / 2;
  g.add(shadowed(handle), shadowed(lower), shadowed(blank));
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const y = 1.0 + t * (length - 1.05);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022 - t * 0.012, 0.004, 5, 10), steel);
    ring.position.set(0, y, 0.03 - t * 0.016);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.07, 14), steel);
  reel.rotation.z = Math.PI / 2;
  reel.position.set(0, 0.5, 0.065);
  const reelCore = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12), dark);
  reelCore.rotation.z = Math.PI / 2;
  reelCore.position.copy(reel.position);
  g.add(shadowed(reel), reelCore);
  g.userData.tip = V(0, length, 0);
  return g;
}

export function makeBoat() {
  const boat = new THREE.Group();
  const DS = { side: THREE.DoubleSide };
  const white = toon(0xe9ebee, DS);
  const whiteIn = toon(0xdfe3e8, DS);
  const railTopMat = toon(0xf1f2f4, DS);
  const navy = toon(0x1f3a5c, DS);
  const bottom = toon(0x6b2a2a, DS);
  const deckMat = toon(0x3b485c, DS);
  const glass = toon(0x16222e);
  const steel = toon(0xb4bcc6);
  const rope = toon(0xb99a63);
  const solidWhite = toon(0xe9ebee);
  const orange = toon(0xe8571e);

  // ---- Hull, lofted from stations along the length ----
  const zs = [];
  for (let z = Z_STERN; z <= 2.01; z += 1) zs.push(z);
  for (let z = 2.5; z <= Z_BOW + 0.001; z += 0.5) zs.push(z);
  zs[zs.length - 1] = Z_BOW;

  const topYs = [];
  for (const s of [-1, 1]) {
    const keel = [], chine = [], s1 = [], s2 = [], sheer = [], topO = [], topI = [], inB = [];
    for (const z of zs) {
      const w = Math.max(0.1, hullHalfWidth(z));
      const t = THREE.MathUtils.clamp((z - 2) / 9, 0, 1);
      const rise = t * t * 1.3;
      const topY = DECK_Y + RAIL_H + t * t * 0.35;
      if (s === 1) topYs.push(topY);
      const pk = V(0, -1.0 + rise, z);
      const pc = V(s * w * 0.74, -0.25 + rise * 0.8, z);
      const ps = V(s * w, DECK_Y, z);
      keel.push(pk); chine.push(pc); sheer.push(ps);
      s1.push(pc.clone().lerp(ps, 0.5));
      s2.push(pc.clone().lerp(ps, 0.64));
      topO.push(V(s * (w + 0.04), topY, z));
      topI.push(V(s * Math.max(0.02, w - 0.27), topY, z));
      inB.push(V(s * Math.max(0.02, w - 0.2), DECK_Y, z));
    }
    boat.add(
      ribbon(keel, chine, bottom), ribbon(chine, s1, white), ribbon(s1, s2, navy),
      ribbon(s2, sheer, white), ribbon(sheer, topO, white), ribbon(topO, topI, railTopMat),
      ribbon(topI, inB, whiteIn)
    );
    boat.userData['inB' + s] = inB;
    boat.userData['topO' + s] = topO;

    // Transom half.
    if (s === 1) {
      const L = (arr) => arr[0].clone();
      const a = [keel, chine, sheer, topO].map(L);
      const b = a.map((p) => V(-p.x, p.y, p.z));
      boat.add(ribbon(a, b, white));
    }
  }
  boat.add(ribbon(boat.userData['inB-1'], boat.userData['inB1'], deckMat));
  boat.add(box(BEAM * 2 + 0.08, RAIL_H, 0.26, solidWhite, 0, DECK_Y + RAIL_H / 2, Z_STERN + 0.13));

  // ---- Rail fittings: rod holder holes, outboard tubes, rope ----
  const holeGeo = new THREE.CircleGeometry(0.042, 12);
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x15181c });
  const railSlots = [];
  for (const s of [-1, 1]) {
    for (let z = -9.5; z <= 9.2; z += 1.15) {
      const w = hullHalfWidth(z);
      const t = THREE.MathUtils.clamp((z - 2) / 9, 0, 1);
      const y = DECK_Y + RAIL_H + t * t * 0.35;
      const x = s * (w - 0.115);
      const hole = new THREE.Mesh(holeGeo, holeMat);
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(x, y + 0.004, z);
      boat.add(hole);
      boat.add(pipe(V(s * (w + 0.09), y - 0.5, z + 0.3), V(s * (w + 0.16), y - 0.18, z + 0.3), 0.03, steel));
      railSlots.push({ s, x, y, z });
    }
    const pts = [];
    for (let z = -9.5; z <= 9.6; z += 0.25) {
      const w = hullHalfWidth(z);
      const sag = Math.abs(Math.sin((z + 9.5) * Math.PI / 2.3));
      pts.push(V(s * (w + 0.13), DECK_Y + 0.4 - 0.06 * sag, z));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.02, 6), rope);
    boat.add(shadowed(tube));
  }
  boat.userData.railSlots = railSlots;

  // Spare rods standing in holders (kept clear of where the players stand).
  const rodSpots = [
    [-1, 8.9, 0.1], [-1, 7.75, -0.06], [-1, 1.4, 0.08], [-1, -0.3, -0.05], [-1, -2.6, 0.1],
    [1, 8.2, -0.08], [1, 6.2, 0.07], [1, 3.6, -0.04], [1, 0.6, 0.1], [1, -1.9, -0.08],
  ];
  for (const [s, z, lean] of rodSpots) {
    const w = hullHalfWidth(z);
    const t = THREE.MathUtils.clamp((z - 2) / 9, 0, 1);
    const rod = makeRod(2.5 + Math.abs(lean) * 2);
    rod.position.set(s * (w - 0.115), DECK_Y + RAIL_H + t * t * 0.35 - 0.3, z);
    rod.rotation.z = -s * 0.2;
    rod.rotation.x = lean;
    rod.rotation.y = s > 0 ? Math.PI : 0;
    boat.add(rod);
  }

  // ---- Bow: pulpit rail, anchor winch ----
  const pulpit = { '-1': [], '1': [] };
  for (const s of [-1, 1]) {
    for (const z of [6.5, 8, 9.3, 10.3, 10.95]) {
      const w = Math.max(0.1, hullHalfWidth(z));
      const t = (z - 2) / 9;
      const y0 = DECK_Y + RAIL_H + t * t * 0.35;
      const base = V(s * (w - 0.1), y0, z);
      const top = V(s * (w - 0.1), y0 + 0.42, z);
      boat.add(pipe(base, top, 0.02, steel));
      pulpit[s].push(top);
    }
    for (let i = 0; i < pulpit[s].length - 1; i++) boat.add(pipe(pulpit[s][i], pulpit[s][i + 1], 0.02, steel));
  }
  boat.add(box(0.5, 0.35, 0.6, solidWhite, 0, DECK_Y + 0.175, 9.2));
  boat.add(pipe(V(0, DECK_Y + 0.35, 9.2), V(0, DECK_Y + 0.55, 9.2), 0.09, steel, 12));
  boat.add(box(0.12, 0.3, 0.12, steel, 0.5, DECK_Y + 0.15, 8.3));
  boat.add(box(0.12, 0.3, 0.12, steel, -0.5, DECK_Y + 0.15, 8.3));

  // ---- Cabin ----
  const CAB_W = 4.2, CAB_H = 2.3, CAB_Z0 = -9, CAB_Z1 = 1.2;
  const cabLen = CAB_Z1 - CAB_Z0;
  const cabZ = (CAB_Z0 + CAB_Z1) / 2;
  boat.add(box(CAB_W, CAB_H, cabLen, solidWhite, 0, DECK_Y + CAB_H / 2, cabZ));
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.72), glass);
      win.position.set(s * (CAB_W / 2 + 0.012), DECK_Y + 1.45, CAB_Z0 + 1.2 + i * 1.6);
      win.rotation.y = s * Math.PI / 2;
      boat.add(win);
    }
  }
  const frontZ = CAB_Z1 + 0.012;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.95), toon(0x3a4656));
  door.position.set(0.95, DECK_Y + 0.98, frontZ);
  const doorWin = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.55), glass);
  doorWin.position.set(0.95, DECK_Y + 1.5, frontZ + 0.004);
  const fwin = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), glass);
  fwin.position.set(-0.75, DECK_Y + 1.45, frontZ);
  boat.add(door, doorWin, fwin);
  // Life ring.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.075, 10, 24), orange);
  ring.position.set(-1.72, DECK_Y + 1.35, CAB_Z1 + 0.09);
  boat.add(shadowed(ring));
  for (let i = 0; i < 4; i++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.08, 8, 6, 0.32), solidWhite);
    band.position.copy(ring.position);
    band.rotation.z = i * Math.PI / 2 + 0.6;
    boat.add(band);
  }
  // Hazard-striped step in front of the cabin.
  const hz = hazardTexture();
  hz.wrapS = THREE.RepeatWrapping;
  hz.repeat.x = 2;
  const stepMats = [deckMat, deckMat, toon(0xffffff, { map: hz }), deckMat, toon(0xffffff, { map: hz }), deckMat];
  const step = new THREE.Mesh(new THREE.BoxGeometry(CAB_W + 1.0, 0.1, 0.42), stepMats);
  step.position.set(0, DECK_Y + 0.05, CAB_Z1 + 0.21);
  boat.add(shadowed(step));

  // Upper deck floor with a pointed front.
  const UP_Y = DECK_Y + CAB_H;
  const shape = new THREE.Shape();
  shape.moveTo(-2.3, 9.3); shape.lineTo(-2.3, -1.4); shape.lineTo(0, -2.3); shape.lineTo(2.3, -1.4); shape.lineTo(2.3, 9.3);
  shape.closePath();
  const floorGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, solidWhite);
  floor.position.y = UP_Y;
  boat.add(shadowed(floor));
  const UF = UP_Y + 0.12;

  // Name boards on the angled front.
  const signMat = toon(0xffffff, { map: signTexture() });
  const panelLen = Math.hypot(2.3, 0.9);
  for (const s of [-1, 1]) {
    const mats = [solidWhite, solidWhite, solidWhite, solidWhite, signMat, solidWhite];
    const panel = new THREE.Mesh(new THREE.BoxGeometry(panelLen, 0.85, 0.05), mats);
    panel.position.set(s * 1.15, UF + 0.425, 1.85);
    panel.rotation.y = s * 0.373;
    boat.add(shadowed(panel));
    boat.add(pipe(V(s * 2.3, UF, 1.4), V(s * 2.3, UF + 1.1, 1.4), 0.025, steel));
    boat.add(pipe(V(s * 2.3, UF + 1.1, 1.4), V(0, UF + 1.1, 2.3), 0.025, steel));
    // Side rails.
    const posts = [];
    for (let z = -9.2; z <= 1.41; z += 1.77) posts.push(z);
    posts.forEach((z) => boat.add(pipe(V(s * 2.25, UF, z), V(s * 2.25, UF + 1.1, z), 0.022, steel)));
    boat.add(pipe(V(s * 2.25, UF + 1.1, -9.2), V(s * 2.25, UF + 1.1, 1.4), 0.025, steel));
    boat.add(pipe(V(s * 2.25, UF + 0.55, -9.2), V(s * 2.25, UF + 0.55, 1.4), 0.018, steel));
  }
  boat.add(pipe(V(0, UF, 2.3), V(0, UF + 1.1, 2.3), 0.025, steel));

  // Wheelhouse.
  const WH_W = 3.1, WH_H = 2.0, WH_Z0 = -5.2, WH_Z1 = 0.1;
  boat.add(box(WH_W, WH_H, WH_Z1 - WH_Z0, solidWhite, 0, UF + WH_H / 2, (WH_Z0 + WH_Z1) / 2));
  boat.add(box(WH_W + 0.5, 0.1, WH_Z1 - WH_Z0 + 0.7, solidWhite, 0, UF + WH_H + 0.05, (WH_Z0 + WH_Z1) / 2 + 0.15));
  for (let i = -1; i <= 1; i++) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.8), glass);
    w.position.set(i * 0.98, UF + 1.3, WH_Z1 + 0.012);
    boat.add(w);
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), glass);
      w.position.set(s * (WH_W / 2 + 0.012), UF + 1.3, WH_Z0 + 1.0 + i * 1.6);
      w.rotation.y = s * Math.PI / 2;
      boat.add(w);
    }
  }

  // Mast, radar, antennas, flood light, landing net.
  const ROOF = UF + WH_H + 0.1;
  boat.add(pipe(V(0, ROOF, -2.2), V(0, ROOF + 2.4, -2.2), 0.05, solidWhite));
  boat.add(pipe(V(-1.3, ROOF + 1.5, -2.2), V(1.3, ROOF + 1.5, -2.2), 0.03, solidWhite));
  boat.add(box(0.7, 0.06, 0.6, solidWhite, 0, ROOF + 0.75, -1.85));
  const radar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.33, 0.2, 20), solidWhite);
  radar.position.set(0, ROOF + 0.88, -1.85);
  boat.add(shadowed(radar));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), solidWhite);
  dome.scale.y = 0.45;
  dome.position.set(0, ROOF + 0.98, -1.85);
  boat.add(dome);
  for (const [x, z, h] of [[-1.3, -2.2, 1.8], [1.3, -2.2, 2.4], [-1.1, -4.6, 3.0], [1.2, -4.4, 2.2]]) {
    const y0 = x === -1.1 || x === 1.2 ? ROOF : ROOF + 1.5;
    boat.add(pipe(V(x, y0, z), V(x, y0 + h, z), 0.012, steel, 5));
  }
  boat.add(pipe(V(-1.9, UF, 1.0), V(-1.9, UF + 1.9, 1.0), 0.03, steel));
  const lamp = box(0.42, 0.3, 0.12, toon(0x2a2d33), -1.9, UF + 2.0, 1.06);
  lamp.rotation.x = 0.35;
  const lampFace = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.24), toon(0xe9eef2));
  lampFace.position.set(0, 0, 0.062);
  lamp.add(lampFace);
  boat.add(lamp);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.016, 6, 22), steel);
  hoop.position.set(1.55, UF + 1.75, 0.95);
  hoop.rotation.set(0.2, 0.5, 0);
  const net = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.6, 12, 4, true),
    new THREE.MeshBasicMaterial({ color: 0x1b1f24, wireframe: true })
  );
  net.rotation.x = Math.PI;
  net.position.y = -0.3;
  const netHolder = new THREE.Group();
  netHolder.position.copy(hoop.position);
  netHolder.add(net);
  boat.add(hoop, netHolder, pipe(V(1.55, UF + 0.2, 0.95), V(1.55, UF + 1.45, 0.95), 0.016, steel));

  // Deck props.
  const cooler = box(0.75, 0.42, 0.45, toon(0xe6e8ea), 1.75, DECK_Y + 0.21, 4.4);
  const lid = box(0.78, 0.07, 0.48, toon(0x2f6fb0), 0, 0.245, 0);
  cooler.add(lid);
  cooler.rotation.y = 0.15;
  boat.add(cooler);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.32, 14, 1, true), toon(0xd8dadd, DS));
  bucket.position.set(-1.9, DECK_Y + 0.16, 2.6);
  boat.add(shadowed(bucket));
  const bucketBase = new THREE.Mesh(new THREE.CircleGeometry(0.14, 14), toon(0x4a6f8a));
  bucketBase.rotation.x = -Math.PI / 2;
  bucketBase.position.set(-1.9, DECK_Y + 0.2, 2.6);
  boat.add(bucketBase);

  return boat;
}

// A small sport-fishing boat for the middle distance.
export function makeDistantBoat() {
  const g = new THREE.Group();
  const white = toon(0xe9ebee);
  g.add(box(2.6, 1.1, 8, white, 0, 0.45, 0));
  g.add(box(2.2, 1.2, 3, white, 0, 1.6, -0.3));
  g.add(box(2.4, 0.1, 3.4, white, 0, 3.1, -0.3));
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1.6], [1, -1.6]]) g.add(pipe(V(x, 2.2, z), V(x, 3.1, z), 0.04, white, 5));
  g.add(box(2.0, 0.55, 0.02, toon(0x16222e), 0, 1.8, 1.21));
  g.add(pipe(V(-1.2, 3.1, -1), V(-2.6, 6.4, -2), 0.02, white, 4), pipe(V(1.2, 3.1, -1), V(2.6, 6.4, -2), 0.02, white, 4));
  g.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  return g;
}

export function makeGull() {
  const g = new THREE.Group();
  const white = toon(0xf2f2f2, { side: THREE.DoubleSide });
  const grey = toon(0x8f979f, { side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), white);
  body.scale.set(0.8, 0.7, 2.4);
  g.add(body);
  const wings = [];
  for (const s of [-1, 1]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0.12, 0, 0, -0.1, s * 0.42, 0, 0.02,
      s * 0.42, 0, 0.02, 0, 0, -0.1, s * 0.4, 0, -0.12,
      s * 0.42, 0, 0.02, s * 0.4, 0, -0.12, s * 0.85, 0, -0.16,
    ], 3));
    geo.computeVertexNormals();
    const w = new THREE.Mesh(geo, grey);
    g.add(w);
    wings.push(w);
  }
  g.userData.wings = wings;
  return g;
}
