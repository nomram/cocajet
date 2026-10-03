// What is air made of? Stacked bars by volume / mass + a jar of molecules + oxygen budget of the engine.
import { h, shell, toggle, readout } from '../ui.js';
import { CJ1, FUELS, isa, steadyAt } from '../engine-model.js';

const GASES = [
  { id: 'N2',  name: 'Nitrogen', x: 78.084, M: 28.0134, c: '#4c8dff', role: 'The “passenger”. Does not burn, soaks up heat, so it is the coolant that keeps our flame survivable. At >1 800 K a little turns into NOx.' },
  { id: 'O2',  name: 'Oxygen',   x: 20.946, M: 31.998,  c: '#ff6b6b', role: 'The only part that reacts. Every kilogram of propane needs 3.6 kg of O₂. Our engine burns only about a third of the oxygen it swallows.' },
  { id: 'Ar',  name: 'Argon',    x: 0.934,  M: 39.948,  c: '#b388ff', role: 'Inert and a bit heavy. Makes air very slightly denser; otherwise just along for the ride.' },
  { id: 'CO2', name: 'Carbon dioxide', x: 0.042, M: 44.009, c: '#8a8f98', role: 'Tiny amount in air; it is also what we <em>make</em> when we burn carbon (3 kg of CO₂ per kg of propane).' },
  { id: 'Ne',  name: 'Neon',     x: 0.001818, M: 20.180, c: '#ffd166', role: 'Trace noble gas. Irrelevant for engines.' },
  { id: 'He',  name: 'Helium',   x: 0.000524, M: 4.0026, c: '#3ddc97', role: 'Trace. Light enough to escape to space.' },
  { id: 'CH4', name: 'Methane',  x: 0.000187, M: 16.043, c: '#ff9f43', role: 'Trace; a fuel in its own right (natural gas).' },
  { id: 'Kr',  name: 'Krypton',  x: 0.000114, M: 83.798, c: '#4cc9f0', role: 'Trace noble gas.' },
  { id: 'H2',  name: 'Hydrogen', x: 0.000055, M: 2.0159, c: '#f1f1f1', role: 'Trace.' },
];

export default function init(el) {
  const { body } = shell(el, { title: 'What is air made of?', note: 'Dry air at sea level. Water vapour (0–4 %) is left out so the numbers add up; humid air is a bit lighter because H₂O (18 u) is lighter than N₂ (28 u).' });
  const total = GASES.reduce((a, g) => a + g.x, 0);
  let sumM = 0; GASES.forEach(g => { g.xf = g.x / total; sumM += g.xf * g.M; });
  GASES.forEach(g => { g.w = g.xf * g.M / sumM * 100; });
  let mode = 'vol';

  const bar = h('div', { style: { display: 'flex', height: '46px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--line)' } });
  const tbody = h('tbody');
  const info = h('div', { class: 'callout', style: { margin: '10px 0 0' } });
  const jar = h('canvas', { class: 'plot', style: { aspectRatio: '2.1', height: 'auto' } });
  const tg = toggle({ label: 'Show by mass instead of by volume', onChange: (v) => { mode = v ? 'mass' : 'vol'; draw(); } });
  const maths = h('div', { class: 'eq', html: '' });

  const table = h('table', { class: 'data' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Gas'), h('th', { class: 'num' }, '% volume'), h('th', { class: 'num' }, '% mass'), h('th', { class: 'num' }, 'u'))), tbody);
  const sel = (g) => { info.innerHTML = `<span class="ct" style="color:${g.c}">${g.name} (${g.id})</span>${g.role}`; };

  function draw() {
    bar.innerHTML = '';
    GASES.forEach(g => {
      const v = mode === 'vol' ? g.xf * 100 : g.w;
      if (v < 0.15) return;
      bar.append(h('div', { style: { flex: String(v), background: g.c, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '.8rem', color: '#101820', cursor: 'pointer', minWidth: '14px' }, title: g.name, onclick: () => sel(g) }, v > 3 ? g.id : ''));
    });
    tbody.innerHTML = '';
    GASES.forEach(g => tbody.append(h('tr', { onclick: () => sel(g), style: { cursor: 'pointer' } },
      h('td', {}, h('span', { class: 'sw', style: { background: g.c } }), g.name + ' ', h('span', { style: { color: 'var(--muted)' } }, g.id)),
      h('td', { class: 'num' }, (g.xf * 100 < 0.01 ? (g.xf * 100).toExponential(1) : (g.xf * 100).toFixed(g.xf * 100 < 1 ? 3 : 2))),
      h('td', { class: 'num' }, (g.w < 0.01 ? g.w.toExponential(1) : g.w.toFixed(g.w < 1 ? 3 : 2))),
      h('td', { class: 'num' }, g.M.toFixed(2)))));
  }
  draw(); sel(GASES[1]);

  // oxygen budget of the real engine
  const g0 = steadyAt({ ...CJ1 }, CJ1.Ndesign, isa(0));
  const O2air = 0.2314 * g0.m, O2need = g0.mf * 3.63;
  const ros = h('div', { class: 'readouts' });
  const r1 = readout('Air swallowed', 'kg/s', 'cool'), r2 = readout('Oxygen in that air', 'g/s', 'cool'), r3 = readout('Oxygen burned', 'g/s', 'hot'), r4 = readout('Share used', '%', 'fuel');
  r1.set(g0.m.toFixed(3)); r2.set((O2air * 1000).toFixed(0)); r3.set((O2need * 1000).toFixed(1)); r4.set((O2need / O2air * 100).toFixed(0));
  ros.append(r1.el, r2.el, r3.el, r4.el);

  maths.innerHTML = `Average molar mass: $\\bar M=\\sum x_i M_i = ${sumM.toFixed(3)}\\ \\text{g/mol}$ → specific gas constant $R=\\dfrac{8.314}{${(sumM / 1000).toFixed(5)}} = ${(8.314462 / (sumM / 1000)).toFixed(1)}\\ \\text{J/(kg·K)}$`;

  body.append(
    h('div', { class: 'wgrid' },
      h('div', {}, bar, h('div', { style: { height: '10px' } }), table, info),
      h('div', { class: 'ctls' }, tg.el, jar, h('p', { style: { fontSize: '.8rem', color: 'var(--muted)', margin: 0 } }, 'Every dot is a molecule (not to scale, ratio is right: roughly 4 nitrogen for every oxygen).'),
        h('h4', { style: { margin: '6px 0 0' } }, 'The engine’s oxygen budget at full power'), ros)),
    maths);

  // jar animation
  const ctx = jar.getContext('2d');
  const N = 110, dots = [];
  for (let i = 0; i < N; i++) { const r = Math.random(); dots.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25, c: r < 0.781 ? '#4c8dff' : r < 0.99 ? '#ff6b6b' : '#b388ff' }); }
  let raf = 0, vis = true;
  new IntersectionObserver(([e]) => { vis = e.isIntersecting; }).observe(jar);
  function frame() {
    raf = requestAnimationFrame(frame); if (!vis) return;
    const w = jar.clientWidth, hh = jar.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (jar.width !== Math.round(w * dpr)) { jar.width = Math.round(w * dpr); jar.height = Math.round(hh * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, hh);
    for (const d of dots) {
      d.x += d.vx * 0.016; d.y += d.vy * 0.016;
      if (d.x < 0 || d.x > 1) d.vx *= -1; if (d.y < 0 || d.y > 1) d.vy *= -1;
      ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc(d.x * (w - 8) + 4, d.y * (hh - 8) + 4, 3.2, 0, 7); ctx.fill();
    }
  }
  frame();
}
