/* ==========================================================================
   flow3d.js — airflow particles, combustor flame and exhaust plume for the 3D viewer.
   Everything lives in STL coordinates (z = engine axis, flow toward +z, r = radius) and is
   attached to the viewer's `engine` group so it moves/rotates with the model.
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
  // cold air (cyan) -> warm (pale) -> orange -> yellow-white
  let r, g, b;
  if (T < 330) { r = 0.30; g = 0.78; b = 0.96; }
  else if (T < 520) { const t = (T - 330) / 190; r = 0.30 + 0.55 * t; g = 0.78 + 0.1 * t; b = 0.96 - 0.1 * t; }
  else if (T < 900) { const t = (T - 520) / 380; r = 0.85 + 0.15 * t; g = 0.88 - 0.38 * t; b = 0.86 - 0.66 * t; }
  else if (T < 1500) { const t = (T - 900) / 600; r = 1.0; g = 0.50 + 0.22 * t; b = 0.20 - 0.1 * t; }
  else { const t = Math.min(1, (T - 1500) / 600); r = 1.0; g = 0.72 + 0.28 * t; b = 0.10 + 0.7 * t; }
  out[o] = r; out[o + 1] = g; out[o + 2] = b;
}

const VERT = /* glsl */`
  attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
  uniform float uPx; uniform vec4 uClip; uniform float uClipOn;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vColor = aColor; vAlpha = aAlpha;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    if (uClipOn > 0.5 && dot(uClip.xyz, wp.xyz) + uClip.w > 0.0) vAlpha = 0.0;
    vec4 mv = viewMatrix * wp;
    gl_PointSize = clamp(aSize * uPx / max(1.0, -mv.z), 1.0, 90.0);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */`
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5; float d = length(c);
    float a = smoothstep(0.5, 0.05, d) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }`;

function makePoints(n, additive, clipUniforms) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uPx: clipUniforms.uPx, uClip: clipUniforms.uClip, uClipOn: clipUniforms.uClipOn },
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

export class FlowSystem {
  constructor(engine, { count = 4200 } = {}) {
    this.engine = engine;
    this.routes = buildRoutes();
    this.routeList = Object.values(this.routes);
    this.u = { uPx: { value: 600 }, uClip: { value: new THREE.Vector4(0, 0, -1, 0) }, uClipOn: { value: 0 } };
    this.enabled = { air: true, flame: true, plume: true };
    this.slow = 4.0e-4;                               // visual slow-motion factor
    this.N = count;
    this.air = makePoints(count, false, this.u);
    this.flame = makePoints(520, true, this.u);
    this.plume = makePoints(900, true, this.u);
    engine.add(this.air, this.flame, this.plume);
    // particle state
    this.ps = [];
    for (let i = 0; i < count; i++) {
      const p = { rt: null, s: 0, lane: 0, th: 0, v: 1, jit: 0 };
      this._spawn(p, true);
      this.ps.push(p);
    }
    this.fl = [];
    for (let i = 0; i < 520; i++) this.fl.push({ life: 0, max: 1, th: 0, r: 25, z: 90, vz: 0, size: 6 });
    this.pl = [];
    for (let i = 0; i < 900; i++) this.pl.push({ life: 0, max: 1, th: 0, r: 10, z: 255, vz: 0, vr: 0, size: 6 });
    // lights
    this.lightFlame = new THREE.PointLight(0xff7a30, 0, 300, 1.4);
    this.lightFlame.position.set(0, 0, 100);
    this.lightExit = new THREE.PointLight(0xff9a50, 0, 330, 1.4);
    this.lightExit.position.set(0, 0, 275);
    engine.add(this.lightFlame, this.lightExit);
    this.t = 0;
  }

  _pickRoute() {
    let r = Math.random();
    const e = Math.random();
    // entry zone by air share, wall by hole-area share
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
    p.seg = 0;
  }

  /** place a particle on its route; returns {z, r, th, key, f} */
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
    out.key = t < 0.5 ? A.key : B.key; out.sw = A.sw + (B.sw - A.sw) * t;
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
  setClip(on, plane) { this.u.uClipOn.value = on ? 1 : 0; if (plane) this.u.uClip.value.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant); }

  update(dt, vis, camera) {
    this.t += dt;
    const running = vis && vis.N > 600;
    const pos = this.air.geometry.attributes.position.array, col = this.air.geometry.attributes.aColor.array;
    const sz = this.air.geometry.attributes.aSize.array, al = this.air.geometry.attributes.aAlpha.array;
    const loc = {};
    const colArr = [0, 0, 0];
    const Tprof = vis ? vis.T : null;
    const lit = vis ? vis.lit : false;
    const intensity = Math.min(1, vis ? vis.N / 60000 : 0);
    for (let i = 0; i < this.N; i++) {
      const p = this.ps[i];
      if (!running || !this.enabled.air) { al[i] = 0; continue; }
      this._locate(p, loc);
      // advance along the route; speed from the engine's real velocities, slowed down for the eye
      let vA = this._speedFor(loc.keyA, vis), vB = this._speedFor(loc.keyB, vis);
      let v = (vA + (vB - vA) * loc.t) * 1000 * this.slow * p.v;
      v = Math.max(v, 2.5);
      const ds = v * dt;
      p.s += ds;
      p.th += loc.sw * ds / Math.max(6, loc.r) * 1.0;
      if (p.s >= p.rt.length) { this._spawn(p, false); al[i] = 0; continue; }
      // gentle turbulence in the combustor, laminar elsewhere
      let r = loc.r, z = loc.z;
      if (loc.keyA === 'can' || loc.keyA === 'hole') {
        r += Math.sin(this.t * 7 + p.jit * 3) * 1.2;
        p.th += Math.sin(this.t * 3 + p.jit) * 0.004;
      }
      const th = p.th;
      pos[i * 3] = r * Math.cos(th); pos[i * 3 + 1] = r * Math.sin(th); pos[i * 3 + 2] = z;
      // temperature -> colour
      let T = Tprof.T01;
      if (z < 60) T = gasTempProfile(z, Tprof, lit);
      else if (loc.keyA === 'ann') T = Tprof.T02;
      else if (loc.keyA === 'hole') T = Tprof.T02 + (gasTempProfile(z, Tprof, lit) - Tprof.T02) * loc.t * 0.5;
      else T = gasTempProfile(z, Tprof, lit);
      if (loc.keyA === 'plume' || (z > 255)) T = Tprof.T5 * (1 - 0.55 * Math.min(1, (z - 255) / 240));
      tempColor(T, col, i * 3);
      sz[i] = 1.55 + (T > 900 ? 0.5 : 0);
      al[i] = (loc.keyA === 'amb' ? 0.35 : 0.8) * intensity * (loc.keyA === 'plume' ? Math.max(0, 1 - (z - 255) / 250) : 1);
    }
    this.air.geometry.attributes.position.needsUpdate = true; this.air.geometry.attributes.aColor.needsUpdate = true;
    this.air.geometry.attributes.aSize.needsUpdate = true; this.air.geometry.attributes.aAlpha.needsUpdate = true;
    this._updateFlame(dt, vis, lit);
    this._updatePlume(dt, vis, lit);
    // lights
    const heat = lit ? Math.min(1, 0.3 + (vis.fuelFrac || 0)) : 0;
    this.lightFlame.intensity = THREE.MathUtils.lerp(this.lightFlame.intensity, heat * 2600, 0.15);
    this.lightExit.intensity = THREE.MathUtils.lerp(this.lightExit.intensity, heat * 1500, 0.15);
  }

  _updateFlame(dt, vis, lit) {
    const g = this.flame.geometry.attributes;
    const pos = g.position.array, col = g.aColor.array, sz = g.aSize.array, al = g.aAlpha.array;
    const on = lit && this.enabled.flame;
    const ff = vis ? Math.min(1.2, 0.35 + vis.fuelFrac) : 0;
    for (let i = 0; i < this.fl.length; i++) {
      const f = this.fl[i];
      f.life -= dt;
      if (f.life <= 0) {
        if (!on) { al[i] = 0; continue; }
        f.max = f.life = 0.35 + Math.random() * 0.55;
        f.th = Math.random() * 6.283; f.r = 18.8 + Math.random() * 12.4; f.z = 79 + Math.random() * 14;
        f.vz = 18 + Math.random() * 55; f.size = 3.2 + Math.random() * 4.2 * ff;
      }
      const k = 1 - f.life / f.max;
      f.z += f.vz * dt * 0.8;
      const wob = 1 + 0.06 * Math.sin(this.t * 40 + i);
      pos[i * 3] = f.r * Math.cos(f.th) * wob; pos[i * 3 + 1] = f.r * Math.sin(f.th) * wob; pos[i * 3 + 2] = f.z;
      // blue-white core fading to orange then red
      if (k < 0.18) { col[i * 3] = 0.55; col[i * 3 + 1] = 0.7; col[i * 3 + 2] = 1.0; }
      else if (k < 0.5) { col[i * 3] = 1.0; col[i * 3 + 1] = 0.82 - 0.35 * (k - 0.18) / 0.32; col[i * 3 + 2] = 0.3; }
      else { col[i * 3] = 0.95; col[i * 3 + 1] = 0.35 - 0.2 * (k - 0.5) / 0.5; col[i * 3 + 2] = 0.08; }
      sz[i] = f.size * (0.7 + 0.5 * Math.sin(Math.PI * Math.min(1, k * 1.4)));
      al[i] = on ? 0.26 * Math.sin(Math.PI * k) * (0.5 + 0.5 * ff) : 0;
    }
    g.position.needsUpdate = g.aColor.needsUpdate = g.aSize.needsUpdate = g.aAlpha.needsUpdate = true;
  }

  _updatePlume(dt, vis, lit) {
    const g = this.plume.geometry.attributes;
    const pos = g.position.array, col = g.aColor.array, sz = g.aSize.array, al = g.aAlpha.array;
    const on = lit && this.enabled.plume && vis && vis.N > 20000;
    const power = vis ? Math.min(1.1, Math.max(0, (vis.N - 20000) / 95000)) : 0;
    for (let i = 0; i < this.pl.length; i++) {
      const f = this.pl[i];
      f.life -= dt;
      if (f.life <= 0) {
        if (!on) { al[i] = 0; continue; }
        f.max = f.life = 0.8 + Math.random() * 0.9;
        f.th = Math.random() * 6.283; f.r = 8.6 + Math.random() * 11.4; f.z = Z_NOZ_EXIT + Math.random() * 3;
        f.vz = (230 + Math.random() * 120) * (0.35 + 0.65 * power); f.vr = (Math.random() - 0.3) * 9 * power;
        f.size = 2.6 + Math.random() * 4.2;
      }
      const k = 1 - f.life / f.max;
      f.z += f.vz * dt; f.r = Math.max(0.5, f.r + f.vr * dt * (0.6 + k));
      pos[i * 3] = f.r * Math.cos(f.th); pos[i * 3 + 1] = f.r * Math.sin(f.th); pos[i * 3 + 2] = f.z;
      const h = 1 - k;
      col[i * 3] = 1.0; col[i * 3 + 1] = 0.30 + 0.45 * h * h; col[i * 3 + 2] = 0.06 + 0.25 * h * h * h;
      sz[i] = f.size * (0.8 + 1.8 * k);
      al[i] = on ? 0.085 * power * Math.sin(Math.PI * Math.min(1, k * 1.2)) * (0.6 + 0.4 * h) : 0;
    }
    g.position.needsUpdate = g.aColor.needsUpdate = g.aSize.needsUpdate = g.aAlpha.needsUpdate = true;
  }

  setVisible(v) { this.air.visible = this.flame.visible = this.plume.visible = v; this.lightFlame.visible = this.lightExit.visible = v; }
  dispose() {
    for (const o of [this.air, this.flame, this.plume]) { o.geometry.dispose(); o.material.dispose(); this.engine.remove(o); }
    this.engine.remove(this.lightFlame, this.lightExit);
  }
}
