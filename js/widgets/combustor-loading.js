// The combustor in the engine: efficiency falls when the loading is high (low pressure, little air), and the flame lives only in a window of fuel/air ratio.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1, isa, steadyAt, combustionLoading } from '../engine-model.js';

const AFR = 15.6, PZ = 0.26;                         // propane stoichiometric air/fuel; share of the air that enters the primary zone
export default function init(el) {
  const { body } = shell(el, { title: 'The flame in the engine: loading, efficiency and the blow-out window', note: 'Burning needs time, temperature and pressure. When the engine idles or flies high, the pressure in the combustor falls and the air flow is low, so the reaction has less chance to finish before the gas leaves: <b>combustion efficiency drops</b> (chapter 10’s kinetics). The primary zone (the front quarter of the air) must also stay inside the window of fuel/air ratio where propane burns at all: too lean and the flame blows out, too rich and it chokes. Move the fuel and watch the point leave the window.' });
  const cv = h('canvas', { class: 'plot' }), cv2 = h('canvas', { class: 'plot' });
  const sN = slider({ label: 'Rotor speed', min: 40000, max: 125000, step: 1000, value: 115000, unit: 'rpm', fmt: v => v.toFixed(0), onInput: upd });
  const sA = slider({ label: 'Altitude', min: 0, max: 6000, step: 100, value: 0, unit: 'm', fmt: v => v.toFixed(0), onInput: upd });
  const sF = slider({ label: 'Fuel flow as a share of the steady value for this speed', min: 20, max: 250, step: 1, value: 100, unit: '%', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { eta: readout('Combustion efficiency', '%', 'good'), load: readout('Combustor intensity (1 = design)', '', 'cool'), phi: readout('Primary-zone φ', '', 'hot'), st: readout('Flame', '', 'good'), cut: readout('Fuel cut that would blow it out', '%', 'fuel') };
  body.append(h('div', { class: 'wgrid even' }, cv, cv2), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sN.el, sA.el, sF.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const p1 = new Plot(cv, { xmin: 40000, xmax: 125000, ymin: 0.6, ymax: 1, aspect: 1.5, xlabel: 'rotor speed (rpm)', ylabel: 'combustion efficiency', title: 'Efficiency vs speed at three altitudes', margin: { l: 52, r: 12, t: 28, b: 40 }, ytickFmt: v => Math.round(v * 100) + '%', xtickFmt: v => (v / 1000) + 'k' });
  const p2 = new Plot(cv2, { xmin: 20, xmax: 250, ymin: 0, ymax: 3.6, aspect: 1.5, xlabel: 'fuel flow (% of steady)', ylabel: 'primary-zone φ', title: 'Where the flame can live', margin: { l: 52, r: 12, t: 28, b: 40 } });
  const phiAt = (g, pct) => pct / 100 * g.mf / (PZ * g.m) * AFR;
  function upd() {
    const N = sN.get(), alt = sA.get(), pct = sF.get(), amb = isa(alt), g = steadyAt({ ...CJ1 }, N, amb), phi = phiAt(g, pct);
    const eta = g.etaB, load = combustionLoading(g.P02, g.T02, g.m);
    ro.eta.set((eta * 100).toFixed(1), eta < 0.8 ? 'bad' : 'good'); ro.load.set(load.toFixed(2)); ro.phi.set(phi.toFixed(2));
    const state = phi < 0.42 ? ['BLOWN OUT (lean)', 'bad'] : phi > 3.0 ? ['BLOWN OUT (rich)', 'bad'] : phi < 0.5 || phi > 2.5 ? ['marginal', 'cool'] : ['burning', 'good'];
    ro.st.set(state[0], state[1]); const phi100 = phiAt(g, 100); ro.cut.set(phi100 > 0.42 ? ((1 - 0.42 / phi100) * 100).toFixed(0) : '0');
    let c = p1.begin().col; p1.axes();
    for (const [a, col, lab] of [[0, c.strong, '0 m'], [3000, c.fuel, '3 000 m'], [6000, c.fire, '6 000 m']]) { const xs = [], ys = []; for (let n = 40000; n <= 125000; n += 5000) { xs.push(n); ys.push(steadyAt({ ...CJ1 }, n, isa(a)).etaB); } p1.line(xs, ys, { color: col, width: 2.6 }); p1.text(70000, ys[6] + 0.016, lab, { color: col, align: 'center', size: 11, weight: 700 }); }
    p1.vline(48000, { color: c.muted, label: 'idle', alpha: .8 }); p1.dot(N, eta, { color: c.fire, r: 7 });
    c = p2.begin().col; p2.axes(); p2.hband(0, 0.42, { color: c.bad, alpha: .14, label: 'lean blow-out' }); p2.hband(0.42, 0.5, { color: c.warn, alpha: .12 }); p2.hband(0.5, 2.5, { color: c.ok, alpha: .12, label: 'propane burns (φ 0.5 – 2.5)' }); p2.hband(2.5, 3.0, { color: c.warn, alpha: .12 }); p2.hband(3.0, 3.6, { color: c.bad, alpha: .14, label: 'too rich' });
    const xs = [], ys = []; for (let q = 20; q <= 250; q += 5) { xs.push(q); ys.push(phiAt(g, q)); } p2.line(xs, ys, { color: c.fire, width: 3 }); p2.vline(100, { color: c.muted, alpha: .6, label: 'steady' }); p2.dot(pct, Math.min(3.55, phi), { color: state[1] === 'bad' ? c.bad : c.air, r: 7 });
  }
  p1.onDraw(upd); p2.onDraw(upd); upd();
}
