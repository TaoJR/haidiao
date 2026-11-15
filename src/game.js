import * as THREE from 'three';
import { Angler } from './angler.js';
import { waveHeight } from './water.js';
import { SPECIES, SPECIES_BY_ID, RARITY, rollSpecies, rollSize, scoreFor, makeFishShadow } from './fish.js';
import { DECK_Y } from './boat.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SAVE_KEY = 'haidiao.save.v1';
const NAMES = { a: 'Tao', b: 'Lulu' };
const ROUND_SECONDS = 300;
const SCHOOL_R = 3.6;
const SCHOOL_BOUNDS = { x0: -23, x1: -9, z0: -4, z1: 14 };
const WEATHER_ORDER = ['overcast', 'sunny', 'sunset'];
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const REGION = { x0: -30, x1: -6, z0: -9, z1: 17 };
const LOST_TEXT = { late: '提竿慢了，鱼吃完饵跑了', snap: '线绷断了！', slack: '线太松，鱼脱钩了', ran: '鱼把线拉光跑掉了' };

function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
}
function writeSave(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
}

class Effects {
  constructor(scene) {
    this.drops = [];
    this.rings = [];
    const dropGeo = new THREE.SphereGeometry(0.045, 6, 5);
    const dropMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.6, 1.7) });
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(dropGeo, dropMat);
      m.visible = false;
      scene.add(m);
      this.drops.push({ m, v: V(0, 0, 0), life: 0 });
    }
    const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      m.renderOrder = 6;
      scene.add(m);
      this.rings.push({ m, life: 0, max: 1, size: 1 });
    }
    this.di = 0;
    this.ri = 0;
  }

  splash(pos, size = 0.6) {
    const n = Math.round(5 + size * 9);
    for (let i = 0; i < n; i++) {
      const d = this.drops[this.di++ % this.drops.length];
      const a = Math.random() * Math.PI * 2;
      const sp = (0.6 + Math.random() * 1.6) * size;
      d.v.set(Math.cos(a) * sp, (2 + Math.random() * 2.6) * Math.sqrt(size), Math.sin(a) * sp);
      d.m.position.set(pos.x, Math.max(pos.y, 0) + 0.05, pos.z);
      d.m.scale.setScalar(0.6 + Math.random() * size);
      d.life = 1;
      d.m.visible = true;
    }
    const r = this.rings[this.ri++ % this.rings.length];
    r.m.position.set(pos.x, 0.05, pos.z);
    r.life = r.max = 0.9 + size * 0.5;
    r.size = 0.5 + size * 1.3;
    r.m.visible = true;
  }

  update(dt, time) {
    for (const d of this.drops) {
      if (d.life <= 0) continue;
      d.v.y -= 9.8 * dt;
      d.m.position.addScaledVector(d.v, dt);
      if (d.m.position.y < -0.05 && d.v.y < 0) { d.life = 0; d.m.visible = false; }
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const u = 1 - r.life / r.max;
      r.m.scale.setScalar(0.2 + u * r.size);
      r.m.material.opacity = 0.75 * (1 - u);
      r.m.position.y = waveHeight(r.m.position.x, r.m.position.z, time) + 0.04;
      if (r.life <= 0) r.m.visible = false;
    }
  }
}

export class Game {
  constructor({ scene, boat, env, camera, chars, ui }) {
    Object.assign(this, { scene, boat, env, camera, chars, ui });
    this.mode = 'menu';
    this.anglers = [];
    this.shadows = [];
    this.fx = new Effects(scene);
    this.save = loadSave();
    this.save.journal ||= {};
    this.save.best ||= 0;
    this.scores = { me: { n: 0, pts: 0 }, mate: { n: 0, pts: 0 } };
    this.input = { down: false, aim: 0 };
    this.camPos = V(0, 0, 0);
    this.camLook = V(0, 0, 0);
    this.shake = 0;
    this.weatherT = 0;
    this.autoWeather = true;
    this.listeners = {};
    this.net = null;
    this.netT = 0;
    this.envAt = 0;
    this.seq = 0;
    this.lastCatch = null;
    this.mateSeq = null;
    // Feeding school that the gulls mark.
    this.school = { active: false, shown: false, next: 14, life: 0, pos: V(-14, 0, 5), vel: V(0, 0, 0), fxT: 0, err: 0 };
    // Landing net.
    this.netCd = 0;
    this.netSwings = 0;
    this.netHits = 0;
    this.mateNh = 0;
    this.mateNs = null;
    this.nhBase = 0;
    this.aiNetT = 0;
    this.pendingLand = null;
    this.assistPending = false;
    this.aiAssist = false;
    // Pool derby.
    this.round = { n: 0, left: ROUND_SECONDS, over: false, free: false };
    this.phase = -1;
    this.big = { me: null, mate: null };
    this.rq = 0;
    this.lastRq = 0;
    this.fastWeather = false;
    for (let i = 0; i < 8; i++) this.spawnShadow(true);
  }

