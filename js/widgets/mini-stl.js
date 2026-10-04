// A small, self-contained STL viewer for the extra models (e.g. the home-made spark plug).
//   <div data-widget="mini-stl" data-manifest="models/extras/diy-plug.json" data-title="..."></div>
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { STLLoader } from 'three/addons/STLLoader.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { mergeVertices, toCreasedNormals } from 'three/addons/BufferGeometryUtils.js';
import { h, shell, slider, toggle, button } from '../ui.js';

export default async function init(el) {
  const man = await (await fetch(el.dataset.manifest)).json();
  const base = el.dataset.manifest.replace(/[^/]*$/, '');
  const { body } = shell(el, { title: el.dataset.title || 'Parts viewer', badge: '3D', note: el.dataset.note || 'Drag to rotate, scroll or pinch to zoom. Pull the parts apart with the slider; every part can be downloaded as an STL file (millimetres).' });
  const view = h('div', { class: 'viewer', style: { height: 'clamp(300px, 46vw, 460px)', borderRadius: '12px' } });
  const canvas = h('canvas'); view.append(canvas); view.style.position = 'relative'; canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  const sEx = slider({ label: 'Pull apart', min: 0, max: 1, step: 0.01, value: 0, fmt: v => Math.round(v * 100) + ' %', onInput: () => { ex = sEx.get(); } });
  const rot = toggle({ label: 'Rotate slowly', checked: true });
  const list = h('div', { style: { display: 'grid', gap: '6px', marginTop: '10px' } });
  body.append(h('div', { class: 'wgrid' }, view, h('div', { class: 'ctls' }, sEx.el, rot.el, list, h('div', { class: 'btn-row' }, h('a', { class: 'btn small primary', href: base + man.assembly.file, download: man.assembly.file }, '⬇ whole assembly (STL)')))));

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(); scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xfff1de, 2.4); key.position.set(-120, 200, 160); scene.add(key, new THREE.HemisphereLight(0xcfe6ff, 0x1a2230, 0.5));
  const cam = new THREE.PerspectiveCamera(30, 1, 1, 2000), ctl = new OrbitControls(cam, canvas); ctl.enableDamping = true; ctl.enablePan = false;
  const group = new THREE.Group(); scene.add(group); group.rotation.x = -Math.PI / 2;           // STL +z (the axis) points up on screen
  let ex = 0; const meshes = [];
  const loader = new STLLoader();
  await Promise.all(man.parts.map(p => new Promise((res, rej) => loader.load(base + p.file, (g) => {
    g.deleteAttribute('normal'); g = toCreasedNormals(mergeVertices(g, 0.004), THREE.MathUtils.degToRad(40));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: p.color, metalness: p.id === 'insulator' ? 0.0 : 0.85, roughness: p.id === 'insulator' ? 0.55 : 0.32 }));
    m.userData = p; group.add(m); meshes.push(m); res();
  }, undefined, rej))));
  // centre the assembly
  const box = new THREE.Box3().setFromObject(group); const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  group.position.sub(c);
  cam.position.set(size.y * 1.3, size.y * 0.55, size.y * 1.6 + 40); ctl.target.set(0, 0, 0);
  for (const p of man.parts) list.append(h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '.84rem' } }, h('span', { class: 'sw', style: { background: p.color } }), h('span', { style: { flex: 1 }, title: p.note }, p.name), h('span', { style: { color: 'var(--muted)', fontFamily: 'var(--mono)' } }, p.mass_g + ' g'), h('a', { href: base + p.file, download: p.file, style: { fontSize: '.78rem' } }, '⬇ STL')));
  const fit = () => { const w = view.clientWidth, hh = view.clientHeight; renderer.setSize(w, hh, false); cam.aspect = w / hh; cam.updateProjectionMatrix(); };
  new ResizeObserver(fit).observe(view); fit();
  let vis = true; new IntersectionObserver(([e]) => { vis = e.isIntersecting; }).observe(view);
  let spin = 0, last = performance.now();
  (function loop(now) {
    requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!vis) return;
    if (rot.get()) group.rotation.z += dt * 0.35;
    for (const m of meshes) { const e = m.userData.explode || [0, 0, 0]; m.position.set(e[0] * ex, e[2] * ex, -e[1] * ex); }   // lateral spread (STL x) on screen
    ctl.update(); renderer.render(scene, cam);
  })(last);
}
