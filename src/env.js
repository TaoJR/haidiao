import * as THREE from 'three';
import { skyUniforms } from './sky.js';
import { waterUniforms } from './water.js';

const C = (hex) => new THREE.Color(hex);

function sunDir(elevDeg, azDeg) {
  const e = (elevDeg * Math.PI) / 180;
  const a = (azDeg * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
}

// Three moods taken from the reference photos: grey morning, bright afternoon, dusk.
export const PRESETS = {
  overcast: {
    sunDir: sunDir(30, 190), sunColor: C('#cfd8e0'), sunLight: 1.1, sunDisk: 0, sunGlow: 0.25, sunSpec: 0.05,
    zenith: C('#4b5665'), horizon: C('#a9c6bf'), haze: C('#bcd2cb'),
    cloudLit: C('#a4adb8'), cloudDark: C('#3b4452'), coverage: 0.9, cloudSoft: 0.34,
    hemiSky: C('#b9c6d4'), hemiGround: C('#5d6a70'), hemi: 2.1,
    waterDeep: C('#0f1d28'), waterShallow: C('#2f4b56'), waterSSS: C('#1d3b3a'),
    foam: C('#b9c4c9'), hullLit: C('#aab3ba'), hullShade: C('#8e979f'),
    exposure: 0.95, bloom: 0.25, shadow: 0.35,
  },
  sunny: {
    sunDir: sunDir(34, 182), sunColor: C('#fff1d6'), sunLight: 2.8, sunDisk: 36, sunGlow: 1, sunSpec: 1,
    zenith: C('#1d5cb5'), horizon: C('#8ebde6'), haze: C('#d3e5f3'),
    cloudLit: C('#ffffff'), cloudDark: C('#7387aa'), coverage: 0.5, cloudSoft: 0.07,
    hemiSky: C('#a9cdf5'), hemiGround: C('#5f7f96'), hemi: 1.35,
    waterDeep: C('#08283f'), waterShallow: C('#1b6c7e'), waterSSS: C('#1f8f86'),
    foam: C('#f4f8fa'), hullLit: C('#f2f3f1'), hullShade: C('#93a7c0'),
    exposure: 1.0, bloom: 0.55, shadow: 1,
  },
  sunset: {
    sunDir: sunDir(7, 186), sunColor: C('#ff9550'), sunLight: 2.7, sunDisk: 16, sunGlow: 1.6, sunSpec: 1,
    zenith: C('#2a3876'), horizon: C('#ef8a4c'), haze: C('#ffb37d'),
    cloudLit: C('#ffb78c'), cloudDark: C('#4b3656'), coverage: 0.5, cloudSoft: 0.14,
    hemiSky: C('#8a86c2'), hemiGround: C('#7a5a5c'), hemi: 1.25,
    waterDeep: C('#0f1830'), waterShallow: C('#4c3a55'), waterSSS: C('#a8522f'),
    foam: C('#ffd9c0'), hullLit: C('#ffc9a0'), hullShade: C('#7c6f96'),
    exposure: 1.0, bloom: 0.7, shadow: 1,
  },
};

function clonePreset(p) {
  const o = {};
  for (const k in p) o[k] = p[k].clone ? p[k].clone() : p[k];
  return o;
}

export class Environment {
  constructor(renderer, sun, hemi, bloom) {
    this.renderer = renderer;
    this.sun = sun;
    this.hemi = hemi;
    this.bloom = bloom;
    this.name = 'sunny';
    this.cur = clonePreset(PRESETS.sunny);
    this.from = clonePreset(PRESETS.sunny);
    this.to = PRESETS.sunny;
    this.t = 1;
    this.duration = 4;
    this.apply();
  }

  set(name, duration = 4) {
    if (!PRESETS[name]) return;
    this.name = name;
    this.from = clonePreset(this.cur);
    this.to = PRESETS[name];
    this.t = duration <= 0 ? 1 : 0;
    this.duration = duration;
    if (duration <= 0) this.update(0);
  }

  update(dt) {
    if (this.t < 1 || dt === 0) {
      this.t = Math.min(1, this.t + (this.duration > 0 ? dt / this.duration : 1));
      const k = this.t * this.t * (3 - 2 * this.t);
      for (const key in this.to) {
        const a = this.from[key], b = this.to[key];
        if (b.isColor) this.cur[key].copy(a).lerp(b, k);
        else if (b.isVector3) this.cur[key].copy(a).lerp(b, k).normalize();
        else this.cur[key] = a + (b - a) * k;
      }
      this.apply();
    }
  }

  apply() {
    const c = this.cur;
    const s = skyUniforms, w = waterUniforms;
    s.uSunDir.value.copy(c.sunDir);
    s.uSunColor.value.copy(c.sunColor);
    s.uZenith.value.copy(c.zenith);
    s.uHorizon.value.copy(c.horizon);
    s.uHaze.value.copy(c.haze);
    s.uCloudLit.value.copy(c.cloudLit);
    s.uCloudDark.value.copy(c.cloudDark);
    s.uCoverage.value = c.coverage;
    s.uCloudSoft.value = c.cloudSoft;
    s.uSunDisk.value = c.sunDisk;
    s.uSunGlow.value = c.sunGlow;
    w.uWaterDeep.value.copy(c.waterDeep);
    w.uWaterShallow.value.copy(c.waterShallow);
    w.uWaterSSS.value.copy(c.waterSSS);
    w.uFoamColor.value.copy(c.foam);
    w.uHullLit.value.copy(c.hullLit);
    w.uHullShade.value.copy(c.hullShade);
    w.uSunSpec.value = c.sunSpec;
    this.sun.color.copy(c.sunColor);
    this.sun.intensity = c.sunLight;
    this.sun.shadow.intensity = c.shadow;
    this.hemi.color.copy(c.hemiSky);
    this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = c.hemi;
    this.renderer.toneMappingExposure = c.exposure;
    if (this.bloom) this.bloom.strength = c.bloom;
  }
}
