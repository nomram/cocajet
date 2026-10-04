/* ==========================================================================
   flow3d.js — the gas path made visible: crisp velocity streaks, a ray-marched flame in the
   combustor, a ray-marched exhaust jet and the flash of a compressor surge.
   Everything lives in STL coordinates (z = engine axis, flow toward +z, r = radius) and is
   attached to the viewer's `engine` group so it moves/rotates with the model.

     streaks : instanced ribbons, one per air parcel, always >= ~1.25 px wide, oriented along the
               local velocity and as long as the speed they stand for
     flame   : volume shader in the annulus of the flame tube (swirling, noise-driven, blue core)
     plume   : volume shader behind the nozzle, colour-coded by gas temperature (a real 650 C jet is
               nearly invisible: this is a false-colour "schlieren" view of it)
   ========================================================================== */
import * as THREE from 'three';
import { gasTempProfile } from './engine-sim.js';

/* ---------- geometry of the gas path (matches tools/build-stl.mjs) ---------- */
const P = { zE: 24, R2: 28, rs1: 21, rh1: 6, Lax: 17, b2: 6 };
const hub = (s) => [P.zE + P.Lax * Math.sin(Math.PI * s / 2), P.R2 - (P.R2 - P.rh1) * Math.cos(Math.PI * s / 2)];
const shr = (s) => [P.zE + (P.Lax - P.b2) * Math.sin(Math.PI * s / 2), P.R2 - (P.R2 - P.rs1) * Math.cos(Math.PI * s / 2)];
const rCone = (z) => 21 + (8 - 21) * Math.pow((z - 191) / 61, 1.15);
const rNoz = (z) => 30.1 + (20.5 - 30.1) * (z - 195) / 60;
const Z_NOZ_EXIT = 255, Z_LINER_END = 165;
const ENTRIES = [               // [name, z of hole row, share of the air]
  ['primary', 88, 0.22], ['secondary', 112, 0.30], ['dilution', 142, 0.47], ['dome', 76, 0.01],
];

/** A "rake" is a line across the passage: a = [z, r] at one wall, b = [z, r] at the other. */
const R = (a, b, key, sw = 0) => ({ a, b, key, sw });

function buildRoutes() {
  const pre = [
    R([-95, 0], [-95, 100], 'amb', 0), R([-45, 0], [-45, 62], 'amb', 0), R([3, 0], [3, 40], 'amb', 0),
    R([14, 6], [14, 21.4], 'in', 0), R([24, 6], [24, 21.0], 'in', 0),
  ];
  for (let i = 1; i <= 8; i++) { const s = i / 8; pre.push(R(hub(s), shr(s), 'imp', 0.2 + 2.6 * s)); }
  pre.push(R([41, 32], [34.6, 32], 'diff', 2.4), R([41, 37], [34.6, 37], 'diff', 1.9), R([41, 41], [34.6, 41], 'diff', 1.6));
  pre.push(R([41.6, 42.6], [37.6, 46.2], 'diff', 1.0), R([47, 43.2], [42.6, 47.8], 'ann', 0.5), R([54, 36], [54, 47.8], 'ann', 0.3));
  const routes = {};
  for (const [name, ze] of ENTRIES) {
    for (const wall of ['outer', 'inner']) {
      if (name === 'dome' && wall === 'inner') continue;
      const rk = pre.slice();
      if (wall === 'outer') {
        rk.push(R([64, 34.2], [64, 47.6], 'ann', 0.15));
        for (let z = 64 + 14; z < ze - 4; z += 14) rk.push(R([z, 34.2], [z, 47.6], 'ann', 0.1));
        rk.push(R([ze - 2, 34.4], [ze - 2, 47.6], 'ann', 0.1));
        rk.push(R([ze + 2.5, 27.5], [ze + 2.5, 32.2], 'hole', 0.0));
      } else {
        rk.push(R([60, 17], [60, 40], 'ann', 0.2), R([69, 14.6], [69, 22], 'ann', 0.1), R([79, 14.6], [79, 16.7], 'ann', 0.05));
        for (let z = 79 + 14; z < ze - 4; z += 14) rk.push(R([z, 14.6], [z, 16.7], 'ann', 0.05));
        rk.push(R([ze - 2, 14.6], [ze - 2, 16.7], 'ann', 0.05));
        rk.push(R([ze + 2.5, 18.2], [ze + 2.5, 24.0], 'hole', 0.0));
      }
      const zStart = ze + 2.5;
      for (let z = zStart + 8; z < Z_LINER_END - 4; z += 12) rk.push(R([z, 18.0], [z, 32.0], 'can', 0.05));
      rk.push(R([Z_LINER_END, 17.8], [Z_LINER_END, 32.3], 'can', 0.05));
      rk.push(R([172, 21.2], [172, 30.2], 'ngv', 1.55), R([177, 21.2], [177, 30.2], 'ngv', 1.6));
      rk.push(R([181, 21.2], [181, 29.6], 'turb', 1.0), R([189, 21.2], [189, 29.6], 'turb', 0.05));
      for (let z = 196; z <= Z_NOZ_EXIT; z += 12) rk.push(R([z, rCone(z) + 0.8], [z, rNoz(z) - 0.8], 'noz', 0.04));
      rk.push(R([Z_NOZ_EXIT, 8.5], [Z_NOZ_EXIT, 20], 'noz', 0));
      for (let i = 1; i <= 6; i++) { const z = Z_NOZ_EXIT + i * 42; rk.push(R([z, 0], [z, 20 + i * 2.6], 'plume', 0)); }
      routes[`${name}-${wall}`] = { rakes: rk, name, wall, share: name === 'dome' ? 0.01 : (wall === 'outer' ? 0.61 : 0.39) };
    }
  }
  // cumulative arc-lengths along the mid line of each rake chain
  for (const rt of Object.values(routes)) {
    let L = 0;
    rt.rakes.forEach((r, i) => {
      r.mid = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2];
      if (i > 0) { const p = rt.rakes[i - 1].mid; L += Math.hypot(r.mid[0] - p[0], r.mid[1] - p[1]); }
      r.s = L;
    });
    rt.length = L;
  }
  return routes;
}

