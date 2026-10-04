// Nozzle area: the tuning knob. Computed with the engine model at full speed.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1, isa, steadyAt } from '../engine-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Nozzle area: the one dimension you can still change after building', note: 'A smaller exit throttles the exhaust: pressure and temperature upstream rise and so does the exit speed, but mass flow drops. A bigger exit is cooler and gentler. Real builders start oversize and trim down. The model finds the new steady state each time.' });
  const c1 = h('canvas', { class: 'plot' }), c2 = h('canvas', { class: 'plot' });
  const sA = slider({ label: 'Nozzle exit area', min: 700, max: 1700, step: 10, value: 1119, unit: 'mm²', fmt: v => v.toFixed(0), onInput: upd });
  const sN = slider({ label: 'Engine speed (held)', min: 80000, max: 125000, step: 1000, value: 115000, unit: 'rpm', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { F: readout('Thrust', 'N', 'hot'), T3: readout('Turbine inlet temperature', '°C', 'hot'), T4: readout('EGT', '°C', 'hot'), m: readout('Air flow', 'kg/s', 'cool'), pr: readout('Pressure ratio', '', 'cool'), mf: readout('Fuel', 'g/s', 'fuel'), ch: readout('Nozzle', '') };
  body.append(h('div', { class: 'wgrid even' }, c1, c2), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sA.el, sN.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const amb = isa(0), N0 = 115000;
  const areas = []; for (let a = 700; a <= 1700; a += 50) areas.push(a);
  const cache = {}; const get = (N) => cache[N] || (cache[N] = areas.map(a => steadyAt({ ...CJ1, A5: a * 1e-6 }, N, amb)));
  const p1 = new Plot(c1, { xmin: 700, xmax: 1700, ymin: 30, ymax: 70, xlabel: 'nozzle exit area (mm²)', ylabel: 'thrust (N)', aspect: 1.5, title: 'Thrust' });
  const p2 = new Plot(c2, { xmin: 700, xmax: 1700, ymin: 650, ymax: 1000, xlabel: 'nozzle exit area (mm²)', ylabel: 'temperature (°C)', aspect: 1.5, title: 'Turbine inlet (TIT) and exhaust (EGT) temperature' });
  function upd() {
    const A = sA.get(), N = sN.get(), data = get(N), g = steadyAt({ ...CJ1, A5: A * 1e-6 }, N, amb);
    ro.F.set(g.thrust.toFixed(1)); ro.T3.set((g.T03 - 273.15).toFixed(0)); ro.T4.set((g.T04 - 273.15).toFixed(0)); ro.m.set(g.m.toFixed(3)); ro.pr.set(g.PRc.toFixed(2)); ro.mf.set((g.mf * 1000).toFixed(2)); ro.ch.set(g.nozChoked ? 'choked' : 'subsonic');
    let c = p1.begin().col; const th = data.map(d => d.thrust); p1.set({ ymin: Math.floor(Math.min(...th) / 5) * 5 - 5, ymax: Math.ceil(Math.max(...th) / 5) * 5 + 5 }); p1.axes();
    p1.line(areas, th, { color: c.fire, width: 3 }); p1.dot(A, g.thrust, { color: c.fire }); p1.vline(1119, { color: c.muted, label: 'CJ-1: 1119' });
    c = p2.begin().col; const t3 = data.map(d => d.T03 - 273.15), t4 = data.map(d => d.T04 - 273.15); p2.set({ ymin: Math.floor(Math.min(...t4) / 50) * 50 - 50, ymax: Math.ceil(Math.max(...t3) / 50) * 50 + 50 }); p2.axes();
    p2.line(areas, t3, { color: c.fire, width: 3, dash: [6, 4] }); p2.line(areas, t4, { color: c.bad, width: 3 }); p2.dot(A, g.T04 - 273.15, { color: c.bad }); p2.dot(A, g.T03 - 273.15, { color: c.fire });
    p2.hline(850, { color: c.warn, label: 'EGT alarm (850 °C)', align: 'right' }); p2.vline(1119, { color: c.muted });
    p2.legend([[c.fire, 'TIT (turbine in)', [6, 4]], [c.bad, 'EGT (turbine out)']], { pos: 'tr' });
  }
  [p1, p2].forEach(q => q.onDraw(upd)); upd();
}
