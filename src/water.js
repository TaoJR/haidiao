import * as THREE from 'three';
import { skyUniforms, SKY_GLSL } from './sky.js';

const G = 9.81;
const f = (n) => { const s = Number(n).toFixed(5); return s.includes('.') ? s : s + '.0'; };

function mk(angleDeg, L, A, phase) {
  const a = (angleDeg * Math.PI) / 180;
  const k = (2 * Math.PI) / L;
  return { L, A, k, omega: Math.sqrt(G * k), dx: Math.cos(a), dz: Math.sin(a), phase };
}

// Large waves: displace geometry, also drive the boat and bobbers in JS.
export const WAVES = [
  mk(20, 34, 0.15, 0.0),
  mk(-18, 21, 0.095, 1.7),
  mk(52, 13, 0.055, 4.1),
  mk(-44, 8.3, 0.032, 2.3),
  mk(78, 5.1, 0.018, 5.2),
  mk(4, 3.1, 0.011, 0.9),
];

// Small ripples: shading only.
const RIPPLES = [];
{
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const Ls = [2.3, 1.7, 1.25, 0.95, 0.72, 0.55, 0.42, 0.33];
  for (const L of Ls) RIPPLES.push(mk((rnd() - 0.5) * 170, L, L * 0.011, rnd() * 6.28));
}

export function waveHeight(x, z, t) {
  let h = 0;
  for (const w of WAVES) h += w.A * Math.sin((x * w.dx + z * w.dz) * w.k - t * w.omega + w.phase);
  return h;
}

const dispCode = WAVES.map((w) => `
  {
    float th = dot(p, vec2(${f(w.dx * w.k)}, ${f(w.dz * w.k)})) - t * ${f(w.omega)} + ${f(w.phase)};
    float fd = 1.0 - smoothstep(${f(w.L / 0.36)}, ${f(w.L / 0.18)}, r);
    d.y += ${f(w.A)} * sin(th) * fd;
    d.xz += vec2(${f(w.dx)}, ${f(w.dz)}) * ${f(w.A * 0.6)} * cos(th) * fd;
  }`).join('\n');

const gradCode = [...WAVES, ...RIPPLES].map((w) => `
  {
    float th = dot(p, vec2(${f(w.dx * w.k)}, ${f(w.dz * w.k)})) - t * ${f(w.omega)} + ${f(w.phase)};
    float fd = 1.0 - smoothstep(${f(w.L * 45)}, ${f(w.L * 200)}, dist);
    g += vec2(${f(w.dx)}, ${f(w.dz)}) * (${f(w.A * w.k)} * cos(th) * fd);
  }`).join('\n');

export const waterUniforms = {
  uWaterDeep: { value: new THREE.Color() },
  uWaterShallow: { value: new THREE.Color() },
  uWaterSSS: { value: new THREE.Color() },
  uFoamColor: { value: new THREE.Color() },
  uHullLit: { value: new THREE.Color() },
  uHullShade: { value: new THREE.Color() },
  uSunSpec: { value: 1 },
};

