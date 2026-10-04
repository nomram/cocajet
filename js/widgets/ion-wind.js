// "Ion wind" (corona) thrusters: no moving parts and no propellant tank, just air and high voltage. A calculator, not a recipe.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { ionWind } from '../electric-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Ion wind: thrust from a corona discharge in air', note: 'A very sharp (thin) electrode at high voltage ionises the air next to it, and the ions are pulled across the gap toward a smooth collector, colliding with billions of neutral air molecules on the way and dragging them along: an <b>electric wind</b>. The ideal thrust is F = I·d/μ (current × gap ÷ ion mobility), so more current and a wider gap help, but a wider gap needs more voltage, and too much voltage makes a <b>spark</b> (the breakdown of chapter 11). The window between corona onset and spark-over is narrow. It is a laboratory curiosity, not an engine: about 1–2 N per kilowatt, 100 times worse than a fan, but it is silent and has no moving parts. <b>Calculator only: high voltage is dangerous (see the safety box).</b>' });
  const cv = h('canvas', { class: 'plot' }), cv2 = h('canvas', { class: 'plot' });
  const sV = slider({ label: 'Voltage', min: 5, max: 60, step: 0.5, value: 30, unit: 'kV', fmt: v => v.toFixed(1), onInput: upd });
  const sD = slider({ label: 'Gap between emitter and collector', min: 10, max: 60, step: 1, value: 30, unit: 'mm', fmt: v => v.toFixed(0), onInput: upd });
  const sL = slider({ label: 'Total emitter length', min: 0.2, max: 4, step: 0.05, value: 1.5, unit: 'm', fmt: v => v.toFixed(2), onInput: upd });
  const sM = slider({ label: 'Mass of the whole craft', min: 2, max: 60, step: 0.5, value: 8, unit: 'g', fmt: v => v.toFixed(1), onInput: upd });
  const ro = { I: readout('Current', 'mA', 'cool'), F: readout('Thrust', 'mN', 'fuel'), P: readout('Electrical power', 'W', 'hot'), e: readout('Thrust per kW', 'N/kW', 'good'), tw: readout('Thrust ÷ weight', '', 'cool'), st: readout('State', '', 'good') };
  body.append(h('div', { class: 'wgrid even' }, cv, cv2), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sV.el, sD.el, sL.el, sM.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const pA = new Plot(cv, { xmin: 0, xmax: 60, ymin: 0, ymax: 200, aspect: 1.5, xlabel: 'voltage (kV)', ylabel: 'thrust (mN)', title: 'Thrust vs voltage: only the green window works', margin: { l: 50, r: 12, t: 28, b: 40 } });
  const pB = new Plot(cv2, { xmin: 10, xmax: 60, ymin: 0, ymax: 100, aspect: 1.5, xlabel: 'gap (mm)', ylabel: 'highest usable voltage (kV)', title: 'The window moves with the gap', margin: { l: 50, r: 12, t: 28, b: 40 } });
  function upd() {
    const V = sV.get() * 1000, d = sD.get() / 1000, L = sL.get(), r = ionWind({ V, d, L }), W = sM.get() / 1000 * 9.80665, tw = r.F / W;
    ro.I.set((r.I * 1000).toFixed(2)); ro.F.set((r.F * 1000).toFixed(0)); ro.P.set(r.P.toFixed(0)); ro.e.set(r.P > 0 ? (r.FperP * 1000).toFixed(2) : '–'); ro.tw.set(r.spark ? '–' : tw.toFixed(2), tw >= 1 ? 'good' : 'cool');
    ro.st.set(r.spark ? 'SPARK-OVER: no thrust, hot, dangerous' : !r.corona ? 'below corona onset' : tw >= 1 ? 'lifts its own weight' : 'works, but too heavy to lift', r.spark ? 'bad' : !r.corona ? 'cool' : tw >= 1 ? 'good' : 'cool');
    const xs = [], ys = [];  for (let v = 0; v <= 60; v += 0.5) { const q = ionWind({ V: v * 1000, d, L }); xs.push(v); ys.push(q.spark ? NaN : q.F * 1000); }
    const okMax = Math.max(...ys.filter(Number.isFinite)); pA.set({ ymax: Math.max(20, Math.ceil(okMax * 1.2 / 10) * 10) });
    let c = pA.begin().col; pA.axes();
    pA.band(0, r.Von / 1000, { color: c.muted, alpha: .12, label: 'no corona' }); pA.band(r.Von / 1000, r.Vspark / 1000, { color: c.ok, alpha: .10 }); pA.band(r.Vspark / 1000, 60, { color: c.bad, alpha: .14, label: 'SPARK' });
    const sx = xs.filter((_, i) => Number.isFinite(ys[i])), sy = ys.filter(Number.isFinite); pA.line(sx, sy, { color: c.fire, width: 3 }); pA.hline(sM.get() / 1000 * 9.80665 * 1000, { color: c.air, label: 'weight of the craft', align: 'right' });
    if (!r.spark) pA.dot(V / 1000, r.F * 1000, { color: c.fire, r: 7 }); else pA.vline(V / 1000, { color: c.bad, width: 2 });
    const dx = [], lo = [], hi = []; for (let g = 10; g <= 60; g += 2) { dx.push(g); lo.push(0.5 * g); hi.push(Math.min(100, 1.4 * g)); }
    pB.set({ ymax: 100 }); c = pB.begin().col; pB.axes(); pB.area(dx, lo, hi, { color: c.ok, alpha: .2 }); pB.line(dx, lo, { color: c.muted, width: 2 }); pB.line(dx, hi, { color: c.bad, width: 2.5 });
    pB.text(14, 0.5 * 14 - 4, 'corona starts', { color: c.muted, size: 11 }); pB.text(14, Math.min(98, 1.4 * 14) + 6, 'spark-over', { color: c.bad, size: 11, weight: 700 }); pB.dot(sD.get(), Math.min(100, V / 1000), { color: c.fire, r: 7 });
  }
  pA.onDraw(upd); pB.onDraw(upd); upd();
}
