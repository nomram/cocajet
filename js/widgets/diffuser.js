// Diffuser: turn the air's speed into pressure without letting the flow separate.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';

export default function init(el) {
  const { body } = shell(el, { title: 'The diffuser: slowing air to gain pressure', note: 'Bernoulli: slow air has more pressure. A widening passage slows it, but open it too fast and the flow detaches from the wall and the benefit is lost (stall). The sweet spot is a total divergence angle of ~6–8°. Our 15 spiral vanes give roughly 6°.' });
  const c1 = h('canvas', { class: 'plot' }), c2 = h('canvas', { class: 'plot' });
  const sR = slider({ label: 'Vane outlet radius', min: 34, max: 46, step: 0.5, value: 41, unit: 'mm', fmt: v => v.toFixed(1), onInput: upd });
  const sA = slider({ label: 'Vane angle from radial', min: 40, max: 80, step: 1, value: 62, unit: '°', fmt: v => v.toFixed(0), onInput: upd });
  const sN = slider({ label: 'Number of vanes', min: 8, max: 28, step: 1, value: 15, fmt: v => v.toFixed(0), onInput: upd });
  const ro = { ar: readout('Area ratio  A₃/A₂', '', 'cool'), th: readout('Total divergence angle 2θ', '°', 'fuel'), cp: readout('Pressure recovery Cp', '', 'good'), dp: readout('Pressure gain', 'kPa', 'good'), c3: readout('Exit speed', 'm/s', 'cool'), st: readout('Flow', '') };
  body.append(h('div', { class: 'wgrid even' }, c1, c2), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sR.el, sA.el, sN.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const pA = new Plot(c1, { xmin: 0, xmax: 24, ymin: 0, ymax: 1, xlabel: 'total divergence angle 2θ (°)', ylabel: 'diffuser effectiveness', aspect: 1.45, title: 'Effectiveness peaks, then stalls' });
  const pB = new Plot(c2, { xmin: 1, xmax: 3, ymin: 0, ymax: 0.9, xlabel: 'area ratio A₃/A₂', ylabel: 'pressure recovery Cp', aspect: 1.45, title: 'More area ratio → more pressure' });
  const eff = (t) => t <= 7 ? 0.94 - 0.006 * (7 - t) ** 2 : t < 14 ? 0.94 - 0.012 * (t - 7) ** 2 : Math.max(0.2, 0.94 - 0.012 * 49 - 0.04 * (t - 14));
  function upd() {
    const r2 = 30, r3 = sR.get(), a = sA.get() * Math.PI / 180, n = sN.get(), t = 1.0;
    const w2 = 2 * Math.PI * r2 / n * Math.cos(a) - t, w3 = 2 * Math.PI * r3 / n * Math.cos(a) - t, L = (r3 - r2) / Math.cos(a);
    const AR = Math.max(1.01, w3 / w2), th2 = 2 * Math.atan(Math.max(0, w3 - w2) / (2 * L)) * 180 / Math.PI;
    const cpi = 1 - 1 / (AR * AR), e = eff(th2), cp = cpi * e;
    const C2 = 330, rho = 1.55, dp = cp * 0.5 * rho * C2 * C2 / 1000, C3 = C2 * Math.sqrt(Math.max(0.01, 1 - cpi));
    ro.ar.set(AR.toFixed(2)); ro.th.set(th2.toFixed(1)); ro.cp.set(cp.toFixed(2)); ro.dp.set(dp.toFixed(0)); ro.c3.set(C3.toFixed(0)); ro.st.set(th2 > 14 ? 'STALLED' : th2 > 10 ? 'marginal' : 'attached', th2 > 14 ? 'bad' : th2 > 10 ? 'fuel' : 'good');
    let c = pA.begin().col; pA.band(14, 24, { color: c.bad, alpha: .12, label: 'stall' }); pA.band(6, 8, { color: c.ok, alpha: .16, label: 'best' }); pA.axes();
    pA.fn(eff, 0, 24, { color: c.air, width: 3 }); pA.dot(Math.min(23.5, th2), e, { color: c.fire });
    c = pB.begin().col; pB.axes();
    pB.fn(x => 1 - 1 / (x * x), 1, 3, { color: c.air, width: 2.4, dash: [6, 4] }); pB.fn(x => (1 - 1 / (x * x)) * e, 1, 3, { color: c.fire, width: 3 });
    pB.dot(Math.min(3, AR), cp, { color: c.fire }); pB.legend([[c.air, 'ideal (no losses)', [6, 4]], [c.fire, 'with this divergence angle']], { pos: 'br' });
  }
  [pA, pB].forEach(q => q.onDraw(upd)); upd();
}
