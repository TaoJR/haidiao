import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { skyUniforms, makeSky } from './sky.js';
import { makeWater, waveHeight } from './water.js';
import { makeBoat, makeDistantBoat, makeGull, makeRod, hullHalfWidth, DECK_Y, RAIL_H } from './boat.js';
import { Character } from './characters.js';
import { Game } from './game.js';
import { lineMaterial } from './angler.js';
import { UI } from './ui.js';
import { GameAudio } from './audio.js';
import { Net } from './net.js';
import { Environment } from './env.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.15, 30000);

// ---- Lights ----
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -15;
sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15;
sun.shadow.camera.bottom = -15;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0012;
sun.shadow.normalBias = 0.05;
sun.shadow.radius = 2.5;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 1.4);
scene.add(hemi);

// ---- World ----
const sky = makeSky();
scene.add(sky);
const water = makeWater();
scene.add(water);

const boat = makeBoat();
scene.add(boat);
boat.add(camera);

const farBoat = makeDistantBoat();
farBoat.position.set(-95, 0, -38);
farBoat.rotation.y = 0.9;
scene.add(farBoat);

const gulls = [];
for (let i = 0; i < 4; i++) {
  const gull = makeGull();
  gull.userData.phase = i * 1.9;
  gull.userData.radius = 14 + i * 7;
  gull.userData.height = 9 + i * 2.5;
  gull.userData.speed = 0.16 + i * 0.03;
  scene.add(gull);
  gulls.push(gull);
}

// ---- Characters ----
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const charA = new Character('a');
const charB = new Character('b');
charA.root.position.set(-2.12, DECK_Y, 3.7);
charA.root.rotation.y = -0.2;
charB.root.position.set(-2.12, DECK_Y, 5.3);
charB.root.rotation.y = -0.75;
boat.add(charA.root, charB.root);
boat.updateMatrixWorld(true);

// Boat-space point -> a character's own space.
function toChar(ch, p) {
  ch.root.updateMatrix();
  return p.clone().applyMatrix4(ch.root.matrix.clone().invert());
}

// A: relaxed, one hand on the rail, glancing at the camera.
{
  const railX = -(hullHalfWidth(3.45) - 0.14);
  charA.pose.handR.copy(toChar(charA, V3(railX, DECK_Y + RAIL_H + 0.04, 3.4)));
  charA.pose.handL.set(0.21, 0.6, 0.05);
  charA.pose.lean.set(0.02, 0.1, -0.03);
  charA.pose.head.set(0.04, 0.3, 0.05);
}
// B: both hands on the rod, watching the tip.
const rodB = makeRod(2.3);
{
  const butt = V3(-0.04, 0.55, 0.14);
  const dir = V3(-0.06, 0.93, 0.36).normalize();
  rodB.position.copy(butt);
  rodB.quaternion.setFromUnitVectors(V3(0, 1, 0), dir);
  charB.root.add(rodB);
  charB.pose.handR.copy(butt).addScaledVector(dir, 0.3);
  charB.pose.handL.copy(butt).addScaledVector(dir, 0.68);
  charB.pose.lean.set(-0.05, -0.08, 0);
  charB.pose.head.set(-0.3, 0.12, 0.06);
}
const characters = [charA, charB];

// ---- Camera ----
camera.position.set(-0.6, DECK_Y + 1.25, 7.9);
const controls = new OrbitControls(camera, canvas);
controls.target.set(-2.05, DECK_Y + 0.75, 4.5);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.5;
controls.maxDistance = 45;
controls.maxPolarAngle = Math.PI * 0.56;
controls.enablePan = false;
controls.update();

// ---- Post-processing ----
const pr = renderer.getPixelRatio();
const rt = new THREE.WebGLRenderTarget(window.innerWidth * pr, window.innerHeight * pr, {
  type: THREE.HalfFloatType,
  samples: 4,
});
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.7, 1.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const env = new Environment(renderer, sun, hemi, bloom);

// Quality: low drops shadows, bloom and the high-DPI buffer for phones and older laptops.
let lowQuality = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
const qualityBtn = document.getElementById('quality-btn');
function applyQuality() {
  const ratio = lowQuality ? 1 : Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(ratio);
  composer.setPixelRatio(ratio);
  sun.castShadow = !lowQuality;
  bloom.enabled = !lowQuality;
  qualityBtn.textContent = lowQuality ? '画质：低' : '画质：高';
  resize();
}
qualityBtn.addEventListener('click', () => { lowQuality = !lowQuality; applyQuality(); });