const vertexShader = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
varying vec2 vP0;
varying float vH;
vec3 gerstner(vec2 p, float t, float r) {
  vec3 d = vec3(0.0);
  ${dispCode}
  return d;
}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP0 = wp.xz;
  vec3 d = gerstner(wp.xz, uTime, length(wp.xz));
  wp.xyz += d;
  vH = d.y;
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const fragmentShader = SKY_GLSL + /* glsl */ `
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform vec3 uWaterSSS;
uniform vec3 uFoamColor;
uniform vec3 uHullLit;
uniform vec3 uHullShade;
uniform float uSunSpec;
varying vec3 vWorld;
varying vec2 vP0;
varying float vH;

vec2 waveGrad(vec2 p, float t, float dist) {
  vec2 g = vec2(0.0);
  ${gradCode}
  return g;
}

float hullHalf(float z) {
  float t = clamp((z - 2.0) / 9.0, 0.0, 1.0);
  return 2.9 * (1.0 - pow(t, 2.2));
}
float hullDist(vec2 p) {
  float dx = abs(p.x) - hullHalf(p.y) * 0.93;
  float dz = max(p.y - 11.0, -11.0 - p.y);
  return max(dx, dz);
}

float sparkleLayer(vec2 p, float t, float prob) {
  vec2 i = floor(p);
  vec2 fr = fract(p) - 0.5;
  float ph = hash21(i + 11.7);
  float tt = t * 1.6 + ph * 10.0;
  float h = hash21(i + floor(tt) * 1.37);
  float pulse = sin(3.14159 * fract(tt));
  vec2 off = (vec2(hash21(i + 3.1), hash21(i + 7.3)) - 0.5) * 0.6;
  float d = length(fr - off);
  return step(1.0 - prob, h) * pulse * smoothstep(0.2, 0.03, d);
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;

  vec2 g = waveGrad(vP0, uTime, dist);
  float nf = 1.0 - smoothstep(40.0, 240.0, dist);
  float e = 0.08;
  vec2 q = mat2(0.8, 0.6, -0.6, 0.8) * vP0 * 1.7 + vec2(uTime * 0.25, uTime * 0.11);
  float n0 = vnoise(q);
  g += (vec2(vnoise(q + vec2(e, 0.0)) - n0, vnoise(q + vec2(0.0, e)) - n0) / e * 0.04 * nf) * mat2(0.8, 0.6, -0.6, 0.8);
  float nf2 = 1.0 - smoothstep(10.0, 70.0, dist);
  vec2 q2 = mat2(0.47, -0.88, 0.88, 0.47) * vP0 * 5.3 - vec2(uTime * 0.31, uTime * 0.4);
  float m0 = vnoise(q2);
  g += (vec2(vnoise(q2 + vec2(e, 0.0)) - m0, vnoise(q2 + vec2(0.0, e)) - m0) / e * 0.022 * nf2) * mat2(0.47, -0.88, 0.88, 0.47);

  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  float farT = smoothstep(20.0, 500.0, dist);
  float NdV = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  fres *= mix(1.0, 0.72, farT);

  vec3 R0 = reflect(-V, N);
  R0.y = abs(R0.y);
  vec3 R = normalize(R0 + vec3(0.0, 0.03 + 0.2 * farT, 0.0));
  vec3 refl = skyColor(R, 1.0, 0.0);

  // Fake reflection of the white hull and cabin next to the boat.
  float hd = hullDist(vWorld.xz);
  if (hd < 7.0) {
    float hit = 0.0;
    vec3 hp = vec3(0.0);
    vec3 rp = vec3(vWorld.x, 0.0, vWorld.z);
    for (int i = 1; i <= 10; i++) {
      vec3 qq = rp + R0 * (float(i) * 0.6);
      float top = 2.1;
      if (abs(qq.x) < 2.1 && qq.z > -9.0 && qq.z < 1.2) top = 6.4;
      if (abs(qq.x) < hullHalf(qq.z) && abs(qq.z) < 11.0 && qq.y < top) { hit = 1.0; hp = qq; break; }
    }
    float lit = step(0.0, sign(vWorld.x) * uSunDir.x);
    refl = mix(refl, mix(uHullShade, uHullLit, lit), hit * 0.8);
  }

  float up = clamp(vH / 0.3 * 0.5 + 0.5, 0.0, 1.0);
  vec3 body = mix(uWaterDeep, uWaterShallow, clamp(0.1 + 0.55 * up * up, 0.0, 1.0));
  vec3 sunH = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + vec3(1e-4, 0.0, 0.0));
  float back = pow(max(dot(V, -sunH), 0.0), 3.0);
  body += uWaterSSS * back * up * 0.7;
  body *= mix(0.55, 1.0, smoothstep(-0.2, 2.2, hd));

  vec3 col = mix(body, refl, fres);

  // Sun glitter: a tight highlight up close that widens into a bright path far away.
  float sdot = max(dot(R0, uSunDir), 0.0);
  float spec = pow(sdot, mix(900.0, 55.0, farT)) * mix(14.0, 1.7, farT);
  float lobe = pow(sdot, 22.0);
  float lod = log2(max(dist, 3.0) / 3.0);
  float l0 = floor(lod);
  float lf = lod - l0;
  float prob = clamp(lobe * 1.4, 0.0, 0.85);
  vec2 sp = vP0 + vec2(uTime * 0.2, 0.0);
  float spark = mix(sparkleLayer(sp * 7.0 / exp2(l0), uTime, prob),
                    sparkleLayer(sp * 7.0 / exp2(l0 + 1.0), uTime, prob), lf);
  col += uSunColor * uSunSpec * (spec + spark * 7.0);

  // Foam: a little on steep crests, stylised rings around the hull.
  float fn = fbm(vP0 * 0.8 + vec2(uTime * 0.05, 0.0));
  float streak = fbm(mat2(0.8, 0.6, -0.6, 0.8) * vP0 * vec2(1.1, 4.5) + vec2(0.0, uTime * 0.12));
  float crest = smoothstep(0.2, 0.32, vH) * smoothstep(0.56, 0.7, fn) * smoothstep(0.5, 0.68, streak) * nf;
  float ring = smoothstep(0.55, 0.95, sin(hd * 5.5 - uTime * 1.3 + fn * 5.0) * 0.5 + 0.5);
  float hullFoam = ring * smoothstep(2.2, 0.3, hd) * smoothstep(0.35, 0.6, fn + 0.25 * (1.0 - hd * 0.4));
  hullFoam = max(hullFoam, smoothstep(0.2, 0.0, hd + (fn - 0.5) * 0.35));
  hullFoam *= step(-0.6, hd);
  col = mix(col, uFoamColor, clamp(crest * 0.45 + hullFoam * 0.85, 0.0, 1.0));

  float fog = 1.0 - exp(-dist * 0.00045);
  vec3 hz = skyColor(normalize(vec3(-V.x, 0.02, -V.z)), 0.0, 0.0);
  col = mix(col, hz, fog * 0.92);

  gl_FragColor = vec4(col, 1.0);
}`;

function polarGrid(rings, segs) {
  const pos = [];
  const idx = [];
  pos.push(0, 0, 0);
  for (let i = 1; i <= rings; i++) {
    const r = 0.7 * (Math.pow(1.045, i) - 1);
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * segs;
    const b0 = 1 + i * segs;
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      idx.push(a0 + j, a0 + j1, b0 + j, a0 + j1, b0 + j1, b0 + j);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

export function makeWater() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...skyUniforms, ...waterUniforms },
    vertexShader,
    fragmentShader,
  });
  const mesh = new THREE.Mesh(polarGrid(215, 192), mat);
  mesh.frustumCulled = false;
  return mesh;
}