  on(name, fn) { (this.listeners[name] ||= []).push(fn); return this; }
  emit(name, data) { (this.listeners[name] || []).forEach((fn) => fn(data)); }

  // ---- Fish under the surface ----
  spawnShadow(anywhere = false, boosted = false) {
    let sp = rollSpecies(this.env.name);
    let size = rollSize(sp);
    if (boosted) {
      // Fish in a feeding school run bigger and rarer: best of three, never junk.
      for (let i = 0; i < 2; i++) {
        const sp2 = rollSpecies(this.env.name);
        if (sp2.rarity > sp.rarity || sp.rarity === 0) { sp = sp2; size = rollSize(sp2); }
      }
      if (sp.rarity === 0) sp = SPECIES[0];
      size = Math.max(size, rollSize(sp));
    }
    const mesh = makeFishShadow();
    const len = Math.max(0.7, (size / 100) * 2.1);
    mesh.scale.set(len, 1, len);
    this.scene.add(mesh);
    const s = {
      sp, size, mesh, state: 'wander', angler: null, speed: 0.5 + Math.random() * 0.8, heading: Math.random() * 6.28,
      pos: V(anywhere ? THREE.MathUtils.lerp(REGION.x0, REGION.x1, Math.random()) : REGION.x0 - 4, 0, THREE.MathUtils.lerp(REGION.z0, REGION.z1, Math.random())),
      goal: V(0, 0, 0), t: 0, nibT: 0, alpha: 0,
    };
    this.pickGoal(s);
    this.shadows.push(s);
    return s;
  }

  pickGoal(s) {
    const sc = this.school;
    if (sc.active && Math.random() < 0.65) {
      const a = Math.random() * 6.28, r = Math.random() * SCHOOL_R;
      s.goal.set(sc.pos.x + Math.cos(a) * r, 0, sc.pos.z + Math.sin(a) * r);
      return;
    }
    s.goal.set(THREE.MathUtils.lerp(REGION.x0, REGION.x1, Math.random()), 0, THREE.MathUtils.lerp(REGION.z0, REGION.z1, Math.random()));
  }

  releaseShadow(s, flee = true) {
    if (s.angler) s.angler.shadow = null;
    s.angler = null;
    s.state = flee ? 'flee' : 'wander';
    s.t = 0;
    if (flee) s.goal.set(REGION.x0 - 6, 0, s.pos.z + (Math.random() - 0.5) * 20);
  }

  removeShadow(s) {
    this.scene.remove(s.mesh);
    s.mesh.material.dispose();
    this.shadows.splice(this.shadows.indexOf(s), 1);
    if (s.angler) s.angler.shadow = null;
  }

