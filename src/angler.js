import * as THREE from 'three';
import { toon } from './toon.js';
import { waveHeight } from './water.js';
import { makeFishModel, SPECIES_BY_ID } from './fish.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// Shared by every fishing line; main.js keeps its resolution in sync with the canvas.
export const lineMaterial = new LineMaterial({ color: 0xffffff, linewidth: 1.6, transparent: true, opacity: 0.85 });

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Y_AXIS = V(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const ROD_L = 2.25;
const SEG_S = [0, 0.5, 0.95, 1.2, 1.42, 1.62, 1.8, 1.96, 2.1, ROD_L];
const SEG_R = [0.021, 0.016, 0.012, 0.0105, 0.009, 0.0078, 0.0066, 0.0055, 0.0045, 0.0035];
const LINE_N = 24;
const NET_WINDOW = 4.5; // seconds a big fish stays within reach of the landing net

const pose = (dir, butt, lean, head) => ({ dir: dir.normalize(), butt, lean, head });
const POSES = {
  idle: pose(V(0, 0.72, 0.69), V(-0.05, 0.58, 0.16), 0, 0),
  back: pose(V(0.12, 0.76, -0.64), V(-0.08, 0.74, 0.08), -0.2, -0.1),
  fwd: pose(V(0, 0.32, 0.95), V(-0.05, 0.62, 0.22), 0.22, 0.05),
  wait: pose(V(0, 0.52, 0.85), V(-0.05, 0.58, 0.16), 0.03, 0.06),
  fight: pose(V(0, 0.88, 0.47), V(-0.05, 0.6, 0.13), -0.2, 0.1),
  landed: pose(V(-0.08, 0.95, 0.3), V(-0.04, 0.56, 0.14), -0.04, -0.28),
};

// Straight out to sea from the port rail, swung by `a` radians.
const dirOut = (a, out = V(0, 0, 0)) => out.set(-Math.cos(a), 0, Math.sin(a));

export class Angler {
  constructor(char, scene) {
    this.char = char;
    this.scene = scene;
    this.baseYaw = -Math.PI / 2;
    this.input = { down: false, aim: 0 };
    this.prevDown = false;
    this.auto = null;
    this.remote = false;
    this.listeners = {};

    this.state = 'idle';
    this.t = 0;
    this.aim = 0;
    this.power = 0;
    this.castPower = 0;
    this.T = 0;
    this.dist = 0;
    this.stamina = 1;
    this.surge = 0;
    this.fightAng = 0;
    this.reeling = false;
    this.dip = 0;
    this.pending = null;
    this.caught = null;
    this.shadow = null;
    this.fishDelay = 2;

    this.bob = V(0, 0, 0);
    this.fishPos = V(0, 0, 0);
    this.tipWorld = V(0, 3, 0);
    this.lineEnd = V(0, 0, 0);
    this.origin = V(0, 0, 0);
    this.netT = -1;
    this.netBob = V(0, 0, 0);
    this.netFish = V(0, 0, 0);
    this.flightFrom = V(0, 0, 0);
    this.flightTo = V(0, 0, 0);
    this.retrieveFrom = V(0, 0, 0);

    this.rodDir = POSES.idle.dir.clone();
    this.rodButt = POSES.idle.butt.clone();
    this.lean = 0;
    this.headX = 0;
    this.bend = 0;
    this.pts = SEG_S.map(() => V(0, 0, 0));

    this.buildRod();
    this.buildTackle();
  }

  on(name, fn) { (this.listeners[name] ||= []).push(fn); return this; }
  emit(name, data) { (this.listeners[name] || []).forEach((fn) => fn(data, this)); }

  buildRod() {
    const mats = [toon(0x26262b), toon(0xa3271f), toon(0x1d1a1c)];
    this.segs = [];
    for (let i = 0; i < SEG_S.length - 1; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(SEG_R[i + 1], SEG_R[i], 1, 7), mats[Math.min(i, 2)]);
      m.castShadow = true;
      this.char.root.add(m);
      this.segs.push(m);
    }
    const steel = toon(0xaeb6c0);
    this.reel = new THREE.Group();
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.07, 14), steel);
    drum.rotation.z = Math.PI / 2;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.08, 12), toon(0x1d1a1c));
    core.rotation.z = Math.PI / 2;
    this.crank = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.085, 0.014), steel);
    this.crank.position.x = -0.05;
    this.reel.add(drum, core, this.crank);
    drum.castShadow = true;
    this.char.root.add(this.reel);
  }

  buildTackle() {
    const geo = new LineGeometry();
    geo.setPositions(new Float32Array(LINE_N * 3));
    this.line = new Line2(geo, lineMaterial);
    this.line.frustumCulled = false;
    this.linePts = Array.from({ length: LINE_N }, () => V(0, 0, 0));
    this.scene.add(this.line);

    this.bobber = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xe2351f));
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon(0xf4f4f0));
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), toon(0xf4f4f0));
    stem.position.y = 0.14;
    this.bobber.add(top, bottom, stem);
    this.scene.add(this.bobber);
    this.fishHolder = new THREE.Group();
    this.scene.add(this.fishHolder);
  }

  setState(s) {
    this.state = s;
    this.t = 0;
    if (this.auto) this.autoOnState(s);
    this.emit('state', s);
  }

  // ---- Hooks for the world ----
  wantsFish() { return !this.remote && this.state === 'wait' && !this.shadow && this.t > this.fishDelay; }
  nibble() { this.dip = 1; this.emit('nibble'); }
  bite(sp, size) {
    if (this.state !== 'wait') return;
    this.pending = { sp, size };
    this.biteWindow = 0.95;
    this.setState('bite');
    this.emit('bite');
  }

  // ---- AI companion ----
  enableAuto() {
    this.auto = { timer: 2 + Math.random() * 3, power: 0.6, react: 0.4, hold: false };
  }
  autoOnState(s) {
    const a = this.auto;
    if (s === 'idle') { a.timer = 2.5 + Math.random() * 4; a.power = 0.3 + Math.random() * 0.65; }
    if (s === 'bite') a.react = Math.random() < 0.15 ? 9 : 0.25 + Math.random() * 0.45;
    if (s === 'landed') a.timer = 3;
    a.hold = false;
  }
  autoInput(dt) {
    const a = this.auto, inp = this.input;
    a.timer -= dt;
    switch (this.state) {
      case 'idle': inp.down = a.timer <= 0; inp.aim = a.hint ? a.hint.aim : Math.sin(this.char.t * 0.13) * 0.3; break;
      case 'charge': inp.down = this.t < (a.hint ? a.hint.power : a.power) / 0.85; break;
      case 'wait': inp.down = this.t > 28; break;
      case 'bite': inp.down = this.t > a.react; break;
      case 'fight':
        if (this.T < 0.55) a.hold = true;
        if (this.T > 0.82) a.hold = false;
        inp.down = a.hold;
        break;
      case 'landed': inp.down = a.timer <= 0 && Math.sin(this.t * 20) > 0; break;
      default: inp.down = false;
    }
  }

  // ---- Network mirror ----
  // What the other player needs to draw this angler.
  snapshot() {
    const r = (v) => Math.round(v * 100) / 100;
    const fish = this.caught || this.pending;
    return {
      st: this.state, aim: r(this.aim), pw: r(this.power), cp: r(this.castPower), la: this.launched ? 1 : 0,
      b: [r(this.bob.x), r(this.bob.y), r(this.bob.z)], f: [r(this.fishPos.x), r(this.fishPos.z)],
      T: r(this.T), fa: r(this.fightAng), su: r(this.surge), rl: this.reeling ? 1 : 0, jt: r(this.jumpT ?? -1),
      sp: fish ? fish.sp.id : null, sz: fish ? fish.size : 0,
    };
  }

  setRemote(on) {
    this.remote = on;
    this.netBob = this.bob.clone();
    this.netFish = this.fishPos.clone();
    this.caught = null;
    this.pending = null;
    this.state = 'idle';
    this.t = 0;
    this.input = { down: false, aim: 0 };
    this.prevDown = false;
    if (on) this.auto = null; else this.enableAuto();
  }

  // Everything in `p` came from another browser: validate before use.
  applyRemote(p) {
    const STATES = ['idle', 'charge', 'cast', 'wait', 'bite', 'fight', 'net', 'landed', 'retrieve'];
    if (!p || !STATES.includes(p.st)) return;
    const num = (v, lo, hi, d = 0) => (Number.isFinite(v) ? clamp(v, lo, hi) : d);
    const sp = typeof p.sp === 'string' ? SPECIES_BY_ID[p.sp] : null;
    if (Array.isArray(p.b)) this.netBob.set(num(p.b[0], -60, 10), num(p.b[1], -2, 12), num(p.b[2], -40, 40));
    if (Array.isArray(p.f)) this.netFish.set(num(p.f[0], -60, 10), -0.08, num(p.f[1], -40, 40));
    if (p.st !== this.state) {
      const prev = this.state;
      if (p.st === 'retrieve') this.retrieveFrom.copy(prev === 'fight' || prev === 'net' ? this.fishPos : this.bob);
      if (p.st === 'net') this.emit('net');
      if (p.st === 'fight' && prev === 'net') this.emit('netfail');
      if (p.st === 'cast') this.bob.copy(this.tipWorld);
      const withFish = p.st === 'fight' || p.st === 'net' || p.st === 'landed';
      if (withFish && sp && prev !== 'fight' && prev !== 'net') {
        this.caught = { sp, size: num(p.sz, 1, 300, sp.min) };
        this.showFish(sp, this.caught.size);
        this.fishPos.copy(this.netFish);
      }
      if (withFish && !sp) return;
      if (p.st === 'wait' && prev === 'cast') this.emit('splash', { pos: this.netBob, size: 0.7 });
      if (p.st === 'landed') this.emit('splash', { pos: this.fishPos, size: 1.1 });
      if (p.st === 'cast') this.emit('cast');
      if (p.st === 'bite') this.emit('bite');
      this.state = p.st;
      this.t = 0;
      this.emit('state', p.st);
    }
    this.aim = num(p.aim, -0.6, 0.6);
    this.power = num(p.pw, 0, 1);
    this.castPower = num(p.cp, 0, 1);
    this.launched = !!p.la;
    this.T = num(p.T, 0, 1.2);
    this.fightAng = num(p.fa, -1, 1);
    this.surge = num(p.su, 0, 1);
    this.reeling = !!p.rl;
    this.jumpT = num(p.jt, -1, 1, -1);
  }

  // ---- Simulation ----
  update(dt, time) {
    this.char.root.getWorldPosition(this.origin);
    if (!this.remote) {
      if (this.auto) this.autoInput(dt);
      this.simulate(dt, time);
    } else {
      this.t += dt;
      const k = 1 - Math.exp(-dt * 14);
      if (this.state === 'wait' || this.state === 'bite' || (this.state === 'cast' && this.launched)) {
        this.bob.x += (this.netBob.x - this.bob.x) * k;
        this.bob.z += (this.netBob.z - this.bob.z) * k;
        if (this.state === 'cast') this.bob.y += (this.netBob.y - this.bob.y) * k;
      }
      this.fishPos.lerp(this.netFish, k);
      if (this.state === 'fight') {
        this.splashT = (this.splashT || 0) - dt;
        if (this.splashT <= 0 && this.surge > 0.5) { this.splashT = 0.25; this.emit('splash', { pos: this.fishPos, size: 0.5 }); }
      }
    }
    this.updateVisual(dt, time);
  }

  simulate(dt, time) {
    const inp = this.input;
    const pressed = inp.down && !this.prevDown;
    this.prevDown = inp.down;
    this.t += dt;
    const aimK = 1 - Math.exp(-dt * 8);
    switch (this.state) {
      case 'idle':
        this.aim += (clamp(inp.aim, -0.5, 0.5) - this.aim) * aimK;
        if (pressed) { this.power = 0; this.setState('charge'); }
        break;
      case 'charge': {
        this.aim += (clamp(inp.aim, -0.5, 0.5) - this.aim) * aimK;
        const ph = (this.t * 0.85) % 2;
        this.power = ph < 1 ? ph : 2 - ph;
        if (!inp.down) {
          this.castPower = Math.max(0.1, this.power);
          this.launched = false;
          this.setState('cast');
          this.emit('cast');
        }
        break;
      }
      case 'cast':
        if (!this.launched && this.t >= 0.2) {
          this.launched = true;
          this.flightFrom.copy(this.tipWorld);
          const d = 6 + 16 * this.castPower;
          dirOut(this.aim, this.flightTo).multiplyScalar(d).add(this.origin);
          this.flightTo.y = 0;
          this.flightT = 0.55 + 0.55 * this.castPower;
        }
        if (this.launched) {
          const u = (this.t - 0.2) / this.flightT;
          if (u >= 1) {
            this.bob.copy(this.flightTo);
            this.fishDelay = 1 + Math.random() * 2.2;
            this.setState('wait');
            this.emit('splash', { pos: this.bob, size: 0.7 });
          } else {
            this.bob.lerpVectors(this.flightFrom, this.flightTo, u);
            this.bob.y += (1.4 + 3 * this.castPower) * 4 * u * (1 - u);
          }
        }
        break;
      case 'wait':
        if (pressed) this.startRetrieve(this.bob);
        break;
      case 'bite':
        if (pressed) this.startFight(time);
        else if (this.t > this.biteWindow) {
          this.pending = null;
          this.emit('lost', { reason: 'late' });
          this.startRetrieve(this.bob);
        }
        break;
      case 'fight':
        this.simFight(dt, inp.down, time);
        break;
      case 'net':
        // Big fish held at the boat: someone else has to net it before it bolts.
        dirOut(this.fightAng, this.fishPos).multiplyScalar(3.2).add(this.origin);
        this.fishPos.y = -0.08;
        this.splashT -= dt;
        if (this.splashT <= 0) { this.splashT = 0.3; this.emit('splash', { pos: this.fishPos, size: 0.45 }); }
        if (this.t > NET_WINDOW) {
          this.dist = 5.5 + Math.random() * 2;
          this.T = 0.45;
          this.over = 0;
          this.slack = 0;
          this.surging = true;
          this.phaseT = 1.2;
          this.emit('netfail');
          this.setState('fight');
        }
        break;
      case 'landed':
        if (this.t > 0.9 && pressed) {
          this.caught = null;
          this.setState('idle');
        }
        break;
      case 'retrieve':
        if (this.t > 0.55) this.setState('idle');
        break;
    }
  }

  startRetrieve(from) {
    this.retrieveFrom.copy(from);
    this.setState('retrieve');
  }

  startFight() {
    this.caught = this.pending;
    this.pending = null;
    this.dist = Math.max(4, V(this.bob.x - this.origin.x, 0, this.bob.z - this.origin.z).length());
    this.startDist = this.dist;
    this.fightAng = this.aim;
    this.fightAngTarget = this.aim;
    this.T = 0.4;
    this.stamina = 1;
    this.surge = 0;
    this.surging = false;
    this.phaseT = 0.6;
    this.over = 0;
    this.slack = 0;
    this.splashT = 0;
    this.jumpT = -1;
    this.jumpCd = 1.5;
    this.showFish(this.caught.sp, this.caught.size);
    this.setState('fight');
    this.emit('hook', this.caught);
  }

  simFight(dt, held) {
    const s = this.caught.sp.strength;
    this.reeling = held;
    this.phaseT -= dt;
    if (this.phaseT <= 0) {
      this.surging = !this.surging;
      this.phaseT = this.surging ? 0.7 + Math.random() * 1.1 : (0.7 + Math.random() * 1.5) / (0.6 + s);
      if (this.surging) this.fightAngTarget = clamp(this.aim + (Math.random() - 0.5) * 1.3, -0.9, 0.9);
    }
    this.surge += ((this.surging ? 1 : 0) - this.surge) * (1 - Math.exp(-dt * 5));
    this.fightAng += (this.fightAngTarget - this.fightAng) * (1 - Math.exp(-dt * 1.1));
    const pull = (0.22 + 0.78 * this.surge) * (0.35 + 0.65 * s) * (0.4 + 0.6 * this.stamina);
    if (held) {
      this.T += (0.34 + 0.95 * pull) * dt;
      this.dist -= (2.7 + 1.4 * (1 - s)) * (1 - 0.8 * pull) * dt;
    } else {
      this.T -= (0.8 - 0.4 * pull) * dt;
      this.dist += pull * 2.4 * dt;
    }
    this.T = clamp(this.T, 0, 1.12);
    if (this.T >= 1) this.over += dt; else this.over = Math.max(0, this.over - dt * 0.6);
    if (this.T < 0.12) this.slack += dt * (0.5 + pull); else this.slack = Math.max(0, this.slack - dt);
    this.stamina = Math.max(0.15, this.stamina - dt * (this.T > 0.35 ? 0.05 + 0.1 * this.T : 0.015) / (0.5 + s));
    dirOut(this.fightAng, this.fishPos).multiplyScalar(this.dist + 0.7).add(this.origin);
    this.fishPos.y = -0.08;
    this.splashT -= dt;
    if (this.splashT <= 0 && (this.surge > 0.5 || this.dist < 4)) {
      this.splashT = 0.22;
      this.emit('splash', { pos: this.fishPos, size: 0.35 + 0.5 * pull });
    }

    // Now and then the fish breaks the surface mid-run.
    this.jumpCd -= dt;
    if (this.jumpT < 0 && this.jumpCd <= 0 && this.surge > 0.7 && this.caught.sp.id !== 'boot') {
      this.jumpT = 0;
      this.jumpCd = 2.5 + Math.random() * 3;
      this.emit('splash', { pos: this.fishPos, size: 0.9 });
    }
    if (this.jumpT >= 0) {
      this.jumpT += dt / 0.75;
      if (this.jumpT >= 1) { this.jumpT = -1; this.emit('splash', { pos: this.fishPos, size: 1.0 }); }
    }

    let lost = null;
    if (this.over > 0.6) lost = 'snap';
    else if (this.slack > 2.3) lost = 'slack';
    else if (this.dist > this.startDist + 9) lost = 'ran';
    if (lost) {
      this.caught = null;
      this.emit('lost', { reason: lost });
      this.startRetrieve(this.fishPos);
    } else if (this.dist <= 1.5) {
      if (this.caught.sp.rarity >= 2) {
        this.dist = 1.5;
        this.jumpT = -1;
        this.setState('net');
        this.emit('net');
      } else {
        this.land();
      }
    }
  }

  // The net only reaches the fish while it is up at the surface.
  netGreen() { return this.state === 'net' && this.t % 1.1 < 0.72; }

  buildNet() {
    const steel = toon(0xaeb6c0);
    this.netHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 8), steel);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.022, 6, 24), steel);
    hoop.rotation.x = Math.PI / 2;
    const bag = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 12, 4, true), new THREE.MeshBasicMaterial({ color: 0x1b1f24, wireframe: true }));
    bag.rotation.x = Math.PI;
    bag.position.y = -0.3;
    this.netHead = new THREE.Group();
    this.netHead.add(hoop, bag);
    this.netGroup = new THREE.Group();
    this.netGroup.add(this.netHandle, this.netHead);
    this.netGroup.visible = false;
    this.scene.add(this.netGroup);
  }

  // Swing the long-handled net out to `target` (world space) and back.
  swingNet(target) {
    if (!this.netGroup) this.buildNet();
    this.netT = 0;
    this.netTarget = target.clone();
  }

  land() {
    this.jumpT = -1;
    this.emit('splash', { pos: this.fishPos, size: 1.1 });
    this.setState('landed');
    this.emit('catch', this.caught);
  }

  showFish(sp, size) {
    this.fishHolder.clear();
    const model = makeFishModel(sp);
    model.scale.setScalar(0.28 + (size / 100) * 1.25);
    model.rotation.z = Math.PI / 2;
    this.fishModel = model;
    this.fishHolder.add(model);
  }

  // ---- Presentation ----
  updateVisual(dt, time) {
    const c = this.char;
    const st = this.state;
    let dirT = POSES.idle.dir, buttT = POSES.idle.butt, leanT = 0, headT = 0, rate = 9, bendT = 0;
    const tmpDir = this._tmpDir || (this._tmpDir = V(0, 0, 0));
    const tmpButt = this._tmpButt || (this._tmpButt = V(0, 0, 0));
    if (st === 'charge') {
      const w = THREE.MathUtils.smoothstep(this.t, 0, 0.35) * (0.6 + 0.4 * this.power);
      dirT = tmpDir.copy(POSES.idle.dir).lerp(POSES.back.dir, w).normalize();
      buttT = tmpButt.copy(POSES.idle.butt).lerp(POSES.back.butt, w);
      leanT = POSES.back.lean * w;
      headT = POSES.back.head * w;
      bendT = -0.12 * w;
    } else if (st === 'cast') {
      const P = this.t < 0.32 ? POSES.fwd : POSES.wait;
      dirT = P.dir; buttT = P.butt; leanT = P.lean; headT = P.head;
      rate = this.t < 0.32 ? 24 : 6;
      bendT = this.t < 0.25 ? -0.35 : 0.02;
    } else if (st === 'wait' || st === 'retrieve') {
      ({ dir: dirT, butt: buttT, lean: leanT, head: headT } = POSES.wait);
      bendT = 0.04;
    } else if (st === 'bite') {
      ({ dir: dirT, butt: buttT, lean: leanT, head: headT } = POSES.wait);
      bendT = 0.3 + Math.sin(this.t * 40) * 0.08;
    } else if (st === 'fight' || st === 'net') {
      ({ dir: dirT, butt: buttT, lean: leanT, head: headT } = POSES.fight);
      leanT -= 0.08 * this.T;
      bendT = 0.25 + 0.75 * Math.min(1, this.T) + Math.sin(time * 31) * 0.03 * this.surge;
    } else if (st === 'landed') {
      ({ dir: dirT, butt: buttT, lean: leanT, head: headT } = POSES.landed);
      bendT = 0.14;
    }
    const k = 1 - Math.exp(-dt * rate);
    this.rodDir.lerp(dirT, k).normalize();
    this.rodButt.lerp(buttT, k);
    this.lean += (leanT - this.lean) * k;
    this.headX += (headT - this.headX) * k;
    this.bend += (bendT - this.bend) * (1 - Math.exp(-dt * 12));

    const yaw = st === 'fight' || st === 'net' ? this.aim * 0.4 + this.fightAng * 0.6 : st === 'landed' ? 2.25 : this.aim;
    c.root.rotation.y += (this.baseYaw + yaw - c.root.rotation.y) * (1 - Math.exp(-dt * 7));
    c.pose.lean.set(this.lean, 0, 0);
    c.pose.head.set(this.headX, 0, 0);
    c.pose.hips.z = -this.lean * 0.25;

    // Rod curve in character space, bending toward wherever the line ends.
    c.root.updateWorldMatrix(true, false);
    const endLocal = c.root.worldToLocal(this.lineEnd.clone());
    const tip0 = this.rodButt.clone().addScaledVector(this.rodDir, ROD_L);
    const bd = endLocal.sub(tip0);
    bd.addScaledVector(this.rodDir, -bd.dot(this.rodDir));
    if (bd.lengthSq() < 1e-6) bd.set(0, -1, 0);
    bd.normalize();
    if (this.bend < 0) bd.set(0, 0, 1);
    const b = Math.abs(this.bend);
    for (let i = 0; i < SEG_S.length; i++) {
      const s = SEG_S[i];
      const kk = Math.pow(Math.max(0, s - 0.7) / (ROD_L - 0.7), 2);
      this.pts[i].copy(this.rodButt).addScaledVector(this.rodDir, s - b * b * kk * 0.35).addScaledVector(bd, b * kk * 0.85 * Math.sign(this.bend || 1));
    }
    const tmp = V(0, 0, 0);
    for (let i = 0; i < this.segs.length; i++) {
      const P = this.pts[i], Q = this.pts[i + 1];
      tmp.subVectors(Q, P);
      const len = tmp.length();
      const m = this.segs[i];
      m.position.lerpVectors(P, Q, 0.5);
      m.scale.set(1, len, 1);
      m.quaternion.setFromUnitVectors(Y_AXIS, tmp.divideScalar(len));
    }
    const up = V(0, 0, 0).crossVectors(this.rodDir, V(1, 0, 0)).normalize();
    this.reel.position.copy(this.rodButt).addScaledVector(this.rodDir, 0.43).addScaledVector(up, -0.055);
    const winding = (st === 'fight' && this.reeling) || st === 'retrieve';
    if (winding) this.crank.rotation.x -= dt * 14;
    c.pose.handL.copy(this.rodButt).addScaledVector(this.rodDir, 0.66);
    if (winding) {
      const a = this.crank.rotation.x;
      c.pose.handR.copy(this.reel.position).add(V(-0.08, Math.cos(a) * 0.04, Math.sin(a) * 0.04));
    } else {
      c.pose.handR.copy(this.rodButt).addScaledVector(this.rodDir, 0.26);
    }
    this.tipWorld.copy(this.pts[SEG_S.length - 1]).applyMatrix4(c.root.matrixWorld);

    // Terminal tackle.
    const hang = V(this.tipWorld.x + Math.sin(time * 2.1) * 0.03, this.tipWorld.y - 0.55, this.tipWorld.z + Math.cos(time * 1.7) * 0.03);
    let sag = 0.05;
    let bobVisible = true;
    this.dip *= Math.exp(-dt * 5);
    if (st === 'idle' || st === 'charge' || (st === 'cast' && !this.launched)) {
      this.bob.copy(hang);
    } else if (st === 'cast') {
      sag = 0.35;
    } else if (st === 'wait') {
      this.bob.y = waveHeight(this.bob.x, this.bob.z, time) + 0.03 - this.dip * 0.13;
      sag = 0.7;
    } else if (st === 'bite') {
      this.bob.y = waveHeight(this.bob.x, this.bob.z, time) - 0.16 + Math.sin(this.t * 38) * 0.03;
      sag = 0.15;
    } else if (st === 'retrieve') {
      const u = THREE.MathUtils.smoothstep(this.t, 0, 0.55);
      this.bob.lerpVectors(this.retrieveFrom, hang, u);
      this.bob.y += Math.sin(u * Math.PI) * 0.8;
      sag = 0.25 * (1 - u);
    } else {
      bobVisible = false;
    }
    this.bobber.visible = bobVisible;
    this.bobber.position.copy(this.bob);
    const inWater = st === 'wait' || st === 'bite';
    this.bobScale = (this.bobScale || 0.5) + ((inWater ? 1.5 : 0.5) - (this.bobScale || 0.5)) * (1 - Math.exp(-dt * 6));
    this.bobber.scale.setScalar(this.bobScale);
    this.bobber.rotation.z = st === 'wait' ? Math.sin(time * 1.3 + this.bob.x) * 0.12 : 0;

    if (st === 'fight' || st === 'net') {
      this.lineEnd.copy(this.fishPos);
      sag = 0.4 * Math.max(0, 0.5 - this.T);
    } else if (st === 'landed') {
      this.lineEnd.copy(hang);
      this.lineEnd.y -= 0.75;
      sag = 0;
    } else {
      this.lineEnd.copy(this.bob);
    }
    for (let i = 0; i < LINE_N; i++) {
      const u = i / (LINE_N - 1);
      const p = this.linePts[i].lerpVectors(this.tipWorld, this.lineEnd, u);
      p.y -= sag * 4 * u * (1 - u);
    }
    const seg = this.line.geometry.attributes.instanceStart.data;
    for (let i = 0; i < LINE_N - 1; i++) {
      const p = this.linePts[i], q = this.linePts[i + 1];
      seg.array.set([p.x, p.y, p.z, q.x, q.y, q.z], i * 6);
    }
    seg.needsUpdate = true;

    // Landed fish hangs from the line, flapping then settling.
    const jumping = st === 'fight' && this.jumpT >= 0;
    const atBoat = st === 'net';
    this.fishHolder.visible = st === 'landed' || jumping || atBoat;
    if (jumping && this.fishModel) {
      const u = this.jumpT;
      this.fishHolder.position.set(this.fishPos.x, Math.sin(u * Math.PI) * 1.1 - 0.15, this.fishPos.z);
      this.fishHolder.rotation.y = this.fightAng + Math.PI / 2;
      this.fishModel.rotation.z = Math.PI * (0.75 - u * 1.5);
    } else if (atBoat && this.fishModel) {
      const up = this.t % 1.1 < 0.72 ? 1 : 0;
      this.netUp = (this.netUp || 0) + (up - (this.netUp || 0)) * (1 - Math.exp(-dt * 10));
      this.fishHolder.position.set(this.fishPos.x, -0.42 + this.netUp * 0.5 + Math.sin(time * 9) * 0.04, this.fishPos.z);
      this.fishHolder.rotation.y = this.fightAng + Math.PI / 2 + Math.sin(time * 5) * 0.6;
      this.fishModel.rotation.z = 0.2 + Math.sin(time * 17) * 0.35;
    } else if (st === 'landed' && this.fishModel) {
      this.fishHolder.position.copy(this.lineEnd);
      this.fishHolder.rotation.y = Math.PI / 2 + Math.sin(time * 1.1) * 0.5;
      const flap = Math.exp(-this.t * 0.5) * 0.3 + 0.05;
      this.fishModel.rotation.z = Math.PI / 2 + Math.sin(time * 13) * flap;
    }

    // Landing net, when this angler is helping the other one.
    if (this.netT >= 0 && this.netGroup) {
      this.netT += dt / 0.9;
      const u = Math.min(1, this.netT);
      const reach = Math.sin(u * Math.PI);
      const grip = V(-0.05, 1.0, 0.3).applyMatrix4(c.root.matrixWorld);
      const head = V(0, 1.7, 1.0).applyMatrix4(c.root.matrixWorld).lerp(this.netTarget, reach);
      head.y += 0.25 * reach;
      tmp.subVectors(head, grip);
      const len = tmp.length();
      this.netHandle.position.lerpVectors(grip, head, 0.5);
      this.netHandle.scale.set(1, len, 1);
      this.netHandle.quaternion.setFromUnitVectors(Y_AXIS, tmp.divideScalar(len));
      this.netHead.position.copy(head);
      this.netGroup.visible = true;
      c.pose.handL.copy(c.root.worldToLocal(grip.clone().lerp(head, 0.12)));
      if (this.netT >= 1) { this.netT = -1; this.netGroup.visible = false; }
    }
  }
}
