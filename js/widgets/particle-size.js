// Surface area and burning time: why a log smoulders, sawdust flashes and fuel is sprayed as a fine mist.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';

const MARKS = [[100, 'log'], [10, 'kindling'], [1, 'wood shavings'], [0.1, 'sawdust'], [0.05, 'flour, coal dust'], [0.03, 'fuel droplets (injector)'], [0.01, 'metal powder'], [0.001, 'smoke, soot']];
export default function init(el) {
  const { body } = shell(el, { title: 'Why finely divided fuel burns fast: surface area', note: 'Burning happens at a <b>surface</b> (or on the surface of a vaporising droplet). Cut one cubic centimetre of fuel into spheres of diameter d: the surface grows as 1/d. The time for a droplet or particle to burn follows the “d²-law”, t ≈ d² ⁄ K with K ≈ 1 mm²/s for liquid fuels. Halve the size: four times faster. This is why a log burns for hours, sawdust flares, and flour or coal dust can explode in air. It is also how engineers <i>tune</i> a burn rate: by particle size (and by catalysts).' });
  const vz = h('canvas', { style: { width: '100%', aspectRatio: '1', border: '1px solid var(--line)', borderRadius: '10px', background: 'var(--bg-2)' } }), cv = h('canvas', { class: 'plot' });
  const sD = slider({ label: 'Particle diameter d', min: 0.001, max: 100, step: 0.001, value: 10, unit: 'mm', log: true, fmt: v => v >= 1 ? v.toFixed(v >= 10 ? 0 : 1) : (v * 1000).toFixed(v >= 0.01 ? 0 : 1).replace(/\.0$/, '') + ' µm', onInput: upd });
  const ro = { S: readout('Surface of 1 cm³ of fuel', 'cm²', 'cool'), g: readout('Compared with one solid block', '×', 'fuel'), t: readout('Burn time of one particle', '', 'hot'), b: readout('Behaviour', '') };
  body.append(h('div', { class: 'wgrid' }, h('div', {}, vz, h('p', { style: { fontSize: '.82rem', color: 'var(--muted)', margin: '6px 0 0' } }, 'A slice through 1 cm³ of fuel, cut into particles of the chosen size (not to scale below ~0.3 mm).')), h('div', { class: 'ctls' }, sD.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)), cv)));
  const p = new Plot(cv, { xmin: 0.001, xmax: 100, ymin: 1e-6, ymax: 1e5, xlog: true, ylog: true, aspect: 1.5, xlabel: 'particle diameter d (mm)', ylabel: 'burn time of a particle (s)', margin: { l: 56, r: 12, t: 14, b: 40 } });
  const K = 1.0;                                            // mm^2/s
  const fmtT = (t) => t >= 3600 ? (t / 3600).toFixed(1) + ' h' : t >= 60 ? (t / 60).toFixed(1) + ' min' : t >= 1 ? t.toFixed(1) + ' s' : t >= 1e-3 ? (t * 1e3).toFixed(t >= 0.1 ? 0 : 1) + ' ms' : (t * 1e6).toFixed(0) + ' µs';
  function upd() {
    const d = sD.get(), S = 6 / (d / 10), t = d * d / K;
    ro.S.set(S >= 1e4 ? S.toExponential(1).replace('e+', '×10^') : S.toFixed(S < 100 ? 1 : 0)); ro.g.set('×' + ((S / 6) >= 1e4 ? (S / 6).toExponential(0).replace('e+', '×10^').replace(/^1×/, '') : (S / 6) >= 100 ? (S / 6).toFixed(0) : (S / 6).toFixed(1)).replace(/\.0$/, '')); ro.t.set(fmtT(t));
    ro.b.set(d > 30 ? 'smoulders for hours' : d > 3 ? 'burns steadily' : d > 0.3 ? 'burns fast' : d > 0.03 ? 'flash fire' : d > 0.003 ? 'dust-cloud hazard' : 'burns in the air', d > 0.3 ? 'hot' : 'bad');
    // picture
    const ctx = vz.getContext('2d'), W = vz.clientWidth, dpr = Math.min(2, devicePixelRatio || 1); if (vz.width !== Math.round(W * dpr)) { vz.width = Math.round(W * dpr); vz.height = Math.round(W * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, W);
    const col = getComputedStyle(document.documentElement).getPropertyValue('--fire').trim(), mut = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
    const side = 10 / Math.max(d, 0.3), n = Math.max(1, Math.min(40, Math.round(side)));       // particles across a 10 mm slice (capped)
    const cell = (W - 20) / n, r = Math.max(1.2, cell / 2 - Math.min(1.2, cell * 0.06));
    ctx.fillStyle = col; ctx.globalAlpha = .88;
    if (n === 1) ctx.fillRect(10 + 6, 10 + 6, W - 32, W - 32); else for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { ctx.beginPath(); ctx.arc(10 + cell * (i + 0.5), 10 + cell * (j + 0.5), r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.strokeStyle = mut; ctx.lineWidth = 1; ctx.strokeRect(9.5, 9.5, W - 19, W - 19);
    // curve
    const c = p.begin().col; p.axes();
    const xs = [], ys = []; for (let x = 0.001; x <= 100; x *= 1.1) { xs.push(x); ys.push(x * x / K); } p.line(xs, ys, { color: c.fire, width: 3 });
    for (const [x, n_] of MARKS) { p.dot(x, x * x / K, { color: c.muted, r: 3, ring: false }); }
    p.text(100, 3e-6, 'sawdust → flour → droplets → smoke', { color: c.muted, align: 'right', size: 11 });
    p.hline(1e-3, { color: c.muted, alpha: .5, label: '1 ms: about the gas residence time in the combustor', align: 'right' });
    p.dot(d, d * d / K, { color: c.air, r: 7 });
  }
  p.onDraw(upd); upd();
}