  updateShadows(dt, time) {
    // Hand a waiting line to the nearest free fish.
    for (const a of this.anglers) {
      if (!a.remote && a.state === 'wait' && !a.shadow && a.t > 0.6 && this.inSchool(a.bob)) {
        const s = this.spawnShadow(true, true);
        s.pos.set(a.bob.x + (Math.random() - 0.5) * 2.4, 0, a.bob.z + (Math.random() - 0.5) * 2.4);
        s.state = 'approach';
        s.angler = a;
        s.fast = true;
        a.shadow = s;
        continue;
      }
      if (!a.wantsFish()) continue;
      let best = null, bd = 1e9;
      for (const s of this.shadows) {
        if (s.state !== 'wander') continue;
        const d = s.pos.distanceTo(a.bob);
        if (d < bd) { bd = d; best = s; }
      }
      if (best) { best.state = 'approach'; best.angler = a; a.shadow = best; }
    }
    while (this.shadows.length < 8) this.spawnShadow();

    const to = V(0, 0, 0);
    for (const s of [...this.shadows]) {
      s.t += dt;
      const a = s.angler;
      let speed = s.speed, target = s.goal;
      if (s.state === 'wander') {
        if (s.pos.distanceTo(s.goal) < 1) this.pickGoal(s);
      } else if (s.state === 'flee') {
        speed = 4.5;
        if (s.t > 2.2) { s.state = 'wander'; this.pickGoal(s); }
      } else if (s.state === 'approach') {
        if (a.state !== 'wait' || a.remote) { this.releaseShadow(s); continue; }
        target = a.bob;
        speed = 2.4;
        if (s.pos.distanceTo(a.bob) < 0.5) { s.state = 'nibble'; s.t = 0; s.nibT = s.fast ? 0.2 : 0.5; s.nibEnd = s.fast ? 0.45 + Math.random() * 0.5 : 0.9 + Math.random() * 1.7; }
      } else if (s.state === 'nibble') {
        if (a.state !== 'wait' || a.remote) { this.releaseShadow(s); continue; }
        speed = 0;
        s.heading += dt * 1.5;
        s.pos.x = a.bob.x + Math.cos(s.heading) * 0.35;
        s.pos.z = a.bob.z - Math.sin(s.heading) * 0.35;
        s.nibT -= dt;
        if (s.nibT <= 0) { a.nibble(); s.nibT = 0.35 + Math.random() * 0.3; }
        if (s.t > s.nibEnd) { s.state = 'hooked'; a.bite(s.sp, s.size); }
      } else if (s.state === 'hooked') {
        speed = 0;
        if (a.remote) {
          this.releaseShadow(s);
          continue;
        } else if (a.state === 'bite') {
          s.pos.x = a.bob.x; s.pos.z = a.bob.z;
        } else if (a.state === 'fight' || a.state === 'net') {
          to.subVectors(a.fishPos, s.pos);
          if (to.lengthSq() > 1e-4) s.heading = Math.atan2(-to.z, to.x) + Math.sin(time * 14) * 0.5;
          s.pos.x = a.fishPos.x; s.pos.z = a.fishPos.z;
        } else if (a.state === 'landed') {
          this.removeShadow(s);
          continue;
        } else {
          this.releaseShadow(s);
          continue;
        }
      }
      if (speed > 0) {
        to.subVectors(target, s.pos);
        to.y = 0;
        const want = Math.atan2(-to.z, to.x);
        let dh = want - s.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        s.heading += dh * Math.min(1, dt * 2.5);
        s.pos.x += Math.cos(s.heading) * speed * dt;
        s.pos.z -= Math.sin(s.heading) * speed * dt;
      }
      s.alpha += ((s.pos.x < REGION.x0 - 1 ? 0 : 1) - s.alpha) * Math.min(1, dt * 2);
      s.mesh.material.opacity = 0.42 * s.alpha;
      s.mesh.position.set(s.pos.x, waveHeight(s.pos.x, s.pos.z, time) + 0.04, s.pos.z);
      s.mesh.rotation.y = s.heading + Math.sin(time * 6 + s.size) * 0.12;
    }
  }

  // ---- Session ----
  start(localKind) {
    this.mode = 'play';
    this.localKind = localKind;
    const other = (this.mateKind = localKind === 'a' ? 'b' : 'a');
    this.local = this.addAngler(this.chars[localKind], 'me');
    this.mate = this.addAngler(this.chars[other], 'mate');
    this.local.input = this.input;
    this.mate.enableAuto();
    const lp = this.local.char.root.position;
    this.camPos.set(lp.x + 3.5, DECK_Y + 2.5, 4.5);
    this.camLook.set(lp.x - 9, 0.4, lp.z);
    this.ui.showHud(true);
    this.mateName = NAMES[other];
    this.ui.setMeLabel(`${NAMES[localKind]}（你）`);
    this.ui.setMateLabel(`${this.mateName}（电脑）`);
    this.startRound();
    this.emit('start');
  }