function resize() {
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 76 : 58; // portrait phones need a wider lens to keep both anglers in frame
  camera.updateProjectionMatrix();
  lineMaterial.resolution.set(w, h);
}
lineMaterial.resolution.set(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
window.addEventListener('resize', resize);
applyQuality();

// ---- Game and UI ----
const ui = new UI();
const game = new Game({ scene, boat, env, camera, chars: { a: charA, b: charB }, ui });

const buttons = [...document.querySelectorAll('[data-env]')];
function setEnv(name, duration = 4) {
  env.set(name, duration);
  buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.env === name)));
}
buttons.forEach((b) => b.addEventListener('click', () => { game.weatherT = 0; game.setWeatherStamp(); setEnv(b.dataset.env); }));
game.on('weather', (name) => setEnv(name, game.fastWeather ? 2 : 12));

// Landing net for the partner's fish, and the end-of-round sheet.
document.getElementById('net-btn').addEventListener('click', () => game.tryNet());
document.getElementById('again-btn').addEventListener('click', () => game.requestRestart());
document.getElementById('free-btn').addEventListener('click', () => game.startFree());
document.getElementById('results').addEventListener('cancel', (e) => e.preventDefault());

// Live link: whoever else has this page open shares the boat.
const net = new Net();
game.setNet(net);
const KIND_NAME = { a: 'Tao', b: 'Lulu' };
const inviteBox = document.getElementById('invite');
const inviteUrl = document.getElementById('invite-url');
const inviteBtn = document.getElementById('invite-btn');
async function copyInvite(done) {
  try {
    await navigator.clipboard.writeText(net.inviteUrl);
    done('邀请链接已复制，发给对方就行');
  } catch {
    inviteUrl.focus();
    inviteUrl.select();
    done('复制没成功，请手动复制这个链接');
  }
}
document.getElementById('invite-copy').addEventListener('click', () => copyInvite((msg) => ui.setNetStatus(msg)));
inviteBtn.addEventListener('click', () => copyInvite((msg) => ui.toast(msg.includes('已复制') ? msg : `邀请链接：${net.inviteUrl}`)));

net.onPeers(() => {
  const peerMode = net.kind === 'peer';
  inviteBtn.hidden = !peerMode;
  if (game.mode === 'play') return;
  inviteBox.hidden = !peerMode || net.others().length > 0;
  if (peerMode) inviteUrl.value = net.inviteUrl;
  if (!net.kind) { ui.setNetStatus('联机未连接：现在是单人模式，另一个人由电脑扮演。'); return; }
  const taken = net.others().map((p) => p.presence && p.presence.c).filter((c) => c === 'a' || c === 'b');
  const here = net.others().length;
  ui.setNetStatus(
    here === 0 ? (peerMode ? '想两个人玩：把下面的邀请链接发给对方，对方打开就上船，不用登录。' : '联机已就绪：对方打开同一个链接后会出现在船上。')
      : taken.length ? `对方已经选了${taken.map((c) => KIND_NAME[c]).join('、')}，你选另一个就能一起钓。`
        : '对方已经在页面上，正在选人。',
    taken
  );
});
net.init();

const audio = new GameAudio();
game.on('sfx', ({ name, size, who }) => audio.play(name, { size, gain: who === 'me' ? 1 : 0.35 }));
const muteBtn = document.getElementById('mute-btn');
muteBtn.addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  muteBtn.textContent = audio.muted ? '声音：关' : '声音：开';
  muteBtn.setAttribute('aria-pressed', String(!audio.muted));
});

document.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
  charB.root.remove(rodB);
  controls.enabled = false;
  audio.start();
  game.start(b.dataset.pick);
}));

const journal = document.getElementById('journal');
document.getElementById('journal-btn').addEventListener('click', () => ui.openJournal(game.journalData()));
document.getElementById('journal-close').addEventListener('click', () => journal.close());

// One-button play: hold / release anywhere on the scene, or Space.
function setAim(clientX) {
  game.input.aim = -(clientX / Math.max(1, window.innerWidth) - 0.5) * 1.1;
}
canvas.addEventListener('pointerdown', (e) => {
  if (game.mode !== 'play') return;
  canvas.setPointerCapture(e.pointerId);
  setAim(e.clientX);
  game.input.down = true;
});
canvas.addEventListener('pointermove', (e) => { if (game.mode === 'play') setAim(e.clientX); });
const release = () => { game.input.down = false; };
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
window.addEventListener('blur', release);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && game.mode === 'play' && !journal.open) { e.preventDefault(); game.input.down = true; }
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') release(); });
window.addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !e.repeat) game.tryNet(); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---- Loop ----
const clock = new THREE.Clock();
let time = 0;
const camWorld = new THREE.Vector3();
const smooth = { y: 0, pitch: 0, roll: 0 };
let menuPing = 0;

