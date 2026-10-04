// Inlet bellmouth lip radius and impeller tip clearance: small gaps, big effects. Uses the engine model.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1, isa, steadyAt } from '../engine-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Two details that cost thrust: lip radius and tip clearance', note: 'A sharp inlet lip separates the flow and wastes pressure before the air even reaches the wheel. The gap between blade tips and casing lets high-pressure air leak backward over the blade; the tolerance of a few tenths of a millimetre is the single most important machining tolerance in the engine.' });
  const c1 = h('canvas', { class: 'plot' }), c2 = h('canvas', { class: 'plot' });
  const sR = slider({ label: 'Lip radius ÷ inlet diameter  (r/D)', min: 0.0, max: 0.4, step: 0.01, value: 0.33, fmt: v => v.toFixed(2), onInput: upd });
  const sC = slider({ label: 'Impeller tip clearance', min: 0.1, max: 1.2, step: 0.05, value: 0.4, unit: 'mm', fmt: v => v.toFixed(2), onInput: upd });
  const ro = { K: readout('Inlet loss coefficient K', '', 'cool'), dp: readout('Inlet pressure loss', '%', 'cool'), F: readout('Thrust', 'N', 'hot'), dF: readout('vs the CJ-1 design', 'N', 'fuel'), eta: readout('Compressor efficiency', '%'), mf: readout('Fuel flow', 'g/s') };
  body.append(h('div', { class: 'wgrid even' }, c1, c2), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sR.el, sC.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const pK = new Plot(c1, { xmin: 0, xmax: 0.4, ymin: 0, ymax: 0.6, xlabel: 'lip radius ÷ diameter', ylabel: 'inlet loss coefficient K', aspect: 1.45, title: 'Round the lip' });
  const pT = new Plot(c2, { xmin: 0.1, xmax: 1.2, ymin: 35, ymax: 65, xlabel: 'tip clearance (mm)', ylabel: 'thrust at 115 000 rpm (N)', aspect: 1.45, title: 'Every 0.1 mm of gap costs thrust' });
  const K = (rd) => 0.5 * Math.exp(-11 * rd) + 0.012;
  const amb = isa(0), base = steadyAt({ ...CJ1 }, CJ1.Ndesign, amb);
  const curve = []; for (let cl = 0.1; cl <= 1.201; cl += 0.1) curve.push([cl, steadyAt({ ...CJ1, clearance: cl / 1000 }, CJ1.Ndesign, amb).thrust]);
  function upd() {
    const rd = sR.get(), cl = sC.get(), k = K(rd), dpIn = k * 0.5 * 1.2 * 110 ** 2 / 101325;
    const g = steadyAt({ ...CJ1, clearance: cl / 1000, dpIn }, CJ1.Ndesign, amb);
    ro.K.set(k.toFixed(3)); ro.dp.set((dpIn * 100).toFixed(2)); ro.F.set(g.thrust.toFixed(1)); ro.dF.set((g.thrust - base.thrust > 0 ? '+' : '') + (g.thrust - base.thrust).toFixed(1)); ro.eta.set((g.etaC * 100).toFixed(1)); ro.mf.set((g.mf * 1000).toFixed(2));
    let c = pK.begin().col; pK.axes(); pK.fn(K, 0, 0.4, { color: c.air, width: 3 }); pK.dot(rd, k, { color: c.fire }); pK.vline(0.33, { color: c.muted, label: 'CJ-1 bellmouth' }); pK.text(0.01, 0.52, 'sharp edge: K ≈ 0.5', { color: c.bad, size: 11 });
    c = pT.begin().col; pT.axes(); pT.line(curve.map(q => q[0]), curve.map(q => q[1]), { color: c.fire, width: 3 }); pT.dot(cl, g.thrust, { color: c.fire }); pT.vline(0.4, { color: c.muted, label: 'CJ-1: 0.4 mm' });
  }
  [pK, pT].forEach(q => q.onDraw(upd)); upd();
}