/* ---------- colour ramps ---------- */
function tempColor(T, out, o) {
  // cold air (cyan-white) -> warm (pale) -> orange -> yellow-white
  let r, g, b;
  if (T < 330) { r = 0.42; g = 0.82; b = 1.0; }
  else if (T < 520) { const t = (T - 330) / 190; r = 0.42 + 0.50 * t; g = 0.82 + 0.08 * t; b = 1.0 - 0.14 * t; }
  else if (T < 900) { const t = (T - 520) / 380; r = 0.92 + 0.08 * t; g = 0.90 - 0.36 * t; b = 0.86 - 0.66 * t; }
  else if (T < 1500) { const t = (T - 900) / 600; r = 1.0; g = 0.54 + 0.22 * t; b = 0.20 - 0.08 * t; }
  else { const t = Math.min(1, (T - 1500) / 600); r = 1.0; g = 0.76 + 0.24 * t; b = 0.12 + 0.68 * t; }
  out[o] = r; out[o + 1] = g; out[o + 2] = b;
}

/* ---------- shared GLSL: value-noise fbm and a clip-plane test ---------- */
const GLSL_NOISE = /* glsl */`
float hash31(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x), mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x), mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
vec2 cylRange(vec3 ro, vec3 rd, float R, float z0, float z1) {
  float a = dot(rd.xy, rd.xy), b = dot(ro.xy, rd.xy), c = dot(ro.xy, ro.xy) - R * R;
  float t0 = -1e9, t1 = 1e9;
  if (a < 1e-9) { if (c > 0.0) return vec2(1.0, 0.0); }
  else { float D = b * b - a * c; if (D < 0.0) return vec2(1.0, 0.0); float s = sqrt(D); t0 = (-b - s) / a; t1 = (-b + s) / a; }
  if (abs(rd.z) > 1e-6) { float ta = (z0 - ro.z) / rd.z, tb = (z1 - ro.z) / rd.z; t0 = max(t0, min(ta, tb)); t1 = min(t1, max(ta, tb)); }
  else if (ro.z < z0 || ro.z > z1) return vec2(1.0, 0.0);
  return vec2(max(t0, 0.0), t1);
}`;

