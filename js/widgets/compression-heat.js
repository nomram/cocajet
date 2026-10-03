// How hot does air get when you compress it? Ideal vs real compressor.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Squeeze it: temperature rise vs pressure ratio', note: 'T₂ = T₁ · r^((γ−1)/γ) for an ideal (isentropic) compressor; a real one wastes extra work as heat, so it ends up hotter for the same pressure. Our engine’s wheel: r ≈ 1.95, η ≈ 0.78.' });
  const cv = h('canvas', { class: 'plot' });
  const sR = slider({ label: 'Pressure ratio  r = P₂ / P₁', min: 1, max: 12, step: 0.05, value: 1.95, fmt: v => v.toFixed(2), onInput: upd });
  const sE = slider({ label: 'Compressor efficiency  ηc', min: 0.5, max: 1.0, step: 0.01, value: 0.78, fmt: v => v.toFixed(2), onInput: upd });
  const sT = slider({ label: 'Inlet temperature  T₁', min: 220, max: 330, step: 1, value: 288, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { T2s: readout('Ideal outlet T', '°C', 'cool'), T2: readout('Real outlet T', '°C', 'hot'), dT: readout('Real rise', 'K', 'hot'), w: readout('Work per kg air', 'kJ/kg', 'fuel'), P: readout('Power at 0.152 kg/s', 'kW', 'fuel'), eq: readout('= electric kettles', '×')};
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sR.el, sE.el, sT.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)))));
  const p = new Plot(cv, { xmin: 1, xmax: 12, ymin: 0, ymax: 450, xlabel: 'pressure ratio r', ylabel: 'temperature rise ΔT (K)', aspect: 1.5 });
  const k = 0.4 / 1.4, cp = 1005;
  function upd() {
    const r = sR.get(), e = sE.get(), T1 = sT.get();
    const dTs = T1 * (Math.pow(r, k) - 1), dT = dTs / e, w = cp * dT;
    ro.T2s.set((T1 + dTs - 273.15).toFixed(0)); ro.T2.set((T1 + dT - 273.15).toFixed(0)); ro.dT.set(dT.toFixed(0)); ro.w.set((w / 1000).toFixed(1)); ro.P.set((w * 0.152 / 1000).toFixed(1)); ro.eq.set((w * 0.152 / 2000).toFixed(1));
    const c = p.begin().col; p.axes();
    p.fn(x => T1 * (Math.pow(x, k) - 1), 1, 12, { color: c.air, width: 2.4 });
    for (const ee of [0.9, 0.78, 0.65]) p.fn(x => T1 * (Math.pow(x, k) - 1) / ee, 1, 12, { color: c.fire, width: 1.6, dash: [5, 4], alpha: .8 });
    p.fn(x => T1 * (Math.pow(x, k) - 1) / e, 1, 12, { color: c.fire, width: 3 });
    p.dot(r, dT, { color: c.fire });
    p.text(11.8, T1 * (Math.pow(11.8, k) - 1) + 8, 'ideal', { color: c.air, align: 'right', size: 11, base: 'bottom' });
    p.text(11.8, T1 * (Math.pow(11.8, k) - 1) / 0.65 + 8, 'η = 0.65', { color: c.fire, align: 'right', size: 11, base: 'bottom' });
    p.text(11.8, T1 * (Math.pow(11.8, k) - 1) / 0.9 + 8, '0.90', { color: c.fire, align: 'right', size: 11, base: 'bottom' });
    p.dot(1.95, 288 * (Math.pow(1.95, k) - 1) / 0.78, { color: c.fuel, r: 4, ring: false }); p.text(2.05, 100, 'CJ-1', { color: c.fuel, size: 11 });
  }
  p.onDraw(upd); upd();
}
