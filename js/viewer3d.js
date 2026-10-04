/* ==========================================================================
   viewer3d.js — interactive 3D viewer for the CJ-1 engine (three.js, STL parts loaded at runtime)

     const v = new EngineViewer(el, { tools: ['spin','explode','cut','xray','flow','heat','view','reset'] });
     await v.load();
     v.setStep(4);                 // show parts up to build step 4, highlight step-4 parts
     v.attachSim(new EngineSim()); // optional: live airflow / flame / heat / spinning rotor
   ========================================================================== */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { STLLoader } from 'three/addons/STLLoader.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { mergeVertices, toCreasedNormals } from 'three/addons/BufferGeometryUtils.js';
import { FlowSystem } from './flow3d.js';
import { THERMAL_SAMPLES } from './engine-sim.js';
import { h } from './ui.js';

/* ---------- shared caches ---------- */
let manifestPromise = null;
export function loadManifest(url = 'models/manifest.json') {
  if (!manifestPromise) manifestPromise = fetch(url).then(r => { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); });
  return manifestPromise;
}
const geoCache = new Map();
export function loadGeometry(url) {
  if (!geoCache.has(url)) {
    geoCache.set(url, new Promise((res, rej) => {
      new STLLoader().load(url, (g) => {
        g.deleteAttribute('normal');
        g = mergeVertices(g, 0.004);
        g = toCreasedNormals(g, THREE.MathUtils.degToRad(46));
        g.computeBoundingBox();
        res(g);
      }, undefined, rej);
    }));
  }
  return geoCache.get(url);
}

/* where each part flies to in the exploded view (STL coordinates, mm) */
const EXPLODE = {
  'shaft': [0, 95, 0], 'bearing-tunnel': [0, 0, 0], 'impeller': [0, 0, -42], 'diffuser-plate': [0, 0, -14],
  'compressor-housing': [0, 0, -92], 'combustor-casing': [0, 112, 8], 'flame-tube': [0, 0, 12],
  'fuel-ring': [0, -62, -34], 'igniter': [0, 74, 0], 'ngv': [0, 0, 38], 'turbine-wheel': [0, 0, 82],
  'turbine-casing': [0, 0, 70], 'exhaust-nozzle': [0, 0, 128], 'test-stand': [0, -26, 0],
};
/* parts that become see-through in x-ray mode */
const SHELLS = new Set(['compressor-housing', 'combustor-casing', 'turbine-casing', 'exhaust-nozzle', 'diffuser-plate']);

const Z_CENTER = 128;
const FOV = 32;

/* ---------- material with thermal glow / false-colour injection ---------- */
const GLSL_HEAD = /* glsl */`
uniform float uT[16]; uniform float uZ0; uniform float uZ1; uniform float uThermal; uniform float uHeatOn; uniform float uHL;
varying float vAx;
vec3 bbColor(float T) {
  float t = T / 100.0;
  float g = clamp(99.47 * log(t) - 161.12, 0.0, 255.0) / 255.0;
  float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(138.52 * log(t - 10.0) - 305.04, 0.0, 255.0) / 255.0);
  float r = t <= 66.0 ? 1.0 : clamp(329.7 * pow(t - 60.0, -0.1332), 0.0, 255.0) / 255.0;
  return vec3(r, g, b);
}
vec3 infernoCol(float x) {
  vec3 c0 = vec3(0.001, 0.0, 0.014), c1 = vec3(0.26, 0.04, 0.41), c2 = vec3(0.58, 0.15, 0.40), c3 = vec3(0.87, 0.32, 0.23), c4 = vec3(0.98, 0.65, 0.04), c5 = vec3(0.99, 1.0, 0.64);
  x = clamp(x, 0.0, 1.0) * 5.0;
  if (x < 1.0) return mix(c0, c1, x); if (x < 2.0) return mix(c1, c2, x - 1.0); if (x < 3.0) return mix(c2, c3, x - 2.0);
  if (x < 4.0) return mix(c3, c4, x - 3.0); return mix(c4, c5, x - 4.0);
}
float tempAtZ(float z) {
  float f = clamp((z - uZ0) / max(1.0, uZ1 - uZ0), 0.0, 1.0) * 15.0;
  int i = int(min(floor(f), 14.0)); float u = f - float(i);
  return mix(uT[i], uT[i + 1], u);
}`;

