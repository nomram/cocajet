// Combustor casing: thin-wall hoop stress, end load and bolts.
import { h, shell, slider, select, readout } from '../ui.js';
import { Plot } from '../plot.js';

const MATS = { mild: ['Mild steel', 250, [[20, 1], [300, 1], [400, 1], [500, .78], [600, .47], [700, .23]]], ss304: ['Stainless 304', 210, [[20, 1], [200, .68], [400, .60], [500, .54], [600, .49], [700, .40]]], al: ['Aluminium 6061-T6', 276, [[20, 1], [100, .95], [150, .85], [200, .5], [260, .22], [315, .1]]] };
const interp = (pts, T) => { if (T <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (T <= pts[i][0]) { const f = (T - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]); return pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1]); } return pts[pts.length - 1][1] * 0.5; };

export default function init(el) {
  const { body } = shell(el, { title: 'Combustor casing: how thin can the wall be?', note: 'The casing only holds ~1 bar of overpressure (the compressor’s 1.95 minus the atmosphere), so a thin wall is plenty: hoop stress σ = P·r/t. It is thermal growth, bolt loads and the occasional “hot-start bang” that set the real thickness.' });
  const cv = h('canvas', { class: 'plot' });
  const sP = slider({ label: 'Gauge pressure inside', min: 20, max: 400, step: 5, value: 95, unit: 'kPa', fmt: v => v.toFixed(0), onInput: upd });
  const sD = slider({ label: 'Casing inner diameter', min: 60, max: 140, step: 1, value: 96, unit: 'mm', fmt: v => v.toFixed(0), onInput: upd });
  const sT = slider({ label: 'Wall thickness', min: 0.5, max: 4, step: 0.1, value: 2, unit: 'mm', fmt: v => v.toFixed(1), onInput: upd });
  const sTemp = slider({ label: 'Wall temperature', min: 20, max: 700, step: 10, value: 250, unit: '°C', fmt: v => v.toFixed(0), onInput: upd });
  const sel = select({ label: 'Material', options: Object.entries(MATS).map(([k, v]) => [k, v[0]]), value: 'ss304', onChange: upd });
  const sB = slider({ label: 'Number of M4 flange bolts', min: 4, max: 16, step: 1, value: 8, fmt: v => v.toFixed(0), onInput: upd });
  const ro = { hoop: readout('Hoop stress', 'MPa', 'hot'), sy: readout('Yield at this temperature', 'MPa', 'cool'), sf: readout('Safety factor (wall)', '×', 'good'), F: readout('End load on the rear wall', 'N', 'fuel'), bolt: readout('Load per bolt', 'N'), bsf: readout('Bolt safety factor (M4, 8.8)', '×', 'good') };
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sP.el, sD.el, sT.el, sTemp.el, sel.el, sB.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)))));
  const p = new Plot(cv, { xmin: 20, xmax: 700, ymin: 0, ymax: 300, xlabel: 'wall temperature (°C)', ylabel: 'stress / strength (MPa)', aspect: 1.3 });
  function upd() {
    const P = sP.get() * 1000, D = sD.get() / 1000, t = sT.get() / 1000, T = sTemp.get(), m = MATS[sel.get()];
    const hoop = P * (D / 2) / t / 1e6, sy = m[1] * interp(m[2], T), area = Math.PI / 4 * (D * D - 0.068 ** 2), F = P * area, per = F / sB.get(), bproof = 640e6 * 8.78e-6;
    ro.hoop.set(hoop.toFixed(1)); ro.sy.set(sy.toFixed(0)); ro.sf.set((sy / hoop).toFixed(0), sy / hoop < 4 ? 'bad' : 'good'); ro.F.set(F.toFixed(0)); ro.bolt.set(per.toFixed(0)); ro.bsf.set((bproof / per).toFixed(0), bproof / per < 4 ? 'bad' : 'good');
    const c = p.begin().col; p.axes();
    const xs = [], ys = []; for (let q = 20; q <= 700; q += 10) { xs.push(q); ys.push(m[1] * interp(m[2], q)); }
    p.line(xs, ys, { color: c.air, width: 3 }); p.hline(hoop, { color: c.fire, label: 'hoop stress in the wall', align: 'right' }); p.hline(hoop * 4, { color: c.warn, label: 'with 4× safety factor', align: 'right', alpha: .8 });
    p.dot(T, sy, { color: c.air }); p.text(40, 280, m[0] + ': yield strength vs temperature', { color: c.air, size: 11, weight: 700 });
    p.text(690, 20, 'Real casings are thicker for stiffness and weld distortion, not for pressure', { color: c.muted, size: 11, align: 'right' });
  }
  p.onDraw(upd); upd();
}
