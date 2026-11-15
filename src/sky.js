import * as THREE from 'three';

// Uniforms shared by the sky dome and the water (which reflects the same sky).
export const skyUniforms = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uZenith: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
  uHaze: { value: new THREE.Color() },
  uCloudLit: { value: new THREE.Color() },
  uCloudDark: { value: new THREE.Color() },
  uCoverage: { value: 0.4 },
  uCloudSoft: { value: 0.15 },
  uSunDisk: { value: 1 },
  uSunGlow: { value: 1 },
};

export const SKY_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHaze;
uniform vec3 uCloudLit;
uniform vec3 uCloudDark;
uniform float uCoverage;
uniform float uCloudSoft;
uniform float uSunDisk;
uniform float uSunGlow;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = m * p; a *= 0.5; }
  return s;
}

float cloudField(vec2 p) {
  float n = fbm(p);
  float b = 1.0 - abs(2.0 * vnoise(p * 3.3 + 5.1) - 1.0);
  float d = fbm(p * 5.7 + 7.7);
  return n * 0.64 + b * 0.13 + d * 0.23;
}

// hq > 0.5 adds a second light tap for deeper self-shadowing (sky dome only).
vec4 skyClouds(vec3 d, float sd, float hq) {
  float y = max(d.y, 0.0);
  vec2 uv = d.xz / (y + 0.12);
  vec2 p = uv * 0.8 + vec2(uTime * 0.005, uTime * 0.002);
  float f = cloudField(p);
  float th = mix(0.75, 0.25, uCoverage);
  float c = smoothstep(th, th + uCloudSoft, f);
  vec2 sdir = normalize(uSunDir.xz + vec2(1e-4));
  float l1 = cloudField(p + sdir * 0.07);
  float occ = max(l1 - th, 0.0) * 1.3;
  if (hq > 0.5) occ += max(cloudField(p + sdir * 0.2) - th, 0.0);
  else occ *= 1.8;
  float shade = exp(-occ * 13.0);
  shade = mix(shade, smoothstep(0.2, 0.7, shade), 0.6);
  shade *= mix(1.0, 0.75, smoothstep(th + 0.1, th + 0.35, f));
  vec3 col = mix(uCloudDark, uCloudLit, shade);
  col += uSunColor * uSunGlow * pow(sd, 8.0) * 0.5 * (1.0 - smoothstep(0.1, 0.8, c));
  col = mix(uHaze, col, smoothstep(0.0, 0.3, d.y) * 0.85 + 0.15);
  return vec4(col, c * smoothstep(0.0, 0.14, d.y));
}

// cloudAmt: 0 skips clouds. sunAmt: 0 skips the sun disk.
vec3 skyColor(vec3 d, float cloudAmt, float sunAmt) {
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.45));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * uSunGlow * (pow(sd, 6.0) * 0.10 + pow(sd, 40.0) * 0.22);
  float ca = 0.0;
  if (cloudAmt > 0.0) {
    vec4 cl = skyClouds(d, sd, cloudAmt - 1.0);
    ca = cl.a * min(cloudAmt, 1.0);
    col = mix(col, cl.rgb, ca);
  }
  if (sunAmt > 0.0) {
    float disk = smoothstep(0.99935, 0.99975, sd);
    float halo = pow(sd, 350.0) * 0.12;
    col += uSunColor * uSunDisk * sunAmt * (disk + halo) * (1.0 - ca * 0.92);
  }
  col = mix(col, uHaze, exp(-h * 9.0) * 0.8);
  return col;
}
`;

export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: SKY_GLSL + /* glsl */ `
      varying vec3 vDir;
      void main() {
        gl_FragColor = vec4(skyColor(normalize(vDir), 2.0, 1.0), 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(10000, 48, 24), mat);
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  return mesh;
}