  addAngler(char, who) {
    const a = new Angler(char, this.scene);
    a.who = who;
    a.on('splash', ({ pos, size }) => { this.fx.splash(pos, size); this.emit('sfx', { name: 'splash', size, who }); });
    a.on('cast', () => this.emit('sfx', { name: 'cast', who }));
    a.on('nibble', () => this.emit('sfx', { name: 'nibble', who }));
    a.on('bite', () => {
      if (who === 'me') this.shake = 0.25;
      this.emit('sfx', { name: 'bite', who });
    });
    a.on('hook', () => { char.setExpression('effort'); this.emit('sfx', { name: 'hook', who }); });
    a.on('net', () => {
      char.setExpression('effort');
      if (who === 'me') {
        this.aiNetT = 0.9 + Math.random() * 1.3;
        this.nhBase = this.mateNh;
      } else if (!this.round.over) {
        this.ui.toast(`${this.mateName} 的大鱼到船边了，帮忙抄网！`, 'mate');
      }
      this.emit('sfx', { name: 'bite', who });
    });
    a.on('netfail', () => {
      if (who === 'me') { if (!this.round.over) this.ui.toast('没抄到，鱼又冲出去了！', 'bad'); } else this.assistPending = false;
    });
    a.on('lost', ({ reason }) => {
      char.setExpression('surprised', 1.6);
      if (who !== 'me') this.assistPending = false;
      if (who === 'me' && !this.round.over) this.ui.toast(LOST_TEXT[reason], 'bad');
      this.emit('sfx', { name: reason === 'snap' ? 'snap' : 'lost', who });
    });
    a.on('catch', ({ sp, size }) => this.onCatch(a, sp, size));
    a.on('state', (s) => {
      if (s === 'idle' || s === 'wait') char.setExpression('base');
      if (who === 'me' && s !== 'landed') this.ui.hideCatch();
    });
    this.anglers.push(a);
    return a;
  }

  onCatch(a, sp, size) {
    if (this.round.over) return;
    const pts = scoreFor(sp, size);
    const sc = this.scores[a.who];
    sc.n += 1;
    sc.pts += pts;
    if (sp.rarity > 0 && (!this.big[a.who] || size > this.big[a.who].size)) this.big[a.who] = { id: sp.id, size };
    // Whoever worked the net gets a fifth of the fish.
    const bonus = Math.max(1, Math.round(pts * 0.2));
    if (a.who === 'me' && this.aiAssist) {
      this.scores.mate.pts += bonus;
      this.ui.toast(`${this.mateName} 抄网助攻 +${bonus} 分`, 'mate');
    } else if (a.who === 'mate' && this.assistPending) {
      this.scores.me.pts += bonus;
      this.ui.toast(`抄网助攻 +${bonus} 分`);
    }
    this.aiAssist = false;
    if (a.who === 'mate') this.assistPending = false;
    a.char.setExpression('happy', 4);
    for (const o of this.anglers) if (o !== a) o.char.setExpression('happy', 2.2);
    if (a.who === 'me') {
      this.seq += 1;
      this.lastCatch = [sp.id, size];
      const j = (this.save.journal[sp.id] ||= { count: 0, max: 0 });
      const isNew = j.count === 0;
      const record = !isNew && size > j.max;
      j.count += 1;
      j.max = Math.max(j.max, size);
      this.save.best = Math.max(this.save.best, sc.pts);
      writeSave(this.save);
      this.ui.showCatch(sp, size, pts, { isNew, record });
      this.shake = 0.35;
    } else {
      this.ui.toast(`${this.mateName} 钓到了${sp.name} ${size} 厘米`, 'mate');
    }
    this.ui.setScores(this.scores, this.save.best);
    this.emit('sfx', { name: sp.rarity >= 3 ? 'rare' : 'catch', who: a.who });
    this.emit('catch', { who: a.who, sp, size, pts });
  }

  journalData() {
    return SPECIES.map((sp) => ({ sp, entry: this.save.journal[sp.id] || null, rarity: RARITY[sp.rarity] }));
  }

  // ---- Two players ----
  setNet(net) {
    this.net = net;
  }

  setWeatherStamp() { this.envAt = Date.now(); }