/* ---------- streaks ---------- */
const STREAK_VERT = /* glsl */`
  attribute vec3 aPos; attribute vec3 aDir; attribute float aLen; attribute float aWid; attribute vec3 aCol; attribute float aAlpha;
  uniform float uPx; uniform vec4 uClip; uniform float uClipOn;
  varying vec2 vUv; varying vec3 vCol; varying float vA;
  void main() {
    vec3 wp = (modelMatrix * vec4(aPos, 1.0)).xyz;
    vec3 d = normalize(mat3(modelMatrix) * aDir);
    vec3 toCam = normalize(cameraPosition - wp);
    vec3 side = cross(d, toCam); float sl = length(side);
    side = sl > 1e-3 ? side / sl : normalize(cross(d, vec3(0.0, 1.0, 0.0)));
    float pxMm = uPx / max(1.0, length(cameraPosition - wp));
    float w = max(aWid, 1.3 / pxMm);                       // never thinner than ~1.3 px: stays crisp at any zoom
    vec3 pos = wp + d * (position.x * aLen) + side * (position.y * w);
    vUv = position.xy * 2.0; vCol = aCol;
    vA = aAlpha * clamp(aWid / w * 1.6, 0.4, 1.0);
    if (uClipOn > 0.5 && dot(uClip.xyz, wp) + uClip.w < 0.0) vA = 0.0;
    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  }`;
const STREAK_FRAG = /* glsl */`
  varying vec2 vUv; varying vec3 vCol; varying float vA;
  void main() {
    float across = 1.0 - smoothstep(0.35, 1.0, abs(vUv.y));
    float tail = smoothstep(-1.0, 0.85, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x));
    float a = across * (0.12 + 0.88 * tail) * vA;
    if (a < 0.015) discard;
    gl_FragColor = vec4(vCol * (0.75 + 0.5 * tail), a);
  }`;

function makeStreaks(n, u) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.setAttribute('position', base.attributes.position);
  const attr = (name, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
  attr('aPos', 3); attr('aDir', 3); attr('aLen', 1); attr('aWid', 1); attr('aCol', 3); attr('aAlpha', 1);
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    vertexShader: STREAK_VERT, fragmentShader: STREAK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uPx: u.uPx, uClip: u.uClip, uClipOn: u.uClipOn },
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 3;
  return mesh;
}

/* ---------- volume shaders (ray-march through a bounding cylinder, in engine-local coordinates) ---------- */
const VOL_VERT = /* glsl */`varying vec3 vLocal; void main() { vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FLAME_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vLocal;
  uniform vec3 uCam; uniform float uTime, uInt, uPulse, uSteps; uniform mat4 uModel; uniform vec4 uClip; uniform float uClipOn;
  ${GLSL_NOISE}
  vec3 flameRamp(float h, float blue) {
    vec3 red = vec3(0.85, 0.12, 0.03), orange = vec3(1.0, 0.45, 0.07), yellow = vec3(1.0, 0.82, 0.30), white = vec3(1.0, 0.97, 0.80);
    vec3 c = h < 0.35 ? mix(red, orange, h / 0.35) : h < 0.7 ? mix(orange, yellow, (h - 0.35) / 0.35) : mix(yellow, white, (h - 0.7) / 0.3);
    return mix(c, vec3(0.28, 0.5, 1.0), blue);
  }
  void main() {
    vec3 ro = uCam, rd = normalize(vLocal - uCam);
    vec2 rg = cylRange(ro, rd, 33.5, 70.0, 168.0);
    if (rg.y <= rg.x) discard;
    const int STEPS = 34;
    float dt = (rg.y - rg.x) / uSteps;
    float jitter = hash31(vec3(gl_FragCoord.xy, uTime * 17.0));
    vec3 col = vec3(0.0);
    for (int i = 0; i < STEPS; i++) {
      if (float(i) >= uSteps) break;
      float t = rg.x + (float(i) + jitter) * dt;
      vec3 p = ro + rd * t;
      if (uClipOn > 0.5) { vec3 wp = (uModel * vec4(p, 1.0)).xyz; if (dot(uClip.xyz, wp) + uClip.w < 0.0) continue; }
      float r = length(p.xy), z = p.z;
      float ring = smoothstep(17.7, 19.5, r) * (1.0 - smoothstep(30.8, 32.6, r));        // the annulus between inner tube and can
      float zf = smoothstep(76.0, 83.0, z) * (1.0 - smoothstep(108.0, 158.0, z));
      if (ring * zf < 0.004) continue;
      float ang = atan(p.y, p.x);
      float sw = ang * 2.0 + z * 0.055 - uTime * 3.1;                                    // swirling flow around the shaft
      vec3 q = vec3(cos(sw) * r * 0.11, sin(sw) * r * 0.11, z * 0.05 - uTime * 2.4);
      float n = fbm(q);
      float core = exp(-pow((z - 93.0) / 17.0, 2.0));
      float d = ring * zf * smoothstep(0.26, 0.78, n * 0.95 + 0.50 * core * (0.85 + 0.15 * sin(uTime * 31.0 + ang * 3.0)));
      float h = clamp(0.25 + 0.75 * core + 0.35 * (n - 0.5), 0.0, 1.0);
      float blue = (1.0 - smoothstep(78.0, 92.0, z)) * 0.8;
      col += flameRamp(h, blue) * d * dt * 0.04;
    }
    col *= uInt * (1.0 + 0.6 * uPulse);
    col = vec3(1.0) - exp(-col * 1.15);                    // soft tone-map: no blown-out white blob
    gl_FragColor = vec4(col, clamp(max(col.r, max(col.g, col.b)) * 1.1, 0.0, 1.0));
  }`;

