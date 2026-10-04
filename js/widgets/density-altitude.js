// Hot, high and humid: thrust follows air density. The same engine at 115 000 rpm, different weather.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1, isa, steadyAt } from '../engine-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Weather and altitude: why the same engine makes less thrust on a hot day', note: 'Thrust is mass flow × jet speed, and the mass flow is the <i>density</i> of the air times what the compressor swallows. Hot or thin air is less dense, so at the same rpm the engine moves less air, makes less thrust, and (because the temperature ratio of the cycle shifts) runs hotter for the same fuel. Pilots call the altitude where the standard atmosphere would have the current density the <b>density altitude</b>. Humid air carries water vapour, which is lighter than the nitrogen it replaces and slightly lowers thrust too.' });
  const cv = h('canvas', { class: 'plot' }), cv2 = h('canvas', { class: 'plot' });
  const sA = slider({ label: 'Altitude', min: 0, max: 4000, step: 50, value: 0, unit: 'm', fmt: v => v.toFixed(0), onInput: upd });
  const sT = slider({ label: 'Air temperature', min: -30, max: 45, step: 1, value: 15, unit: '°C', fmt: v => v.toFixed(0), onInput: upd });
  const sH = slider({ label: 'Relative humidity', min: 0, max: 100, step: 5, value: 50, unit: '%', fmt: v => v.toFixed(0), onInput: upd });
  const sN = slider({ label: 'Rotor speed', min: 60000, max: 125000, step: 1000, value: 115000, unit: 'rpm', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { rho: readout('Air density', 'kg/m³', 'cool'), da: readout('Density altitude', 'm', 'fuel'), F: readout('Thrust', 'N', 'hot'), d: readout('Change from the standard day (58 N)', '%', 'good'), m: readout('Mass flow', 'kg/s', 'cool'), tit: readout('Turbine inlet temperature', '°C', 'fuel') };
  body.append(h('div', { class: 'wgrid even' }, cv, cv2), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sA.el, sT.el, sH.el, sN.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const p1 = new Plot(cv, { xmin: 0, xmax: 4000, ymin: 30, ymax: 70, aspect: 1.5, xlabel: 'altitude (m)', ylabel: 'thrust at fixed rpm (N)', title: 'Thrust vs altitude for three days', margin: { l: 52, r: 12, t: 28, b: 40 } });
  const p2 = new Plot(cv2, { xmin: -30, xmax: 45, ymin: 40, ymax: 75, aspect: 1.5, xlabel: 'air temperature at sea level (°C)', ylabel: 'thrust (N)', title: 'Thrust vs temperature at sea level', margin: { l: 52, r: 12, t: 28, b: 40 } });
  const ISA = hk => 15 - 0.0065 * hk;
  const run = (alt, Tc, rh, N) => { const amb = isa(alt, Tc - ISA(alt), rh); return { amb, g: steadyAt({ ...CJ1 }, N, amb) }; };
  const base = steadyAt({ ...CJ1 }, 115000, isa(0));
  function upd() {
    const alt = sA.get(), Tc = sT.get(), rh = sH.get() / 100, N = sN.get(), { amb, g } = run(alt, Tc, rh, N);
    let da = 0; for (let lo = -500, hi = 12000, i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (isa(mid).rho > amb.rho) lo = mid; else hi = mid; da = mid; }
    ro.rho.set(amb.rho.toFixed(3)); ro.da.set(da.toFixed(0)); ro.F.set(g.thrust.toFixed(1)); ro.d.set(((g.thrust / base.thrust - 1) * 100).toFixed(1), g.thrust < base.thrust ? 'bad' : 'good'); ro.m.set(g.m.toFixed(3)); ro.tit.set((g.T03 - 273.15).toFixed(0), g.T03 > 1173 ? 'bad' : 'fuel');
    let c = p1.begin().col; p1.axes();
    const cols = [[-20, c.air, 'cold day (−20 °C)'], [15, c.strong, 'standard day (15 °C)'], [35, c.fire, 'hot day (35 °C)']];
    for (const [dT, col, lab] of cols) { const xs = [], ys = []; for (let a = 0; a <= 4000; a += 200) { xs.push(a); ys.push(steadyAt({ ...CJ1 }, N, isa(a, dT - 15, rh)).thrust); } p1.line(xs, ys, { color: col, width: 2.6 }); p1.text(3960, ys[ys.length - 1] + 1.4, lab, { color: col, align: 'right', size: 11, weight: 700 }); }
    p1.dot(alt, g.thrust, { color: c.fire, r: 7 });
    c = p2.begin().col; p2.axes(); const xs = [], ys = []; for (let t = -30; t <= 45; t += 3) { xs.push(t); ys.push(steadyAt({ ...CJ1 }, N, isa(0, t - 15, rh)).thrust); }
    p2.line(xs, ys, { color: c.fire, width: 3 }); p2.dot(Tc - 0.0065 * alt * 0, g.thrust, { color: c.air, r: 0.1 }); p2.vline(15, { color: c.muted, label: 'standard day', alpha: .7 });
    if (alt === 0) p2.dot(Tc, g.thrust, { color: c.fire, r: 7 });
  }
  p1.onDraw(upd); p2.onDraw(upd); upd();
}