  updateNet(dt) {
    const net = this.net;
    if (!net || !net.kind) return;
    this.netT -= dt;
    if (this.netT <= 0) {
      this.netT = 0.05;
      net.setPresence({
        c: this.localKind, ...this.local.snapshot(), n: this.scores.me.n, pts: this.scores.me.pts,
        seq: this.seq, lc: this.lastCatch, env: this.env.name, ea: this.envAt,
        nh: this.netHits, ns: this.netSwings, rn: this.round.n, rt: Math.round(this.round.left), ro: this.round.over ? 1 : 0,
        rq: this.rq, bg: this.big.me ? [this.big.me.id, this.big.me.size] : null,
        sc: this.autoWeather ? [Math.round(this.school.pos.x * 10) / 10, Math.round(this.school.pos.z * 10) / 10, this.school.active ? 1 : 0] : null,
      });
    }
    const others = net.others().filter((p) => p.presence && typeof p.presence.st === 'string');
    const rp = others.find((p) => p.presence.c === this.mateKind);
    const mate = this.mate;
    if (rp) {
      const pr = rp.presence;
      if (!mate.remote) {
        if (mate.shadow) this.releaseShadow(mate.shadow);
        mate.setRemote(true);
        this.scores.mate = { n: 0, pts: 0 };
        this.mateSeq = null;
        this.ui.setMateLabel(this.mateName);
        this.ui.toast(`${this.mateName} 上船了，彩池赛重新开始`, 'mate');
        this.mateNs = null;
        this.startRound();
      }
      mate.applyRemote(pr);
      const n = Number.isFinite(pr.n) ? Math.max(0, Math.floor(pr.n)) : 0;
      const pts = Number.isFinite(pr.pts) ? Math.max(0, Math.floor(pr.pts)) : 0;
      if (n !== this.scores.mate.n || pts !== this.scores.mate.pts) {
        this.scores.mate = { n, pts };
        this.ui.setScores(this.scores, this.save.best);
      }
      const seq = Number.isFinite(pr.seq) ? pr.seq : 0;
      if (this.mateSeq !== null && seq > this.mateSeq && Array.isArray(pr.lc)) {
        const sp = SPECIES_BY_ID[pr.lc[0]];
        const size = Number.isFinite(pr.lc[1]) ? Math.round(pr.lc[1]) : 0;
        if (sp && this.assistPending) {
          const bonus = Math.max(1, Math.round(scoreFor(sp, size) * 0.2));
          this.scores.me.pts += bonus;
          this.assistPending = false;
          this.ui.toast(`抄网助攻 +${bonus} 分`);
          this.ui.setScores(this.scores, this.save.best);
        }
        if (sp) {
          this.ui.toast(`${this.mateName} 钓到了${sp.name} ${size} 厘米`, 'mate');
          mate.char.setExpression('happy', 4);
          this.local.char.setExpression('happy', 2);
          this.emit('sfx', { name: sp.rarity >= 3 ? 'rare' : 'catch', who: 'mate' });
        }
      }
      this.mateSeq = seq;
      // Their net: a hit lands my fish, a swing is drawn either way.
      const nh = fin(pr.nh), ns = fin(pr.ns);
      if (this.local.state === 'net' && nh > this.nhBase) this.local.land();
      if (this.mateNs !== null && ns > this.mateNs && this.local.state === 'net') mate.swingNet(this.local.fishPos);
      this.mateNh = nh;
      this.mateNs = ns;
      const bg = Array.isArray(pr.bg) && SPECIES_BY_ID[pr.bg[0]] ? { id: pr.bg[0], size: Math.round(fin(pr.bg[1])) } : null;
      this.big.mate = bg;
      // Round clock and the school follow whichever side is keeping them.
      if (!this.autoWeather) {
        if (Number.isFinite(pr.rn) && pr.rn !== this.round.n) { this.startRound(); this.round.n = pr.rn; }
        if (Number.isFinite(pr.rt) && Math.abs(pr.rt - this.round.left) > 1.5) this.round.left = Math.max(0, pr.rt);
        if (pr.ro && !this.round.over && !this.round.free) this.endRound();
        if (Array.isArray(pr.sc)) {
          this.school.active = !!pr.sc[2];
          this.school.pos.x += (fin(pr.sc[0], this.school.pos.x) - this.school.pos.x) * 0.2;
          this.school.pos.z += (fin(pr.sc[1], this.school.pos.z) - this.school.pos.z) * 0.2;
        }
      } else if (fin(pr.rq) > this.lastRq) {
        this.lastRq = pr.rq;
        if (this.round.over) this.startRound();
      }
      // Newest weather change wins, whoever made it.
      if (Number.isFinite(pr.ea) && pr.ea > this.envAt && ['overcast', 'sunny', 'sunset'].includes(pr.env)) {
        this.envAt = pr.ea;
        this.weatherT = 0;
        if (pr.env !== this.env.name) this.emit('weather', pr.env);
      }
    } else if (mate.remote) {
      mate.setRemote(false);
      this.ui.setMateLabel(`${this.mateName}（电脑）`);
      this.ui.toast(`${this.mateName} 离开了，先由电脑接手`, 'mate');
    }
    // Only one side advances the weather clock.
    const ids = net.peers.filter((p) => p.presence && p.presence.c).map((p) => p.id).sort();
    const mine = net.peers.find((p) => p.me);
    this.autoWeather = !rp || !mine || ids[0] === mine.id;
  }

