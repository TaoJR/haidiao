import * as THREE from 'three';
import { toon, addOutline } from './toon.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Y_AXIS = V(0, 1, 0);
const RIM = 0.55;
const OUTLINE = 0.0045;

// ---------- Face textures ----------
const FACE_W = 1024, FACE_H = 512;

function ell(g, x, y, rx, ry) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

function drawFace(spec, expr) {
  const c = document.createElement('canvas');
  c.width = FACE_W;
  c.height = FACE_H;
  const g = c.getContext('2d');
  g.fillStyle = spec.skin;
  g.fillRect(0, 0, FACE_W, FACE_H);
  const cx = 256, ey = 274, dx = 62;
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // Blush.
  g.fillStyle = 'rgba(255, 120, 110, 0.2)';
  ell(g, cx - dx - 14, ey + 46, 24, 12);
  ell(g, cx + dx + 14, ey + 46, 24, 12);

  for (const s of [-1, 1]) {
    const x = cx + s * dx;
    let mode = expr.eyes;
    if (mode === 'wink') mode = s === 1 ? 'happy' : 'open';
    if (mode === 'open') {
      g.fillStyle = '#ffffff';
      ell(g, x, ey, 23, 29);
      g.fillStyle = spec.iris;
      ell(g, x, ey + 3, 18, 25);
      g.fillStyle = '#1b1210';
      ell(g, x, ey + 5, 10, 15);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      ell(g, x + 4, ey + 17, 8, 5);
      g.fillStyle = '#ffffff';
      ell(g, x - 7, ey - 8, 6, 7);
      // Half-lidded look: cover the top of the eye with skin.
      const lid = spec.lid || 0;
      const lidY = ey - 30 + lid * 58;
      if (lid > 0) {
        g.fillStyle = spec.skin;
        g.fillRect(x - 32, ey - 40, 64, lidY - (ey - 40));
      }
      g.strokeStyle = '#2a1b1a';
      g.lineWidth = 8;
      g.beginPath();
      if (lid > 0) {
        g.moveTo(x - 25, lidY + 3);
        g.quadraticCurveTo(x, lidY - 5, x + 25, lidY + 3);
      } else {
        g.moveTo(x - 25, ey - 12);
        g.quadraticCurveTo(x, ey - 40, x + 25, ey - 12);
      }
      g.stroke();
      // Outer lash flick.
      g.lineWidth = 5;
      g.beginPath();
      const ly = lid > 0 ? lidY + 3 : ey - 12;
      g.moveTo(x + s * 25, ly);
      g.lineTo(x + s * 33, ly - 5);
      g.stroke();
    } else if (mode === 'happy') {
      g.strokeStyle = '#2a1b1a';
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(x - 23, ey + 8);
      g.quadraticCurveTo(x, ey - 20, x + 23, ey + 8);
      g.stroke();
    } else if (mode === 'closed') {
      g.strokeStyle = '#2a1b1a';
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(x - 23, ey + 2);
      g.quadraticCurveTo(x, ey + 14, x + 23, ey + 2);
      g.stroke();
    } else if (mode === 'effort') {
      g.strokeStyle = '#2a1b1a';
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(x - s * 20, ey - 14);
      g.lineTo(x + s * 14, ey);
      g.lineTo(x - s * 20, ey + 14);
      g.stroke();
    }
    // Brows.
    g.strokeStyle = spec.brow;
    g.lineWidth = 7;
    g.beginPath();
    const by = ey - 54 + (expr.browLift || 0);
    const tilt = (expr.browTilt || 0) * s;
    g.moveTo(x - 24, by + tilt);
    g.quadraticCurveTo(x, by - 7, x + 24, by - tilt);
    g.stroke();
  }

  // Nose hint and mouth.
  g.fillStyle = 'rgba(190, 120, 100, 0.5)';
  ell(g, cx, ey + 38, 4, 3);
  const my = ey + 70;
  g.strokeStyle = '#8a3b33';
  g.lineWidth = 6;
  g.beginPath();
  if (expr.mouth === 'smile') {
    g.moveTo(cx - 22, my - 4);
    g.quadraticCurveTo(cx, my + 14, cx + 22, my - 4);
    g.stroke();
  } else if (expr.mouth === 'flat') {
    g.moveTo(cx - 13, my + 2);
    g.lineTo(cx + 13, my);
    g.stroke();
  } else if (expr.mouth === 'open') {
    g.fillStyle = '#7a2b2b';
    g.beginPath();
    g.ellipse(cx, my + 4, 17, 15, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e88a85';
    ell(g, cx, my + 12, 10, 6);
  } else if (expr.mouth === 'grit') {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(cx - 20, my - 7, 40, 17, 6);
    g.fill();
    g.lineWidth = 4;
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const EXPRESSIONS = {
  blink: { eyes: 'closed' },
  happy: { eyes: 'happy', mouth: 'open', browLift: -6 },
  effort: { eyes: 'effort', mouth: 'grit', browTilt: 6 },
  surprised: { eyes: 'open', mouth: 'open', browLift: -12 },
};

// ---------- Geometry helpers ----------
function blob(mat, r, sx, sy, sz, x, y, z, outline = OUTLINE) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (outline) addOutline(m, outline / Math.max(0.2, Math.min(sx, sy, sz)) * 0.6);
  return m;
}

// Open sphere cap hugging the skull: used for fringes. Front of the head is phi = PI/2.
function shell(mat, r, phi0, phi1, thetaLen, tiltZ, tiltX = 0) {
  const geo = new THREE.SphereGeometry(r, 28, 14, Math.PI / 2 + phi0, phi1 - phi0, 0, thetaLen);
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(0.975, 1.0, 0.955);
  m.rotation.set(tiltX, 0, tiltZ);
  m.castShadow = true;
  addOutline(m, OUTLINE * 0.8);
  return m;
}

const css = (hex) => '#' + hex.toString(16).padStart(6, '0');

// Jacket detail painted onto the torso lathe; u = 0 and u = 1 meet at the front centre.
function jacketTexture(kind, base) {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = css(base);
  g.fillRect(0, 0, W, H);
  const strip = (u0, u1, color) => {
    g.fillStyle = color;
    g.fillRect(u0 * W, 0, (u1 - u0) * W, H);
    g.fillRect((1 - u1) * W, 0, (u1 - u0) * W, H);
  };
  if (kind === 'a') {
    strip(0, 0.07, '#3a211d');
    strip(0, 0.064, '#b53b2c');
    strip(0.03, 0.034, '#7e241b');
    strip(0, 0.03, '#f2f0ea');
    strip(0, 0.0025, '#d2cfc7');
    // Small chest patch on their left.
    g.fillStyle = '#efece6';
    g.fillRect(0.105 * W, 232, 34, 20);
    // Hem and pocket seams.
    g.fillStyle = 'rgba(40, 18, 14, 0.35)';
    g.fillRect(0, 420, W, 5);
    g.fillRect(0.14 * W, 330, 70, 4);
    g.fillRect((1 - 0.14) * W - 70, 330, 70, 4);
  } else {
    strip(0, 0.03, '#d44a1a');
    strip(0.028, 0.031, '#9a3410');
    strip(0, 0.006, '#2a2b30');
    g.strokeStyle = '#2a2b30';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(0.075 * W, 215);
    g.lineTo(0.15 * W, 250);
    g.stroke();
    g.fillStyle = 'rgba(110, 35, 8, 0.4)';
    g.fillRect(0, 300, W, 4);
    g.fillRect(0, 440, W, 5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

class Limb {
  constructor(parent, a, b, rA, rB, rEnd, matA, matB, matEnd) {
    this.a = a;
    this.b = b;
    const cyl = (r1, r2) => new THREE.CylinderGeometry(r2, r1, 1, 12, 1, true);
    this.segA = new THREE.Mesh(cyl(rA, rB), matA);
    this.segB = new THREE.Mesh(cyl(rB, rB * 0.92), matB);
    this.jS = new THREE.Mesh(new THREE.SphereGeometry(rA, 12, 10), matA);
    this.jE = new THREE.Mesh(new THREE.SphereGeometry(rB, 12, 10), matA);
    this.jH = new THREE.Mesh(new THREE.SphereGeometry(rEnd, 14, 10), matEnd);
    for (const m of [this.segA, this.segB, this.jS, this.jE, this.jH]) {
      m.castShadow = true;
      m.receiveShadow = true;
      addOutline(m, OUTLINE);
      parent.add(m);
    }
    this.E = V(0, 0, 0);
    this._d = V(0, 0, 0);
    this._p = V(0, 0, 0);
  }

  static place(mesh, P, Q, tmp) {
    tmp.subVectors(Q, P);
    const len = Math.max(1e-4, tmp.length());
    mesh.position.lerpVectors(P, Q, 0.5);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, tmp.divideScalar(len));
  }

  // Two-bone IK from S to T, bending toward `hint`.
  solve(S, T, hint) {
    const { a, b } = this;
    const d = this._d.subVectors(T, S);
    let len = d.length();
    const max = (a + b) * 0.999;
    if (len > max) { d.multiplyScalar(max / len); len = max; }
    const H = this._p.copy(S).add(d);
    const dir = d.clone().divideScalar(len);
    const cosA = THREE.MathUtils.clamp((a * a + len * len - b * b) / (2 * a * len), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const perp = hint.clone().addScaledVector(dir, -hint.dot(dir));
    if (perp.lengthSq() < 1e-6) perp.set(0, 0, 1);
    perp.normalize();
    this.E.copy(S).addScaledVector(dir, a * cosA).addScaledVector(perp, a * sinA);
    const tmp = V(0, 0, 0);
    Limb.place(this.segA, S, this.E, tmp);
    Limb.place(this.segB, this.E, H, tmp);
    this.jS.position.copy(S);
    this.jE.position.copy(this.E);
    this.jH.position.copy(H);
    return H;
  }
}

// ---------- Character specs ----------
export const SPECS = {
  // Long black hair, brown-red shell over a red fleece and white shirt.
  a: {
    name: 'a', height: 1.1,
    skin: '#f3d3bd', iris: '#3a2a26', brow: '#1d1718', lid: 0.36,
    base: { eyes: 'open', mouth: 'flat' },
    hair: 0x211e27, jacket: 0x7b3b30, pants: 0x2c2f36, shoes: 0x2a2a2e, legR: [0.07, 0.062],
  },
  // Blonde bob, orange shell, grey sweatpants, sunglasses.
  b: {
    name: 'b', height: 1.04,
    skin: '#f6d6c0', iris: '#4a3326', brow: '#6b4a32', lid: 0,
    base: { eyes: 'open', mouth: 'smile' },
    hair: 0xdcb878, jacket: 0xe4531f, pants: 0xb7bac1, shoes: 0xeeeeea, legR: [0.082, 0.086],
  },
};

export class Character {
  constructor(kind) {
    const spec = (this.spec = SPECS[kind]);
    this.kind = kind;
    this.root = new THREE.Group();
    this.root.scale.setScalar(spec.height);
    this.body = new THREE.Group();
    this.root.add(this.body);

    const skinMat = toon(new THREE.Color(spec.skin), { rim: RIM });
    const jacket = toon(spec.jacket, { rim: RIM });
    const pants = toon(spec.pants, { rim: RIM * 0.6 });
    const shoes = toon(spec.shoes, { rim: RIM * 0.5 });
    const hairMat = toon(spec.hair, { rim: kind === 'a' ? 0.9 : 0.5 });
    this.mats = { skinMat, jacket, pants, shoes, hairMat };

    // Torso (jacket), lathe profile squashed front-to-back.
    const longJacket = kind === 'b';
    const profile = [
      [0.0, longJacket ? -0.17 : -0.1], [0.17, longJacket ? -0.17 : -0.1], [0.19, longJacket ? -0.13 : -0.06],
      [0.188, 0.05], [0.18, 0.2], [0.172, 0.31], [0.14, 0.39], [0.085, 0.435], [0.06, 0.46], [0.0, 0.46],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const torsoMat = toon(0xffffff, { rim: RIM, map: jacketTexture(kind, spec.jacket) });
    const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), torsoMat);
    torso.scale.z = 0.72;
    torso.castShadow = true;
    torso.receiveShadow = true;
    addOutline(torso, OUTLINE);
    this.body.add(torso);
    this.body.add(blob(pants, 0.16, 1, 0.75, 0.72, 0, -0.06, 0));

    // Hood resting on the shoulders.
    this.body.add(blob(jacket, 0.1, 1.5, 0.6, 0.85, 0, 0.42, -0.085));

    this.body.add(blob(toon(0x1c1c20), kind === 'a' ? 0.06 : 0.065, 1, 0.5, 0.9, 0, 0.44, 0.02, 0));
    for (const sd of [-1, 1]) {
      const collar = blob(toon(kind === 'a' ? 0x26262b : 0xf3f2ee), 0.05, 1.1, 0.35, 0.8, sd * 0.05, 0.447, 0.068, 0);
      collar.rotation.z = sd * 0.5;
      collar.rotation.y = sd * 0.4;
      this.body.add(collar);
    }

    // Neck and head.
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.1, 12), skinMat);
    neck.position.y = 0.49;
    this.body.add(neck);
    this.head = new THREE.Group();
    this.head.position.y = 0.7;
    this.body.add(this.head);

    this.faces = { base: drawFace(spec, spec.base) };
    for (const k in EXPRESSIONS) this.faces[k] = drawFace(spec, { ...spec.base, ...EXPRESSIONS[k] });
    this.faceMat = toon(0xffffff, { rim: RIM, map: this.faces.base });
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 40, 28), this.faceMat);
    skull.scale.set(0.96, 1.0, 0.94);
    skull.castShadow = true;
    skull.receiveShadow = true;
    addOutline(skull, OUTLINE);
    this.head.add(skull);

    this.hairParts = [];
    this.buildHair(kind, hairMat);

    // Limbs live in root space and are solved every frame.
    const [rThigh, rShin] = spec.legR;
    this.armL = new Limb(this.root, 0.25, 0.24, 0.062, 0.054, 0.05, jacket, jacket, skinMat);
    this.armR = new Limb(this.root, 0.25, 0.24, 0.062, 0.054, 0.05, jacket, jacket, skinMat);
    this.legL = new Limb(this.root, 0.295, 0.295, rThigh, rShin, rShin * 0.9, pants, pants, pants);
    this.legR = new Limb(this.root, 0.295, 0.295, rThigh, rShin, rShin * 0.9, pants, pants, pants);
    this.shoeL = blob(shoes, 0.07, 0.95, 0.7, 1.75, 0, 0, 0);
    this.shoeR = blob(shoes, 0.07, 0.95, 0.7, 1.75, 0, 0, 0);
    this.root.add(this.shoeL, this.shoeR);

    // Pose targets, in root space (character faces +Z; +X is their left).
    this.pose = {
      hips: V(0, 0.672, 0),
      lean: new THREE.Euler(0, 0, 0),
      head: new THREE.Euler(0, 0, 0),
      handL: V(0.24, 0.6, 0.06),
      handR: V(-0.24, 0.6, 0.06),
      footL: V(0.095, 0.07, 0),
      footR: V(-0.095, 0.07, 0),
      footYaw: 0.18,
    };
    this.expr = 'base';
    this.exprUntil = 0;
    this.blinkAt = 1 + Math.random() * 3;
    this.t = Math.random() * 10;
    this.wind = 0.5;
  }

  buildHair(kind, mat) {
    const h = this.head;
    const add = (m, sway = 0) => {
      h.add(m);
      if (sway) this.hairParts.push({ m, sway, rz: m.rotation.z, rx: m.rotation.x });
      return m;
    };
    const matDS = toon(this.spec.hair, { rim: kind === 'a' ? 0.9 : 0.5, side: THREE.DoubleSide });
    if (kind === 'a') {
      add(blob(mat, 0.215, 1, 1, 1, 0, 0.014, -0.036));
      add(blob(mat, 0.2, 1.0, 1.35, 0.6, 0, -0.17, -0.1), 0.03);
      // Centre-parted fringe: two caps sloping down and outward.
      add(shell(matDS, 0.209, -0.02, 1.45, 1.3, -0.4));
      add(shell(matDS, 0.209, -1.45, 0.02, 1.3, 0.4));
      for (const s of [-1, 1]) {
        // Long curtains framing the face, down to the shoulders.
        const lock = blob(mat, 0.1, 0.62, 2.5, 0.62, s * 0.158, -0.1, 0.075);
        lock.rotation.z = s * 0.07;
        add(lock, 0.06 * s);
        const inner = blob(mat, 0.1, 0.36, 1.9, 0.36, s * 0.132, -0.04, 0.132);
        inner.rotation.z = s * 0.14;
        add(inner, 0.08 * s);
      }
      // One wind-blown strand across the face.
      const strand = blob(mat, 0.1, 0.075, 1.2, 0.06, 0.035, 0.0, 0.193, 0);
      strand.rotation.z = 0.42;
      add(strand, 0.12);
    } else {
      add(blob(mat, 0.218, 1, 1, 1, 0, 0.016, -0.03));
      // Bob: a bell that tucks in at the jaw, open at the front for the face.
      const bobPts = [[0.2, 0.1], [0.222, 0.02], [0.23, -0.07], [0.226, -0.14], [0.205, -0.2], [0.17, -0.232], [0.13, -0.24]]
        .map(([r, y]) => new THREE.Vector2(r, y));
      const bob = new THREE.Mesh(new THREE.LatheGeometry(bobPts, 36, 0.95, Math.PI * 2 - 1.9), matDS);
      bob.scale.set(0.97, 1, 0.95);
      bob.position.z = -0.022;
      bob.castShadow = true;
      addOutline(bob, OUTLINE);
      add(bob);
      // Side-swept fringe.
      add(shell(matDS, 0.21, -0.75, 1.5, 1.24, -0.3));
      add(shell(matDS, 0.209, -1.5, -0.55, 1.1, 0.55));

      // Sunglasses: worn in bright sun, pushed up otherwise.
      const g = new THREE.Group();
      const lensMat = toon(0x141418);
      for (const s of [-1, 1]) {
        const lens = blob(lensMat, 0.05, 1.25, 0.8, 0.3, s * 0.072, 0, 0, 0);
        lens.rotation.y = s * 0.33;
        lens.rotation.z = -s * 0.12;
        g.add(lens);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.2), lensMat);
        arm.position.set(s * 0.145, 0.005, -0.105);
        arm.rotation.y = -s * 0.12;
        g.add(arm);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.012), lensMat);
      bridge.position.set(0, 0.008, 0.012);
      g.add(bridge);
      this.glasses = g;
      this.glassesWorn = 1;
      h.add(g);
    }
  }

  setExpression(name, seconds = 0) {
    this.expr = name;
    this.exprUntil = seconds > 0 ? this.t + seconds : Infinity;
    if (name === 'base') this.exprUntil = 0;
  }

  // 1 = on the eyes, 0 = pushed up into the hair.
  setGlasses(worn) {
    this.glassesTarget = worn ? 1 : 0;
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    const p = this.pose;

    // Face: timed expression, otherwise blink now and then.
    let face = this.expr;
    if (this.expr !== 'base' && t > this.exprUntil) this.expr = face = 'base';
    if (face === 'base') {
      if (t > this.blinkAt) {
        face = 'blink';
        if (t > this.blinkAt + 0.12) this.blinkAt = t + 1.8 + Math.random() * 3.5;
      }
    }
    if (this.faceMat.map !== this.faces[face]) this.faceMat.map = this.faces[face];

    if (this.glasses) {
      const target = this.glassesTarget ?? 1;
      this.glassesWorn += (target - this.glassesWorn) * (1 - Math.exp(-dt * 6));
      const w = this.glassesWorn;
      this.glasses.position.set(0, THREE.MathUtils.lerp(0.175, -0.012, w), THREE.MathUtils.lerp(0.085, 0.186, w));
      this.glasses.rotation.x = THREE.MathUtils.lerp(-0.95, 0.04, w);
    }

    // Breathing and weight shift.
    const breathe = Math.sin(t * 1.7) * 0.004;
    this.body.position.copy(p.hips);
    this.body.position.y += breathe;
    this.body.rotation.copy(p.lean);
    this.head.rotation.copy(p.head);
    this.head.rotation.z += Math.sin(t * 0.8) * 0.015;

    // Hair moves with the wind.
    for (const h of this.hairParts) {
      h.m.rotation.z = h.rz + (Math.sin(t * 2.3 + h.m.position.y * 9) * 0.5 + 0.6) * h.sway * this.wind;
      h.m.rotation.x = h.rx + Math.sin(t * 1.9 + h.m.position.x * 7) * Math.abs(h.sway) * 0.5 * this.wind;
    }

    this.body.updateMatrix();
    const M = this.body.matrix;
    const sL = V(0.185, 0.355, 0).applyMatrix4(M);
    const sR = V(-0.185, 0.355, 0).applyMatrix4(M);
    const hL = V(0.088, -0.03, 0).applyMatrix4(M);
    const hR = V(-0.088, -0.03, 0).applyMatrix4(M);
    this.armL.solve(sL, p.handL, V(0.5, -0.7, -0.5));
    this.armR.solve(sR, p.handR, V(-0.5, -0.7, -0.5));
    this.legL.solve(hL, p.footL, V(0.12, 0, 1));
    this.legR.solve(hR, p.footR, V(-0.12, 0, 1));
    this.shoeL.position.copy(p.footL).add(V(0.012, -0.028, 0.035));
    this.shoeR.position.copy(p.footR).add(V(-0.012, -0.028, 0.035));
    this.shoeL.rotation.y = p.footYaw;
    this.shoeR.rotation.y = -p.footYaw;
  }
}