function step(dt) {
  time += dt;
  skyUniforms.uTime.value = time;
  env.update(dt);

  // Boat rides the same waves the water shader draws.
  const hB = waveHeight(0, 7, time), hS = waveHeight(0, -7, time);
  const hP = waveHeight(-2.5, 0, time), hSt = waveHeight(2.5, 0, time);
  const k = 1 - Math.exp(-dt * 2.2);
  smooth.y += ((hB + hS + hP + hSt) * 0.25 * 0.55 - smooth.y) * k;
  smooth.pitch += (Math.atan2(hS - hB, 14) * 0.7 - smooth.pitch) * k;
  smooth.roll += (Math.atan2(hSt - hP, 5) * 0.55 - smooth.roll) * k;
  boat.position.y = smooth.y;
  boat.rotation.x = smooth.pitch;
  boat.rotation.z = smooth.roll;

  // On the menu, keep the direct link warm so each side can see the other is there.
  if (game.mode !== 'play' && net.kind === 'peer') {
    menuPing -= dt;
    if (menuPing <= 0) { menuPing = 1; net.setPresence({}); net.notify(); }
  }
  boat.updateMatrixWorld(true);
  charB.setGlasses(env.name === 'sunny');
  game.update(dt, time);
  const me = game.local;
  audio.reel(!!me && ((me.state === 'fight' && me.reeling) || me.state === 'retrieve'), me ? me.T : 0, dt);
  for (const ch of characters) ch.update(dt);

  farBoat.position.y = waveHeight(farBoat.position.x, farBoat.position.z, time) * 0.6 - 0.1;
  farBoat.rotation.z = Math.sin(time * 0.9) * 0.04;

  // Gulls loiter over the boat until a school shows, then circle low over it and dive.
  const sc = game.school;
  const gk = 1 - Math.exp(-dt * 0.9);
  gulls.forEach((g, i) => {
    const u = g.userData;
    if (u.cx === undefined) Object.assign(u, { cx: -10, cz: 2, r: u.radius, h: u.height, spd: u.speed, ang: u.phase });
    const want = sc.active
      ? { cx: sc.pos.x, cz: sc.pos.z, r: 2.2 + i * 1.0, h: 3.4 + i * 0.8, spd: 0.85 }
      : { cx: -10, cz: 2, r: u.radius, h: u.height, spd: u.speed };
    for (const key of ['cx', 'cz', 'r', 'h', 'spd']) u[key] += (want[key] - u[key]) * gk;
    u.ang += dt * u.spd;
    const dive = sc.active ? Math.pow(Math.max(0, Math.sin(time * 1.1 + u.phase * 2.3)), 8) * (u.h - 0.5) : 0;
    g.position.set(u.cx + Math.cos(u.ang) * u.r, u.h - dive + Math.sin(u.ang * 1.7) * 0.5, u.cz + Math.sin(u.ang) * u.r);
  });
  for (const g of gulls) {
    const a = g.userData.ang;
    g.rotation.y = -a;
    g.rotation.z = -0.25;
    const flap = Math.sin(time * 5 + g.userData.phase) * 0.5 * (0.4 + 0.6 * Math.max(0, Math.sin(a * 0.7)));
    g.userData.wings[0].rotation.z = -flap;
    g.userData.wings[1].rotation.z = flap;
  }

  if (controls.enabled) controls.update();
  boat.updateMatrixWorld(true);
  camera.getWorldPosition(camWorld);
  sky.position.copy(camWorld);

  const sd = skyUniforms.uSunDir.value;
  sun.target.position.set(0, 1, 0);
  sun.position.copy(sun.target.position).addScaledVector(sd, 60);
}

function frame() {
  requestAnimationFrame(frame);
  step(Math.min(clock.getDelta(), 0.05));
  composer.render();
}
requestAnimationFrame(frame);

// Debug hooks for checking the scene from the console.
window.__game = {
  scene, camera, controls, renderer, env, setEnv, boat, charA, charB, game, net,
  renderOnce(dt = 0.016) { step(dt); composer.render(); },
};
