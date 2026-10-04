// The rocket equation and staging: why reaching orbit is so hard, and why every kilogram of structure matters.
import { h, shell, slider, button, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { G0 } from '../rocket-model.js';

const ORBIT = 9400;                                      // m/s: low Earth orbit including gravity and drag losses
const MARKS = [[70, 'cold gas'], [250, 'solid'], [330, 'kerosene'], [450, 'hydrogen'], [3000, 'ion']];

export default function init(el) {
  const { body } = shell(el, { title: 'The rocket equation: Δv = Isp · g₀ · ln(m₀ / m_final)', note: 'Because a rocket must accelerate its own unburnt propellant, the speed it can gain grows only with the <i>logarithm</i> of the mass ratio. Each stage holds a fraction ε of structure (tank, engine) relative to propellant and the whole rocket has a payload fraction π. Splitting the rocket into stages throws away dead structure as you go: a single stage with a hydrogen engine barely reaches orbit; two stages with kerosene reach it easily. Reaching low orbit needs ≈ 9.4 km/s, almost all of it spent fighting gravity and drag.' });
  const cv = h('canvas', { class: 'plot' });
  const sI = slider({ label: 'Specific impulse Isp', min: 50, max: 5000, step: 5, value: 330, unit: 's', log: true, fmt: v => v.toFixed(0), onInput: upd });
  const sE = slider({ label: 'Structure fraction ε of each stage', min: 0.03, max: 0.35, step: 0.005, value: 0.09, fmt: v => (v * 100).toFixed(1) + ' %', onInput: upd });
  const sP = slider({ label: 'Payload as a share of liftoff mass', min: 0.2, max: 10, step: 0.1, value: 2, unit: '%', fmt: v => v.toFixed(1), onInput: upd });
  const sN = slider({ label: 'Number of stages', min: 1, max: 4, step: 1, value: 2, fmt: v => v.toFixed(0), onInput: upd });
  const pre = h('div', { class: 'btn-row' }, ...[['Cold gas', 70, 0.12], ['Solid', 250, 0.12], ['Kerosene + O₂', 330, 0.07], ['Hydrogen + O₂', 450, 0.12], ['Ion engine', 3000, 0.25]].map(([n, i, e]) => button(n, () => { sI.set(i); sE.set(e); upd(); }, 'small')));
  const ro = { R: readout('Mass ratio of one stage', '', 'cool'), dv: readout('Total Δv', 'km/s', 'hot'), ok: readout('Reaches orbit (9.4 km/s)?', ''), m: readout('Liftoff mass for a 100 kg payload', 'kg', 'fuel'), prop: readout('… of which propellant', '%', 'cool') };
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, pre, sI.el, sE.el, sP.el, sN.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)))));
  const p = new Plot(cv, { xmin: 50, xmax: 5000, ymin: 0, ymax: 30, xlog: true, aspect: 1.35, xlabel: 'specific impulse (s)', ylabel: 'total Δv (km/s)', xtickFmt: v => String(v) });
  const dvOf = (isp, eps, pi, n) => { const lam = Math.pow(pi, 1 / n), R = 1 / (lam + eps * (1 - lam)); return { R, dv: n * isp * G0 * Math.log(R) / 1000, lam }; };
  function upd() {
    const isp = sI.get(), eps = sE.get(), pi = sP.get() / 100, n = Math.round(sN.get()), r = dvOf(isp, eps, pi, n), m0 = 100 / pi;
    // structure and payload mass fractions of the whole vehicle
    let mass = m0, structure = 0, prop = 0; for (let i = 0; i < n; i++) { const pay = mass * r.lam, stageDry = eps * (mass - pay), stageProp = mass - pay - stageDry; structure += stageDry; prop += stageProp; mass = pay; }
    ro.R.set(r.R.toFixed(2)); ro.dv.set(r.dv.toFixed(1), r.dv >= ORBIT / 1000 ? 'good' : 'bad'); ro.ok.set(r.dv >= ORBIT / 1000 ? 'YES' : 'no', r.dv >= ORBIT / 1000 ? 'good' : 'bad'); ro.m.set(m0 >= 1e4 ? (m0 / 1000).toFixed(1) + ' t' : m0.toFixed(0)); ro.prop.set((prop / m0 * 100).toFixed(0));
    const c = p.begin().col; p.axes();
    p.hline(ORBIT / 1000, { color: c.ok, label: 'low Earth orbit: 9.4 km/s', align: 'left', width: 2 });
    const colors = [c.muted, c.air, c.fuel, c.fire];
    const tags = [];
    for (let k = 1; k <= 4; k++) { const xs = [], ys = []; for (let i = 50; i <= 5000; i *= 1.06) { xs.push(i); ys.push(dvOf(i, eps, pi, k).dv); } p.line(xs, ys, { color: colors[k - 1], width: k === n ? 3.4 : 1.6, alpha: k === n ? 1 : .55 }); tags.push(Math.min(26.5, ys[ys.length - 1] - 0.6)); }
    for (let k = 1; k < 4; k++) if (tags[k - 1] - tags[k] < 1.5) tags[k] = tags[k - 1] - 1.5;          // keep the right-hand labels apart
    tags.forEach((y, k) => p.text(4900, y, (k + 1) + (k === 0 ? ' stage' : ' stages'), { color: colors[k], align: 'right', size: 11, weight: 700 }));
    MARKS.forEach(([i, nm], k) => { p.vline(i, { color: c.muted, alpha: .35, dash: [2, 4] }); p.text(i * 1.04, 28.6 - (k % 2) * 1.5, nm, { color: c.muted, size: 10 }); });
    p.dot(isp, r.dv, { color: c.fire, r: 7 });
  }
  p.onDraw(upd); upd();
}