function makePartMaterial(meta, part) {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(meta.color), metalness: meta.stand ? 0.25 : meta.id === 'flame-tube' ? 0.55 : 0.82,
    roughness: meta.stand ? 0.75 : meta.id === 'impeller' ? 0.28 : 0.4, envMapIntensity: meta.stand ? 0.35 : 1.1,
  });
  part.uT = new Float32Array(THERMAL_SAMPLES).fill(293);
  part.u = { uT: { value: part.uT }, uZ0: { value: meta.bbox.min[2] }, uZ1: { value: meta.bbox.max[2] }, uThermal: { value: 0 }, uHeatOn: { value: 1 }, uHL: { value: 0 } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, part.u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vAx;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAx = position.z;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_HEAD)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float Tl = tempAtZ(vAx);
        vec3 tcol = infernoCol((Tl - 290.0) / 1200.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, tcol * 0.28, uThermal);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float glowK = pow(clamp((Tl - 760.0) / 720.0, 0.0, 1.0), 1.25);
        totalEmissiveRadiance += uHeatOn * (1.0 - uThermal) * bbColor(max(Tl, 1000.0)) * glowK * 2.6 + uThermal * tcol * 0.95 + uHL * vec3(0.04, 0.42, 0.72);`);
  };
  mat.customProgramCacheKey = () => 'cj-part-thermal-v1';
  return mat;
}

/* ====================================================================================== */
export class EngineViewer {
  constructor(container, opts = {}) {
    this.el = container;
    this.opts = Object.assign({ tools: ['spin', 'explode', 'cut', 'xray', 'view', 'reset'], autoRotate: false, caption: '', hint: 'drag to rotate · right-drag to pan · click to zoom', flow: false, pixelRatio: 2, spinSlow: 1 / 380, showStand: true, interactive: true }, opts);
    this.parts = new Map();
    this.manifest = null;
    this.sim = null; this.vis = null; this.timeWarp = 1;
    this.state = { explode: 0, explodeT: 0, cut: false, xray: false, flow: !!this.opts.flow, heat: 'real', spin: true, rotate: !!this.opts.autoRotate, step: null };
    this.spinAngle = 0; this.spinRate = 0.6;          // rad/s when no sim is attached
    this._anim = null; this._visible = true; this._raf = 0; this._hover = null;
    this._buildDom();
    this._initThree();
    this._bindEvents();
    this._tick = this._tick.bind(this);
    this._clock = new THREE.Clock();
    this._raf = requestAnimationFrame(this._tick);
  }

  /* ---------- DOM ---------- */
  _buildDom() {
    const el = this.el;
    el.classList.add('viewer'); el.innerHTML = '';
    this.canvas = h('canvas', { tabindex: 0, 'aria-label': '3D engine viewer' });
    this.bar = h('div', { class: 'vbar' });
    this.label = h('div', { class: 'vlabel' }, this.opts.caption || '');
    this.hint = h('div', { class: 'vhint' }, this.opts.interactive ? this.opts.hint : '');
    this.loading = h('div', { class: 'vloading' }, 'Loading 3D parts…');
    el.append(this.canvas, this.bar, this.label, this.hint, this.loading);
    if (!this.opts.caption) this.label.style.display = 'none';
    this.btns = {};
    const mk = (id, text, fn, title) => {
      const b = h('button', { class: 'btn', type: 'button', title: title || text, onclick: () => fn(b) }, text);
      this.btns[id] = b; this.bar.append(b); return b;
    };
    const T = new Set(this.opts.tools);
    if (T.has('spin')) mk('spin', '⟳ Spin', (b) => { this.state.spin = !this.state.spin; b.classList.toggle('on', this.state.spin); }, 'Spin the rotor (slow motion)').classList.add('on');
    if (T.has('explode')) mk('explode', '✸ Explode', (b) => { this.state.explodeT = this.state.explodeT ? 0 : 1; b.classList.toggle('on', !!this.state.explodeT); }, 'Pull the parts apart');
    if (T.has('cut')) mk('cut', '◐ Cutaway', (b) => { this.setCut(!this.state.cut); }, 'Slice the engine in half');
    if (T.has('xray')) mk('xray', '◌ X-ray', (b) => { this.setXray(!this.state.xray); }, 'See through the casings');
    if (T.has('flow')) mk('flow', '≋ Airflow', (b) => { this.setFlow(!this.state.flow); }, 'Show air, flame and exhaust');
    if (T.has('heat')) mk('heat', '🌡 Heat: glow', (b) => { this.cycleHeat(); }, 'Cycle: glow / thermal camera / off');
    if (T.has('view')) mk('view', '⌖ View', (b) => { this.cycleView(); }, 'Next camera angle');
    if (T.has('rotate')) mk('rotate', '↻ Orbit', (b) => { this.state.rotate = !this.state.rotate; b.classList.toggle('on', this.state.rotate); }, 'Auto-orbit');
    if (T.has('reset')) mk('reset', '⟲ Reset', () => this.setView('iso'), 'Reset camera');
    if (this.state.rotate && this.btns.rotate) this.btns.rotate.classList.add('on');
    if (this.state.flow && this.btns.flow) this.btns.flow.classList.add('on');
  }

  /* ---------- three.js ---------- */
  _initThree() {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.opts.pixelRatio));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.localClippingEnabled = true;
    r.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex;
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 4, 5000);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.09;
    this.controls.minDistance = 70; this.controls.maxDistance = 1500;
    this.controls.enableZoom = !!this.opts.zoomAlways;
    // lights
    this.scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x1a2230, 0.55));
    const key = new THREE.DirectionalLight(0xfff1de, 2.6); key.position.set(-200, 340, 260); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fb8ff, 1.6); rim.position.set(260, 120, -280); this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 0.7); fill.position.set(0, -200, 200); this.scene.add(fill);
    // engine group: STL coords (z = axis) -> world (x = axis)
    this.engine = new THREE.Group();
    this.engine.rotation.y = Math.PI / 2;
    this.engine.position.x = -Z_CENTER;
    this.scene.add(this.engine);
    // ground disc (subtle) for depth
    const g = new THREE.Mesh(new THREE.CircleGeometry(420, 64), new THREE.MeshBasicMaterial({ color: 0x0c1218, transparent: true, opacity: 0.55 }));
    g.rotation.x = -Math.PI / 2; g.position.y = -74; this.ground = g; this.scene.add(g);
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    this.flow = null;
    this.setView('iso', false);
    this._resize();
  }

  _bindEvents() {
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.el);
    if ('IntersectionObserver' in window) {
      this._io = new IntersectionObserver(([e]) => { this._visible = e.isIntersecting; }, { threshold: 0.01 });
      this._io.observe(this.el);
    }
    const c = this.canvas;
    c.addEventListener('pointerdown', () => { this.controls.enableZoom = true; this._userMoved = true; });
    c.addEventListener('pointerleave', () => { if (!this.opts.zoomAlways) this.controls.enableZoom = false; this._setHover(null); });
    c.addEventListener('pointermove', (e) => this._onMove(e));
    let downAt = null;
    c.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
    c.addEventListener('pointerup', (e) => {
      if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5) this._onClick(e);
      downAt = null;
    });
    this._vis = () => { if (document.hidden) cancelAnimationFrame(this._raf); else { this._clock.getDelta(); this._raf = requestAnimationFrame(this._tick); } };
    document.addEventListener('visibilitychange', this._vis);
  }

  _resize() {
    const w = Math.max(100, this.el.clientWidth), hh = Math.max(100, this.el.clientHeight);
    this.renderer.setSize(w, hh, false);
    this.camera.aspect = w / hh; this.camera.updateProjectionMatrix();
    this._w = w; this._h = hh;
    if (this.flow) this.flow.setViewport(hh * this.renderer.getPixelRatio(), FOV);
  }

  /* ---------- loading ---------- */
  async load({ only = null } = {}) {
    const manifest = this.manifest = await loadManifest();
    const list = manifest.parts.filter(p => (this.opts.showStand || !p.stand) && (!only || only.includes(p.id)));
    let done = 0;
    await Promise.all(list.map(async (meta) => {
      const geo = await loadGeometry('models/' + meta.file);
      this._addPart(meta, geo);
      this.loading.textContent = `Loading 3D parts… ${++done}/${list.length}`;
    }));
    this.loading.classList.add('done');
    this.flow = new FlowSystem(this.engine, { count: (window.innerWidth < 700 || (navigator.hardwareConcurrency || 8) <= 4) ? 2400 : 4200 });
    this.flow.setViewport(this._h * this.renderer.getPixelRatio(), FOV);
    this.flow.setVisible(this.state.flow);
    this.setStep(this.state.step);
    this._applyMaterialsState();
    return this;
  }

  _addPart(meta, geo) {
    const part = { id: meta.id, meta, vis: true, expl: 0, hl: 0 };
    part.mat = makePartMaterial(meta, part);
    part.mesh = new THREE.Mesh(geo, part.mat);
    part.mesh.userData.partId = meta.id;
    part.capMat = new THREE.MeshBasicMaterial({ color: 0xe9a35a, side: THREE.BackSide });
    part.cap = new THREE.Mesh(geo, part.capMat); part.cap.visible = false;
    part.outer = new THREE.Group(); part.inner = new THREE.Group();
    part.inner.add(part.mesh, part.cap); part.outer.add(part.inner);
    this.engine.add(part.outer);
    this.parts.set(meta.id, part);
    return part;
  }

  /* ---------- state setters ---------- */
  setStep(step, { animate = true, frame = true } = {}) {
    this.state.step = step;
    if (!this.manifest) return;
    const total = Math.max(...this.manifest.parts.map(p => p.step));
    for (const part of this.parts.values()) {
      const s = part.meta.step;
      const show = step == null || s <= step;
      const isNew = step != null && s === step;
      if (show && !part.vis && animate) part.expl = 1;            // fly in from the exploded position
      part.vis = show; part.hlTarget = isNew ? 1 : 0;
      part.outer.visible = show;
    }
    if (frame && step != null) {
      const ids = [...this.parts.values()].filter(p => p.meta.step === step).map(p => p.id);
      this.frame(step === total ? null : ids, { pad: step === total ? 1.18 : 1.35 });
    } else if (frame && step == null) this.frame(null, { pad: 1.18 });
    this._updateFlowAvailability();
  }

  _updateFlowAvailability() {
    const all = this.state.step == null || (this.manifest && this.state.step >= Math.max(...this.manifest.parts.map(p => p.step)) - 1);
    this._flowOK = all;
    if (this.flow) this.flow.setVisible(this.state.flow && all);
  }

  setExplode(t) { this.state.explodeT = t; if (this.btns.explode) this.btns.explode.classList.toggle('on', !!t); }
  setCut(on) { this.state.cut = on; this._applyMaterialsState(); if (this.btns.cut) this.btns.cut.classList.toggle('on', on); }
  setXray(on) { this.state.xray = on; this._applyMaterialsState(); if (this.btns.xray) this.btns.xray.classList.toggle('on', on); }
  setFlow(on) { this.state.flow = on; if (this.flow) this.flow.setVisible(on && this._flowOK !== false); if (this.btns.flow) this.btns.flow.classList.toggle('on', on); }
  setHeat(mode) {
    this.state.heat = mode;
    const label = { real: '🌡 Heat: glow', thermal: '🌡 Heat: thermal cam', off: '🌡 Heat: off' }[mode];
    if (this.btns.heat) { this.btns.heat.textContent = label; this.btns.heat.classList.toggle('on', mode !== 'off'); }
  }
  cycleHeat() { this.setHeat({ real: 'thermal', thermal: 'off', off: 'real' }[this.state.heat]); }
  setSpinRate(radPerSec) { this.spinRate = radPerSec; }
  setCaption(t) { this.opts.caption = t; this.label.textContent = t; this.label.style.display = t ? '' : 'none'; }

  _applyMaterialsState() {
    const { cut, xray } = this.state;
    for (const part of this.parts.values()) {
      const m = part.mat;
      m.clippingPlanes = cut ? [this.clipPlane] : null;
      part.capMat.clippingPlanes = cut ? [this.clipPlane] : null;
      part.cap.visible = cut;
      const shell = SHELLS.has(part.id) && xray;
      const ft = part.id === 'flame-tube' && xray;
      m.transparent = shell || ft; m.opacity = shell ? 0.16 : ft ? 0.55 : 1; m.depthWrite = !(shell || ft);
      m.needsUpdate = true; part.capMat.needsUpdate = true;
      part.mesh.renderOrder = shell ? 2 : 0;
    }
    if (this.flow) this.flow.setClip(cut, this.clipPlane);
  }

  /* ---------- sim hookup ---------- */
  attachSim(sim) {
    this.sim = sim;
    if (this.manifest && sim.setParts) sim.setParts(this.manifest.parts);
  }

  detachSim() { this.sim = null; this.vis = null; }

  /* ---------- camera ---------- */
  setView(name, animate = true) {
    const views = {
      iso: [-0.62, 0.38, 0.69], front: [-1, 0.12, 0.2], side: [0, 0.06, 1], top: [0, 1, 0.02], rear: [1, 0.15, 0.35], low: [-0.5, -0.35, 0.8],
    };
    const d = new THREE.Vector3(...views[name]).normalize();
    this._viewName = name;
    const dist = this.camera.position.distanceTo(this.controls.target) || 560;
    const to = d.multiplyScalar(Math.max(dist, 460)).add(this.controls.target);
    if (!animate) { this._camTween = null; this.camera.position.copy(to); this.controls.update(); return; }
    this._camTween = { t: 0, dur: 0.9, fromP: this.camera.position.clone(), toP: to, fromT: this.controls.target.clone(), toT: this.controls.target.clone() };
  }
  cycleView() {
    const order = ['iso', 'side', 'front', 'top', 'rear', 'low'];
    this.setView(order[(order.indexOf(this._viewName) + 1) % order.length]);
  }

  /** fly the camera so that the given parts fill the view (null = whole engine) */
  frame(ids, { pad = 1.4 } = {}) {
    const box = new THREE.Box3();
    const targets = ids ? ids.map(id => this.parts.get(id)).filter(Boolean) : [...this.parts.values()].filter(p => p.vis && !p.meta.stand);
    if (!targets.length) return;
    this.engine.updateMatrixWorld(true);
    for (const p of targets) {
      // frame the assembled position (explode amount is animated separately)
      const b = new THREE.Box3().setFromBufferAttribute(p.mesh.geometry.attributes.position);
      b.applyMatrix4(this.engine.matrixWorld);
      box.union(b);
    }
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    // the engine axis runs along screen-x in the default views: fit width (÷ aspect) and height separately
    const needW = s.x * 0.95 + s.z * 0.35, needH = s.y * 1.15 + s.x * 0.2;
    const dist = pad * Math.max(needW / this.camera.aspect, needH) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2));
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this._camTween = { t: 0, dur: 1.0, fromP: this.camera.position.clone(), toP: c.clone().add(dir.multiplyScalar(Math.min(1400, Math.max(180, dist)))), fromT: this.controls.target.clone(), toT: c };
  }

  /* ---------- picking ---------- */
  _pick(e) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = this._rc || (this._rc = new THREE.Raycaster());
    rc.setFromCamera(ndc, this.camera);
    const meshes = [...this.parts.values()].filter(p => p.vis && p.outer.visible).map(p => p.mesh);
    const hit = rc.intersectObjects(meshes, false)[0];
    return hit ? hit.object.userData.partId : null;
  }
  _onMove(e) {
    if (!this.opts.interactive || e.buttons) return;
    const now = performance.now();
    if (now - (this._lastPick || 0) < 70) return;
    this._lastPick = now;
    this._setHover(this._pick(e));
  }
  _setHover(id) {
    if (id === this._hover) return;
    this._hover = id;
    this.canvas.style.cursor = id ? 'pointer' : 'grab';
    if (id) {
      const m = this.parts.get(id).meta;
      this.label.style.display = '';
      this.label.innerHTML = `<b>${m.name}</b> · ${m.materialName} · ${m.mass_g.toFixed(0)} g`;
    } else this.setCaption(this.opts.caption);
  }
  _onClick(e) {
    const id = this._pick(e);
    if (this.opts.onSelect) this.opts.onSelect(id ? this.parts.get(id).meta : null);
  }

  /* ---------- main loop ---------- */
  _tick() {
    this._raf = requestAnimationFrame(this._tick);
    const dt = Math.min(0.05, this._clock.getDelta());
    if (!this._visible || document.hidden) return;
    this._update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt) {
    // camera tween
    const tw = this._camTween;
    if (tw) {
      tw.t += dt / tw.dur;
      const k = Math.min(1, tw.t), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.camera.position.lerpVectors(tw.fromP, tw.toP, e);
      this.controls.target.lerpVectors(tw.fromT, tw.toT, e);
      if (k >= 1) this._camTween = null;
    }
    if (this.state.rotate && !this._camTween) {
      const off = this.camera.position.clone().sub(this.controls.target);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.22);
      this.camera.position.copy(this.controls.target).add(off);
    }
    this.controls.update();

    // simulation
    let vis = this.vis;
    if (this.sim) {
      this.sim.step(dt * this.timeWarp);
      vis = this.vis = this.sim.visual();
    }
    // rotor spin (slow-motion version of the real rpm)
    let w = this.state.spin ? this.spinRate : 0;
    if (vis) w = this.state.spin ? vis.N * Math.PI / 30 * this.opts.spinSlow : 0;
    this.spinAngle = (this.spinAngle + w * dt) % (Math.PI * 2);

    // explode + highlight easing
    this.state.explode += (this.state.explodeT - this.state.explode) * Math.min(1, dt * 4);
    const hlPulse = 0.5 + 0.5 * Math.sin(performance.now() / 280);
    for (const part of this.parts.values()) {
      part.expl += ((part.vis ? 0 : 1) - part.expl) * Math.min(1, dt * 3.2);
      const ex = EXPLODE[part.id] || [0, 0, 0];
      const amt = this.state.explode + part.expl * 0.9;
      part.outer.position.set(ex[0] * amt, ex[1] * amt, ex[2] * amt);
      if (part.meta.rotor) part.inner.rotation.z = this.spinAngle;
      part.hl += ((part.hlTarget || 0) - part.hl) * Math.min(1, dt * 5);
      part.u.uHL.value = part.hl * (0.35 + 0.65 * hlPulse) * (this.state.step == null ? 0 : 1);
      // thermal state
      const T = this.sim && this.sim.temps ? this.sim.temps[part.id] : null;
      if (T) part.uT.set(T); else if (part.uT[0] !== 293) part.uT.fill(293);
      part.u.uThermal.value = this.state.heat === 'thermal' ? 1 : 0;
      part.u.uHeatOn.value = this.state.heat === 'off' ? 0 : 1;
    }
    if (this.flow && vis) {
      this.flow.enabled.air = this.state.flow; this.flow.enabled.flame = this.state.flow || true; this.flow.enabled.plume = true;
      this.flow.update(dt, vis, this.camera);
    }
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    document.removeEventListener('visibilitychange', this._vis);
    this._ro.disconnect(); if (this._io) this._io.disconnect();
    this.controls.dispose();
    for (const p of this.parts.values()) { p.mat.dispose(); p.capMat.dispose(); }
    if (this.flow) this.flow.dispose();
    this.renderer.dispose();
  }
}

/* ====================================================================================== */
/** Render a PNG thumbnail of every part with ONE offscreen renderer (the gallery uses this). */
export async function renderThumbnails(manifest, { size = 360 } = {}) {
  const canvas = document.createElement('canvas');
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size * 0.75, false); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x1a2230, 0.6));
  const key = new THREE.DirectionalLight(0xfff1de, 2.4); key.position.set(-2, 3, 2.5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x6fb8ff, 1.4); rim.position.set(3, 1, -3); scene.add(rim);
  const cam = new THREE.PerspectiveCamera(30, 4 / 3, 1, 4000);
  const out = {};
  for (const meta of manifest.parts) {
    const geo = await loadGeometry('models/' + meta.file);
    const mat = new THREE.MeshStandardMaterial({ color: meta.color, metalness: 0.8, roughness: 0.38 });
    const mesh = new THREE.Mesh(geo, mat);
    const box = geo.boundingBox, c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    mesh.position.sub(c);
    const g = new THREE.Group(); g.add(mesh); g.rotation.y = 0.0; scene.add(g);
    const rad = 0.5 * s.length();
    const dir = (meta.stand ? new THREE.Vector3(-0.8, 0.8, 1.2) : new THREE.Vector3(-0.75, 0.5, 1.0)).normalize();
    cam.position.copy(dir.multiplyScalar(rad / Math.sin(THREE.MathUtils.degToRad(15)) * 0.72)); cam.lookAt(0, 0, 0);
    r.render(scene, cam);
    out[meta.id] = canvas.toDataURL('image/png');
    scene.remove(g); mat.dispose();
  }
  r.dispose();
  return out;
}