const PLUME_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vLocal;
  uniform vec3 uCam; uniform float uTime, uInt, uLen, uAdv, uT5, uTamb, uPulse, uSteps; uniform mat4 uModel; uniform vec4 uClip; uniform float uClipOn;
  ${GLSL_NOISE}
  vec3 thermal(float T) {   // false colour: cool haze -> dull red -> orange -> pale yellow
    float x = clamp((T - 300.0) / 800.0, 0.0, 1.0);
    vec3 a = vec3(0.30, 0.45, 0.70), b = vec3(0.85, 0.20, 0.05), c = vec3(1.0, 0.55, 0.10), d = vec3(1.0, 0.92, 0.55);
    return x < 0.33 ? mix(a, b, x / 0.33) : x < 0.66 ? mix(b, c, (x - 0.33) / 0.33) : mix(c, d, (x - 0.66) / 0.34);
  }
  void main() {
    vec3 ro = uCam, rd = normalize(vLocal - uCam);
    float Rb = 20.5 + 0.21 * uLen;
    vec2 rg = cylRange(ro, rd, Rb, 253.0, 255.0 + uLen);
    if (rg.y <= rg.x) discard;
    const int STEPS = 44;
    float dt = (rg.y - rg.x) / uSteps;
    float jitter = hash31(vec3(gl_FragCoord.xy, uTime * 13.0));
    vec3 col = vec3(0.0);
    for (int i = 0; i < STEPS; i++) {
      if (float(i) >= uSteps) break;
      float t = rg.x + (float(i) + jitter) * dt;
      vec3 p = ro + rd * t;
      if (uClipOn > 0.5) { vec3 wp = (uModel * vec4(p, 1.0)).xyz; if (dot(uClip.xyz, wp) + uClip.w < 0.0) continue; }
      float zz = max(0.0, p.z - 255.0), s = clamp(zz / uLen, 0.0, 1.0);
      float r = length(p.xy);
      float ro_ = 20.5 + 0.21 * zz;                                                       // the jet spreads at ~12 degrees
      vec3 q = vec3(p.xy * 0.075, p.z * 0.05 - uTime * uAdv);
      float n = fbm(q);                                                                    // eddies carried downstream
      float rho = r / ro_ * (1.0 + 0.55 * (n - 0.5) * smoothstep(0.0, 0.35, s));
      float prof = 1.0 - smoothstep(0.55, 1.08, rho);
      float theta = pow(max(0.0, 1.0 - s), 1.15) * prof;                                   // temperature excess decays with distance
      if (theta < 0.01) continue;
      float T = uTamb + (uT5 - uTamb) * theta;
      float edge = smoothstep(0.0, 0.12, s);
      col += thermal(T) * theta * theta * dt * 0.045 * (0.55 + 0.9 * n) * (0.4 + 0.6 * edge);
    }
    col *= uInt * (1.0 + 0.5 * uPulse);
    col = vec3(1.0) - exp(-col * 1.25);
    gl_FragColor = vec4(col, clamp(max(col.r, max(col.g, col.b)) * 1.1, 0.0, 1.0));
  }`;

export class FlowSystem {
  constructor(engine, { count = 4200 } = {}) {
    this.engine = engine;
    this.routes = buildRoutes();
    this.routeList = Object.values(this.routes);
    this.u = { uPx: { value: 600 }, uClip: { value: new THREE.Vector4(0, 0, -1, 0) }, uClipOn: { value: 0 } };
    this.enabled = { air: true, flame: true, plume: true };
    this.slow = 5.0e-4;                               // visual slow-motion factor (real velocity -> mm per second on screen)
    this.N = this.Nmax = count;
    this.quality = 1;
    this.streaks = makeStreaks(count, this.u);
    engine.add(this.streaks);
    // volumes
    const vu = () => ({ uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uInt: { value: 0 }, uPulse: { value: 0 }, uSteps: { value: 34 }, uModel: { value: engine.matrixWorld }, uClip: this.u.uClip, uClipOn: this.u.uClipOn });
    this.flameU = Object.assign(vu(), {});
    this.plumeU = Object.assign(vu(), { uLen: { value: 330 }, uAdv: { value: 2.0 }, uT5: { value: 900 }, uTamb: { value: 288 } });
    const volMat = (frag, u) => new THREE.ShaderMaterial({ vertexShader: VOL_VERT, fragmentShader: frag, uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide });
    const cyl = (r0, r1, z0, z1) => { const g = new THREE.CylinderGeometry(r1, r0, z1 - z0, 40, 1, false); g.rotateX(Math.PI / 2); g.translate(0, 0, (z0 + z1) / 2); return g; };
    this.flame = new THREE.Mesh(cyl(34.5, 34.5, 70, 168), volMat(FLAME_FRAG, this.flameU));
    this.plumeMesh = new THREE.Mesh(cyl(21.5, 21.5 + 0.21 * 360 + 4, 252, 255 + 360), volMat(PLUME_FRAG, this.plumeU));
    this.flame.frustumCulled = this.plumeMesh.frustumCulled = false; this.flame.renderOrder = this.plumeMesh.renderOrder = 2;
    engine.add(this.flame, this.plumeMesh);
    // surge flash out of the intake
    this.flash = new THREE.Mesh(new THREE.CircleGeometry(80, 40), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uA: { value: 0 } },
      vertexShader: 'varying vec2 vP; void main() { vP = position.xy / 80.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vP; uniform float uA; void main() { float d = length(vP); float a = pow(max(0.0, 1.0 - d), 1.6) * uA; gl_FragColor = vec4(vec3(1.0, 0.62, 0.22) * a * 1.6, a); }',
    }));
    this.flash.position.set(0, 0, -6); this.flash.visible = false; engine.add(this.flash);
    // parcels
    this.ps = [];
    for (let i = 0; i < count; i++) { const p = { rt: null, s: 0, lane: 0, th: 0, v: 1, jit: 0, seg: 0, px: 0, py: 0, pz: 0, fresh: true }; this._spawn(p, true); this.ps.push(p); }
    // lights
    this.lightFlame = new THREE.PointLight(0xff7a30, 0, 300, 1.4);
    this.lightFlame.position.set(0, 0, 100);
    this.lightExit = new THREE.PointLight(0xff9a50, 0, 330, 1.4);
    this.lightExit.position.set(0, 0, 275);
    engine.add(this.lightFlame, this.lightExit);
    this.t = 0; this._lastPhase = 0; this._flashA = 0;
  }

  /** 1 = full detail; <1 draws fewer parcels and fewer volume steps (set by the viewer when the frame rate drops) */
  setQuality(q) { this.quality = q; this.N = Math.max(600, Math.round(this.Nmax * q)); this.streaks.geometry.instanceCount = this.N; this.flameU.uSteps.value = Math.max(12, Math.round(34 * Math.pow(q, 0.7))); this.plumeU.uSteps.value = Math.max(14, Math.round(44 * Math.pow(q, 0.7))); }

  _pickRoute() {
    const r = Math.random(), e = Math.random();
    let zone = 0, acc = 0;
    for (let i = 0; i < ENTRIES.length; i++) { acc += ENTRIES[i][2]; if (e <= acc) { zone = i; break; } }
    const name = ENTRIES[zone][0];
    const wall = name === 'dome' ? 'outer' : (r < 0.61 ? 'outer' : 'inner');
    return this.routes[`${name}-${wall}`];
  }

  _spawn(p, scatter) {
    p.rt = this._pickRoute();
    p.s = scatter ? Math.random() * p.rt.length : 0;
    p.lane = Math.random() * 2 - 1;
    p.th = Math.random() * Math.PI * 2;
    p.v = 0.85 + Math.random() * 0.3;
    p.jit = Math.random() * 6.28;
    p.seg = 0; p.fresh = true;
  }

  /** place a particle on its route; returns {z, r, key, f} */
  _locate(p, out) {
    const rk = p.rt.rakes;
    let i = p.seg;
    while (i < rk.length - 2 && rk[i + 1].s < p.s) i++;
    while (i > 0 && rk[i].s > p.s) i--;
    p.seg = i;
    const A = rk[i], B = rk[i + 1];
    const t = Math.min(1, Math.max(0, (p.s - A.s) / Math.max(1e-6, B.s - A.s)));
    const za = A.a[0] + (B.a[0] - A.a[0]) * t, ra = A.a[1] + (B.a[1] - A.a[1]) * t;
    const zb = A.b[0] + (B.b[0] - A.b[0]) * t, rb = A.b[1] + (B.b[1] - A.b[1]) * t;
    const u = (p.lane + 1) / 2;
    out.z = za + (zb - za) * u; out.r = ra + (rb - ra) * u;
    out.sw = A.sw + (B.sw - A.sw) * t;
    out.keyA = A.key; out.keyB = B.key; out.t = t;
    return out;
  }

  _speedFor(rake, vis) {
    const v = vis.v;
    switch (rake) {
      case 'amb': return v.in * 0.35;
      case 'in': return v.in; case 'imp': return v.imp; case 'diff': return v.diff;
      case 'ann': return v.ann; case 'hole': return Math.max(v.can * 2.2, 40); case 'can': return v.can;
      case 'ngv': return v.ngv; case 'turb': return v.turb; case 'noz': return v.noz; case 'plume': return v.noz * 0.8;
    }
    return 10;
  }

  setViewport(h, fov) { this.u.uPx.value = (h * 0.5) / Math.tan(THREE.MathUtils.degToRad(fov) / 2); }
  setClip(on, plane) { this.cutMode = on; this.u.uClipOn.value = on ? 1 : 0; if (plane) this.u.uClip.value.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant); }

  update(dt, vis, camera) {
    this.t += dt;
    const running = !!vis && vis.N > 600;
    const lit = !!vis && vis.lit;
    const surgeMod = vis ? (vis.surgeMod ?? 1) : 1;
    // ---- streaks ----
    const g = this.streaks.geometry.attributes;
    const P = g.aPos.array, D = g.aDir.array, L = g.aLen.array, W = g.aWid.array, C = g.aCol.array, A = g.aAlpha.array;
    const loc = {}, tmp = [0, 0, 0];
    const Tprof = vis ? vis.T : null;
    const intensity = Math.min(1, vis ? vis.N / 50000 : 0);
    for (let i = 0; i < this.N; i++) {
      const p = this.ps[i];
      if (!running || !this.enabled.air) { A[i] = 0; continue; }
      this._locate(p, loc);
      const vA = this._speedFor(loc.keyA, vis), vB = this._speedFor(loc.keyB, vis), vReal = vA + (vB - vA) * loc.t;
      const v = Math.max(vReal * 1000 * this.slow * p.v, 3.0);
      p.s += v * dt;
      p.th += loc.sw * v * dt / Math.max(6, loc.r);
      if (p.s >= p.rt.length) { this._spawn(p, false); A[i] = 0; continue; }
      let r = loc.r, z = loc.z;
      if (loc.keyA === 'can' || loc.keyA === 'hole') {          // turbulent in the combustor, laminar elsewhere
        r += Math.sin(this.t * 7 + p.jit * 3) * 1.2; p.th += Math.sin(this.t * 3 + p.jit) * 0.004;
      }
      const x = r * (this.cutMode ? Math.abs(Math.cos(p.th)) : Math.cos(p.th)), y = r * Math.sin(p.th);   // in a cut-away every parcel is drawn in the half that is still there (the flow is symmetric)
      let dx = x - p.px, dy = y - p.py, dz = z - p.pz; const dl = Math.hypot(dx, dy, dz);
      if (p.fresh || dl < 1e-5) { dx = 0; dy = 0; dz = 1; p.fresh = false; } else { dx /= dl; dy /= dl; dz /= dl; }
      p.px = x; p.py = y; p.pz = z;
      P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; D[i * 3] = dx; D[i * 3 + 1] = dy; D[i * 3 + 2] = dz;
      // temperature -> colour
      let T = Tprof.T01;
      if (z < 60) T = gasTempProfile(z, Tprof, lit);
      else if (loc.keyA === 'ann') T = Tprof.T02;
      else if (loc.keyA === 'hole') T = Tprof.T02 + (gasTempProfile(z, Tprof, lit) - Tprof.T02) * loc.t * 0.5;
      else T = gasTempProfile(z, Tprof, lit);
      if (loc.keyA === 'plume' || z > 255) T = Tprof.T5 * (1 - 0.55 * Math.min(1, (z - 255) / 240));
      tempColor(T, C, i * 3);
      L[i] = 1.8 + 0.42 * Math.sqrt(Math.max(vReal, 1) * p.v);           // longer streak = faster air (3 mm at the intake, ~9 mm in the nozzle)
      W[i] = 0.42;
      A[i] = (loc.keyA === 'amb' ? 0.40 : 0.85) * intensity * (loc.keyA === 'plume' ? Math.max(0, 1 - (z - 255) / 250) : 1) * (0.55 + 0.45 * surgeMod);
    }
    for (const k of ['aPos', 'aDir', 'aLen', 'aWid', 'aCol', 'aAlpha']) g[k].needsUpdate = true;

    // ---- volumes ----
    camera.updateMatrixWorld();
    this.engine.updateMatrixWorld(true);
    const camLocal = this.engine.worldToLocal(camera.position.clone());
    const fuelF = vis ? Math.min(1.2, 0.30 + vis.fuelFrac) : 0;
    const flick = 0.9 + 0.1 * Math.sin(this.t * 43) * Math.sin(this.t * 17.3);
    const pulse = vis && vis.surge ? 1 - surgeMod : 0;
    this.flameU.uCam.value.copy(camLocal); this.flameU.uTime.value = this.t;
    this.flameU.uInt.value = lit && this.enabled.flame ? fuelF * flick * (vis.surge ? 0.5 + 0.9 * surgeMod : 1) : 0;
    this.flameU.uPulse.value = pulse;
    this.flame.visible = this.flameU.uInt.value > 0.01;
    const power = vis ? Math.min(1.15, Math.max(0, (vis.N - 20000) / 95000)) : 0;
    this.plumeU.uCam.value.copy(camLocal); this.plumeU.uTime.value = this.t;
    const ve = vis ? vis.v.noz : 0;
    this.plumeU.uLen.value = 120 + 220 * Math.min(1.1, ve / 380);
    this.plumeU.uAdv.value = Math.max(0.5, ve * 1000 * this.slow * 0.045);
    this.plumeU.uT5.value = vis ? Math.max(vis.T.T5, vis.T.T01 + 1) : 600; this.plumeU.uTamb.value = vis ? vis.T.T01 : 288;
    this.plumeU.uInt.value = lit && this.enabled.plume && power > 0.02 ? Math.min(1.4, 0.35 + power) * (vis.surge ? 0.6 + 0.8 * surgeMod : 1) : 0;
    this.plumeU.uPulse.value = pulse;
    this.plumeMesh.visible = this.plumeU.uInt.value > 0.01;
    // surge flash through the intake: one burst each time the pressure collapses
    if (vis && vis.surge) { if (vis.surgePhase < this._lastPhase) this._flashA = 1; this._lastPhase = vis.surgePhase; } else this._lastPhase = 0;
    this._flashA = Math.max(0, this._flashA - dt * 7);
    this.flash.material.uniforms.uA.value = this._flashA; this.flash.visible = this._flashA > 0.01;
    if (this.flash.visible) { const qe = this._qe || (this._qe = new THREE.Quaternion()); this.engine.getWorldQuaternion(qe); this.flash.quaternion.copy(qe.invert().multiply(camera.quaternion)); }   // billboard
    // lights
    const heat = lit ? Math.min(1, 0.3 + (vis.fuelFrac || 0)) * (vis.surge ? 0.5 + 0.8 * surgeMod : 1) : 0;
    this.lightFlame.intensity = THREE.MathUtils.lerp(this.lightFlame.intensity, heat * 2600 * flick, 0.2);
    this.lightExit.intensity = THREE.MathUtils.lerp(this.lightExit.intensity, heat * 1500, 0.15);
  }

  setVisible(v) {
    this.streaks.visible = v; this.lightFlame.visible = this.lightExit.visible = v;
    if (!v) { this.flame.visible = false; this.plumeMesh.visible = false; this.flash.visible = false; }
  }
  dispose() {
    for (const o of [this.streaks, this.flame, this.plumeMesh, this.flash]) { o.geometry.dispose(); o.material.dispose(); this.engine.remove(o); }
    this.engine.remove(this.lightFlame, this.lightExit);
  }
}
