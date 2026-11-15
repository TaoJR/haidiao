import * as THREE from 'three';

let grad;
// Light ramp: a crisp terminator with a faint second band, sampled by dot(N, L).
export function gradientMap() {
  if (grad) return grad;
  const n = 128;
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const d = ((i + 0.5) / n) * 2 - 1;
    let v = THREE.MathUtils.smoothstep(d, -0.01, 0.07);
    v = v * 0.86 + 0.14 * THREE.MathUtils.smoothstep(d, 0.5, 0.6);
    const b = Math.round(v * 255);
    data.set([b, b, b, 255], i * 4);
  }
  grad = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
  grad.minFilter = grad.magFilter = THREE.LinearFilter;
  grad.needsUpdate = true;
  return grad;
}

// opts.rim: strength of the view-dependent edge light (characters).
export function toon(color, opts = {}) {
  const { rim = 0, ...rest } = opts;
  const mat = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...rest });
  if (rim > 0) {
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `float rimF = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.2);
         outgoingLight += rimF * ${rim.toFixed(3)} * (diffuseColor.rgb * 0.7 + 0.3) * (0.35 + 0.65 * length(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse));
         #include <opaque_fragment>`
      );
    };
    mat.customProgramCacheKey = () => 'rim' + rim.toFixed(3);
  }
  return mat;
}

const outlineMats = new Map();
function outlineMaterial(thickness) {
  const key = thickness.toFixed(4);
  if (!outlineMats.has(key)) {
    outlineMats.set(key, new THREE.ShaderMaterial({
      uniforms: { uT: { value: thickness }, uColor: { value: new THREE.Color(0x3d2622) } },
      vertexShader: `uniform float uT; void main(){ vec3 p = position + normalize(normal) * uT; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor, 1.0); }`,
      side: THREE.BackSide,
    }));
  }
  return outlineMats.get(key);
}

// Inverted-hull outline; best on smooth geometry.
export function addOutline(mesh, thickness = 0.012) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness));
  o.userData.outline = true;
  mesh.add(o);
  return o;
}