  // ---- Feeding school ----
  inSchool(p) {
    const sc = this.school;
    return sc.active && Math.hypot(p.x - sc.pos.x, p.z - sc.pos.z) < SCHOOL_R;
  }

  updateSchool(dt) {
    const sc = this.school;
    if (this.autoWeather) {
      if (!sc.active) {
        sc.next -= dt;
        if (sc.next <= 0 && !this.round.over) {
          sc.active = true;
          sc.life = 28 + Math.random() * 10;
          sc.pos.set(THREE.MathUtils.lerp(-21, -11, Math.random()), 0, THREE.MathUtils.lerp(-1, 12, Math.random()));
          const a = Math.random() * 6.28;
          sc.vel.set(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);
        }
      } else {
        sc.life -= dt;
        sc.pos.addScaledVector(sc.vel, dt);
        if (sc.pos.x < SCHOOL_BOUNDS.x0 || sc.pos.x > SCHOOL_BOUNDS.x1) sc.vel.x *= -1;
        if (sc.pos.z < SCHOOL_BOUNDS.z0 || sc.pos.z > SCHOOL_BOUNDS.z1) sc.vel.z *= -1;
        if (sc.life <= 0 || this.round.over) { sc.active = false; sc.next = 26 + Math.random() * 22; }
      }
    }
    if (sc.active !== sc.shown) {
      sc.shown = sc.active;
      if (sc.active) {
        sc.err = (Math.random() - 0.5) * 0.3;
        this.ui.toast('海鸥在聚集！把饵抛到鸟群下面');
        this.emit('sfx', { name: 'gull', who: 'me' });
        for (const s of this.shadows) if (s.state === 'wander') this.pickGoal(s);
      }
    }
    if (sc.active) {
      // The water boils where the school is feeding.
      sc.fxT -= dt;
      if (sc.fxT <= 0) {
        sc.fxT = 0.1 + Math.random() * 0.2;
        const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * SCHOOL_R * 0.9;
        this.fx.splash(V(sc.pos.x + Math.cos(a) * r, 0, sc.pos.z + Math.sin(a) * r), 0.2 + Math.random() * 0.3);
      }
    }
    // The computer partner goes for the birds too, not always accurately.
    const mate = this.mate;
    if (mate && mate.auto) {
      if (sc.active) {
        const dx = sc.pos.x - mate.origin.x, dz = sc.pos.z - mate.origin.z;
        mate.auto.hint = {
          aim: THREE.MathUtils.clamp(Math.atan2(dz, -dx) + sc.err, -0.5, 0.5),
          power: THREE.MathUtils.clamp((Math.hypot(dx, dz) - 6) / 16 + sc.err * 0.5, 0.1, 1),
        };
      } else {
        mate.auto.hint = null;
      }
    }
  }

  // ---- Landing net ----
  // The local player swings for the partner's fish.
  tryNet() {
    const m = this.mate;
    if (this.mode !== 'play' || this.round.over || !m || m.state !== 'net' || this.netCd > 0) return;
    this.netCd = 0.9;
    this.netSwings += 1;
    this.local.swingNet(m.fishPos);
    this.emit('sfx', { name: 'cast', who: 'me' });
    if (m.netGreen()) {
      this.assistPending = true;
      if (m.remote) this.netHits += 1;
      else this.pendingLand = { a: m, t: 0.35 };
    } else {
      this.ui.toast('抄空了，等鱼浮上来（绿灯）再下网', 'bad');
    }
  }

  updateNetting(dt) {
    this.netCd = Math.max(0, this.netCd - dt);
    if (this.pendingLand) {
      this.pendingLand.t -= dt;
      if (this.pendingLand.t <= 0) {
        const a = this.pendingLand.a;
        this.pendingLand = null;
        if (a.state === 'net') a.land();
      }
    }
    // Computer partner nets the local player's fish, and misses now and then.
    const me = this.local;
    if (me.state === 'net' && !this.mate.remote && !this.pendingLand) {
      this.aiNetT -= dt;
      if (this.aiNetT <= 0 && me.netGreen()) {
        this.mate.swingNet(me.fishPos);
        this.emit('sfx', { name: 'cast', who: 'mate' });
        if (Math.random() < 0.78) {
          this.aiAssist = true;
          this.pendingLand = { a: me, t: 0.35 };
        } else {
          this.aiNetT = 1.0;
          this.ui.toast(`${this.mateName} 抄空了！`, 'bad');
        }
      }
    }
  }

