// Bolt a fan on: thrust and efficiency vs bypass ratio for the same core.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1, isa, steadyAt } from '../engine-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Add a ducted fan: bypass ratio', note: 'Keep CJ-1’s core exactly as it is, but instead of throwing its 11 kW of jet power out of the nozzle at 376 m/s, use it to drive a ducted fan that accelerates (1 + B) times more air more gently. Ideal model: ½ṁ_total (Vₑ² − V₀²) = η_fan · P_core, same exit speed for both streams. More air, slower jet, much more thrust for the same fuel.' });
  const cv = h('canvas', { class: 'plot' }), cv2 = h('canvas', { class: 'plot' });
  const sB = slider({ label: 'Bypass ratio B (fan air ÷ core air)', min: 0, max: 12, step: 0.1, value: 4, fmt: v => v.toFixed(1), onInput: upd });
  const sV = slider({ label: 'Flight speed V₀', min: 0, max: 250, step: 5, value: 0, unit: 'm/s', fmt: v => v.toFixed(0), onInput: upd });
  const sE = slider({ label: 'Fan + LP turbine efficiency', min: 0.6, max: 0.95, step: 0.01, value: 0.82, fmt: v => v.toFixed(2), onInput: upd });
  const ro = { F: readout('Thrust', 'N', 'hot'), x: readout('vs the plain jet', '×', 'good'), Ve: readout('Exhaust speed', 'm/s', 'cool'), eta: readout('Propulsive efficiency', '%', 'good'), D: readout('Fan diameter (at Mach 0.3)', 'mm', 'fuel'), sfc: readout('Fuel per thrust', 'kg/(N·h)') };
  body.append(h('div', { class: 'wgrid even' }, cv, cv2), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sB.el, sV.el, sE.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const base = steadyAt({ ...CJ1 }, CJ1.Ndesign, isa(0)), P = 0.5 * base.mg * base.Ve ** 2, mc = base.m, mf = base.mf;
  const p1 = new Plot(cv, { xmin: 0, xmax: 12, ymin: 0, ymax: 220, xlabel: 'bypass ratio B', ylabel: 'thrust (N)', aspect: 1.4, title: 'Thrust (same core, same fuel)' });
  const p2 = new Plot(cv2, { xmin: 0, xmax: 12, ymin: 0, ymax: 100, xlabel: 'bypass ratio B', ylabel: 'propulsive efficiency (%)', aspect: 1.4, title: 'Propulsive efficiency' });
  const solve = (B, V0, e) => { const mt = mc * (1 + B), Ve = Math.sqrt(V0 * V0 + 2 * e * P / mt), F = mt * (Ve - V0); return { Ve, F, eta: V0 > 0 ? F * V0 / (0.5 * mt * (Ve * Ve - V0 * V0)) : 0, mt }; };
  function upd() {
    const B = sB.get(), V0 = sV.get(), e = sE.get(), r = solve(B, V0, e), r0 = solve(0, V0, 1);
    ro.F.set(r.F.toFixed(0)); ro.x.set((r.F / Math.max(1, r0.F)).toFixed(2)); ro.Ve.set(r.Ve.toFixed(0)); ro.eta.set(V0 > 0 ? (r.eta * 100).toFixed(0) : '0'); ro.D.set((Math.sqrt(4 * r.mt / (1.2 * 100 * Math.PI)) * 1000).toFixed(0)); ro.sfc.set(r.F > 1 ? (mf / r.F * 3600).toFixed(3) : '–');
    let c = p1.begin().col; p1.set({ ymax: Math.max(100, Math.ceil(solve(12, 0, e).F / 50) * 50 + 20) }); p1.axes();
    for (const v of [0, 50, 100, 200]) { const xs = [], ys = []; for (let b = 0; b <= 12; b += 0.25) { xs.push(b); ys.push(solve(b, v, e).F); } p1.line(xs, ys, { color: v === V0 ? c.fire : c.muted, width: v === V0 ? 3 : 1.4, alpha: v === V0 ? 1 : .6, dash: v === V0 ? null : [4, 4] }); p1.text(11.9, ys[ys.length - 1] + 3, v + ' m/s', { color: c.muted, align: 'right', size: 10.5, base: 'bottom' }); }
    p1.fn(b => solve(b, V0, e).F, 0, 12, { color: c.fire, width: 3.4 }); p1.dot(B, r.F, { color: c.fire });
    c = p2.begin().col; p2.axes();
    for (const v of [50, 100, 200]) { const xs = [], ys = []; for (let b = 0; b <= 12; b += 0.25) { xs.push(b); ys.push(solve(b, v, e).eta * 100); } p2.line(xs, ys, { color: v === V0 ? c.fire : c.air, width: v === V0 ? 3 : 1.8, alpha: v === V0 ? 1 : .7 }); p2.text(11.9, ys[ys.length - 1] + 2, v + ' m/s', { color: c.air, align: 'right', size: 10.5, base: 'bottom' }); }
    if (V0 > 0) p2.dot(B, r.eta * 100, { color: c.fire }); else p2.text(6, 50, 'pick a flight speed above 0', { color: c.muted, align: 'center' });
  }
  [p1, p2].forEach(q => q.onDraw(upd)); upd();
}
