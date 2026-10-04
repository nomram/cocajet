// Creep rupture with the Larson–Miller parameter (illustrative master curves).
import { h, shell, slider, select, readout } from '../ui.js';
import { Plot } from '../plot.js';

const MAT = [['s304', 'Stainless 304', 34.1, 6.3, '#4cc9f0'], ['s310', 'Stainless 310S', 35.1, 6.3, '#3ddc97'], ['i625', 'Inconel 625', 35.95, 5.1, '#b388ff'], ['i718', 'Inconel 718', 35.0, 4.7, '#ffb703']];
export default function init(el) {
  const { body } = shell(el, { title: 'Creep: metal that slowly stretches under load while hot', note: 'Above roughly 40 % of the melting temperature (in kelvin) a loaded metal flows slowly even far below yield, and eventually ruptures. The Larson–Miller parameter LMP = T·(20 + log₁₀ t) packs temperature and time into one number that depends only on stress. Curves here are ILLUSTRATIVE fits to typical published data: use real data for real parts.' });
  const cv = h('canvas', { class: 'plot' });
  const sS = slider({ label: 'Stress', min: 20, max: 500, step: 5, value: 190, unit: 'MPa', fmt: v => v.toFixed(0), onInput: upd });
  const sT = slider({ label: 'Metal temperature', min: 500, max: 1000, step: 5, value: 750, unit: '°C', fmt: v => v.toFixed(0), onInput: upd });
  const ro = {}; MAT.forEach(m => { ro[m[0]] = readout(m[1], '', 'cool'); });
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sS.el, sT.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)),
    h('p', { style: { fontSize: '.85rem', color: 'var(--muted)' } }, 'At the CJ-1 turbine blade root (~190 MPa, ~750 °C) stainless lasts hours, nickel superalloys thousands of hours. Lower the stress or the temperature and the life explodes: every 25 °C hotter cuts the life about four-fold.'))));
  const p = new Plot(cv, { xmin: 500, xmax: 1000, ymin: 0.01, ymax: 1e6, ylog: true, xlabel: 'temperature (°C)', ylabel: 'rupture life (hours)', aspect: 1.25 });
  const life = (a, b, S, TC) => Math.pow(10, (a - b * Math.log10(S)) * 1000 / (TC + 273.15) - 20);
  const fmt = (t) => t < 1 ? (t * 60).toFixed(0) + ' min' : t < 100 ? t.toFixed(1) + ' h' : t < 1e5 ? Math.round(t).toLocaleString('en') + ' h' : '> 10 years';
  function upd() {
    const S = sS.get(), T = sT.get(), c = p.begin().col; p.axes();
    p.hline(1, { color: c.muted, label: '1 hour', align: 'left' }); p.hline(100, { color: c.muted, label: 'a hobbyist’s lifetime of runs: ~100 h', align: 'left' }); p.hline(8760, { color: c.muted, label: '1 year', align: 'left' });
    MAT.forEach(([id, n, a, b, col]) => { const xs = [], ys = []; for (let q = 500; q <= 1000; q += 10) { xs.push(q); ys.push(life(a, b, S, q)); } p.line(xs, ys, { color: col, width: 2.8 }); p.dot(T, life(a, b, S, T), { color: col, r: 4.5 }); const L = life(a, b, S, T); ro[id].set(fmt(L), L < 5 ? 'bad' : L < 100 ? 'fuel' : 'good'); });
    p.vline(T, { color: c.muted });
  }
  p.onDraw(upd); upd();
}