  // ---- Pool derby: five minutes, biggest single fish takes the pool ----
  startRound() {
    this.round.n += 1;
    this.round.left = ROUND_SECONDS;
    this.round.over = false;
    this.round.free = false;
    this.phase = -1;
    this.scores = { me: { n: 0, pts: 0 }, mate: { n: 0, pts: 0 } };
    this.big = { me: null, mate: null };
    this.assistPending = false;
    this.aiAssist = false;
    this.pendingLand = null;
    this.school.active = false;
    this.school.next = 12 + Math.random() * 6;
    this.ui.hideResults();
    this.ui.setScores(this.scores, this.save.best);
  }

  startFree() {
    this.startRound();
    this.round.free = true;
    this.weatherT = 0;
  }

  // Either player may ask; the side keeping the clock restarts for both.
  requestRestart() {
    if (this.autoWeather) this.startRound();
    else { this.rq = Date.now(); this.ui.setResultsNote(`已经告诉${this.mateName}了，马上开始……`); }
  }

  poolLeader() {
    const me = this.big.me, mate = this.big.mate;
    if (!me && !mate) return null;
    if (me && (!mate || me.size >= mate.size)) return { ...me, who: 'me', name: NAMES[this.localKind] };
    return { ...mate, who: 'mate', name: this.mateName };
  }

  updateRound(dt) {
    const r = this.round;
    if (r.free) {
      if (this.autoWeather) {
        this.weatherT += dt;
        if (this.weatherT > 110) {
          this.weatherT = 0;
          this.setWeatherStamp();
          this.emit('weather', WEATHER_ORDER[(WEATHER_ORDER.indexOf(this.env.name) + 1) % 3]);
        }
      }
      return;
    }
    if (r.over) return;
    r.left -= dt;
    // The trip runs grey morning, bright afternoon, dusk.
    if (this.autoWeather) {
      const phase = r.left > ROUND_SECONDS * 2 / 3 ? 0 : r.left > ROUND_SECONDS / 3 ? 1 : 2;
      if (phase !== this.phase) {
        this.fastWeather = this.phase === -1;
        this.phase = phase;
        this.setWeatherStamp();
        if (WEATHER_ORDER[phase] !== this.env.name) this.emit('weather', WEATHER_ORDER[phase]);
        this.fastWeather = false;
      }
      if (r.left <= 0) this.endRound();
    } else if (r.left < -3) {
      this.endRound(); // the other side went quiet; do not hang at zero
    }
  }

  endRound() {
    const r = this.round;
    r.over = true;
    r.left = 0;
    this.input.down = false;
    this.save.best = Math.max(this.save.best, this.scores.me.pts);
    writeSave(this.save);
    const meName = NAMES[this.localKind];
    const top = this.poolLeader();
    const tie = this.big.me && this.big.mate && this.big.me.size === this.big.mate.size;
    const fish = (b) => (b ? `${SPECIES_BY_ID[b.id].name} ${b.size} 厘米` : '没有上鱼');
    this.ui.hideCatch();
    this.ui.showResults({
      pool: !top ? '这一趟没人上鱼，彩池留到下一局' : tie ? '最大的鱼一样长，彩池平分' : `${top.name} 赢得彩池`,
      poolFish: top ? fish(top) : '',
      iWon: !!top && !tie && top.who === 'me',
      rows: [
        { name: `${meName}（你）`, n: this.scores.me.n, pts: this.scores.me.pts, big: fish(this.big.me) },
        { name: this.mate.remote ? this.mateName : `${this.mateName}（电脑）`, n: this.scores.mate.n, pts: this.scores.mate.pts, big: fish(this.big.mate) },
      ],
      best: this.save.best,
      canFree: !this.mate.remote,
    });
    this.emit('sfx', { name: 'rare', who: 'me' });
  }

  // ---- Per frame ----
  update(dt, time) {
    this.fx.update(dt, time);
    this.updateShadows(dt, time);
    if (this.mode !== 'play') return;

    this.updateRound(dt);
    this.updateSchool(dt);
    this.updateNetting(dt);
    if (this.round.over) this.input.down = false;
    this.updateNet(dt);
    for (const a of this.anglers) a.update(dt, time);
    this.updateCamera(dt);
    this.updateHud();
  }

  updateCamera(dt) {
    const a = this.local;
    const lp = a.char.root.position;
    const wantPos = V(lp.x + 3.5, DECK_Y + 2.5, 4.5 * 0.45 + lp.z * 0.55 + 0.3);
    const wantLook = V(lp.x - 9, 0.5, lp.z + Math.sin(a.aim) * 7);
    if (a.state === 'wait' || a.state === 'bite' || (a.state === 'cast' && a.launched)) {
      wantLook.set(a.bob.x * 0.6 + (lp.x - 5) * 0.4, 0.4, a.bob.z * 0.7 + lp.z * 0.3);
    } else if (a.state === 'fight' || a.state === 'net') {
      // Close to the hull the rail hides the water, so the camera climbs and leans out.
      const near = a.state === 'net' ? 1 : 1 - THREE.MathUtils.clamp((a.dist - 2) / 5, 0, 1);
      const w = 0.7 + 0.3 * near;
      wantLook.set(a.fishPos.x * w + (lp.x - 3) * (1 - w), 0.5 - 0.3 * near, a.fishPos.z * 0.8 + lp.z * 0.2);
      wantPos.y += -0.15 + near * 1.5;
      wantPos.x -= near * 2.2;
    } else if (a.state === 'landed') {
      wantPos.set(lp.x + 2.3, DECK_Y + 1.6, lp.z + 2.3);
      wantLook.set(lp.x + 0.25, DECK_Y + 1.4, lp.z + 0.25);
    }
    // Partner's fish at the boat: show where the net has to go.
    const m = this.mate;
    if (m.state === 'net' && !['net', 'fight', 'bite', 'landed'].includes(a.state)) {
      wantPos.set(lp.x + 1.3, DECK_Y + 3.9, (lp.z + m.char.root.position.z) / 2);
      wantLook.set(m.fishPos.x, 0.2, m.fishPos.z);
    }
    const k = 1 - Math.exp(-dt * (a.state === 'landed' ? 4 : 2.6));
    this.camPos.lerp(wantPos, k);
    this.camLook.lerp(wantLook, k);
    this.shake = Math.max(0, this.shake - dt);
    const fightShake = a.state === 'fight' ? 0.012 * a.surge * (0.5 + a.T) : 0;
    const sh = this.shake * 0.06 + fightShake;
    this.camera.position.set(
      this.camPos.x + (Math.random() - 0.5) * sh,
      this.camPos.y + (Math.random() - 0.5) * sh,
      this.camPos.z + (Math.random() - 0.5) * sh
    );
    this.camera.lookAt(this.camLook);
  }

  updateHud() {
    const a = this.local, ui = this.ui;
    const st = a.state;
    ui.setPower(st === 'charge' ? a.power : null);
    ui.setFight(st === 'fight' ? { T: a.T, progress: 1 - (a.dist - 1.5) / Math.max(1, a.startDist + 4 - 1.5), reeling: a.reeling, danger: a.over > 0 || a.slack > 0.8 } : null);
    const prompts = {
      idle: '按住蓄力，松开抛竿',
      charge: '松开抛竿',
      cast: '',
      wait: a.shadow ? '有鱼靠近了，稳住……' : '等待鱼儿上钩',
      bite: '咬钩了！快按！',
      fight: '按住收线，绷太紧就松手',
      net: `鱼到船边了，等${this.mateName}下抄网……`,
      landed: '按一下继续',
      retrieve: '',
    };
    ui.setPrompt(prompts[st], st === 'bite');
    const m = this.mate;
    ui.setNetButton(m.state === 'net' && !this.round.over ? { green: m.netGreen(), name: this.mateName } : null);
    const r = this.round;
    const left = Math.max(0, Math.ceil(r.left));
    ui.setTimer(r.free ? '自由钓' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, !r.free && left <= 30);
    const top = this.poolLeader();
    ui.setPool(top ? `彩池领先：${top.name} 的${SPECIES_BY_ID[top.id].name} ${top.size} 厘米` : '彩池：还没人上鱼');
    if (st === 'bite') {
      const p = a.bob.clone().project(this.camera);
      ui.setBiteMark((p.x * 0.5 + 0.5) * window.innerWidth, (-p.y * 0.5 + 0.5) * window.innerHeight);
    } else {
      ui.setBiteMark(null);
    }
  }
}
